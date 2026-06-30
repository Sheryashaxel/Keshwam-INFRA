import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get('nodeId')

    if (!nodeId) return NextResponse.json({ success: false, error: "Missing nodeId" }, { status: 400 })

    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    
    // Fetch aggregated hourly data
    const { data, error } = await supabase
      .from('hourly_telemetry_rollup')
      .select('hour_bucket, sum_active_power, max_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
      .eq('node_id', nodeId)
      .gte('hour_bucket', oneYearAgo)
      .order('hour_bucket', { ascending: false })

    if (error) throw new Error(`DB error: ${error.message}`)

    // Fetch high-res 24H data for the Playback Engine
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: rawData, error: rawError } = await supabase
      .from('meter_telemetry')
      .select('recorded_at, active_power, voltage, current, power_factor, frequency')
      .eq('node_id', nodeId)
      .gte('recorded_at', oneDayAgo)
      .order('recorded_at', { ascending: true })

    if (rawError) throw new Error(`Raw DB error: ${rawError.message}`)

    const now = Date.now();
    let daily_w = 0, weekly_w = 0, monthly_w = 0, yearly_w = 0;
    let peak_w = 0;

    const graphData = data?.map(row => {
      const rowTime = new Date(row.hour_bucket).getTime();
      const diffDays = (now - rowTime) / (1000 * 60 * 60 * 24);
      const power = row.sum_active_power || 0;

      if (diffDays <= 1) daily_w += power;
      if (diffDays <= 7) weekly_w += power;
      if (diffDays <= 30) monthly_w += power;
      if (diffDays <= 365) yearly_w += power;
      if (row.max_active_power > peak_w) peak_w = row.max_active_power;

      return {
        recorded_at: row.hour_bucket,
        active_power: power,
        voltage: row.avg_voltage || 0,
        current: row.avg_current || 0,
        power_factor: row.avg_power_factor || 0,
        frequency: row.avg_frequency || 50.0
      }
    }) || [];

    const stats = {
      daily_kwh: daily_w / 1000,
      weekly_kwh: weekly_w / 1000,
      monthly_kwh: monthly_w / 1000,
      yearly_kwh: yearly_w / 1000,
      peak_demand_w: peak_w,
      estimated_monthly_cost: (monthly_w / 1000) * 8.5, // Assuming ₹8.5 per unit
      carbon_offset_kg: (monthly_w / 1000) * 0.85 // 0.85 kg CO2 per kWh
    }

    return NextResponse.json({ success: true, stats, time_series: graphData, playback_series: rawData }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}