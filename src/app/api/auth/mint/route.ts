import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    // 1. Root Admin Check: SECURE BACKEND VARIABLE NOW ACTIVE
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.EXTERNAL_API_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized: Root access required" }, { status: 401 })
    }

    const body = await request.json()
    const { identity, scopes, nodeId, cidr } = body

    if (!identity || !nodeId) {
      return NextResponse.json({ error: "Identity and Node ID are required" }, { status: 400 })
    }

    // 2. The Cryptographic Signature
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!)
    
    const jwt = await new SignJWT({ 
      scopes,       // e.g., ['ELEC', 'WATR']
      node: nodeId, // e.g., 5
      cidr          // e.g., '10.0.0.0/8' (For future IP validation)
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('keshwam-infra-iam')
      .setSubject(identity)
      .setExpirationTime('1y') // Set a 1-year hardware rotation policy
      .sign(secret)

    return NextResponse.json({ 
      success: true, 
      token: jwt,
      message: `Token minted successfully for ${identity} locked to Node 0x0${nodeId}`
    }, { status: 201 })

  } catch (error: any) {
    console.error("Key Minting Error:", error)
    return NextResponse.json({ error: "Internal KMS Failure" }, { status: 500 })
  }
}