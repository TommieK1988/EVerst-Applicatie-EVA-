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
import { datumNL, datumISO, nJaarLater, normaliseerInvoer, ontbrekendeVelden, volledigeNaam, euroNL } from './format'
import type { DocumentSjabloon } from './types'
import { isInkoopSoort } from './types'
import {
  laadBestellingBlokken, bestellingHoortBijDossier,
  LEEG_BESTELLING_BLOK, LEEG_LEVERANCIER_BLOK,
} from './bestelling-blok'
import { getOpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'
import { getOpleverTokenLinks, getOpleverFeedbackTemplates, maakToegangToken } from '@/lib/dossiers/oplevering'
import { bouwHoutrotBlok, LEEG_HOUTROT_BLOK } from './houtrot-rapport'
import { RAPPORT_FOTO_MAX, parseRapportOpties, HOUTROT_OPTIES_SLEUTEL } from './houtrot-opties'
import { bouwKwaliteitBlok, LEEG_KWALITEIT_BLOK } from './kwaliteit-rapport'
import { KWALITEIT_FOTO_MAX, KWALITEIT_FOTO_KLEIN } from './kwaliteit-opties'

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

/** De meegegeven bestelling hoort bij een ander dossier — nooit renderen. */
export class BestellingNietVanDossierError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BestellingNietVanDossierError'
  }
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
 * @param opties     preview beperkt zware contextbouwers; bestellingId vult de
 *                   inkoopblokken ({bestelling.*}, {leverancier.*})
 */
