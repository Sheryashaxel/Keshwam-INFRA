import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// CRITICAL: This tells Vercel to compile this into a globally distributed V8 Edge Isolate
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export async function GET(request: Request) {
  try {
    // 1. THE SECURITY GATEWAY
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`

    // We block unauthorized requests at the Edge, so they never even touch our databases
    if (!authHeader || authHeader !== expectedToken) {
      return NextResponse.json(
        { success: false, error: "401 Unauthorized: Invalid Egress Token" }, 
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1D'

    // ==========================================
    // PATH A: LIVE REDIS CACHE (Sub-50ms Response)
    // ==========================================
    if (range === 'LIVE') {
      if (!UPSTASH_URL || !UPSTASH_TOKEN) {
        throw new Error("Redis credentials missing in environment variables.")
      }

      const redisRes = await fetch(`${UPSTASH_URL}/hgetall/keshwam:live_state`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        // Ensure Edge doesn't aggressively cache the fetch response
        cache: 'no-store' 
      })
      
      if (!redisRes.ok) throw new Error(`Upstash fetch failed: ${redisRes.status}`)
      const redisJson = await redisRes.json()
      if (redisJson.error) throw new Error(`Upstash Error: ${redisJson.error}`)

      const liveNodes = []
      if (redisJson.result && Array.isArray(redisJson.result)) {
        for (let i = 1; i < redisJson.result.length; i += 2) {
          try { liveNodes.push(JSON.parse(redisJson.result[i])) } 
          catch (e) { /* Skip malformed node payloads */ }
        }
      }

      return NextResponse.json({ success: true, data: liveNodes }, { status: 200 })
    }

    // ==========================================
    // PATH B: HISTORICAL SUPABASE ROLLUPS
    // ==========================================
    
    // Calculate the cutoff time based on the requested range
    let hoursToFetch = 24
    if (range === '5D') hoursToFetch = 24 * 5
    if (range === '1M') hoursToFetch = 24 * 30
    if (range === 'MAX') hoursToFetch = 24 * 365

    // We query the materialized view we built in Phase 1 instead of the raw table.
    // This reduces the DB workload by 99% and keeps the Vercel payload tiny.
    const { data: rollupData, error } = await supabase
      .from('hourly_node_stats')
      .select('hour_bucket, avg_active_power, peak_power')
      .order('hour_bucket', { ascending: false })
      .limit(hoursToFetch * 5) // 5 nodes per hour

    if (error) throw error

    // Aggregate the 5 separate node rows into a single facility-wide load per hour
    const facilityAggregates: Record<string, { recorded_at: string, active_power: number, peak_demand: number }> = {}

    rollupData?.forEach(row => {
      const timeKey = row.hour_bucket
      if (!facilityAggregates[timeKey]) {
        facilityAggregates[timeKey] = {
          recorded_at: timeKey,
          active_power: 0,
          peak_demand: 0
        }
      }
      facilityAggregates[timeKey].active_power += Number(row.avg_active_power)
      // For facility peak, we sum the node peaks in that hour bucket
      facilityAggregates[timeKey].peak_demand += Number(row.peak_power) 
    })

    const finalData = Object.values(facilityAggregates).sort((a, b) => 
      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    )

    return NextResponse.json({ success: true, data: finalData }, { status: 200 })

  } catch (error: any) {
    console.error("Edge API Error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" }, 
      { status: 500 }
    )
  }
}