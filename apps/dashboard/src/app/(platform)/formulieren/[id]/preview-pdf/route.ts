import { NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import jsPDF from 'jspdf'
import type { FormField, FormInstellingen } from '@/components/formulieren/types'
import {
  mergePdfConfig, hexNaarRgb, urlNaarBase64, dummyWaarde, buildBlokken,
  tekenKop, renderReport, tekenPaginavoettekst, pasBriefpapierToe,
  type GlobalePdfConfig, type Marge,
} from '@/components/formulieren/pdf-schema'

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
  const versie    = versieResult.data as unknown as { schema: { fields: FormField[]; instellingen?: FormInstellingen }; versienummer: number }
  const fields    = versie.schema.fields ?? []
  const instellingen = versie.schema.instellingen
  const pdfConfig = mergePdfConfig(pdfConfigResult.data as GlobalePdfConfig, instellingen?.pdf)
  const accentRgb = hexNaarRgb(instellingen?.accentkleur)
  const bedrijf   = bedrijfResult.data as {
    naam: string | null; logo_primair_url: string | null; logo_url: string | null
  } | null

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const briefpapier = !!pdfConfig.briefpapierUrl
  const marge: Marge = briefpapier
    ? { boven: pdfConfig.briefpapierMargeBoven, onder: pdfConfig.briefpapierMargeOnder, links: 20, rechts: 20 }
    : { boven: 18, onder: 16, links: 18, rechts: 18 }

  // Diagonaal VOORBEELD-watermerk (op elke pagina).
  const watermerk = (d: jsPDF) => {
    d.setFont('helvetica', 'bold'); d.setFontSize(48); d.setTextColor(230, 230, 230)
    d.text('VOORBEELD', pageW / 2, pageH / 2, { align: 'center', angle: 45 })
    d.setTextColor(0, 0, 0)
  }
  watermerk(doc)

  const logoUrl = bedrijf?.logo_primair_url ?? bedrijf?.logo_url ?? null
  const logo = pdfConfig.toonLogo && !briefpapier && logoUrl ? await urlNaarBase64(logoUrl) : null

  const metaDelen: string[] = []
  if (pdfConfig.koptekst) metaDelen.push(pdfConfig.koptekst)
  if (pdfConfig.toonInvuller) metaDelen.push(`Ingediend: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  if (pdfConfig.toonProjectRef) metaDelen.push('Project: PRJ-2026-001')
  metaDelen.push('Status: Ingediend')

  const startY = tekenKop(doc, {
    titel: template.naam,
    subtitel: `v${versie.versienummer} · VOORBEELDWEERGAVE`,
    metaDelen,
    logo,
    briefpapier,
    pageW, pageH, marge, accentRgb,
  })

  const blokken = await buildBlokken(fields, f => dummyWaarde(f), { preview: true })
  await renderReport(doc, blokken, { startY, pageW, pageH, marge, accentRgb, opNieuwePagina: watermerk })

  tekenPaginavoettekst(doc, {
    voettekst: pdfConfig.voettekst ?? bedrijf?.naam ?? '',
    briefpapier, pageW, pageH, marge,
  })

  const pdfBytes = await pasBriefpapierToe(doc.output('arraybuffer'), pdfConfig.briefpapierUrl)

  return new NextResponse(pdfBytes as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="voorbeeld-${id.slice(0, 8)}.pdf"`,
    },
  })
}
