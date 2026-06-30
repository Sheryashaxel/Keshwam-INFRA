import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

const NODE_UUID_MAP: Record<number, string> = {
  1: "35779cb1-e3bb-4375-a5cd-24ecccda382a", // Ground
  2: "ca352649-d5f7-40b2-a57d-b4b4f077d010", // Second
  3: "f2d0b950-61d8-4a68-8cf7-b04ded5efe1a", // Third
  4: "635e2bf2-23bc-4566-bb99-35f9b4d0d9e2", // Top
  5: "519296c2-c1ca-423c-933a-a4ee39dc3397"  // Pump
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meterId = parseInt(searchParams.get('meterId') || '1')
    const targetUuid = NODE_UUID_MAP[meterId]

    if (!targetUuid) {
      return NextResponse.json({ success: false, error: "Invalid Meter ID mapping" }, { status: 400 })
    }

    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // 1. Fetch Lambda Time-Travel Playback Series (High-Res 20s or raw data)
    const { data: playbackData, error: pError } = await supabase
      .from('meter_telemetry')
      .select('recorded_at, active_power, voltage, current, power_factor, frequency')
      .eq('node_id', targetUuid)
      .gte('recorded_at', oneDayAgo)
      .order('recorded_at', { ascending: true })

    if (pError) throw new Error(`Playback stream failure: ${pError.message}`)

    // 2. Fetch Aggregated Historical Blocks (Up to 1 Year)
    const { data: historicalData, error: hError } = await supabase
      .from('hourly_telemetry_rollup')
      .select('hour_bucket, sum_active_power, max_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
      .eq('node_id', targetUuid)
      .gte('hour_bucket', oneYearAgo)
      .order('hour_bucket', { ascending: true })

    if (hError) throw new Error(`Historical rollups failure: ${hError.message}`)

    // 3. Compute Structural Metrics Matrices
    let dailySum = 0, weeklySum = 0, monthlySum = 0, yearlySum = 0
    let peakDemand = 0
    const nowMs = now.getTime()

    historicalData?.forEach(row => {
      const bucketMs = new Date(row.hour_bucket).getTime()
      const ageDays = (nowMs - bucketMs) / (1000 * 60 * 60 * 24)
      const activePower = parseFloat(row.sum_active_power || 0)
      const maxPower = parseFloat(row.max_active_power || 0)

      if (ageDays <= 1) dailySum += activePower
      if (ageDays <= 7) weeklySum += activePower
      if (ageDays <= 30) monthlySum += activePower
      if (ageDays <= 365) yearlySum += activePower
      if (maxPower > peakDemand) peakDemand = maxPower
    })

    const responsePayload = {
      success: true,
      metrics: {
        daily_kwh: dailySum / 1000,
        weekly_kwh: weeklySum / 1000,
        monthly_kwh: monthlySum / 1000,
        yearly_kwh: yearlySum / 1000,
        peak_demand_w: peakDemand
      },
      time_series: historicalData?.map(row => ({
        recorded_at: row.hour_bucket,
        active_power: row.sum_active_power || 0,
        voltage: row.avg_voltage || 0,
        current: row.avg_current || 0,
        power_factor: row.avg_power_factor || 0,
        frequency: row.avg_frequency || 50.0
      })) || [],
      playback_series: playbackData || []
    }

    return NextResponse.json(responsePayload, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}