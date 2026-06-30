import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

// Use the Service Role key because this is a secure Server-to-Server call
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    // 1. SERVER-TO-SERVER SECURITY
    // Billflow will send a secret key in the headers. 
    // If it doesn't match the IoT's secret, violently reject it.
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.B2B_API_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized B2B Access' }, { status: 401 })
    }

    // 2. EXTRACT PARAMETERS
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get('node_id')
    const startDate = searchParams.get('start_date') // e.g., '2026-06-01'
    const endDate = searchParams.get('end_date')     // e.g., '2026-06-30'

    if (!nodeId || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // 3. FETCH THE PRE-CALCULATED ROLLUPS (Lightning Fast)
    const { data, error } = await supabase
      .from('daily_telemetry_rollup')
      .select(`
        day_bucket,
        avg_voltage:sum_voltage, 
        reading_count,
        max_active_power,
        max_total_energy,
        min_total_energy
      `)
      .eq('node_id', nodeId)
      .gte('day_bucket', startDate)
      .lte('day_bucket', endDate)
      .order('day_bucket', { ascending: true })

    if (error) throw error

    if (!data || data.length === 0) {
      return NextResponse.json({ message: 'No data found for this period', calendar_data: [], totals: {} }, { status: 200 })
    }

    // 4. FORMAT FOR THE BILLFLOW CALENDAR UI
    let grandTotalUnits = 0;
    let peakPowerLoad = 0;

    const calendarArray = data.map(day => {
      // Calculate actual kWh consumed on this specific day
      const unitsConsumedToday = day.max_total_energy - day.min_total_energy;
      grandTotalUnits += unitsConsumedToday;
      
      if (day.max_active_power > peakPowerLoad) peakPowerLoad = day.max_active_power;

      return {
        date: day.day_bucket,
        units_consumed: Number(unitsConsumedToday.toFixed(2)),
        avg_voltage: Number((day.avg_voltage / day.reading_count).toFixed(1)),
        peak_wattage: Number(day.max_active_power.toFixed(2))
      }
    });

    // 5. RETURN THE READY-TO-RENDER PAYLOAD
    return NextResponse.json({
      success: true,
      billing_period: { start: startDate, end: endDate },
      totals: {
        total_kwh_consumed: Number(grandTotalUnits.toFixed(2)),
        peak_load_watts: Number(peakPowerLoad.toFixed(2))
      },
      calendar_data: calendarArray // This gets mapped directly into your 30-day App Shell UI
    }, { status: 200 })

  } catch (error: any) {
    console.error("[B2B API] Billing Fetch Error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}