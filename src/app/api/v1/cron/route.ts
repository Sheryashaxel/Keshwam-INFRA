import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 🚀 Use the Edge runtime so Vercel doesn't cold-boot a heavy Node.js server
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export async function GET(request: Request) {
  try {
    // SECURITY: Ensure only cron-job.org (or you) can trigger this via a secret header
    // In cron-job.org, add a Header: Authorization -> Bearer YOUR_CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`

    if (authHeader !== expectedToken) {
      return NextResponse.json({ success: false, error: "401 Unauthorized CRON Trigger" }, { status: 401 })
    }

    // 1. FIRE THE COMPRESSOR: Rolls up the last 4 hours of raw data
    const { error: rollupError } = await supabase.rpc('execute_system_telemetry_rollup');
    if (rollupError) throw new Error(`Rollup RPC Failed: ${rollupError.message}`);

    // 2. FIRE THE FLUSHER: Permanently deletes raw data older than 3 days
    const { error: purgeError } = await supabase.rpc('execute_sliding_window_purge');
    if (purgeError) throw new Error(`Purge RPC Failed: ${purgeError.message}`);

    return NextResponse.json({ 
      success: true, 
      message: "Enterprise Database Maintenance Executed Flawlessly." 
    }, { status: 200 })

  } catch (error: any) {
    console.error("CRON 500 ERROR:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}