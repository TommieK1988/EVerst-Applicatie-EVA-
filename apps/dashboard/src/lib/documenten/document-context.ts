/**
 * document-context.ts
 *
 * Bouwt de render-context voor een document (bewonersbrief, garantiecertificaat,
 * informatiebrief). Dit is de document-tegenhanger van `quote-renderer.ts`
 * `buildRenderContext()`, maar veel kleiner: documenten hebben geen regels,
 * secties, boom of totalen — wel rollen, planning, oplevering en vrije invoer.
 *
 * De dossier-/bedrijfslookup hergebruikt `laadBedrijfEnDossier()` uit de
 * offerte-module: die kent de werkmaatschappij-afleiding en de opdrachtgever-
 * fallback al. Er is geen offerte nodig — we roepen aan met `{ dossier_id }`.
 */

import 'server-only'
import { laadBedrijfEnDossier } from '../everts-calc/offerte-bronnen'
import { fetchImageDataUrl } from './render-docx'
import { ROLLEN, type RolNaam } from './rollen'
import { datumNL, datumISO, nJaarLater, normaliseerInvoer, ontbrekendeVelden, volledigeNaam } from './format'
import type { DocumentSjabloon } from './types'
import { getOpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'

export { ROLLEN, type RolNaam }
// Re-export zodat bestaande importers van deze module niets hoeven te wijzigen.
export { datumNL, datumISO, normaliseerInvoer, ontbrekendeVelden }

/** Eén projectrol met contactgegevens; `heeft` maakt {#uitvoerder.heeft}…{/} mogelijk. */
export interface RolContext {
  heeft: boolean
  naam: string
  voornaam: string
  functie: string
  telefoon: string
  mobiel: string
  email: string
  /** Foto voor {%<rol>.foto} / {%foto_<rol>} als base64 data-URL; '' als er geen foto is. */
  foto: string
}

export interface DocumentRenderContext {
  [key: string]: unknown
}

const LEGE_ROL: RolContext = {
  heeft: false, naam: '', voornaam: '', functie: '', telefoon: '', mobiel: '', email: '', foto: '',
}

// ── Rollen ────────────────────────────────────────────────────────────

/**
 * Bouwt één rolblok uit een medewerker-embed. Foto's worden apart opgehaald
 * (fetchImage) omdat de image-module bytes wil, geen URL.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bouwRol(row: any): Promise<RolContext> {
  if (!row) return { ...LEGE_ROL }
  const foto = await fetchImageDataUrl(row.foto_url)
  return {
    heeft: true,
    naam: volledigeNaam(row),
    voornaam: row.voornaam ?? '',
    functie: row.functie ?? '',
    telefoon: row.telefoon ?? '',
    mobiel: row.mobiel ?? '',
    // o365_email is het zakelijke adres dat men daadwerkelijk gebruikt.
    email: row.o365_email ?? row.email ?? '',
    foto,
  }
}

// ── Context ───────────────────────────────────────────────────────────

/**
 * Bouwt de volledige render-context voor een document.
 *
 * @param supabase   server Supabase-client (admin voor RLS-vrije reads)
 * @param dossierId  het dossier waarvoor het document wordt opgesteld
 * @param sjabloon   het gekozen sjabloon (levert documentsoort + velddefinities)
 * @param invoer     door de gebruiker ingevulde waarden
 * @param ondertekenaarId  medewerker-id van de ingelogde gebruiker (nooit uit de client)
 */
export async function buildDocumentContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossierId: string,
  sjabloon: DocumentSjabloon,
  invoer: Record<string, unknown> = {},
  ondertekenaarId?: string | null,
): Promise<DocumentRenderContext> {
  const { bedrijf, dossier, dossierRow, bedrijfRow } = await laadBedrijfEnDossier(supabase, {
    dossier_id: dossierId,
  })

  // Rollen — parallel, elk best-effort (een ontbrekende rol geeft een leeg blok).
  const rolParen = await Promise.all(
    ROLLEN.map(async rol => [rol, await bouwRol(dossierRow?.[rol])] as const),
  )
  const rollen = Object.fromEntries(rolParen) as Record<RolNaam, RolContext>

  // Ondertekenaar = de ingelogde medewerker. Apart ophalen: getCurrentMedewerker()
  // levert geen e-mail/telefoon/handtekening.
  const ondertekenaar = await laadOndertekenaar(supabase, ondertekenaarId)

  // Oplevering — laatste opgeleverde moment van dit dossier (voor het garantiecertificaat).
  const opleverDatum = await laadOpleverdatum(supabase, dossierId)

  // Opdracht-samenstelling — alleen voor de opdrachtbevestiging (opsomming van in-opdracht-onderdelen).
  const opdracht = sjabloon.documentsoort === 'opdrachtbevestiging'
    ? await laadOpdrachtBlok(dossierId)
    : LEEG_OPDRACHT_BLOK

  const genormaliseerd = normaliseerInvoer(sjabloon.velden ?? [], invoer)

  // Feedback-ronde: het eerste veld van type 'feedback_link' levert de gekozen
  // bewoners-feedbacklink. Daaruit volgen de linktekst {feedback.url}, de QR-code
  // {%feedback_qr} en (via genereer-document) het doel van de klik-knop.
  const feedback = await bouwFeedbackBlok(sjabloon, genormaliseerd)

  // Garantie: termijn komt uit de invoer (geen dossierfeit), einddatum is afgeleid.
  const garantieJaren = Number(String(genormaliseerd.garantie_jaren ?? '').replace(',', '.'))
  const garantieTot =
    opleverDatum && Number.isFinite(garantieJaren) && garantieJaren > 0
      ? nJaarLater(opleverDatum, garantieJaren)
      : null

  const logo = await fetchImageDataUrl(bedrijf.logo_url)
  const logoWit = await fetchImageDataUrl(bedrijf.logo_wit_url)

  const geadresseerde = {
    naam: dossier.werkadres_naam || dossier.contactpersoon || '',
    aanhef: genormaliseerd.aanhef || 'Geachte bewoner',
    adres: dossier.werkadres_straat || '',
    postcode: dossier.werkadres_postcode || '',
    plaats: dossier.werkadres_plaats || '',
    email: dossier.werkadres_email || dossier.contactpersoon_email || '',
    telefoon: dossier.werkadres_telefoon || dossier.contactpersoon_telefoon || '',
    volledig_adres: dossier.werkadres || '',
  }

  const startdatum = dossierRow?.verwacht_startdatum ?? null
  const einddatum = dossierRow?.verwacht_einddatum ?? null

  const ctx: DocumentRenderContext = {
    bedrijf,
    dossier,
    // Platte klant-/contactpersoonblokken, gelijk aan de offerte-conventie.
    klant: {
      naam: dossier.klant_naam,
      adres: dossier.klant_adres,
      postcode: dossier.klant_postcode,
      plaats: dossier.klant_plaats,
      email: dossier.klant_email,
      telefoon: dossier.klant_telefoon,
      kvk: dossier.klant_kvk,
      btw: dossier.klant_btw,
    },
    contactpersoon: {
      naam: dossier.contactpersoon,
      voornaam: dossier.contactpersoon_voornaam,
      achternaam: dossier.contactpersoon_achternaam,
      aanhef: dossier.contactpersoon_aanhef,
      aanspreekvorm: dossier.contactpersoon_aanspreekvorm,
      email: dossier.contactpersoon_email,
      telefoon: dossier.contactpersoon_telefoon,
      mobiel: dossier.contactpersoon_mobiel,
    },
    geadresseerde,
    ...rollen,
    ondertekenaar,
    planning: {
      heeft: !!(startdatum || einddatum),
      startdatum: datumNL(startdatum),
      startdatum_iso: datumISO(startdatum),
      einddatum: datumNL(einddatum),
      einddatum_iso: datumISO(einddatum),
      werkzaamheden: genormaliseerd.werkzaamheden ?? '',
    },
    oplevering: {
      heeft: !!opleverDatum,
      datum: datumNL(opleverDatum),
      datum_iso: datumISO(opleverDatum),
    },
    garantie: {
      heeft: !!garantieTot,
      termijn_jaren: genormaliseerd.garantie_jaren ?? '',
      tot_datum: datumNL(garantieTot),
      tot_datum_iso: datumISO(garantieTot),
      behandelingen: genormaliseerd.behandelingen ?? '',
    },
    opdracht,
    document: {
      datum: datumNL(new Date().toISOString()),
      datum_iso: datumISO(new Date().toISOString()),
      plaats: bedrijfRow?.adres_plaats ?? '',
      soort: sjabloon.documentsoort ?? '',
      naam: sjabloon.naam ?? '',
      dossiernummer: dossier.dossiernummer,
      opdrachtnummer: dossier.opdracht_referentie || dossier.referentie || '',
    },
    invoer: genormaliseerd,
    // Feedback-ronde (bewoners): linktekst + QR-code. De klik-knop wordt in
    // genereer-document via de `hyperlinks`-optie op de sentinel gezet.
    feedback,
    // Image-tags (base64 data-URLs — nooit kale Buffers, zie bufferNaarDataUrl)
    logo,
    logo_wit: logoWit,
    handtekening: ondertekenaar.handtekening,
    // Platte alias voor de QR-image-tag ({%feedback_qr}), zoals foto_<rol> het patroon volgt.
    feedback_qr: feedback.qr,
  }

  // Platte alias per rol-foto ({%foto_uitvoerder}). De geneste vorm ({%uitvoerder.foto})
  // werkt via dottedTagParser; deze platte variant is de gegarandeerde uitwijk en staat
  // daarom als aanbevolen tag in het variabelenpaneel.
  for (const rol of ROLLEN) ctx[`foto_${rol}`] = rollen[rol].foto

  return ctx
}

