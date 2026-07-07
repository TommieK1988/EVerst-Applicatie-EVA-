/**
 * GET /everts-calc/api/quotes/[id]/pdf-preview
 *
 * Rendert de offerte naar een echte PDF (Word-template → docxtemplater →
 * Microsoft Graph) en legt daar het briefpapier als achtergrond onder. Geeft de
 * PDF *inline* terug zodat de layout-editor exact het eindresultaat toont —
 * inclusief briefpapier, kleuren en Word-opmaak.
 *
 * Dit is de vrije on-scherm preview (géén goedkeuring-gate; die geldt alleen
 * voor downloaden/verzenden). Ondersteunt `id === 'demo'` voor testgegevens.
 *
 * Query params:
 *   template_url    – .docx template-URL (override; live upload-preview)
 *   drive_id/item_id– SharePoint/OneDrive template via Graph (override)
 *   briefpapier_url – briefpapier-PDF (override; live upload-preview)
 *   bedrijf         – JSON-string met bedrijfsgegevens
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
import { convertDocxToPdf } from '@/lib/o365/docx-to-pdf'
import { fetchBriefpapier, mergeBriefpapierBackground, tekenConceptWatermerk } from '@/lib/everts-calc/briefpapier'
import { buildDemoQuote, DEMO_BEDRIJF, buildDemoDossierContext } from '@/lib/everts-calc/demo-quote'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

function foutHtml(titel: string, detail: string, status = 500): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
      <h2>${titel}</h2>
      <p style="word-break:break-word;color:#334155">${detail.replace(/</g, '&lt;')}</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status },
  )
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const sp = request.nextUrl.searchParams
  const templateUrlParam = sp.get('template_url')
  const driveIdParam = sp.get('drive_id')
  const itemIdParam = sp.get('item_id')
  const briefpapierParam = sp.get('briefpapier_url')
  const bedrijfParam = sp.get('bedrijf')

  const isDemo = id === 'demo'

  try {
    // ── 1. Offerte ophalen (of demo bouwen) ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quote: any
    if (isDemo) {
      quote = buildDemoQuote()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = (await createClient()) as any
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          client:clients(*),
          sections:quote_sections(*, lines:quote_lines(*)),
          terms:quote_terms(*),
          layout:quote_layouts(*),
          betalingsconditie:betalingscondities(*)
        `)
        .eq('id', id)
        .order('volgorde', { referencedTable: 'quote_sections', ascending: true })
        .order('volgorde', { referencedTable: 'quote_sections.quote_lines', ascending: true })
        .order('volgorde', { referencedTable: 'quote_terms', ascending: true })
        .single()
      if (error || !data) return foutHtml('Offerte niet gevonden', String(error?.message ?? id), 404)
      quote = data
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLayout: any = quote.layout ?? {}

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

    // ── 2. Bedrijfsgegevens ──────────────────────────────────────────────────
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
        const parsed = JSON.parse(bedrijfParam) as Record<string, unknown>
        const gevuld = Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => v != null && v !== ''),
        )
        bedrijf = { ...bedrijf, ...gevuld }
      } catch { /* db/demo-bedrijf gebruiken */ }
    }

    // ── 3. Template ophalen + vullen → ingevuld .docx ────────────────────────
    let docxBuffer: Buffer
    try {
      let templateBuffer: Buffer
      if (driveIdParam && itemIdParam) {
        templateBuffer = await appGraphGetRaw(`/drives/${driveIdParam}/items/${itemIdParam}/content`)
      } else if (templateUrlParam) {
        const res = await fetch(templateUrlParam)
        if (!res.ok) return foutHtml('Template ophalen mislukt', `HTTP ${res.status}`, 502)
        templateBuffer = Buffer.from(await res.arrayBuffer())
      } else {
        templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
      }
      docxBuffer = await renderQuoteDocx(quote, bedrijf, layout, templateBuffer, { dossier })
    } catch (err) {
      if (err instanceof GeenTemplateError) {
        return foutHtml(
          'Geen Word-template geconfigureerd',
          'Koppel een .docx template in het linkerpaneel om een PDF-voorbeeld te zien.',
          200,
        )
      }
      console.error('PDF-preview render fout:', err)
      // Preview van het eigen template: toon de tag + omringende tekst (vindbaar in Word).
      const detail = String((err as Error)?.message ?? err)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
          <h2 style="margin:0 0 .4rem">Template render fout</h2>
          <p style="color:#64748b;font-size:.8rem;margin:.2rem 0 1rem;line-height:1.5">
            Onderstaande tag(s) konden niet verwerkt worden. Zoek de aangegeven tekst in je Word-template en
            typ de tag opnieuw. Gebruik de knop <strong>Template controleren</strong> voor een volledig overzicht.
          </p>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;line-height:1.6;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:1rem;color:#7f1d1d;white-space:pre-wrap">${detail}</div>
        </body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 },
      )
    }

    // ── 4. .docx → PDF via Microsoft Graph ───────────────────────────────────
    let pdfBytes: Uint8Array = await convertDocxToPdf(docxBuffer)

    // ── 5. Briefpapier als achtergrond ───────────────────────────────────────
    const briefpapierUrl = briefpapierParam || rawLayout.briefpapier_pdf_url || null
    const briefpapier = await fetchBriefpapier(briefpapierUrl)
    if (briefpapier) {
      try {
        pdfBytes = await mergeBriefpapierBackground(pdfBytes, briefpapier)
      } catch (mergeErr) {
        console.warn('Briefpapier-merge mislukt, PDF zonder briefpapier:', mergeErr)
      }
    }

    // ── 6. CONCEPT-watermerk voor een echte, nog niet goedgekeurde offerte ────
    // (niet bij demo of een template-override-preview in de layout-editor).
    const templateOverride = !!(driveIdParam || itemIdParam || templateUrlParam)
    if (!isDemo && !templateOverride) {
      try {
        const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
        const goedkeuring = await assertOfferteVerzendbaar(id)
        if (!goedkeuring.ok) pdfBytes = await tekenConceptWatermerk(pdfBytes)
      } catch { /* bij twijfel geen watermerk forceren */ }
    }

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('PDF-preview fout:', err)
    return foutHtml('PDF-voorbeeld mislukt', String(err))
  }
}