export async function buildDocumentContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossierId: string,
  sjabloon: DocumentSjabloon,
  invoer: Record<string, unknown> = {},
  ondertekenaarId?: string | null,
  opties: { preview?: boolean; bestellingId?: string | null } = {},
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

  // Inkoopblokken — alleen bij een inkooporder/OA-contract, en alleen als er een
  // bestelling bij hoort. Zonder bestelling blijft {#bestelling.heeft} vals.
  //
  // De bestelling-id komt uit de client; hij moet bij dít dossier horen. Dat is
  // hier afgedwongen en niet in de aanroepende routes, zodat elke ingang
  // (preview, PDF, mailen) dezelfde controle krijgt.
  let inkoop = { bestelling: LEEG_BESTELLING_BLOK, leverancier: LEEG_LEVERANCIER_BLOK }
  if (isInkoopSoort(sjabloon.documentsoort) && opties.bestellingId) {
    if (!(await bestellingHoortBijDossier(supabase, opties.bestellingId, dossierId))) {
      throw new BestellingNietVanDossierError('Deze bestelling hoort niet bij dit dossier.')
    }
    inkoop = await laadBestellingBlokken(supabase, opties.bestellingId)
    // Slaat deze opdracht op één adres binnen een dossier met meerdere locaties, dan hoort dát
    // adres op het papier — niet het dossieradres. {bestelling.werkadres} blijft daarnaast leeg
    // zolang er niets afwijkends is ingevuld, zodat een sjabloon beide kan gebruiken.
    if (inkoop.bestelling.werkadres) dossier.werkadres = inkoop.bestelling.werkadres
  }

  const genormaliseerd = normaliseerInvoer(sjabloon.velden ?? [], invoer)

  // Houtrot-rapportage — zelfde patroon als `opdracht` hierboven: alleen laden als
  // het sjabloon er om vraagt, zodat een brief geen registraties en foto's ophaalt.
  const houtrot = sjabloon.documentsoort === 'houtrot_rapportage'
    ? await bouwHoutrotBlok(dossierId, genormaliseerd, { preview: opties.preview })
    : LEEG_HOUTROT_BLOK

  // Kwaliteitscontrole-rapport — zelfde patroon: alleen laden als het sjabloon erom vraagt.
  const kwaliteit = sjabloon.documentsoort === 'kwaliteitsrapport'
    ? await bouwKwaliteitBlok(dossierId, genormaliseerd, { preview: opties.preview })
    : LEEG_KWALITEIT_BLOK

  // Feedback-ronde: de bewoners-feedbacklink wordt automatisch bepaald (opgehaald of
  // aangemaakt) — daaruit volgen de linktekst {feedback.url}, de QR-code {%feedback_qr}
  // en (via genereer-document) het doel van de klik-knop.
  const feedback = await bouwFeedbackBlok(dossierId, sjabloon, genormaliseerd)

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

  /* Voorlopige planning: de indicatieve periode die vóór de detailplanning met de
     opdrachtgever wordt afgesproken (dossiers.voorlopige_start/-eind, handmatig in EVA).
     Bewust naast startdatum/einddatum en niet als fallback daarvan: die twee komen uit
     Bouw7 en staan al in bestaande opdrachtbevestigingen — er stilzwijgend iets anders
     in laten vallen verandert documenten zonder dat iemand het merkt. */
  const voorlopigStart = dossierRow?.voorlopige_start ?? null
  const voorlopigEind = dossierRow?.voorlopige_eind ?? null
  const voorlopigePeriode =
    voorlopigStart && voorlopigEind ? `${datumNL(voorlopigStart)} t/m ${datumNL(voorlopigEind)}`
    : voorlopigStart                ? `vanaf ${datumNL(voorlopigStart)}`
    : voorlopigEind                 ? `tot ${datumNL(voorlopigEind)}`
    : ''

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
      heeft_voorlopig: !!(voorlopigStart || voorlopigEind),
      voorlopige_startdatum: datumNL(voorlopigStart),
      voorlopige_startdatum_iso: datumISO(voorlopigStart),
      voorlopige_einddatum: datumNL(voorlopigEind),
      voorlopige_einddatum_iso: datumISO(voorlopigEind),
      voorlopige_periode: voorlopigePeriode,
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
    houtrot,
    kwaliteit,
    // Platte vlag zodat {#toon_prijzen}…{/toon_prijzen} óók binnen de registratie-
    // en groeploops oplost (de dotted parser valt door naar de buitenste scope).
    toon_prijzen: houtrot.heeft
      ? parseRapportOpties(genormaliseerd[HOUTROT_OPTIES_SLEUTEL]).toon_prijzen
      : false,
    bestelling: inkoop.bestelling,
    leverancier: inkoop.leverancier,
    document: {
      datum: datumNL(new Date().toISOString()),
      datum_iso: datumISO(new Date().toISOString()),
      plaats: bedrijfRow?.adres_plaats ?? '',
      soort: sjabloon.documentsoort ?? '',
      naam: sjabloon.naam ?? '',
      dossiernummer: dossier.dossiernummer,
      opdrachtnummer: dossier.opdracht_referentie || dossier.referentie || '',
      // Bij inkoop is het Bouw7-contractnummer het kenmerk waar de leverancier
      // naar verwijst; bij brieven bestaat het niet en blijft dit leeg.
      nummer: inkoop.bestelling.nummer,
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
  // Houtrot-rapportage: het kader begrenst de fotohoogte, en dáármee de hoogte van
  // een registratieblok — de basis onder "vast aantal registraties per pagina".
  // Zowel de platte tag ({%foto_voor}) als de geneste ({%fotos.voor}) registreren:
  // de image-module krijgt de tagnaam letterlijk zoals hij in Word staat.
  for (const type of ['voor', 'tijdens', 'na']) {
    max[`foto_${type}`] = RAPPORT_FOTO_MAX
    max[`fotos.${type}`] = RAPPORT_FOTO_MAX
  }
  // Kwaliteitsrapport: `foto` staat al in STANDAARD_IMAGE_MAX op PHOTO_MAX, maar dat kader is te
  // groot voor drie afwijkingen op één pagina. Hier begrenst het kader de blokhoogte, net als bij
  // de houtrot-rapportage. `foto_klein` is de strook positieve waarnemingen.
  max['foto'] = KWALITEIT_FOTO_MAX
  max['foto_klein'] = KWALITEIT_FOTO_KLEIN
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
 * Bepaalt de bewoners-feedbacklink voor het document en genereert er een QR-code bij.
 *
 * De link wordt automatisch bepaald — géén handmatige keuze meer nodig:
 *  1. Een expliciet feedback_link-invoerveld (indien aanwezig én ingevuld) wint, als override.
 *  2. Anders, bij een bewonersbrief: de dossier-feedbacklink wordt opgehaald of, als die er
 *     nog niet is, meteen aangemaakt ({@link resolveOfMaakFeedbackLink}).
 *
 * Geen link te bepalen → leeg blok (image-module toont dan niets, {#feedback.heeft} blijft vals).
 */
async function bouwFeedbackBlok(
  dossierId: string,
  sjabloon: DocumentSjabloon,
  genormaliseerd: Record<string, string>,
): Promise<FeedbackBlok> {
  const veld = (sjabloon.velden ?? []).find(v => v.type === 'feedback_link')
  let url = veld ? schoonLink(genormaliseerd[veld.sleutel] ?? '') : ''
  if (!url && sjabloon.documentsoort === 'bewonersbrief') {
    url = schoonLink(await resolveOfMaakFeedbackLink(dossierId))
  }
  if (!url) return { ...LEEG_FEEDBACK_BLOK }
  const qr = await maakQrDataUrl(url)
  return { heeft: true, url, qr }
}

/**
 * Haalt de bewoners-feedbacklink van een dossier op, of maakt er automatisch één aan als
 * die nog niet bestaat. Hergebruikt de nieuwste, niet-verlopen `/p/feedback/…`-tokenlink;
 * anders wordt er één gemunt op het (eerste) gepubliceerde feedbackformulier. Best-effort:
 * geen gepubliceerd formulier of een fout → '' (dan simpelweg geen QR/link in de brief).
 *
 * Idempotent per dossier: previews en de definitieve PDF hergebruiken dezelfde link, dus er
 * ontstaat hooguit één token per dossier (geldig 60 dagen).
 */
async function resolveOfMaakFeedbackLink(dossierId: string): Promise<string> {
  try {
    const bestaande = await getOpleverTokenLinks(dossierId, 'feedback')
    const bruikbaar = bestaande.find(l => !l.verlopen)
    if (bruikbaar) return bruikbaar.url

    const formulieren = await getOpleverFeedbackTemplates()
    if (formulieren.length === 0) return ''
    const r = await maakToegangToken('feedback', {
      dossierId,
      formTemplateId: formulieren[0].id,
      omschrijving: 'Bewonersbrief',
      geldigDagen: 60,
    })
    return r.ok ? r.url : ''
  } catch (err) {
    console.error('Feedback-link ophalen/aanmaken mislukt:', err)
    return ''
  }
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

/**
 * QR-code van een URL als PNG base64 data-URL. Best-effort: faalt hij, dan geen QR ('').
 *
 * `qrcode` moet server-side de Node-build draaien; anders gooit de browserbuild
 * "You need to specify a canvas element". Daarom staat `qrcode` in `serverExternalPackages`
 * (next.config.js). Een fout hier wordt gelogd i.p.v. stilzwijgend geslikt, zodat een
 * verdwenen QR-code herleidbaar blijft.
 */
async function maakQrDataUrl(url: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('qrcode')
    const QR = mod.default ?? mod
    // toDataURL levert "data:image/png;base64,…" — de image-module str(ip)t het data:-deel zelf.
    return await QR.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' })
  } catch (err) {
    console.error('QR-code genereren mislukt (feedback-link):', err)
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
const fmtEur = euroNL

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
    // Alleen stelposten die in opdracht zijn: `basis` rekent ook alleen met die, dus zou een
    // uitgesloten stelpost meenemen de opsomming hoger doen uitkomen dan het contracttotaal.
    const stelpostenInOpdracht = ov.stelposten.filter(sp => sp.in_opdracht)
    const contractExcl = (ov.aanneemsomInclStelposten ?? ov.aanneemsom ?? 0) + ov.gekozenOptiesTotaal
    const onderdelen: OpdrachtOnderdeelRegel[] = []
    if (ov.basis != null) onderdelen.push({ soort: 'Basisopdracht', omschrijving: 'Aangenomen werk conform offerte', bedrag: fmtEur(ov.basis) })
    for (const sp of stelpostenInOpdracht) onderdelen.push({ soort: 'Stelpost', omschrijving: sp.omschrijving, bedrag: fmtEur(sp.bedrag_excl_btw) })
    for (const op of gekozenOpties) onderdelen.push({ soort: 'Optie', omschrijving: op.omschrijving, bedrag: fmtEur(op.bedrag_excl_btw) })
    return {
      heeft: onderdelen.length > 0,
      aanneemsom: fmtEur(ov.aanneemsom),
      stelposten_totaal: fmtEur(ov.stelpostenTotaal),
      gekozen_opties_totaal: fmtEur(ov.gekozenOptiesTotaal),
      contracttotaal: fmtEur(contractExcl),
      onderdelen,
      stelposten: stelpostenInOpdracht.map(sp => ({ omschrijving: sp.omschrijving, bedrag: fmtEur(sp.bedrag_excl_btw) })),
      opties: gekozenOpties.map(op => ({ omschrijving: op.omschrijving, bedrag: fmtEur(op.bedrag_excl_btw) })),
    }
  } catch {
    return LEEG_OPDRACHT_BLOK
  }
}