/** Max-kaders voor de image-tags van een document (naast de engine-standaarden). */
export function documentImageMax(): Record<string, { w: number; h: number }> {
  const PASFOTO = { w: 160, h: 200 }
  const QR = { w: 190, h: 190 }
  const max: Record<string, { w: number; h: number }> = {
    feedback_qr: QR,
    'feedback.qr': QR,
  }
  for (const rol of ROLLEN) {
    max[`foto_${rol}`] = PASFOTO
    max[`${rol}.foto`] = PASFOTO
  }
  return max
}

/** Feedback-ronde-blok: linktekst + QR-code van de gekozen bewoners-feedbacklink. */
interface FeedbackBlok {
  heeft: boolean
  /** De opgeschoonde link als tekst (zonder een per ongeluk meegeplakt "KEY="-voorvoegsel). */
  url: string
  /**
   * QR-code van de link als PNG **base64 data-URL** voor {%feedback_qr}; '' als er geen link is.
   * Bewust een string en géén Buffer: docxtemplater-image-module-free behandelt in de
   * synchrone render elk object (dus ook een Buffer) als een al-verwerkte afbeelding en
   * crasht dan — alleen een base64/data-URL-string doorloopt het echte insluit-pad.
   */
  qr: string
}

const LEEG_FEEDBACK_BLOK: FeedbackBlok = { heeft: false, url: '', qr: '' }

