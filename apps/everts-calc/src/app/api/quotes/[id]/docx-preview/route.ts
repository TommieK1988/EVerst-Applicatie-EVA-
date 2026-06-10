/**
 * GET /api/quotes/[id]/docx-preview
 *
 * Rendert het Word-template met docxtemplater en converteert het resultaat
 * naar HTML via mammoth.js — voor gebruik als preview in de layout-editor.
 *
 * Query params:
 *   template_url  – URL van het .docx template (override; anders uit layout)
 *   bedrijf       – JSON-string met bedrijfsgegevens
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildRenderContext,
  STANDAARD_LAYOUT,
  BEDRIJF_FALLBACK,
  type BedrijfContext,
  type LayoutContext,
} from '@/lib/quote-renderer'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Strip HTML tags en vervang <br> door newline voor plain-text velden */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const templateUrlParam = searchParams.get('template_url')
  const bedrijfParam = searchParams.get('bedrijf')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = await createClient() as any

    // ── 1. Quote ophalen ─────────────────────────────────────────────────────
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        sections:quote_sections(*, lines:quote_lines(*)),
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
      return new NextResponse('<p>Offerte niet gevonden</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 404,
      })
    }

    // ── 2. Template URL ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLayout: any = (quote as any).layout ?? {}
    const docxTemplateUrl: string | null =
      templateUrlParam || rawLayout.docx_template_url || null

    if (!docxTemplateUrl) {
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#64748b">
          <p>Geen Word template geconfigureerd voor deze layout.</p>
          <p>Upload een .docx template in het linkerpaneel.</p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    // ── 3. Layout context ────────────────────────────────────────────────────
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
      papier_formaat:    rawLayout.papier_formaat    ?? STANDAARD_LAYOUT.papier_formaat,
      papier_orientatie: rawLayout.papier_orientatie ?? STANDAARD_LAYOUT.papier_orientatie,
    }

    // ── 4. Bedrijfsgegevens ──────────────────────────────────────────────────
    let bedrijf: BedrijfContext = BEDRIJF_FALLBACK
    if (bedrijfParam) {
      try { bedrijf = { ...BEDRIJF_FALLBACK, ...JSON.parse(bedrijfParam) } } catch { /* gebruik fallback */ }
    }

    // ── 5. Render context bouwen ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = buildRenderContext(quote as any, bedrijf, layout)

    const docxCtx = {
      ...ctx,
      offerte: {
        ...ctx.offerte,
        inleiding: stripHtml(ctx.offerte.inleiding),
        slottekst:  stripHtml(ctx.offerte.slottekst),
      },
      voorwaarden:   stripHtml(ctx.voorwaarden),
      uitsluitingen: stripHtml(ctx.uitsluitingen),
      opmerkingen:   stripHtml(ctx.opmerkingen),
    }

    // ── 6. Docx template ophalen ─────────────────────────────────────────────
    const templateRes = await fetch(docxTemplateUrl)
    if (!templateRes.ok) {
      return new NextResponse('<p>Template ophalen mislukt</p>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 502,
      })
    }
    const templateBuffer = await templateRes.arrayBuffer()

    // ── 7. docxtemplater renderen ────────────────────────────────────────────
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
      const detail = details.length ? details.join(' | ') : String(renderErr)
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
          <h2>Template render fout</h2>
          <p>${detail.replace(/</g, '&lt;')}</p>
          <p style="color:#64748b;font-size:0.875rem;margin-top:1rem">Controleer de tag-syntax in het .docx template.</p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 }
      )
    }

    const renderedBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    // ── 8. Mammoth: docx → HTML ──────────────────────────────────────────────
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

    const bodyHtml = result.value

    // ── 9. Volledige HTML-pagina teruggeven ──────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Offerte preview (Word)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #e2e8f0;
      font-family: 'Calibri', 'Arial', sans-serif;
      font-size: 11pt;
      color: #1e293b;
    }
    .page {
      background: white;
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      padding: 20mm 20mm 20mm 20mm;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    }

    /* Basis typografie */
    h1 { font-size: 18pt; font-weight: bold; margin: 12pt 0 6pt; color: #1e293b; }
    h2 { font-size: 14pt; font-weight: bold; margin: 10pt 0 4pt; color: #334155; }
    h3 { font-size: 12pt; font-weight: bold; margin: 8pt 0 3pt; color: #475569; }
    h4 { font-size: 11pt; font-weight: bold; margin: 6pt 0 2pt; color: #64748b; }
    p  { margin: 0 0 6pt; line-height: 1.5; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0;
      font-size: 10pt;
    }
    td, th {
      padding: 4pt 6pt;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    th { background: #f8fafc; font-weight: bold; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    ul, ol { margin: 4pt 0 4pt 18pt; }
    li { margin-bottom: 2pt; }

    /* Mammoth warnings notice (verborgen) */
    .mammoth-warning { display: none; }
  </style>
</head>
<body>
  <div class="page">
    ${bodyHtml}
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })

  } catch (err) {
    console.error('Docx preview fout:', err)
    const msg = String(err)
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
        <h2>Preview fout</h2>
        <p>${msg.replace(/</g, '&lt;')}</p>
        <p style="color:#64748b;font-size:0.875rem;margin-top:1rem">
          Controleer of het template geldig docxtemplater-syntax gebruikt.
        </p>
      </body></html>`,
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        status: 500,
      }
    )
  }
}
