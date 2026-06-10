import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { FormField } from '@/components/formulieren/types'
import { FIELD_TYPE_LABELS } from '@/components/formulieren/types'

// Voorbeeld-waarde per veldtype
function dummyWaarde(field: FormField): string {
  switch (field.type) {
    case 'text':      return 'Voorbeeld tekst'
    case 'textarea':  return 'Langere voorbeeld tekst met meerdere woorden.'
    case 'number':    return '42'
    case 'date':      return new Date().toLocaleDateString('nl-NL')
    case 'time':      return '09:30'
    case 'dropdown':  return field.options?.[0]?.label ?? 'Optie 1'
    case 'radio':     return field.options?.[0]?.label ?? 'Optie 1'
    case 'checkbox':  return field.options?.slice(0, 2).map(o => o.label).join(', ') ?? 'Optie 1, Optie 2'
    case 'boolean':   return 'Ja'
    case 'photo':     return '[Foto — 1 afbeelding]'
    case 'signature': return '[Handtekening aanwezig]'
    case 'location':  return '52.3676, 4.9041 (Amsterdam)'
    case 'barcode':   return '1234567890'
    case 'file':      return 'document.pdf'
    case 'repeatable': return '2 rijen'
    default:          return '—'
  }
}

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const [templateResult, versieResult, pdfConfigResult, bedrijfResult] = await Promise.all([
    supabase.from('form_templates').select('naam').eq('id', id).maybeSingle(),
    supabase.from('form_versies').select('*').eq('template_id', id).order('versienummer', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('formulier_pdf_config').select('*').limit(1).maybeSingle(),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  if (!templateResult.data || !versieResult.data) {
    return NextResponse.json({ error: 'Formulier niet gevonden' }, { status: 404 })
  }

  const template  = templateResult.data as { naam: string }
  const versie    = versieResult.data as { schema: { fields: FormField[] }; versienummer: number }
  const fields    = versie.schema.fields ?? []
  const pdfConfig = pdfConfigResult.data as {
    toon_logo: boolean; toon_invuller: boolean; toon_project_ref: boolean;
    koptekst: string | null; voettekst: string | null;
  } | null
  const bedrijf   = bedrijfResult.data as {
    naam: string | null; logo_primair_url: string | null; logo_url: string | null
  } | null

  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const margin = 18
  let y = margin

  // Voorbeeld-watermark
  doc.setFontSize(48)
  doc.setTextColor(230, 230, 230)
  doc.setFont('helvetica', 'bold')
  doc.text('VOORBEELD', pageW / 2, pageH / 2, { align: 'center', angle: 45 })

  doc.setTextColor(22, 27, 32)

  // Logo
  if (pdfConfig?.toon_logo !== false) {
    const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
    if (logoUrl) {
      const logoB64 = await urlNaarBase64(logoUrl)
      if (logoB64) {
        try { doc.addImage(logoB64, 'PNG', margin, y, 36, 12); y += 14 } catch { /* skip */ }
      }
    }
  }

  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.text(template.naam, margin, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`v${versie.versienummer} · VOORBEELDWEERGAVE`, margin, y + 5)
  y += 14

  if (pdfConfig?.koptekst) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic')
    doc.text(pdfConfig.koptekst, margin, y); y += 7
  }

  const metaDelen: string[] = []
  if (pdfConfig?.toon_invuller !== false) metaDelen.push(`Ingediend: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  if (pdfConfig?.toon_project_ref !== false) metaDelen.push('Project: PRJ-2026-001')
  metaDelen.push('Status: Ingediend')

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
  doc.text(metaDelen.join('  |  '), margin, y); y += 7

  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageW - margin, y); y += 6

  const rows: [string, string][] = fields
    .filter(f => f.type !== 'divider')
    .map(f => {
      if (f.type === 'heading')   return [`▶ ${f.label}`, '']
      if (f.type === 'paragraph') return [f.label, '']
      return [f.label, dummyWaarde(f)]
    })

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Veld', 'Antwoord (voorbeeld)']],
    body: rows,
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 } },
    headStyles: { fillColor: [0, 148, 57], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold', textColor: [45, 55, 72] },
      1: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.startsWith('▶')) {
        data.cell.styles.fillColor = [240, 244, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [0, 100, 200]
      }
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages: number = (doc as any).internal.getNumberOfPages()
  const voettekst = pdfConfig?.voettekst ?? bedrijf?.naam ?? ''
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setTextColor(160, 160, 160)
    if (voettekst) doc.text(voettekst, margin, pageH - 8)
    doc.text(`Pagina ${i} van ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' })
  }

  return new NextResponse(doc.output('arraybuffer'), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="voorbeeld-${id.slice(0, 8)}.pdf"`,
    },
  })
}
