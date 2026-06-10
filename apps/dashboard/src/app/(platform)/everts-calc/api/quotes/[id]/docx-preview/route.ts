/**
 * GET /everts-calc/everts-calc/api/quotes/[id]/docx-preview
 *
 * Rendert het Word-template met docxtemplater en converteert het resultaat
 * naar HTML via mammoth.js — voor gebruik als preview in de layout-editor.
 *
 * Query params:
 *   template_url  – URL van het .docx template (override; anders uit layout)
 *   bedrijf       – JSON-string met bedrijfsgegevens
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/everts-calc/supabase/server'
import {
  buildRenderContext,
  STANDAARD_LAYOUT,
  BEDRIJF_FALLBACK,
  type BedrijfContext,
  type LayoutContext,
} from '@/lib/everts-calc/quote-renderer'
import { fixSplitDocxTags, stripHtml } from '@/lib/everts-calc/docx-utils'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
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

    // Voeg gesplitste docxtemplater-tags samen (Word knipt {tag} soms op over meerdere runs)
    fixSplitDocxTags(zip)

    // Zowel de constructor als render() worden in dezelfde try-catch gevangen,
    // zodat ook constructor-fouten (bijv. ongeldige XML) gedetailleerde meldingen geven.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let doc: any
    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nullGetter: (part: any) => part.module ? '' : '',
      })
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
          <p style="word-break:break-word">${detail.replace(/</g, '&lt;')}</p>
          <p style="color:#64748b;font-size:0.875rem;margin-top:1rem">
            Controleer de tag-syntax in het .docx template.<br>
            Veelvoorkomende oorzaak: Word heeft een tag zoals <code>{variabele}</code> in meerdere afzonderlijke tekstfragmenten opgeknipt.
            Download het template, verwijder de tag en typ hem opnieuw in één keer.
          </p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 }
      )
    }

    // ── 8. Gerenderde .docx buffer teruggeven ───────────────────────────────
    // De client (DocxViewer) gebruikt docx-preview om de buffer te renderen
    // met volledige opmaakfideliteit — mammoth-conversie is niet meer nodig.
    const renderedBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    return new NextResponse(renderedBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
