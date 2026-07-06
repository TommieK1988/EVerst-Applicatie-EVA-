/**
 * GET /everts-calc/api/quotes/[id]/docx-preview
 *
 * Rendert het Word-template met docxtemplater en geeft de ingevulde .docx-buffer
 * terug. De client (DocxViewer) rendert die met volledige opmaakfideliteit.
 * Gebruikt dezelfde render-functie als de PDF/docx-routes.
 *
 * Query params:
 *   template_url  – URL van een .docx template (override; voor live preview tijdens upload)
 *   bedrijf       – JSON-string met bedrijfsgegevens
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/everts-calc/supabase/server'
import {
  STANDAARD_LAYOUT,
  type BedrijfContext,
  type DossierContext,
  type LayoutContext,
} from '@/lib/everts-calc/quote-renderer'
import {
  renderQuoteDocx,
  loadQuoteTemplateBuffer,
  GeenTemplateError,
} from '@/lib/everts-calc/render-quote-docx'
import { laadBedrijfEnDossier } from '@/lib/everts-calc/offerte-bronnen'
import { appGraphGetRaw } from '@/lib/o365/graph'
import { buildDemoQuote, DEMO_BEDRIJF, buildDemoDossierContext } from '@/lib/everts-calc/demo-quote'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

function htmlMelding(body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#64748b">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status },
  )
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const templateUrlParam = searchParams.get('template_url')
  const driveIdParam = searchParams.get('drive_id')
  const itemIdParam = searchParams.get('item_id')
  const bedrijfParam = searchParams.get('bedrijf')

  // Object-level authz: offerte-preview mag alleen door gebruikers met everts_calc-leesrecht worden opgehaald.
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return htmlMelding('<p>Geen toegang</p>', 403)
    throw e
  }

  // Demo/testgegevens: geen DB nodig — bouw een volledig gevulde voorbeeld-offerte.
  const isDemo = id === 'demo'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quote: any
    if (isDemo) {
      quote = buildDemoQuote()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = (await createClient()) as any
      const { data, error: qErr } = await supabase
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

      if (qErr || !data) {
        return htmlMelding('<p>Offerte niet gevonden</p>', 404)
      }
      quote = data
    }

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

    // Bedrijf (werkmaatschappij) + dossier: demo → testgegevens, anders uit de DB.
    let bedrijf: BedrijfContext
    let dossier: DossierContext
    if (isDemo) {
      bedrijf = DEMO_BEDRIJF
      dossier = buildDemoDossierContext()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = (await createClient()) as any
      const bron = await laadBedrijfEnDossier(sb, quote)
      bedrijf = bron.bedrijf
      dossier = bron.dossier
    }
    if (bedrijfParam) {
      try {
        // Alleen niet-lege velden uit de meegegeven bedrijfsgegevens overschrijven.
        const parsed = JSON.parse(bedrijfParam) as Record<string, unknown>
        const gevuld = Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => v != null && v !== ''),
        )
        bedrijf = { ...bedrijf, ...gevuld }
      } catch {
        /* db/demo-bedrijf gebruiken */
      }
    }

    // Template-buffer: Graph-override (drive+item), URL-override (live upload-preview), of uit de layout
    let templateBuffer: Buffer
    try {
      if (driveIdParam && itemIdParam) {
        templateBuffer = await appGraphGetRaw(`/drives/${driveIdParam}/items/${itemIdParam}/content`)
      } else if (templateUrlParam) {
        const res = await fetch(templateUrlParam)
        if (!res.ok) return htmlMelding('<p>Template ophalen mislukt</p>', 502)
        templateBuffer = Buffer.from(await res.arrayBuffer())
      } else {
        templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
      }
    } catch (err) {
      if (err instanceof GeenTemplateError) {
        return htmlMelding(
          '<p>Geen Word-template geconfigureerd voor deze layout.</p><p>Koppel een .docx template in het linkerpaneel.</p>',
        )
      }
      throw err
    }

    let output: Buffer
    try {
      output = await renderQuoteDocx(quote as Parameters<typeof renderQuoteDocx>[0], bedrijf, layout, templateBuffer, { dossier })
    } catch (renderErr) {
      // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
      console.error('Docx preview render fout:', renderErr)
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
          <h2>Template render fout</h2>
          <p style="color:#64748b;font-size:0.875rem;margin-top:1rem">
            Controleer de tag-syntax in het .docx template. Veelvoorkomende oorzaak: Word heeft een
            tag zoals <code>{variabele}</code> in losse fragmenten opgeknipt — verwijder de tag en
            typ hem in één keer opnieuw.
          </p>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 },
      )
    }

    return new NextResponse(output as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
    console.error('Docx preview fout:', err)
    return htmlMelding('<p style="color:#dc2626">Er ging iets mis</p>', 500)
  }
}
