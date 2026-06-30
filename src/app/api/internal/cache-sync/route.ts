import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // 1. Verify the request actually came from our Supabase Webhook
  const authHeader = request.headers.get('Authorization')
  const expectedSecret = `Bearer ${process.env.WEBHOOK_SECRET_KEY}`

  if (!authHeader || authHeader !== expectedSecret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // 2. Parse the webhook payload from Supabase
    const payload = await request.json()
    
    // Supabase sends the old and new row data on UPDATE
    const newRecord = payload.record 
    
    if (newRecord && newRecord.status === 'revoked') {
      const revokedHash = newRecord.key_hash
      
      // 3. TODO: Purge or blacklist this hash in Redis/Edge Config here
      console.log(`[SECURITY] Revoking cache for key hash: ${revokedHash}`)
      // await redis.del(`device_key:${revokedHash}`)
    }

    return new NextResponse('Cache Synced', { status: 200 })
  } catch (error) {
    return new NextResponse('Bad Request', { status: 400 })
  }
}