import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const BATCH_SIZE = 1000 // Process up to 1000 records per cron cycle

export async function GET(request: Request) {
  try {
    // 1. CRON SECURITY: Block any request that isn't from Vercel's internal cron daemon
    // NOTE: Using CRON_SECRET which is matched against the cron-job.org authorization header
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized Trigger' }, { status: 401 })
    }

    if (!UPSTASH_URL || !UPSTASH_TOKEN) {
      throw new Error("Redis credentials missing.")
    }

    // 2. THE READ PHASE: Grab the oldest items without deleting them
    const rangeRes = await fetch(`${UPSTASH_URL}/lrange/keshwam:telemetry_queue/0/${BATCH_SIZE - 1}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: 'no-store'
    })
    
    const rangeData = await rangeRes.json()
    const records = rangeData.result || []

    if (records.length === 0) {
      // Even if the queue is empty, we trigger the garbage collector to ensure maintenance runs
      await supabase.rpc('clean_old_telemetry');
      return NextResponse.json({ success: true, message: 'Queue empty. Maintenance run complete.' }, { status: 200 })
    }

    // 3. THE PARSE PHASE: Convert Redis strings back to JSON objects
    const parsedPayloads = records.map((record: string) => {
      try { return JSON.parse(record) } 
      catch (e) { return null }
    }).filter(Boolean)

    if (parsedPayloads.length === 0) {
      // If records were corrupted, trim them so they don't block the queue forever
      await fetch(`${UPSTASH_URL}/ltrim/keshwam:telemetry_queue/${BATCH_SIZE}/-1`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
      return NextResponse.json({ success: false, message: 'Corrupted batch cleared.' }, { status: 200 })
    }

    // 4. WRITE: Bulk upsert into Postgres (Idempotent: ignores existing records)
    const { error: dbError } = await supabase
      .from('meter_telemetry')
      .upsert(parsedPayloads, { ignoreDuplicates: true })

    if (dbError) {
      // CRITICAL: We throw an error here. We DO NOT trim the Redis queue.
      // The data will remain in Redis and the next cron cycle will try again.
      throw new Error(`Supabase Insert Failed: ${dbError.message}`)
    }

    // 5. THE COMMIT PHASE: The DB write was successful. Now we can safely delete.
    const trimRes = await fetch(`${UPSTASH_URL}/ltrim/keshwam:telemetry_queue/${records.length}/-1`, {
      method: 'POST', // LTRIM requires a POST request
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })

    if (!trimRes.ok) {
        // Edge case: DB wrote it, but Redis trim failed. Next cycle might duplicate data.
        // Postgres unique constraints will silently reject duplicates on the next run.
        throw new Error("DB write succeeded, but Redis trim failed.")
    }

    // 6. ENTERPRISE GARBAGE COLLECTION
    // Deletes raw 20-second data older than 7 days to keep the database small and free.
    // Hourly, Daily, and Monthly rollups remain untouched.
    const { error: gcError } = await supabase.rpc('clean_old_telemetry');
    
    if (gcError) {
        // We log the error, but don't fail the response since the primary flush task succeeded.
        console.error("Garbage Collection Failed:", gcError.message);
    }

    return NextResponse.json({ 
      success: true, 
      flushed: records.length, 
      message: `Successfully committed ${records.length} telemetry records and executed GC.` 
    }, { status: 200 })

  } catch (error: any) {
    console.error("Flush Pipeline Critical Error:", error)
    return NextResponse.json(
      { success: false, error: error.message }, 
      { status: 500 }
    )
  }
}