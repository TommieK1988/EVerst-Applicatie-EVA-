/**
 * GET /everts-calc/everts-calc/api/quotes/[id]/pdf
 *
 * Genereert een PDF van de offerte via Puppeteer.
 * Query params:
 *   formaat    A4 | A3        (default: A4)
 *   orientatie portrait | landscape (default: template instelling)
 *
 * Stappen:
 * 1. Haal quote op uit Supabase (incl. secties, regels, terms, klant, layout)
 * 2. Haal bedrijfsgegevens op (localStorage kan niet server-side — gebruik fallback of Supabase later)
 * 3. Render HTML via Handlebars template
 * 4. Puppeteer → PDF
 * 5. Return binary PDF
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/everts-calc/supabase/server'
import {
  buildRenderContext,
  renderQuoteHtml,
  STANDAARD_LAYOUT,
  BEDRIJF_FALLBACK,
  type BedrijfContext,
  type LayoutContext,
} from '@/lib/everts-calc/quote-renderer'
import { TEMPLATE_STANDAARD } from '@/lib/everts-calc/quote-templates/standaard'

/** Strip HTML tags en vervang <br> door newline voor plain-text velden */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/**
 * Rendert een .docx template via docxtemplater en converteert het resultaat
 * naar een volledige HTML-pagina via mammoth.js (voor puppeteer PDF-generatie).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderDocxTemplateToHtml(docxTemplateUrl: string, docxCtx: any): Promise<string> {
  const templateRes = await fetch(docxTemplateUrl)
  if (!templateRes.ok) throw new Error(`Template ophalen mislukt: HTTP ${templateRes.status}`)
  const templateBuffer = await templateRes.arrayBuffer()

  const PizZip = (await import('pizzip')).default
  const Docxtemplater = (await import('docxtemplater')).default

  const zip = new PizZip(templateBuffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nullGetter: (part: any) => part.module ? '' : '',
  })

  try {
    doc.render(docxCtx)
  } catch (renderErr: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = renderErr as any
    const details: string[] = []
    if (e?.properties?.errors?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const sub of e.properties.errors as any[]) {
        const xtag = sub?.properties?.xtag ?? ''
        const explanation = sub?.properties?.explanation ?? sub?.message ?? String(sub)
        details.push(xtag ? `Tag {${xtag}}: ${explanation}` : explanation)
      }
    }
    throw new Error(details.length ? details.join(' | ') : String(renderErr))
  }

  const renderedBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(renderedBuffer) },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Kop 1']     => h1:fresh",
        "p[style-name='Kop 2']     => h2:fresh",
        "p[style-name='Kop 3']     => h3:fresh",
        "p[style-name='Kop 4']     => h4:fresh",
      ],
    }
  )

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4 portrait; margin: 0; }
    body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1e293b; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm; }
    h1 { font-size: 18pt; font-weight: bold; margin: 12pt 0 6pt; }
    h2 { font-size: 14pt; font-weight: bold; margin: 10pt 0 4pt; }
    h3 { font-size: 12pt; font-weight: bold; margin: 8pt 0 3pt; }
    h4 { font-size: 11pt; font-weight: bold; margin: 6pt 0 2pt; }
    p  { margin: 0 0 6pt; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
    td, th { padding: 4pt 6pt; border: 1px solid #e2e8f0; vertical-align: top; }
    th { background: #f8fafc; font-weight: bold; }
    ul, ol { margin: 4pt 0 4pt 18pt; }
    li { margin-bottom: 2pt; }
  </style>
</head>
<body>
  <div class="page">
    ${result.value}
  </div>
</body>
</html>`
}

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const formaatParam = searchParams.get('formaat') as 'A4' | 'A3' | null
  const orientatieParam = searchParams.get('orientatie') as 'portrait' | 'landscape' | null
  const bedrijfParam = searchParams.get('bedrijf')  // JSON string

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = await createClient() as any

    // ── 1. Quote ophalen ─────────────────────────────────────────────────────
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        sections:quote_sections(
          *,
          lines:quote_lines(* )
        ),
        terms:quote_terms(*),
        layout:quote_layouts(*),
        betalingsconditie:betalingscondities(*),
        algemene_voorwaarden:algemene_voorwaarden(*)
      `)
      .eq('id', id)
      .order('volgorde', { referencedTable: 'quote_sections', ascending: true })
      .order('volgorde', { referencedTable: 'quote_sections.quote_lines', ascending: true })
      .order('volgorde', { referencedTable: 'quote_terms', ascending: true })
      .single()

    if (qErr || !quote) {
      return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
    }

    // ── 2. Layout context opbouwen ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLayout: any = (quote as any).layout ?? {}

    const layout: LayoutContext = {
      primaire_kleur:    rawLayout.primaire_kleur    ?? STANDAARD_LAYOUT.primaire_kleur,
      secundaire_kleur:  rawLayout.secundaire_kleur  ?? STANDAARD_LAYOUT.secundaire_kleur,
      accent_kleur:      rawLayout.accent_kleur      ?? STANDAARD_LAYOUT.accent_kleur,
      kleur_niveau_2:    rawLayout.kleur_niveau_2    ?? STANDAARD_LAYOUT.kleur_niveau_2,
      kleur_niveau_3:    rawLayout.kleur_niveau_3    ?? STANDAARD_LAYOUT.kleur_niveau_3,
      lettertype:        rawLayout.lettertype        ?? STANDAARD_LAYOUT.lettertype,
      lettergrootte:     rawLayout.lettergrootte     ?? STANDAARD_LAYOUT.lettergrootte,
      marge_boven:       rawLayout.marge_boven       ?? STANDAARD_LAYOUT.marge_boven,
      marge_onder:       rawLayout.marge_onder       ?? STANDAARD_LAYOUT.marge_onder,
      marge_links:       rawLayout.marge_links       ?? STANDAARD_LAYOUT.marge_links,
      marge_rechts:      rawLayout.marge_rechts      ?? STANDAARD_LAYOUT.marge_rechts,
      toon_voorblad:     rawLayout.toon_voorblad     ?? STANDAARD_LAYOUT.toon_voorblad,
      toon_specificatie: rawLayout.toon_specificatie ?? STANDAARD_LAYOUT.toon_specificatie,
      toon_voorwaarden:  rawLayout.toon_voorwaarden  ?? STANDAARD_LAYOUT.toon_voorwaarden,
      toon_paginanummer: rawLayout.toon_paginanummer ?? STANDAARD_LAYOUT.toon_paginanummer,
      voettekst:         rawLayout.voettekst         ?? STANDAARD_LAYOUT.voettekst,
      koptekst:          rawLayout.koptekst          ?? STANDAARD_LAYOUT.koptekst,
      footer_html:       rawLayout.footer_html       ?? STANDAARD_LAYOUT.footer_html,
      papier_formaat:    formaatParam    ?? rawLayout.papier_formaat    ?? STANDAARD_LAYOUT.papier_formaat,
      papier_orientatie: orientatieParam ?? rawLayout.papier_orientatie ?? STANDAARD_LAYOUT.papier_orientatie,
    }

    // ── 3. Bedrijfsgegevens ──────────────────────────────────────────────────
    // Bedrijfsgegevens komen mee als query param (JSON, ingesteld in localStorage)
    // In de toekomst: opslaan in Supabase tabel bedrijfsinstellingen
    let bedrijf: BedrijfContext = BEDRIJF_FALLBACK
    if (bedrijfParam) {
      try {
        bedrijf = { ...BEDRIJF_FALLBACK, ...JSON.parse(bedrijfParam) }
      } catch { /* gebruik fallback */ }
    }

    // ── 4. HTML renderen ─────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context = buildRenderContext(quote as any, bedrijf, layout)

    let html: string

    if (rawLayout.docx_template_url) {
      // Word-modus: docx renderen → mammoth HTML → puppeteer PDF
      const docxCtx = {
        ...context,
        offerte: {
          ...context.offerte,
          inleiding: stripHtml(context.offerte.inleiding),
          slottekst:  stripHtml(context.offerte.slottekst),
        },
        voorwaarden:   stripHtml(context.voorwaarden),
        uitsluitingen: stripHtml(context.uitsluitingen),
        opmerkingen:   stripHtml(context.opmerkingen),
      }
      html = await renderDocxTemplateToHtml(rawLayout.docx_template_url, docxCtx)
    } else {
      // HTML-modus: Handlebars template
      const templateHtml: string =
        rawLayout.html_template ||
        (rawLayout.wysiwyg_body
          ? `<div class="offerte-pagina">${rawLayout.wysiwyg_body}</div>`
          : null) ||
        TEMPLATE_STANDAARD
      html = renderQuoteHtml(templateHtml, context)
    }

    // ── 5. PDF genereren via Puppeteer ───────────────────────────────────────
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })

      const pageW = layout.papier_formaat === 'A3' ? '297mm' : '210mm'
      const pageH = layout.papier_formaat === 'A3'
        ? (layout.papier_orientatie === 'landscape' ? '420mm' : '297mm')
        : (layout.papier_orientatie === 'landscape' ? '297mm' : '210mm')

      const pdfBuffer = await page.pdf({
        width: pageW,
        height: pageH,
        printBackground: true,
        // Marges worden beheerd door de template zelf (.pagina padding / .offerte-pagina padding).
        // Puppeteer margin op 0 voorkomt dubbele marges en zorgt voor correcte paginabreeks.
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        displayHeaderFooter: false,
        headerTemplate: '<span></span>',
        footerTemplate: '<span></span>',
      })

      const filename = encodeURIComponent(`offerte-${quote.quote_nummer}.pdf`)

      // ── 6. Algemene voorwaarden als bijlage samenvoegen ──────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const avBestand = (quote as any).algemene_voorwaarden

      if (avBestand?.bestand_url) {
        try {
          const { PDFDocument } = await import('pdf-lib')
          const avRes = await fetch(avBestand.bestand_url)
          if (avRes.ok) {
            const avBytes = await avRes.arrayBuffer()
            const mainDoc = await PDFDocument.load(pdfBuffer)
            const avDoc   = await PDFDocument.load(avBytes)
            const avPages = await mainDoc.copyPages(avDoc, avDoc.getPageIndices())
            avPages.forEach(p => mainDoc.addPage(p))
            const merged = await mainDoc.save()

            return new NextResponse(merged.buffer as ArrayBuffer, {
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store',
              },
            })
          }
        } catch (mergeErr) {
          console.warn('AV samenvoegen mislukt, PDF zonder bijlage:', mergeErr)
        }
      }

      return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      })
    } finally {
      await browser.close()
    }
  } catch (err) {
    console.error('PDF generatie fout:', err)
    return NextResponse.json(
      { error: 'PDF generatie mislukt', detail: String(err) },
      { status: 500 }
    )
  }
}
