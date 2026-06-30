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
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`
    const hasSupabaseCookie = request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'));

    if ((!authHeader || authHeader !== expectedToken) && !hasSupabaseCookie) {
      return NextResponse.json({ success: false, error: "401 Unauthorized" }, { status: 401 })
    }

    const { data: nodes, error: nodesError } = await supabase.from('network_nodes').select('*').order('modbus_slave_id', { ascending: true })
    if (nodesError) throw new Error(`Node fetch failed: ${nodesError.message}`)

    const { data: hardwareLogs, error: logsError } = await supabase.from('node_hardware_logs').select('*').order('recorded_at', { ascending: false }).limit(500)
    if (logsError) throw new Error(`Log fetch failed: ${logsError.message}`)

    const latestLogs = new Map();
    hardwareLogs?.forEach(log => {
      if (!latestLogs.has(log.node_uuid)) latestLogs.set(log.node_uuid, log);
    });

    // 🚀 DSA GRAPH ENGINE: Build Adjacency List & Base Health
    const adjList = new Map();
    const baseHealth = new Map();

    nodes?.forEach(n => {
      adjList.set(n.id, []);
      const diag = latestLogs.get(n.node_uuid);
      let isAlive = false;
      
      if (diag && diag.recorded_at) {
        let parsedTime = new Date(diag.recorded_at).getTime();
        
        if (!isNaN(parsedTime)) {
            let diff = Date.now() - parsedTime;
            
            // 🚀 FIX: The IST Timezone Drift Hack restored for the Backend Graph Engine!
            if (diff < -19000000 && diff > -20000000) diff += 19800000; 
            if (diff > 19000000 && diff < 20000000) diff -= 19800000;

            isAlive = Math.abs(diff) < 300000; // 5 min strict tolerance
        }
      }
      baseHealth.set(n.id, isAlive);
    });

    nodes?.forEach(n => {
      if (n.parent_node_id && adjList.has(n.parent_node_id)) {
        adjList.get(n.parent_node_id).push(n.id);
      }
    });

    // 🚀 DSA GRAPH ENGINE: Breadth-First Search (BFS) for Cascading Failures
    const finalHealth = new Map();
    const rootNodes = nodes?.filter(n => !n.parent_node_id || n.modbus_slave_id === 1) || [];
    const queue = [...rootNodes.map(n => ({ id: n.id, parentStatus: 'ONLINE' }))];

    while(queue.length > 0) {
      const current = queue.shift()!;
      const selfBaseAlive = baseHealth.get(current.id);
      
      let status = 'ONLINE';
      if (current.parentStatus !== 'ONLINE') {
        status = 'CASCADE_FAULT'; // The wire above it is cut
      } else if (!selfBaseAlive) {
        status = 'OFFLINE'; // The node itself is dead
      }

      finalHealth.set(current.id, status);

      const children = adjList.get(current.id) || [];
      children.forEach((childId: number) => {
        queue.push({ id: childId, parentStatus: status });
      });
    }

    // Map Final Payload
    const topology = nodes?.map(node => {
      const diag = latestLogs.get(node.node_uuid);
      return {
        id: node.id,
        uuid: node.node_uuid,
        label: node.label,
        modbus_id: node.modbus_slave_id,
        parent_id: node.parent_node_id,
        floor: node.location_floor,
        diagnostics: {
          status: finalHealth.get(node.id),
          wifi_rssi: diag?.wifi_rssi || 0,
          free_heap: diag?.free_heap_bytes || 0,
          uptime_sec: diag?.uptime_seconds || 0,
          packet_success: diag?.packet_success_rate || 0,
          bus_voltage: diag?.bus_voltage_mv || 0,
          last_seen: diag?.recorded_at || null
        }
      }
    });

    return NextResponse.json({ success: true, nodes: topology }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}