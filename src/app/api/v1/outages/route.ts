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
    // 1. Enterprise Auth Handshake
    const authHeader = request.headers.get('authorization')
    const expectedToken = `Bearer ${process.env.EXTERNAL_API_SECRET}`
    
    const hasSupabaseCookie = request.cookies.getAll().some(cookie => 
      cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
    );

    if ((!authHeader || authHeader !== expectedToken) && !hasSupabaseCookie) {
      return NextResponse.json({ success: false, error: "401 Unauthorized - Shreyash Labs Infrastructure" }, { status: 401 })
    }

    // 2. Parse Target Node
    const { searchParams } = new URL(request.url)
    const nodeId = searchParams.get('node_id')

    if (!nodeId) {
      return NextResponse.json({ success: false, error: "Missing node_id parameter" }, { status: 400 })
    }

    // 3. Query the Permanent Blackout Ledger
    const { data: outageData, error } = await supabase
      .from('facility_outages')
      .select('id, dropout_time, restored_time, duration_mins, severity_code')
      .eq('node_id', nodeId)
      .order('dropout_time', { ascending: false }) // Newest blackouts first
      .limit(100); 

    if (error) {
      throw new Error(`Outage DB error: ${error.message}`)
    }

    return NextResponse.json({ success: true, data: outageData || [] }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}