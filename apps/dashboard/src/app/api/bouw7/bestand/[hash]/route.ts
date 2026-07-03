import { NextRequest, NextResponse } from 'next/server'
import { getBouw7Client } from '@/lib/bouw7/sync'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bouw7/bestand/{fileHash}?id={projectFileId}&naam=...
 *
 * Proxy voor Bouw7-bestandsdownload. De Bouw7-download vereist de Bearer-token, dus kan geen kale
 * link zijn — EVA haalt het bestand op met de gedeelde client en streamt het terug.
 * Primair via de storage-hash (GET /storage/{fileHash}/download); lukt dat niet en is er een
 * project-file-id meegegeven, dan valt het terug op GET /project/file/{id}. `naam` = weergavenaam.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params
  const id = req.nextUrl.searchParams.get('id')
  if (!hash && !id) return new NextResponse('Geen bestand opgegeven', { status: 400 })

  const client = await getBouw7Client()
  const paden: string[] = []
  if (hash && hash !== '-') paden.push(`/storage/${encodeURIComponent(hash)}/download`)
  if (id) paden.push(`/project/file/${encodeURIComponent(id)}`)

  let laatsteFout = 'onbekende fout'
  for (const pad of paden) {
    try {
      const { data, contentType, fileName } = await client.getBinary(pad)
      const naam = (req.nextUrl.searchParams.get('naam') || fileName || 'bestand').replace(/["\r\n]/g, '')
      return new NextResponse(Buffer.from(data), {
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${naam}"`,
          'Cache-Control': 'private, max-age=60',
        },
      })
    } catch (e) {
      laatsteFout = e instanceof Error ? e.message : 'onbekende fout'
    }
  }
  return new NextResponse(`Download mislukt: ${laatsteFout}`, { status: 502 })
}