/**
 * Zoekt het feedback_link-veld in het sjabloon, schoont de gekozen URL op en genereert
 * er een QR-code bij. Geen veld / lege waarde → leeg blok (image-module toont dan niets).
 */
async function bouwFeedbackBlok(
  sjabloon: DocumentSjabloon,
  genormaliseerd: Record<string, string>,
): Promise<FeedbackBlok> {
  const veld = (sjabloon.velden ?? []).find(v => v.type === 'feedback_link')
  if (!veld) return { ...LEEG_FEEDBACK_BLOK }
  const url = schoonLink(genormaliseerd[veld.sleutel] ?? '')
  if (!url) return { ...LEEG_FEEDBACK_BLOK }
  const qr = await maakQrDataUrl(url)
  return { heeft: true, url, qr }
}

/**
 * Vangnet tegen een per ongeluk meegeplakt "NEXT_PUBLIC_APP_URL="-voorvoegsel (of andere
 * "KEY=") en omringende quotes/spaties in een gekopieerde link.
 */
function schoonLink(waarde: string): string {
  return String(waarde ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')
    .trim()
}

/** QR-code van een URL als PNG base64 data-URL. Best-effort: faalt hij, dan geen QR (''). */
async function maakQrDataUrl(url: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('qrcode')
    const QR = mod.default ?? mod
    // toDataURL levert "data:image/png;base64,…" — de image-module str(ip)t het data:-deel zelf.
    return await QR.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' })
  } catch {
    return ''
  }
}

