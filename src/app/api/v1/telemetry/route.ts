import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`
    
    const hasSupabaseCookie = request.cookies.getAll().some(cookie => 
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    );

    if ((!authHeader || authHeader !== expectedToken) && !hasSupabaseCookie) {
      return NextResponse.json({ success: false, error: "401 Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1D'
    const targetMsStr = searchParams.get('target_ms') // 🚀 NEW: UTC-Safe Millisecond targeting
    const archiveRange = searchParams.get('archive_range') || '1D' 
    const calendarMonthStr = searchParams.get('calendar_month') 
    const calendarYearStr = searchParams.get('calendar_year')

    // ==========================================
    // PATH A: HOT PATH - REDIS (Live Ticker Only)
    // ==========================================
    if (range === 'LIVE' && !targetMsStr && !calendarMonthStr && !calendarYearStr) {
      if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error("Redis credentials missing.")
      const redisRes = await fetch(`${UPSTASH_URL}/hgetall/keshwam:live_state`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        cache: 'no-store' 
      })
      if (!redisRes.ok) throw new Error(`Upstash failed: ${redisRes.status}`)
      const redisJson = await redisRes.json()
      const liveNodes: any[] = []
      
      if (redisJson.result && Array.isArray(redisJson.result)) {
        for (let i = 0; i < redisJson.result.length; i += 2) {
          try { 
            const nodeDataString = redisJson.result[i + 1]
            if (nodeDataString) {
              const parsedNode = JSON.parse(nodeDataString)
              parsedNode.node_id = redisJson.result[i] 
              liveNodes.push(parsedNode)
            }
          } catch (e) {}
        }
      }
      return NextResponse.json({ success: true, data: liveNodes }, { status: 200 })
    }

    // ==========================================
    // PATH E: HEATMAP DAILY YEAR MATRIX
    // ==========================================
    if (calendarYearStr) {
      const year = parseInt(calendarYearStr);
      const startOfYear = `${year}-01-01T00:00:00.000Z`;
      const endOfYear = `${year + 1}-01-01T00:00:00.000Z`;

      const { data: dailyData, error: dailyError } = await supabase
        .from('daily_telemetry_rollup')
        .select('day_bucket, node_id, peak_active_power, avg_voltage, avg_power_factor, total_energy_kwh')
        .gte('day_bucket', startOfYear)
        .lt('day_bucket', endOfYear)
        .order('day_bucket', { ascending: true })
        .limit(10000); 
        
      if (dailyError) throw new Error(`Daily Rollup DB error: ${dailyError.message}`);

      const mappedDaily = dailyData?.map(row => ({
        recorded_at: row.day_bucket, node_id: row.node_id, active_power: row.peak_active_power || 0, voltage: row.avg_voltage || 0, current: 0, power_factor: row.avg_power_factor || 0, frequency: 50.0, total_energy: row.total_energy_kwh || 0, is_rollup: true
      })) || [];

      return NextResponse.json({ success: true, data: mappedDaily }, { status: 200 });
    }

    // ==========================================
    // PATH D: HEATMAP HOURLY MONTH
    // ==========================================
    if (calendarMonthStr) {
      const [year, month] = calendarMonthStr.split('-');
      const startOfMonth = `${year}-${month}-01T00:00:00.000Z`;
      
      const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const endOfMonth = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;

      const { data: rollupData, error: rollupError } = await supabase
        .from('hourly_telemetry_rollup')
        .select('hour_bucket, node_id, sum_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
        .gte('hour_bucket', startOfMonth)
        .lt('hour_bucket', endOfMonth)
        .order('hour_bucket', { ascending: true })
        .limit(15000); 
        
      if (rollupError) throw new Error(`Rollup DB error: ${rollupError.message}`);

      const mappedRollup = rollupData?.map(row => ({
        recorded_at: row.hour_bucket, node_id: row.node_id, active_power: row.sum_active_power || 0, voltage: row.avg_voltage || 0, current: row.avg_current || 0, power_factor: row.avg_power_factor || 0, frequency: row.avg_frequency || 50.0, is_rollup: true
      })) || [];

      return NextResponse.json({ success: true, data: mappedRollup }, { status: 200 });
    }

    // ==========================================
    // 🚀 PATH C: EXACT UTC-SAFE TIME TRAVEL ARCHIVE
    // ==========================================
    if (targetMsStr) {
      const localMidnightMs = parseInt(targetMsStr);
      
      // Calculate Exact Window Boundaries based strictly on passed Milliseconds
      const endOfRange = new Date(localMidnightMs + (24 * 60 * 60 * 1000) - 1); // Exactly 23:59:59 of that local day
      const startOfRange = new Date(localMidnightMs);

      // Adjust start date based on requested modal range
      if (archiveRange === '7D') startOfRange.setDate(startOfRange.getDate() - 6);
      if (archiveRange === '30D') startOfRange.setDate(startOfRange.getDate() - 29);
      if (archiveRange === '1Y') startOfRange.setFullYear(startOfRange.getFullYear() - 1);

      // MACRO ARCHIVE (1 Year -> Daily Rollups Only)
      if (archiveRange === '1Y') {
        const { data: dailyData, error: dailyError } = await supabase
          .from('daily_telemetry_rollup')
          .select('day_bucket, node_id, peak_active_power, avg_voltage, avg_power_factor, total_energy_kwh')
          .gte('day_bucket', startOfRange.toISOString())
          .lte('day_bucket', endOfRange.toISOString())
          .order('day_bucket', { ascending: true })
          .limit(10000);

        if (dailyError) throw new Error(`Daily DB error: ${dailyError.message}`);

        const mappedDaily = dailyData?.map(row => ({
          recorded_at: row.day_bucket, node_id: row.node_id, active_power: row.peak_active_power || 0, voltage: row.avg_voltage || 0, current: 0, power_factor: row.avg_power_factor || 0, frequency: 50.0, total_energy: row.total_energy_kwh || 0, is_gap: false, is_rollup: true
        })) || [];

        return NextResponse.json({ success: true, data: mappedDaily }, { status: 200 });
      }

      // MID ARCHIVE (7D / 30D -> Hourly Rollups Only)
      if (archiveRange === '7D' || archiveRange === '30D') {
        const { data: rollupData, error: rollupError } = await supabase
          .from('hourly_telemetry_rollup')
          .select('hour_bucket, node_id, sum_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
          .gte('hour_bucket', startOfRange.toISOString())
          .lte('hour_bucket', endOfRange.toISOString())
          .order('hour_bucket', { ascending: true })
          .limit(10000);

        if (rollupError) throw new Error(`Rollup DB error: ${rollupError.message}`);

        const mappedRollup = rollupData?.map(row => ({
          recorded_at: row.hour_bucket, node_id: row.node_id, active_power: row.sum_active_power || 0, voltage: row.avg_voltage || 0, current: row.avg_current || 0, power_factor: row.avg_power_factor || 0, frequency: row.avg_frequency || 50.0, total_energy: 0, is_gap: false, is_rollup: true
        })) || [];

        return NextResponse.json({ success: true, data: mappedRollup }, { status: 200 });
      }

      // MICRO ARCHIVE (1D -> Hourly + Raw Data Stitched)
      const { data: rollupData, error: rollupError } = await supabase
        .from('hourly_telemetry_rollup')
        .select('hour_bucket, node_id, sum_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency')
        .gte('hour_bucket', startOfRange.toISOString())
        .lte('hour_bucket', endOfRange.toISOString())
        .order('hour_bucket', { ascending: true })
        .limit(5000);

      if (rollupError) throw new Error(`Rollup DB error: ${rollupError.message}`);

      const { data: rawData, error: rawError } = await supabase
        .from('meter_telemetry')
        .select('recorded_at, node_id, active_power, voltage, current, power_factor, frequency, total_energy')
        .gte('recorded_at', startOfRange.toISOString())
        .lte('recorded_at', endOfRange.toISOString())
        .order('recorded_at', { ascending: true }) 
        .limit(10000);

      if (rawError) throw new Error(`Raw DB error: ${rawError.message}`);

      const mappedRollup = rollupData?.map(row => ({
        recorded_at: row.hour_bucket, node_id: row.node_id, active_power: row.sum_active_power || 0, voltage: row.avg_voltage || 0, current: row.avg_current || 0, power_factor: row.avg_power_factor || 0, frequency: row.avg_frequency || 50.0, total_energy: 0, is_rollup: true
      })) || [];

      const mappedRaw = rawData?.map(row => ({
        recorded_at: row.recorded_at, node_id: row.node_id, active_power: row.active_power || 0, voltage: row.voltage || 0, current: row.current || 0, power_factor: row.power_factor || 0, frequency: row.frequency || 50.0, total_energy: row.total_energy || 0, is_rollup: false
      })) || [];

      const mergedData = [...mappedRollup, ...mappedRaw].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

      const processedPoints: any[] = [];
      const nodeGroups: Record<string, any[]> = {};
      
      mergedData.forEach(d => {
          if (!nodeGroups[d.node_id]) nodeGroups[d.node_id] = [];
          nodeGroups[d.node_id].push(d);
      });

      for (const [nodeId, nodeData] of Object.entries(nodeGroups)) {
          for (let i = 0; i < nodeData.length; i++) {
              const currentTs = new Date(nodeData[i].recorded_at).getTime();
              if (i > 0) {
                  const prevData = nodeData[i - 1];
                  const prevTs = new Date(prevData.recorded_at).getTime();
                  const isRollupPhase = nodeData[i].is_rollup || prevData.is_rollup;
                  const threshold = isRollupPhase ? 3 * 60 * 60 * 1000 : 3 * 60 * 1000;

                  if (currentTs - prevTs > threshold) {
                      processedPoints.push({
                          recorded_at: new Date(prevTs + 1000).toISOString(),
                          node_id: nodeId,
                          is_gap: true,
                          active_power: null, voltage: null, current: null, power_factor: null, frequency: null, total_energy: null
                      });
                  }
              }
              processedPoints.push({ ...nodeData[i], is_gap: false });
          }
      }

      return NextResponse.json({ success: true, data: processedPoints }, { status: 200 })
    }

    // ==========================================
    // PATH B: LAMBDA ARCHITECTURE (Stitched Data)
    // ==========================================
    let startDate = new Date();
    const isMacroView = ['3M', '6M', '1Y', 'MAX'].includes(range);

    if (range === '1D') startDate.setHours(startDate.getHours() - 24);
    else if (range === '7D') startDate.setDate(startDate.getDate() - 7);
    else if (range === '30D' || range === '1M') startDate.setDate(startDate.getDate() - 30);
    else if (range === '3M') startDate.setMonth(startDate.getMonth() - 3);
    else if (range === '6M') startDate.setMonth(startDate.getMonth() - 6);
    else if (range === '1Y') startDate.setFullYear(startDate.getFullYear() - 1);
    else if (range === 'MAX') startDate.setFullYear(startDate.getFullYear() - 5);

    if (isMacroView) {
        const { data: dailyData, error: dailyError } = await supabase.from('daily_telemetry_rollup').select('day_bucket, node_id, peak_active_power, avg_voltage, avg_power_factor, total_energy_kwh').gte('day_bucket', startDate.toISOString()).order('day_bucket', { ascending: true }).limit(10000)
        if (dailyError) throw new Error(`Daily DB error: ${dailyError.message}`)
        
        const mappedDaily = dailyData?.map(row => ({ recorded_at: row.day_bucket, node_id: row.node_id, active_power: row.peak_active_power || 0, voltage: row.avg_voltage || 0, current: 0, power_factor: row.avg_power_factor || 0, frequency: 50.0, total_energy: row.total_energy_kwh || 0, is_gap: false, is_rollup: true })) || [];
        return NextResponse.json({ success: true, data: mappedDaily }, { status: 200 })
    }

    const { data: rollupData, error: rollupError } = await supabase.from('hourly_telemetry_rollup').select('hour_bucket, node_id, sum_active_power, avg_voltage, avg_current, avg_power_factor, avg_frequency').gte('hour_bucket', startDate.toISOString()).order('hour_bucket', { ascending: true }).limit(10000)
    if (rollupError) throw new Error(`Rollup DB error: ${rollupError.message}`)

    let latestRollupTime = startDate.toISOString();
    if (rollupData && rollupData.length > 0) latestRollupTime = rollupData.reduce((max, obj) => new Date(obj.hour_bucket) > new Date(max) ? obj.hour_bucket : max, rollupData[0].hour_bucket);

    const { data: rawData, error: rawError } = await supabase.from('meter_telemetry').select('recorded_at, node_id, active_power, voltage, current, power_factor, frequency, total_energy').gt('recorded_at', latestRollupTime).order('recorded_at', { ascending: false }).limit(10000)
    if (rawError) throw new Error(`Raw DB error: ${rawError.message}`)

    const mappedRollup = rollupData?.map(row => ({ recorded_at: row.hour_bucket, node_id: row.node_id, active_power: row.sum_active_power || 0, voltage: row.avg_voltage || 0, current: row.avg_current || 0, power_factor: row.avg_power_factor || 0, frequency: row.avg_frequency || 50.0, total_energy: 0, is_rollup: true })) || [];
    const mappedRaw = rawData?.reverse().map(row => ({ recorded_at: row.recorded_at, node_id: row.node_id, active_power: row.active_power || 0, voltage: row.voltage || 0, current: row.current || 0, power_factor: row.power_factor || 0, frequency: row.frequency || 50.0, total_energy: row.total_energy || 0, is_rollup: false })) || [];

    const mergedData = [...mappedRollup, ...mappedRaw].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    
    // Gap Injection Logic
    const processedPoints: any[] = [];
    const nodeGroups: Record<string, any[]> = {};
    mergedData.forEach(d => {
        if (!nodeGroups[d.node_id]) nodeGroups[d.node_id] = [];
        nodeGroups[d.node_id].push(d);
    });

    for (const [nodeId, nodeData] of Object.entries(nodeGroups)) {
        for (let i = 0; i < nodeData.length; i++) {
            const currentTs = new Date(nodeData[i].recorded_at).getTime();
            if (i > 0) {
                const prevData = nodeData[i - 1];
                const prevTs = new Date(prevData.recorded_at).getTime();
                const isRollupPhase = nodeData[i].is_rollup || prevData.is_rollup;
                const threshold = isRollupPhase ? 3 * 60 * 60 * 1000 : 3 * 60 * 1000;

                if (currentTs - prevTs > threshold) {
                    processedPoints.push({
                        recorded_at: new Date(prevTs + 1000).toISOString(), node_id: nodeId, is_gap: true, active_power: null, voltage: null, current: null, power_factor: null, frequency: null, total_energy: null
                    });
                }
            }
            processedPoints.push({ ...nodeData[i], is_gap: false });
        }
    }

    return NextResponse.json({ success: true, data: processedPoints }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}