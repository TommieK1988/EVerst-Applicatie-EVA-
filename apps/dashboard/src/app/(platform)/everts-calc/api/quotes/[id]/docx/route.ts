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
  type BedrijfContext,
  type LayoutContext,
} from '@/lib/everts-calc/quote-renderer'
import {
  renderQuoteDocx,
  loadQuoteTemplateBuffer,
  GeenTemplateError,
} from '@/lib/everts-calc/render-quote-docx'
import { laadBedrijfEnDossier } from '@/lib/everts-calc/offerte-bronnen'
import { haalBewerkteOfferteDocxVoorUitvoer, WordBronError } from '@/lib/everts-calc/offerte-word'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const bedrijfParam = searchParams.get('bedrijf')

  // Object-level authz: offerte-documenten mogen alleen door gebruikers met everts_calc-leesrecht worden opgehaald.
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  // Gate: downloaden mag altijd; zolang niet goedgekeurd is het een concept
  // (de Word-template kan {#is_concept}…{/is_concept} tonen).
  const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
  const goedkeuring = await assertOfferteVerzendbaar(id)
  const isConcept = !goedkeuring.ok

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createClient()) as any

    // ── 1. Quote ophalen ─────────────────────────────────────────────────────
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        sections:quote_sections(*, lines:quote_lines(*, btw_tarief:btw_tarieven(id, label, percentage, verlegd))),
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

    // ── 3. Bedrijf (werkmaatschappij) + dossier uit de database ──────────────
    const { bedrijf: dbBedrijf, dossier } = await laadBedrijfEnDossier(supabase, quote)
    let bedrijf: BedrijfContext = dbBedrijf
    if (bedrijfParam) {
      try {
        const parsed = JSON.parse(bedrijfParam) as Record<string, unknown>
        const gevuld = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v != null && v !== ''))
        bedrijf = { ...dbBedrijf, ...gevuld }
      } catch {
        /* db-bedrijf gebruiken */
      }
    }

    // ── 4. Bron-.docx: bewerkt Word-document, anders het sjabloon vullen ─────
    // Hangt er een Word Online-document aan de offerte, dan is dát wat de
    // gebruiker downloadt — inclusief zijn handmatige aanpassingen. Het
    // CONCEPT-watermerk wordt hier opnieuw afgedwongen, zodat een download nooit
    // schoner (of juist onterecht concept) is dan de goedkeuringsstatus zegt.
    let output: Buffer
    try {
      const bewerkt = await haalBewerkteOfferteDocxVoorUitvoer(id, isConcept)
      if (bewerkt) {
        output = bewerkt
      } else {
        const templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
        output = await renderQuoteDocx(quote as Parameters<typeof renderQuoteDocx>[0], bedrijf, layout, templateBuffer, { dossier, is_concept: isConcept })
      }
    } catch (err) {
      if (err instanceof WordBronError) {
        return NextResponse.json({ error: err.message }, { status: 502 })
      }
      if (err instanceof GeenTemplateError) {
        return NextResponse.json(
          { error: 'Geen Word-template geconfigureerd voor deze layout.' },
          { status: 422 },
        )
      }
      // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
      console.error('Docx render fout:', err)
      return NextResponse.json(
        { error: 'Template render fout — controleer de tag-syntax in het .docx bestand' },
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
    // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
    console.error('Docx generatie fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis' }, { status: 500 })
  }
}