/** Ondertekenaar-blok: de ingelogde medewerker met handtekening. */
async function laadOndertekenaar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  medewerkerId?: string | null,
): Promise<RolContext & { handtekening: string }> {
  if (!medewerkerId) return { ...LEGE_ROL, handtekening: '' }
  try {
    const { data } = await supabase
      .from('medewerkers')
      .select('voornaam, tussenvoegsel, achternaam, functie, email, o365_email, telefoon, mobiel, foto_url, handtekening_url')
      .eq('id', medewerkerId)
      .maybeSingle()
    if (!data) return { ...LEGE_ROL, handtekening: '' }
    const rol = await bouwRol(data)
    const handtekening = await fetchImageDataUrl(data.handtekening_url)
    return { ...rol, handtekening }
  } catch {
    return { ...LEGE_ROL, handtekening: '' }
  }
}

/**
 * Opleverdatum = het laatst opgeleverde moment van het dossier. Best-effort:
 * geen oplevering (of tabel niet leesbaar) → null, en {#oplevering.heeft} blijft vals.
 */
async function laadOpleverdatum(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossierId: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('oplever_momenten')
      .select('opgeleverd_op')
      .eq('dossier_id', dossierId)
      .not('opgeleverd_op', 'is', null)
      .order('opgeleverd_op', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.opgeleverd_op ?? null
  } catch {
    return null
  }
}

/** Formatteert een bedrag als € 1.234,56 voor de opdrachtbevestiging. */
const EUR_FMT = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
const fmtEur = (n: number | null | undefined): string => EUR_FMT.format(Number(n) || 0)

type OpdrachtOnderdeelRegel = { soort: string; omschrijving: string; bedrag: string }
type OpdrachtBlok = {
  heeft: boolean
  aanneemsom: string
  stelposten_totaal: string
  gekozen_opties_totaal: string
  contracttotaal: string
  onderdelen: OpdrachtOnderdeelRegel[]
  stelposten: { omschrijving: string; bedrag: string }[]
  opties: { omschrijving: string; bedrag: string }[]
}
const LEEG_OPDRACHT_BLOK: OpdrachtBlok = {
  heeft: false, aanneemsom: '', stelposten_totaal: '', gekozen_opties_totaal: '',
  contracttotaal: '', onderdelen: [], stelposten: [], opties: [],
}

/**
 * Opsomming van de in-opdracht-onderdelen (basis + stelposten + gekozen opties) met bedragen, voor de
 * opdrachtbevestiging. Best-effort — geen samenstelling → leeg blok, {#opdracht.heeft} blijft vals.
 * Bevat geen interne bewakingscodes (die horen niet op de klant-PDF).
 */
async function laadOpdrachtBlok(dossierId: string): Promise<OpdrachtBlok> {
  try {
    const ov = await getOpdrachtOverzicht(dossierId)
    if (!ov) return LEEG_OPDRACHT_BLOK
    const gekozenOpties = ov.opties.filter(o => o.in_opdracht)
    const contractExcl = (ov.aanneemsom ?? 0) + ov.gekozenOptiesTotaal
    const onderdelen: OpdrachtOnderdeelRegel[] = []
    if (ov.basis != null) onderdelen.push({ soort: 'Basisopdracht', omschrijving: 'Aangenomen werk conform offerte', bedrag: fmtEur(ov.basis) })
    for (const sp of ov.stelposten) onderdelen.push({ soort: 'Stelpost', omschrijving: sp.omschrijving, bedrag: fmtEur(sp.bedrag_excl_btw) })
    for (const op of gekozenOpties) onderdelen.push({ soort: 'Optie', omschrijving: op.omschrijving, bedrag: fmtEur(op.bedrag_excl_btw) })
    return {
      heeft: onderdelen.length > 0,
      aanneemsom: fmtEur(ov.aanneemsom),
      stelposten_totaal: fmtEur(ov.stelpostenTotaal),
      gekozen_opties_totaal: fmtEur(ov.gekozenOptiesTotaal),
      contracttotaal: fmtEur(contractExcl),
      onderdelen,
      stelposten: ov.stelposten.map(sp => ({ omschrijving: sp.omschrijving, bedrag: fmtEur(sp.bedrag_excl_btw) })),
      opties: gekozenOpties.map(op => ({ omschrijving: op.omschrijving, bedrag: fmtEur(op.bedrag_excl_btw) })),
    }
  } catch {
    return LEEG_OPDRACHT_BLOK
  }
}
