import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import jsPDF from 'jspdf'
import { urlNaarBase64 } from '@/components/formulieren/pdf-schema'
import { getRapportage } from '../../actions'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Object-level authz: PDF wordt met de admin-client (bypast RLS) gebouwd.
  try {
    await vereisRecht('toolbox', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: toolbox } = await supabase
    .from('toolboxen')
    .select('titel, huidige_versie')
    .eq('id', id)
    .maybeSingle()
  if (!toolbox) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const [deelnemers, bedrijfResult] = await Promise.all([
    getRapportage(id),
    supabase.from('bedrijfsgegevens').select('naam, logo_primair_url, logo_url').limit(1).maybeSingle(),
  ])

  const bedrijf = bedrijfResult.data as { naam: string | null; logo_primair_url: string | null; logo_url: string | null } | null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margeL = 16
  const margeR = pageW - 16

  // ── Kop ────────────────────────────────────────────────────────────
  const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
  const logo = logoUrl ? await urlNaarBase64(logoUrl).catch(() => null) : null
  let y = 16
  if (logo) {
    try { doc.addImage(logo.dataUrl, logo.format, margeR - 34, y, 34, 12, undefined, 'FAST') } catch { /* logo optioneel */ }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(22, 27, 32)
  doc.text('Toolbox — presentielijst', margeL, y + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 100, 108)
  doc.text(toolbox.titel, margeL, y + 13)

  const afgerond = deelnemers.filter((d) => d.status === 'afgerond').length
  doc.setFontSize(9); doc.setTextColor(120, 128, 134)
  const metaRegel = [
    `Versie v${toolbox.huidige_versie}`,
    `Gegenereerd: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    `${afgerond} van ${deelnemers.length} afgerond`,
  ].join('   ·   ')
  doc.text(metaRegel, margeL, y + 19)

  y += 27
  doc.setDrawColor(220, 224, 227); doc.line(margeL, y, margeR, y)
  y += 6

  // ── Tabelkop ───────────────────────────────────────────────────────
  const kolNaam = margeL
  const kolFunctie = margeL + 52
  const kolDatum = margeL + 92
  const kolHandtekening = margeR - 42
  const rijH = 16

  function tekenTabelkop() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 134)
    doc.text('NAAM', kolNaam, y)
    doc.text('FUNCTIE', kolFunctie, y)
    doc.text('AFGEROND OP', kolDatum, y)
    doc.text('HANDTEKENING', kolHandtekening, y)
    y += 3
    doc.setDrawColor(220, 224, 227); doc.line(margeL, y, margeR, y)
    y += 2
  }
  tekenTabelkop()

  // ── Rijen ──────────────────────────────────────────────────────────
  for (const d of deelnemers) {
    if (y + rijH > pageH - 16) {
      doc.addPage(); y = 16; tekenTabelkop()
    }
    const rijY = y + 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(22, 27, 32)
    doc.text(d.medewerker_naam.slice(0, 32), kolNaam, rijY)
    doc.setTextColor(90, 100, 108); doc.setFontSize(9)
    doc.text((d.functie ?? '—').slice(0, 22), kolFunctie, rijY)
    doc.text(
      d.afgerond_op ? new Date(d.afgerond_op).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '—',
      kolDatum, rijY,
    )

    if (d.handtekening_url) {
      const b64 = await urlNaarBase64(d.handtekening_url).catch(() => null)
      if (b64) {
        try { doc.addImage(b64.dataUrl, b64.format, kolHandtekening, y, 34, rijH - 3, undefined, 'FAST') } catch { /* overslaan */ }
      }
    } else {
      doc.setDrawColor(220, 224, 227)
      doc.line(kolHandtekening, rijY, kolHandtekening + 34, rijY)
    }

    y += rijH
    doc.setDrawColor(238, 241, 242); doc.line(margeL, y - 2, margeR, y - 2)
  }

  if (deelnemers.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(120, 128, 134)
    doc.text('Nog geen deelnemers toegewezen.', margeL, y + 6)
  }

  // Voettekst
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 156, 161)
  doc.text(bedrijf?.naam ?? '', margeL, pageH - 10)

  const veiligNaam = toolbox.titel.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const pdfBytes = doc.output('arraybuffer')

  return new NextResponse(pdfBytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="presentielijst-${veiligNaam}.pdf"`,
    },
  })
}
