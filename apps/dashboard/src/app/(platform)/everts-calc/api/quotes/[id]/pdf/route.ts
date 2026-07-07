/**
 * GET /everts-calc/api/quotes/[id]/pdf
 *
 * Genereert een PDF van de offerte.
 *
 * Eén pad (Word-only):
 *   1. Quote ophalen (incl. secties, regels, terms, klant, layout, AV)
 *   2. Word-template ophalen (SharePoint/OneDrive via Graph, of Supabase-storage)
 *   3. Template vullen via docxtemplater  → ingevuld .docx
 *   4. .docx → PDF via Microsoft Graph (Word's eigen renderer)
 *   5. Algemene voorwaarden als bijlage samenvoegen (pdf-lib)
 *   6. Binaire PDF teruggeven
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
import { convertDocxToPdf } from '@/lib/o365/docx-to-pdf'
import { fetchBriefpapier, mergeBriefpapierBackground, tekenConceptWatermerk } from '@/lib/everts-calc/briefpapier'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const formaatParam = searchParams.get('formaat') as 'A4' | 'A3' | null
  const orientatieParam = searchParams.get('orientatie') as 'portrait' | 'landscape' | null
  const bedrijfParam = searchParams.get('bedrijf') // JSON string

  // Object-level authz: offerte-PDF's mogen alleen door gebruikers met everts_calc-leesrecht worden opgehaald.
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  // Gate: downloaden mag altijd, maar zolang de offerte niet is goedgekeurd door de
  // controller krijgt de PDF een CONCEPT-watermerk. Na goedkeuring is hij schoon.
  const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
  const goedkeuring = await assertOfferteVerzendbaar(id)
  const verzendbaar = goedkeuring.ok

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
      papier_formaat: formaatParam ?? rawLayout.papier_formaat ?? STANDAARD_LAYOUT.papier_formaat,
      papier_orientatie:
        orientatieParam ?? rawLayout.papier_orientatie ?? STANDAARD_LAYOUT.papier_orientatie,
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

    // ── 4. Template ophalen + vullen → ingevuld .docx ────────────────────────
    let docxBuffer: Buffer
    try {
      const templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
      docxBuffer = await renderQuoteDocx(quote as Parameters<typeof renderQuoteDocx>[0], bedrijf, layout, templateBuffer, { dossier })
    } catch (err) {
      if (err instanceof GeenTemplateError) {
        return NextResponse.json(
          { error: 'Koppel eerst een Word-template aan deze offerte-layout.' },
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

    // ── 5. .docx → PDF via Microsoft Graph ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfBuffer: Uint8Array = await convertDocxToPdf(docxBuffer)

    // Briefpapier van de layout als achtergrond onder de content-pagina's.
    const briefpapier = await fetchBriefpapier(rawLayout.briefpapier_pdf_url ?? null)
    if (briefpapier) {
      try {
        pdfBuffer = await mergeBriefpapierBackground(pdfBuffer, briefpapier)
      } catch (mergeErr) {
        console.warn('Briefpapier-merge mislukt, PDF zonder briefpapier:', mergeErr)
      }
    }

    const filename = encodeURIComponent(`offerte-${quote.quote_nummer}.pdf`)

    // ── 6. Algemene voorwaarden als bijlage samenvoegen ──────────────────────
    let finalPdf: Uint8Array = pdfBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avBestand = (quote as any).algemene_voorwaarden

    if (avBestand?.bestand_url) {
      try {
        const { PDFDocument } = await import('pdf-lib')
        const avRes = await fetch(avBestand.bestand_url)
        if (avRes.ok) {
          const avBytes = await avRes.arrayBuffer()
          const mainDoc = await PDFDocument.load(pdfBuffer)
          const avDoc = await PDFDocument.load(avBytes)
          const avPages = await mainDoc.copyPages(avDoc, avDoc.getPageIndices())
          avPages.forEach((p) => mainDoc.addPage(p))
          finalPdf = await mainDoc.save()
        }
      } catch (mergeErr) {
        console.warn('AV samenvoegen mislukt, PDF zonder bijlage:', mergeErr)
      }
    }

    // ── 7. CONCEPT-watermerk zolang niet goedgekeurd ─────────────────────────
    if (!verzendbaar) {
      finalPdf = await tekenConceptWatermerk(finalPdf)
    }

    return new NextResponse(finalPdf.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
    console.error('PDF generatie fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis' }, { status: 500 })
  }
}
