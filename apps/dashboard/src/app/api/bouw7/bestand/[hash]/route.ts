import { NextRequest, NextResponse } from 'next/server'
import { getBouw7Client } from '@/lib/bouw7/sync'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bouw7/bestand/{secureHash}?naam=...
 *
 * Proxy voor Bouw7-bestandsdownload (GET /storage/{hash}/download). De Bouw7-download vereist de
 * Bearer-token, dus kan geen kale link zijn — EVA haalt het bestand op met de gedeelde client en
 * streamt het terug. `naam` bepaalt de weergegeven bestandsnaam.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params
  if (!hash) return new NextResponse('Geen bestand opgegeven', { status: 400 })

  try {
    const client = await getBouw7Client()
    const { data, contentType, fileName } = await client.getBinary(`/storage/${encodeURIComponent(hash)}/download`)
    const naam = (req.nextUrl.searchParams.get('naam') || fileName || 'bestand').replace(/["\r\n]/g, '')
    return new NextResponse(Buffer.from(data), {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${naam}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    return new NextResponse(`Download mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`, { status: 502 })
  }
}
