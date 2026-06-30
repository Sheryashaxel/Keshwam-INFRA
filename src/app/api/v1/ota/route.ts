import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// 🚀 Must use Node.js to access native crypto for fast SHA-256 binary hashing
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

// ============================================================================
// POST: COMMAND & CONTROL (Upload Firmware & Trigger Deployments)
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`
    
    const hasSupabaseCookie = request.cookies.getAll().some(cookie => 
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    );

    if ((!authHeader || authHeader !== expectedToken) && !hasSupabaseCookie) {
      return NextResponse.json({ success: false, error: "401 Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData();
    const action = formData.get('action');

    // 🚀 PHASE 1: BINARY UPLOAD & HASHING
    if (action === 'UPLOAD_FIRMWARE') {
      const file = formData.get('file') as File;
      const version = formData.get('version') as string;
      
      if (!file || !version) throw new Error("Missing binary file or version string.");

      // Read file into memory and hash it
      const buffer = Buffer.from(await file.arrayBuffer());
      const hashSum = crypto.createHash('sha256');
      hashSum.update(buffer);
      const sha256_hash = hashSum.digest('hex');

      // Prevent duplicate version deployments
      const { data: existing } = await supabase.from('firmware_releases').select('id').eq('version_string', version).single();
      if (existing) throw new Error("Version string already exists. Increment the version number.");

      const filePath = `${version}/${file.name}`;

      // 1. Upload strictly to the public firmware_vault
      const { error: storageError } = await supabase.storage
        .from('firmware_vault')
        .upload(filePath, buffer, { contentType: 'application/octet-stream', upsert: true });

      if (storageError) throw new Error(`Storage error: ${storageError.message}`);
      
      // 2. Log it in the Ledger as ARCHIVED (Staged, but not live)
      const { data, error: dbError } = await supabase.from('firmware_releases').insert([{
        version_string: version,
        file_path: filePath,
        sha256_hash: sha256_hash,
        file_size_bytes: file.size,
        status: 'ARCHIVED' 
      }]).select();

      if (dbError) throw new Error(`Database error: ${dbError.message}`);

      return NextResponse.json({ success: true, data: data[0] });
    }

    // 🚀 PHASE 2: FLEET DEPLOYMENT (Make Active)
    if (action === 'DEPLOY_FIRMWARE') {
       const version = formData.get('version') as string;
       
       // 1. Deactivate current global releases
       await supabase.from('firmware_releases').update({ status: 'ARCHIVED' }).eq('status', 'ACTIVE');
       
       // 2. Set the requested version to ACTIVE
       const { error: updateError } = await supabase.from('firmware_releases')
         .update({ status: 'ACTIVE' })
         .eq('version_string', version);
         
       if (updateError) throw updateError;
       
       // 3. Update the Fleet Tracker
       // Find the UUID of the newly active release and assign it to the target_version_id of all active nodes.
       const { data: activeRelease } = await supabase.from('firmware_releases').select('id').eq('version_string', version).single();
       if (activeRelease) {
           await supabase.from('fleet_ota_status')
             .update({ target_version_id: activeRelease.id })
             .eq('device_status', 'ACTIVE');
       }

       return NextResponse.json({ success: true, message: "Fleet deployment initiated." });
    }

    return NextResponse.json({ error: "Invalid action payload" }, { status: 400 });

  } catch (error: any) {
    console.error("OTA POST Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


// ============================================================================
// GET: ESP32 HARDWARE POLLING ENDPOINT (The Chunking Engine)
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac');

    if (!mac) return NextResponse.json({ error: "Missing MAC address" }, { status: 400 });

    // 1. Gatekeeper: Is this device allowed to download?
    const { data: device } = await supabase.from('fleet_ota_status').select('device_status, target_version_id').eq('mac_address', mac).single();
    
    if (!device) return NextResponse.json({ error: "Unregistered hardware" }, { status: 404 });
    if (device.device_status === 'BANNED') return NextResponse.json({ update_available: false, command: "SLEEP", message: "DEVICE BLACKLISTED" }, { status: 403 });
    
    if (!device.target_version_id) return NextResponse.json({ update_available: false });

    // 2. Fetch the target payload
    const { data: release } = await supabase.from('firmware_releases').select('*').eq('id', device.target_version_id).single();
    
    // Safety check: Don't serve corrupted or aborted binaries
    if (!release || release.status !== 'ACTIVE') return NextResponse.json({ update_available: false });

    // 3. Generate the direct download URL
    const { data: urlData } = supabase.storage.from('firmware_vault').getPublicUrl(release.file_path);

    // 🚀 THE CHUNKING PAYLOAD
    return NextResponse.json({
      update_available: true,
      version: release.version_string,
      url: urlData.publicUrl,
      hash: release.sha256_hash,
      file_size: release.file_size_bytes, // ESP32 needs this to know when to stop asking for chunks
      chunk_size_bytes: 4096 // Tells the ESP32 to pull 4KB at a time
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}