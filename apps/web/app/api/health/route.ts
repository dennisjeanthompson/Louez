import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      env_trust_host: process.env.AUTH_TRUST_HOST,
      env_url: process.env.AUTH_URL,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  )
}
