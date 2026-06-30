import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

// 🚀 Edge runtime ensures zero cold-start delays
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// 🚀 THE BULLETPROOF DICTIONARY MAP (FIXED FOR ESP32 INDEXING)
const HARDWARE_MAP: Record<string, string> = {
  // The ESP32 is sending `meterIndex` as 0, 1, 2, 3, 4.
  // We must map these exact indexes to the correct UUIDs so the Pump (Index 4) receives its data!
  "0": "35779cb1-e3bb-4375-a5cd-24ecccda382a", // ESP Index 0 -> Ground Floor
  "1": "ca352649-d5f7-40b2-a57d-b4b4f077d010", // ESP Index 1 -> Second Floor
  "2": "f2d0b950-61d8-4a68-8cf7-b04ded5efe1a", // ESP Index 2 -> Third Floor
  "3": "635e2bf2-23bc-4566-bb99-35f9b4d0d9e2", // ESP Index 3 -> Top Floor
  "4": "519296c2-c1ca-423c-933a-a4ee39dc3397", // ESP Index 4 -> Main Pump 🚀 FIXED
  
  // Failsafe in case you switch firmware back to sending Modbus IDs (1-5)
  "5": "519296c2-c1ca-423c-933a-a4ee39dc3397"  
};

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body) return NextResponse.json({ success: false, error: "Empty payload" }, { status: 400 })

    const payloads = Array.isArray(body) ? body : [body];
    if (payloads.length === 0) return NextResponse.json({ success: true });

    const redisPayload: Record<string, string> = {};
    const supabasePayloads: any[] = [];
    const timestampNow = new Date().toISOString();

    for (const data of payloads) {
      // Extract whatever ID the ESP32 decided to send
      const rawId = String(data.node_id ?? data.meterIndex ?? "0");
      
      // Resolve the ID strictly against our Map
      let mappedUuid = HARDWARE_MAP["0"]; // Default Failsafe to Ground Floor
      if (HARDWARE_MAP[rawId]) {
         mappedUuid = HARDWARE_MAP[rawId];
      } else if (Object.values(HARDWARE_MAP).includes(rawId)) {
         mappedUuid = rawId; // It was already a valid UUID
      }

      // Unconditional parsing: if it's 0, it saves as 0. The ping proves it's online.
      const active_power = parseFloat(data.active_power) || 0;
      const voltage = parseFloat(data.voltage) || 0;
      const current = parseFloat(data.current) || 0;
      const power_factor = parseFloat(data.power_factor) || 0;
      const frequency = parseFloat(data.frequency) || 50.0;
      const total_energy = parseFloat(data.total_energy) || 0;

      // Pack for Upstash Redis (The Live Dashboard)
      redisPayload[mappedUuid] = JSON.stringify({
        node_id: mappedUuid, // Injecting UUID directly into the JSON for UI safety
        voltage,
        current,
        power_factor,
        frequency,
        active_power,
        total_energy,
        recorded_at: timestampNow
      });

      // Pack for Supabase Postgres (The Historical DB)
      supabasePayloads.push({
        node_id: mappedUuid,
        recorded_at: timestampNow,
        active_power,
        voltage,
        current,
        power_factor,
        frequency,
        total_energy
      });
    }

    // MULTI-THREADED EXECUTION
    // Pushes all valid meters to Redis and Postgres simultaneously.
   // Push the stringified payloads into the Redis queue for the cron job to handle later
    const queuePayloads = supabasePayloads.map(p => JSON.stringify(p));
    
    await Promise.all([
      redis.hset("keshwam:live_state", redisPayload),
      redis.rpush("keshwam:telemetry_queue", ...queuePayloads) // ✅ Fast, non-blocking queue insertion
    ]);

    return NextResponse.json({ success: true, count: payloads.length }, { status: 200 })

  } catch (error: any) {
    console.error("Ingress Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}