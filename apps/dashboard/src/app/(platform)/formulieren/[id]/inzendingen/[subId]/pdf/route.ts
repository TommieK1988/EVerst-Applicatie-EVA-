import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import jsPDF from 'jspdf'
import type { FormField, FormInstellingen } from '@/components/formulieren/types'
import { formatVeldwaardeTekst } from '@/components/formulieren/format'
import {
  mergePdfConfig, hexNaarRgb, renderPdfItems, pasBriefpapierToe,
  type PdfItem, type GlobalePdfConfig,
} from '@/components/formulieren/pdf-schema'

// Hulpfunctie: URL → base64 data-URL
async function urlNaarBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf  = await resp.arrayBuffer()
    const b64  = Buffer.from(buf).toString('base64')
    const mime = resp.headers.get('content-type') ?? 'image/png'
    return `data:${mime};base64,${b64}`
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  // Object-level authz: de PDF wordt met de admin-client (bypast RLS) opgebouwd — vereis
  // lees-recht op de formulieren-module zodat niet elke ingelogde gebruiker een inzending kan ophalen.
  try {
    await vereisRecht('formulieren', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const { subId } = await params
  const supabase  = createAdminClient()

  // Laad inzending + versie + template
  const { data: inzending, error } = await supabase
    .from('form_inzendingen')
    .select('*, versie:versie_id(*), template:template_id(*)')
    .eq('id', subId)
    .maybeSingle()

  if (error || !inzending) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  const template = inzending.template as { naam: string } | null
  const versie   = inzending.versie   as unknown as { schema: { fields: FormField[]; instellingen?: FormInstellingen }; versienummer: number } | null
  const fields   = versie?.schema?.fields ?? []
  const waarden  = inzending.waarden as Record<string, unknown>
  const instellingen = versie?.schema?.instellingen

  // Laad PDF-config + bedrijfsgegevens
  const [pdfConfigResult, bedrijfResult] = await Promise.all([
    supabase.from('formulier_pdf_config').select('*').limit(1).maybeSingle(),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  // Per-sjabloon PDF-instellingen over de globale singleton leggen.
  const pdfConfig = mergePdfConfig(pdfConfigResult.data as GlobalePdfConfig, instellingen?.pdf)
  const accentRgb = hexNaarRgb(instellingen?.accentkleur)

  const bedrijf = bedrijfResult.data as {
    naam: string | null; logo_primair_url: string | null; logo_url: string | null
  } | null

  // ── Genereer PDF ──────────────────────────────────────────────────
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const margin = 18
  let y = margin

  // Logo
  const toonLogo = pdfConfig.toonLogo
  if (toonLogo) {
    const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
    if (logoUrl) {
      const logoB64 = await urlNaarBase64(logoUrl)
      if (logoB64) {
        try {
          doc.addImage(logoB64, 'PNG', margin, y, 36, 12)
          y += 14
        } catch { /* logo niet beschikbaar */ }
      }
    }
  }

  // Formuliernaam + versie
  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(22, 27, 32)
  doc.text(template?.naam ?? 'Formulier', margin, y + (toonLogo ? 0 : 6))
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`v${versie?.versienummer ?? 1}`, margin, y + (toonLogo ? 0 : 6) + 5)
  y += toonLogo ? 14 : 20

  // Koptekst
  if (pdfConfig.koptekst) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(120, 120, 120)
    doc.text(pdfConfig.koptekst, margin, y)
    y += 7
  }

  // Meta-regel
  const metaDelen: string[] = []

  const toonInvuller = pdfConfig.toonInvuller
  if (toonInvuller && inzending.ingediend_op) {
    const datumStr = new Date(inzending.ingediend_op as string).toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    metaDelen.push(`Ingediend: ${datumStr}`)
  }

  const toonProjectRef = pdfConfig.toonProjectRef
  if (toonProjectRef && inzending.project_ref) {
    metaDelen.push(`Project: ${inzending.project_ref}`)
  }

  metaDelen.push(`Status: ${inzending.status}`)

  if (metaDelen.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(metaDelen.join('  |  '), margin, y)
    y += 7
  }

  // Scheidingslijn
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  // ── Veldwaarden → renderbare items (tabel + pagina-einden + afbeeldingen) ──
  const items: PdfItem[] = []

  for (const field of fields) {
    if (field.type === 'divider') continue
    if (field.type === 'pagebreak') { items.push({ kind: 'pagebreak' }); continue }
    if (field.type === 'image') {
      if (field.afbeeldingUrl) items.push({ kind: 'image', url: field.afbeeldingUrl, breedte: field.afbeeldingBreedte ?? 200, uitlijning: field.opmaak?.uitlijning })
      continue
    }
    if (field.type === 'callout') { items.push({ kind: 'row', cells: [field.label, ''], callout: field.opmaak?.variant ?? 'info' }); continue }
    if (field.type === 'heading') { items.push({ kind: 'row', cells: [field.label, ''], stijl: 'heading' }); continue }
    if (field.type === 'paragraph') { items.push({ kind: 'row', cells: [field.label, ''] }); continue }
    if (field.type === 'signature' || field.type === 'photo') {
      items.push({ kind: 'row', cells: [field.label, '[Afbeelding — zie digitale inzending]'] })
      continue
    }

    // Herhalende sectie: elke rij met zijn sub-velden uitschrijven.
    if (field.type === 'repeatable') {
      const rijen = Array.isArray(waarden[field.id]) ? (waarden[field.id] as Record<string, unknown>[]) : []
      items.push({ kind: 'row', cells: [field.label, rijen.length === 0 ? '(geen rijen)' : ''], stijl: 'heading' })
      rijen.forEach((row, i) => {
        items.push({ kind: 'row', cells: [`#${i + 1}`, ''], stijl: 'rijkop' })
        for (const child of field.children ?? []) {
          if (child.type === 'divider' || child.type === 'heading' || child.type === 'paragraph' || child.type === 'callout' || child.type === 'image' || child.type === 'pagebreak') continue
          const disp = (child.type === 'signature' || child.type === 'photo')
            ? '[Afbeelding — zie digitale inzending]'
            : formatVeldwaardeTekst(child, row[child.id])
          items.push({ kind: 'row', cells: [`    ${child.label}`, disp] })
        }
      })
      continue
    }

    items.push({ kind: 'row', cells: [field.label, formatVeldwaardeTekst(field, waarden[field.id])] })
  }

  await renderPdfItems(doc, items, { startY: y, margin, pageW, pageH, accentRgb })

  // ── Footer per pagina ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages: number = (doc as any).internal.getNumberOfPages()
  const voettekst = pdfConfig.voettekst ?? bedrijf?.naam ?? ''

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(160, 160, 160)
    if (voettekst) {
      doc.text(voettekst, margin, pageH - 8)
    }
    doc.text(`Pagina ${i} van ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' })
  }

  // Briefpapier als achtergrond onder elke pagina (best-effort).
  const pdfBytes = await pasBriefpapierToe(doc.output('arraybuffer'), pdfConfig.briefpapierUrl)
  const veiligNaam = (template?.naam ?? 'formulier').replace(/[^a-z0-9]/gi, '-').toLowerCase()

  return new NextResponse(pdfBytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${veiligNaam}-${subId.slice(0, 8)}.pdf"`,
    },
  })
}
