import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get('nodeId')
    const mode = searchParams.get('mode') || 'VCR'
    const range = searchParams.get('range') || '30D'
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    if (!nodeId) return NextResponse.json({ success: false, error: "Missing Target Node ID" }, { status: 400 })

    let startDate = new Date();
    let endDate = new Date();
    
    if (startParam && endParam) {
      startDate = new Date(startParam);
      endDate = new Date(endParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      if (range === '1D') startDate.setHours(startDate.getHours() - 24);
      else if (range === '7D') startDate.setDate(startDate.getDate() - 7);
      else if (range === '30D') startDate.setDate(startDate.getDate() - 30);
      else if (range === '3M') startDate.setMonth(startDate.getMonth() - 3);
      else if (range === '6M') startDate.setMonth(startDate.getMonth() - 6);
      else if (range === '1Y') startDate.setFullYear(startDate.getFullYear() - 1);
      else if (range === 'MAX') startDate.setFullYear(startDate.getFullYear() - 5);
    }

    // ==========================================
    // HEATMAP: Querying the new CRON-powered Daily Table directly
    // ==========================================
    if (mode === 'HEATMAP') {
      const { data, error } = await supabase
        .from('daily_telemetry_rollup')
        .select('day_bucket, total_energy_kwh')
        .eq('node_id', nodeId)
        .gte('day_bucket', startDate.toISOString())
        .lte('day_bucket', endDate.toISOString())
        .order('day_bucket', { ascending: true })
        .limit(365)

      if (error) throw new Error(`Heatmap DB error: ${error.message}`)

      // Direct 1-to-1 mapping, no math required on the edge server
      const heatmapData = data?.map(row => ({ 
          date: row.day_bucket, 
          kwh: parseFloat(row.total_energy_kwh) || 0 
      })) || [];
      
      return NextResponse.json({ success: true, data: heatmapData }, { status: 200 })
    }

    // ==========================================
    // VCR & OUTAGE: The Lambda Merge Engine
    // ==========================================
    
    // 1. Fetch Historical Hourly Rollups
    const { data: rollupData, error: rollupError } = await supabase
      .from('hourly_telemetry_rollup')
      .select('hour_bucket, sum_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
      .eq('node_id', nodeId)
      .gte('hour_bucket', startDate.toISOString())
      .lte('hour_bucket', endDate.toISOString())
      .order('hour_bucket', { ascending: true })
      .limit(10000)

    if (rollupError) throw new Error(`Rollup DB error: ${rollupError.message}`)

    // 2. Fetch Recent Raw Data (To catch immediate micro-blackouts and live ticks)
    let latestRollupTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    if (rollupData && rollupData.length > 0) {
       latestRollupTime = rollupData[rollupData.length - 1].hour_bucket;
    }

    const { data: rawData, error: rawError } = await supabase
      .from('meter_telemetry')
      .select('recorded_at, active_power, voltage, current, power_factor, frequency')
      .eq('node_id', nodeId)
      .gt('recorded_at', latestRollupTime)
      .order('recorded_at', { ascending: true })
      .limit(10000)

    if (rawError) throw new Error(`Raw DB error: ${rawError.message}`)

    // 3. Map both datasets to a unified chronological structure
    const mappedRollup = rollupData?.map(row => ({
      recorded_at: row.hour_bucket,
      active_power: row.sum_active_power || 0,
      voltage: row.avg_voltage || 0,
      current: row.avg_current || 0,
      power_factor: row.avg_power_factor || 0,
      frequency: row.avg_frequency || 50.0,
      is_rollup: true
    })) || [];

    const mappedRaw = rawData?.map(row => ({
      recorded_at: row.recorded_at,
      active_power: row.active_power || 0,
      voltage: row.voltage || 0,
      current: row.current || 0,
      power_factor: row.power_factor || 0,
      frequency: row.frequency || 50.0,
      is_rollup: false
    })) || [];

    const mergedData = [...mappedRollup, ...mappedRaw].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    // 4. Process Gaps and Outages
    const processedVcr: any[] = [];
    const outageLogs: any[] = [];
    let totalOutageHours = 0;

    for (let i = 0; i < mergedData.length; i++) {
        const currentObj = mergedData[i];
        const currentTs = new Date(currentObj.recorded_at).getTime();

        if (i > 0) {
            const prevObj = mergedData[i - 1];
            const prevTs = new Date(prevObj.recorded_at).getTime();
            const gapMs = currentTs - prevTs;

            // Rollup Outage = 1.5 Hours. Raw Outage = 2 Minutes (120000ms).
            const isRollupPhase = currentObj.is_rollup || prevObj.is_rollup;
            const threshold = isRollupPhase ? 5400000 : 120000;

            if (gapMs > threshold) {
                const durationHours = gapMs / 3600000;
                totalOutageHours += durationHours;
                
                outageLogs.push({
                    start_time: prevObj.recorded_at,
                    end_time: currentObj.recorded_at,
                    duration_hours: parseFloat(durationHours.toFixed(3)),
                    severity: durationHours > 1 ? 'CRITICAL' : 'MODERATE'
                });

                // Inject `null` gap to physically snap the ECharts line
                processedVcr.push({
                    recorded_at: new Date(prevTs + 1000).toISOString(),
                    is_gap: true,
                    active_power: null, voltage: null, current: null, power_factor: null, frequency: null
                });
            }
        }
        processedVcr.push({ ...currentObj, is_gap: false });
    }

    if (mode === 'OUTAGE') {
        const timeSpanHours = (endDate.getTime() - startDate.getTime()) / 3600000;
        const uptimePercentage = timeSpanHours > 0 ? ((timeSpanHours - totalOutageHours) / timeSpanHours) * 100 : 100;
        
        return NextResponse.json({ 
            success: true, 
            stats: { total_outages: outageLogs.length, uptime_percent: Math.min(100, Math.max(0, parseFloat(uptimePercentage.toFixed(2)))) },
            data: outageLogs.reverse() 
        }, { status: 200 })
    }

    return NextResponse.json({ success: true, data: processedVcr }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}