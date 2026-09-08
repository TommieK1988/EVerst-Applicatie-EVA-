import { NextResponse } from 'next/server'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisInkoopfactuurToegang } from '@/lib/inkoopfacturen/actions'
import type { Bouw7PurchaseInvoiceDetail } from '@/lib/bouw7/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/inkoopfacturen/{id}/document — het factuurdocument van één inkoopfactuur.
 *
 * Bewust een eigen route en niet `/api/bouw7/bestand/[hash]`. Die route gate't op
 * `dossiers:lezen` en neemt een wíllekeurige storage-hash uit de URL aan: allebei fout hier.
 * Een inkoopfactuur-lezer heeft geen dossiers-recht nodig, en een hash in de URL zou de
 * scope-regel omzeilen — dan kan iemand zonder `inkoopfacturen_alle` alsnog een overheadfactuur
 * ophalen als hij de hash ergens vandaan haalt.
 *
 * Daarom: de EVA-uuid in het pad, `vereisInkoopfactuurToegang` erop, en de storage-sleutel pas
 * daarna zelf uit Bouw7 lezen. De sleutel bereikt de browser nooit.
 *
 * Downloaden met `file.uri`, NIET met `file.secureHash`: bij inkoopfacturen geeft de secureHash
 * een 404 (anders dan bij projectbestanden). Zie de doc-comment op `Bouw7PurchaseInvoiceDetail`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  let bouw7InvoiceId: string
  try {
    const { factuur } = await vereisInkoopfactuurToegang(id, 'lezen')
    bouw7InvoiceId = factuur.bouw7_invoice_id
  } catch (e) {
    if (e instanceof GeenToegangError) return new NextResponse('Geen toegang', { status: 403 })
    throw e
  }

  const client = await getBouw7Client()

  let detail: Bouw7PurchaseInvoiceDetail
  try {
    detail = await client.get<Bouw7PurchaseInvoiceDetail>(
      `/purchase-invoicing/purchase-invoice/${bouw7InvoiceId}`
    )
  } catch (e) {
    return new NextResponse(
      `Factuur ophalen mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`,
      { status: 502 },
    )
  }

  const uri = detail.file?.uri
  if (!uri) return new NextResponse('Bij deze factuur is geen document opgeslagen.', { status: 404 })

  try {
    const { data, contentType, fileName } = await client.getBinary(`/storage/${encodeURIComponent(uri)}/download`)
    const naam = (detail.file?.name || fileName || `factuur-${bouw7InvoiceId}.pdf`).replace(/["\r\n]/g, '')
    return new NextResponse(Buffer.from(data), {
      headers: {
        'Content-Type': contentType || 'application/pdf',
        'Content-Disposition': `inline; filename="${naam}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    return new NextResponse(
      `Download mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`,
      { status: 502 },
    )
  }
}
