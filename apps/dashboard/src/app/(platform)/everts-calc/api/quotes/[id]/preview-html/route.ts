/**
 * GET /everts-calc/everts-calc/api/quotes/[id]/preview-html
 *
 * Geeft de gerenderde HTML van de offerte terug als text/html.
 * Wordt gebruikt voor de live iframe-preview in de layout editor.
 *
 * Query params:
 *   layout_id  (optioneel) — gebruik dit layout i.p.v. het layout van de offerte
 *   template   (optioneel) — ruwe Handlebars HTML override (voor live editing)
 *   bedrijf    (optioneel) — JSON string met bedrijfsgegevens
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

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const layoutId = searchParams.get('layout_id')
  const templateOverride = searchParams.get('template')
  const bedrijfParam = searchParams.get('bedrijf')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = await createClient() as any

    // Quote ophalen
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        sections:quote_sections(*, lines:quote_lines(*)),
        terms:quote_terms(*),
        layout:quote_layouts(*)
      `)
      .eq('id', id)
      .order('volgorde', { referencedTable: 'quote_sections', ascending: true })
      .order('volgorde', { referencedTable: 'quote_sections.quote_lines', ascending: true })
      .order('volgorde', { referencedTable: 'quote_terms', ascending: true })
      .single()

    if (error || !quote) {
      return new NextResponse('<p>Offerte niet gevonden</p>', { status: 404, headers: { 'Content-Type': 'text/html' } })
    }

    // Layout ophalen (optioneel override)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawLayout: any = (quote as any).layout ?? {}
    if (layoutId && layoutId !== rawLayout?.id) {
      const { data: overrideLayout } = await supabase
        .from('quote_layouts')
        .select('*')
        .eq('id', layoutId)
        .single()
      if (overrideLayout) rawLayout = overrideLayout
    }

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

    let bedrijf: BedrijfContext = BEDRIJF_FALLBACK
    if (bedrijfParam) {
      try { bedrijf = { ...BEDRIJF_FALLBACK, ...JSON.parse(bedrijfParam) } } catch { /* gebruik fallback */ }
    }

    // Bepaal de juiste template: override > html_template > wysiwyg_body > standaard
    // wysiwyg_body wordt gewrapped in .offerte-pagina zodat renderQuoteHtml de A4-CSS toepast
    const templateHtml: string =
      templateOverride ||
      rawLayout.html_template ||
      (rawLayout.wysiwyg_body
        ? `<div class="offerte-pagina">${rawLayout.wysiwyg_body}</div>`
        : null) ||
      TEMPLATE_STANDAARD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context = buildRenderContext(quote as any, bedrijf, layout)
    const html = renderQuoteHtml(templateHtml, context)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Preview HTML fout:', err)
    return new NextResponse(
      `<p style="color:red;padding:20px;">Fout: ${String(err)}</p>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    )
  }
}
