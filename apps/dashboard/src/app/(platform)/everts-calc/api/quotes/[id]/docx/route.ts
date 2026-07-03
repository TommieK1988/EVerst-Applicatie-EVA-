/**
 * GET /everts-calc/api/quotes/[id]/docx
 *
 * Genereert een ingevuld Word-document (.docx) op basis van het docxtemplater-
 * template dat per layout is ingesteld. Gebruikt dezelfde render-functie als de
 * PDF-route (`renderQuoteDocx`), zodat Word- en PDF-output identiek zijn.
 *
 * Template syntax (in het .docx bestand):
 *   {offerte.nummer}          → tekstveld
 *   {klant.naam}              → tekstveld
 *   {%logo}                   → afbeelding (bedrijfslogo)
 *   {#normale_secties} … {/normale_secties}   → sectie-loop
 *   {#heeft_stelposten} … {/heeft_stelposten} → conditioneel blok
 *
 * Alle variabelen: zie quote-renderer.ts → RenderContext
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/everts-calc/supabase/server'
import {
  STANDAARD_LAYOUT,
  BEDRIJF_FALLBACK,
  type BedrijfContext,
  type LayoutContext,
} from '@/lib/everts-calc/quote-renderer'
import {
  renderQuoteDocx,
  loadQuoteTemplateBuffer,
  GeenTemplateError,
} from '@/lib/everts-calc/render-quote-docx'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const bedrijfParam = searchParams.get('bedrijf')

  // Gate: downloaden mag pas na controller-goedkeuring (on-screen preview blijft vrij).
  const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
  const goedkeuring = await assertOfferteVerzendbaar(id)
  if (!goedkeuring.ok) {
    return NextResponse.json({ error: goedkeuring.error }, { status: 403 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createClient()) as any

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
      return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
    }

    // ── 2. Layout context ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLayout: any = (quote as any).layout ?? {}
    const layout: LayoutContext = {
      primaire_kleur: rawLayout.primaire_kleur ?? STANDAARD_LAYOUT.primaire_kleur,
      secundaire_kleur: rawLayout.secundaire_kleur ?? STANDAARD_LAYOUT.secundaire_kleur,
      accent_kleur: rawLayout.accent_kleur ?? STANDAARD_LAYOUT.accent_kleur,
      kleur_niveau_2: rawLayout.kleur_niveau_2 ?? STANDAARD_LAYOUT.kleur_niveau_2,
      kleur_niveau_3: rawLayout.kleur_niveau_3 ?? STANDAARD_LAYOUT.kleur_niveau_3,
      lettertype: rawLayout.lettertype ?? STANDAARD_LAYOUT.lettertype,
      lettergrootte: rawLayout.lettergrootte ?? STANDAARD_LAYOUT.lettergrootte,
      marge_boven: rawLayout.marge_boven ?? STANDAARD_LAYOUT.marge_boven,
      marge_onder: rawLayout.marge_onder ?? STANDAARD_LAYOUT.marge_onder,
      marge_links: rawLayout.marge_links ?? STANDAARD_LAYOUT.marge_links,
      marge_rechts: rawLayout.marge_rechts ?? STANDAARD_LAYOUT.marge_rechts,
      toon_voorblad: rawLayout.toon_voorblad ?? STANDAARD_LAYOUT.toon_voorblad,
      toon_specificatie: rawLayout.toon_specificatie ?? STANDAARD_LAYOUT.toon_specificatie,
      toon_voorwaarden: rawLayout.toon_voorwaarden ?? STANDAARD_LAYOUT.toon_voorwaarden,
      toon_paginanummer: rawLayout.toon_paginanummer ?? STANDAARD_LAYOUT.toon_paginanummer,
      voettekst: rawLayout.voettekst ?? STANDAARD_LAYOUT.voettekst,
      koptekst: rawLayout.koptekst ?? STANDAARD_LAYOUT.koptekst,
      footer_html: rawLayout.footer_html ?? STANDAARD_LAYOUT.footer_html,
      papier_formaat: rawLayout.papier_formaat ?? STANDAARD_LAYOUT.papier_formaat,
      papier_orientatie: rawLayout.papier_orientatie ?? STANDAARD_LAYOUT.papier_orientatie,
    }

    // ── 3. Bedrijfsgegevens ──────────────────────────────────────────────────
    let bedrijf: BedrijfContext = BEDRIJF_FALLBACK
    if (bedrijfParam) {
      try {
        bedrijf = { ...BEDRIJF_FALLBACK, ...JSON.parse(bedrijfParam) }
      } catch {
        /* gebruik fallback */
      }
    }

    // ── 4. Template ophalen + vullen ─────────────────────────────────────────
    let output: Buffer
    try {
      const templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
      output = await renderQuoteDocx(quote as Parameters<typeof renderQuoteDocx>[0], bedrijf, layout, templateBuffer)
    } catch (err) {
      if (err instanceof GeenTemplateError) {
        return NextResponse.json(
          { error: 'Geen Word-template geconfigureerd voor deze layout.' },
          { status: 422 },
        )
      }
      console.error('Docx render fout:', err)
      return NextResponse.json(
        { error: 'Template render fout — controleer de tag-syntax in het .docx bestand', detail: String(err) },
        { status: 500 },
      )
    }

    const filename = encodeURIComponent(`offerte-${quote.quote_nummer}.docx`)

    return new NextResponse(output as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Docx generatie fout:', err)
    return NextResponse.json({ error: 'Docx generatie mislukt', detail: String(err) }, { status: 500 })
  }
}
