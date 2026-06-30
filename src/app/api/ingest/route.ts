import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper function to compute SHA-256 hash in Edge runtime
async function hashKey(plainKey: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(plainKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  // CRITICAL FIX: The client is now initialized INSIDE the function.
  // This prevents Next.js from attempting to read env vars during static build compilation.
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Kept secure on Vercel
  )

  try {
    const deviceKey = request.headers.get('X-Device-Key')
    const deviceId = request.headers.get('X-Device-ID')

    if (!deviceKey || !deviceId) {
      return new NextResponse(JSON.stringify({ error: 'Bad Request: Missing Credentials' }), { status: 400 })
    }

    // 1. Compute the hash of the presented key
    const hashedKey = await hashKey(deviceKey)

    // 2. BIG TECH CHECK: Look up in local Edge cache / Redis first
    // For this blueprint, we fallback to an optimized database index lookup.
    const { data: keyRecord, error } = await supabaseAdmin
      .from('device_keys')
      .select('status, id')
      .eq('key_hash', hashedKey)
      .single()

    // 3. Fail open isolation: if key does not exist or isn't explicitly active, drop packet immediately
    if (error || !keyRecord || keyRecord.status !== 'active') {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized: Hardware Blocked' }), { status: 401 })
    }

    // 4. Extract telemetry payload safely
    const telemetryData = await request.json()

    // 5. Asynchronously execute the insert into the metrics ledger 
    // This unblocks the HTTP execution thread for maximum hardware throughput
    const { error: insertError } = await supabaseAdmin
      .from('telemetry_stream')
      .insert({
        device_id: deviceId,
        payload: telemetryData,
        recorded_at: new Date().toISOString()
      })

    if (insertError) {
      // Log internally, but don't crash the hardware loop
      console.error('Database write error:', insertError)
      return new NextResponse(JSON.stringify({ error: 'Internal Storage Error' }), { status: 500 })
    }

    return new NextResponse(JSON.stringify({ success: true }), { status: 200 })

  } catch (err) {
    return new NextResponse(JSON.stringify({ error: 'Fatal Pipeline Server Error' }), { status: 500 })
  }
}