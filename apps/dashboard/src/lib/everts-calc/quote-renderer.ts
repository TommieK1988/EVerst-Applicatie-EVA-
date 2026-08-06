/**
 * quote-renderer.ts
 *
 * Bouwt de render-context voor een offerte: alle variabelen die in een Word-
 * template (.docx) via docxtemplater beschikbaar zijn. De daadwerkelijke render
 * naar .docx/PDF gebeurt in `render-quote-docx.ts`.
 *
 * Beschikbare variabelen (in {tag}):
 *   offerte.*       - hoofdvelden van de offerte
 *   klant.*         - klantgegevens
 *   bedrijf.*       - bedrijfsgegevens
 *   secties[]       - secties met regels
 *   normale_secties[] - secties excl. opties
 *   boom[]          - geneste structuurboom (niveau 1 > kinderen > regels) met opgerolde totalen
 *   optie_secties[] - alleen optie-secties
 *   stelpost_regels[] - alle stelpost-regels plat
 *   voorwaarden / uitsluitingen / opmerkingen
 *   totalen.*       - berekende totalen
 *   layout.*        - layout-instellingen
 */

import type { Quote, QuoteSection, QuoteLine } from './types-quotes'
import { STANDAARD_BTW_HOOG_PCT } from '@/lib/stamdata/constants'
import { nominaalPercentage } from '@/lib/stamdata/btw'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BedrijfContext {
  naam: string
  code?: string
  adres?: string
  postcode_plaats?: string
  land?: string
  telefoon?: string
  email?: string
  website?: string
  kvk?: string
  btw?: string
  iban?: string
  logo_url?: string
  logo_wit_url?: string
  is_werkmaatschappij?: boolean
}

/** Gegevens van het gekoppelde dossier (informatie-tab): werkadres, rollen, referenties. */
export interface DossierContext {
  heeft: boolean
  dossiernummer: string
  titel: string
  referentie: string
  opdracht_referentie: string
  vve_code: string
  werkadres: string          // samengesteld: straat, postcode plaats
  werkadres_naam: string
  werkadres_straat: string
  werkadres_postcode: string
  werkadres_plaats: string
  werkadres_telefoon: string
  werkadres_email: string
  calculator: string
  projectleider: string
  teamleider: string
  werkvoorbereider: string
  uitvoerder: string
  controller: string
  contactpersoon: string
  contactpersoon_email: string
  contactpersoon_telefoon: string
  // Uitgebreide contactpersoon-velden (uit de relaties-module, excl. het privé-blok).
  contactpersoon_aanhef: string
  contactpersoon_voornaam: string
  contactpersoon_tussenvoegsel: string
  contactpersoon_achternaam: string
  contactpersoon_voorletter: string
  contactpersoon_geslacht: string
  contactpersoon_aanspreekvorm: string // 'heer' / 'mevrouw', afgeleid uit het geslacht
  contactpersoon_mobiel: string
  contactpersoon_linkedin: string
  contactpersoon_opmerkingen: string
  // Opdrachtgever van het dossier (relaties!klant_id) — bron voor het klant-blok.
  klant_naam: string
  klant_adres: string
  klant_postcode: string
  klant_plaats: string
  klant_email: string
  klant_telefoon: string
  klant_kvk: string
  klant_btw: string
  klant_betalingstermijn_dagen: string
}

/**
 * Contactpersoon van de klant (uit de relaties-module, gekoppeld via het dossier).
 * Bevat alle vrij-invulbare velden **behalve** het privé-blok (privé-mail/-telefoon/
 * -adres en geboortedatum).
 */
export interface ContactpersoonContext {
  heeft: boolean
  volledige_naam: string
  aanhef: string
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  voorletter: string
  geslacht: string
  aanspreekvorm: string // 'heer' / 'mevrouw', afgeleid uit het geslacht
  email: string
  telefoon: string
  mobiel: string
  linkedin: string
  opmerkingen: string
}

/** Lege dossier-context (offerte zonder gekoppeld dossier). */
export const LEEG_DOSSIER: DossierContext = {
  heeft: false,
  dossiernummer: '', titel: '', referentie: '', opdracht_referentie: '', vve_code: '',
  werkadres: '', werkadres_naam: '', werkadres_straat: '', werkadres_postcode: '',
  werkadres_plaats: '', werkadres_telefoon: '', werkadres_email: '',
  calculator: '', projectleider: '', teamleider: '', werkvoorbereider: '', uitvoerder: '',
  controller: '',
  contactpersoon: '', contactpersoon_email: '', contactpersoon_telefoon: '',
  contactpersoon_aanhef: '', contactpersoon_voornaam: '', contactpersoon_tussenvoegsel: '',
  contactpersoon_achternaam: '', contactpersoon_voorletter: '', contactpersoon_geslacht: '',
  contactpersoon_aanspreekvorm: '',
  contactpersoon_mobiel: '', contactpersoon_linkedin: '', contactpersoon_opmerkingen: '',
  klant_naam: '', klant_adres: '', klant_postcode: '', klant_plaats: '',
  klant_email: '', klant_telefoon: '', klant_kvk: '', klant_btw: '',
  klant_betalingstermijn_dagen: '',
}

/** Eén BTW-tarief-groep met grondslag + BTW-bedrag (voor meerdere tarieven in één offerte). */
export interface BtwGroepContext {
  pct: number              // te heffen percentage
  pct_str: string          // "21%" of "21% verlegd"
  label: string            // tariefnaam uit de stamgegevens, bijv. 'Verlegd Hoog 21%'
  verlegd: boolean
  nominaal_pct: number     // gelijk aan pct; apart veld voor sjablonen die het los tonen
  grondslag: string        // € geformatteerd
  grondslag_raw: string    // kaal met duizendpunt, 2 decimalen (10.000,00)
  grondslag_bedrag: string // 10.000,00 (zonder €)
  btw_bedrag: string       // € geformatteerd
  btw_bedrag_raw: string   // kaal met duizendpunt, 2 decimalen (2.100,00)
  btw_bedrag_getal: string // 2.100,00 (zonder €)
}

export interface LayoutContext {
  primaire_kleur: string
  secundaire_kleur: string
  accent_kleur: string
  kleur_niveau_2: string
  kleur_niveau_3: string
  lettertype: string
  lettergrootte: number
  marge_boven: number
  marge_onder: number
  marge_links: number
  marge_rechts: number
  toon_voorblad: boolean
  toon_specificatie: boolean
  toon_voorwaarden: boolean
  toon_paginanummer: boolean
  voettekst: string
  koptekst: string
  footer_html: string
  papier_formaat: 'A4' | 'A3'
  papier_orientatie: 'portrait' | 'landscape'
}

export interface RenderContext {
  offerte: {
    nummer: string
    titel: string
    datum: string        // formatted
    datum_iso: string    // raw ISO
    geldig_tot: string   // formatted
    geldig_tot_iso: string
    referentie: string
    contactpersoon: string
    aanhef: string
    inleiding: string
    slottekst: string
    status: string
    type: string
    is_intern: boolean
    betalingscondities: string
    betalingscondities_naam: string
    termijnschema: string                 // termijnen tekstueel uitgeschreven (één per regel)
    betalingstermijnen: TermijnContext[]   // loop-variant: {#offerte.betalingstermijnen}…{/}
    heeft_termijnschema: boolean
  }
  klant: {
    naam: string
    bedrijfsnaam: string
    bedrijf_of_naam: string  // bedrijfsnaam ?? naam
    aanhef: string           // = offerte.aanhef
    adres: string
    postcode: string
    plaats: string
    postcode_plaats: string
    email: string
    telefoon: string
    contactpersoon: string           // uit het dossier, anders offerte.contactpersoon
    contactpersoon_email: string
    contactpersoon_telefoon: string
    kvk: string
    btw: string
    betalingstermijn_dagen: string   // aantal dagen betalen, uit de relatiegegevens
  }
  contactpersoon: ContactpersoonContext
  bedrijf: BedrijfContext
  dossier: DossierContext
  secties: SectieContext[]
  normale_secties: SectieContext[]
  normale_secties_niveau1: SectieContext[]
  normale_secties_niveau2: SectieContext[]
  normale_secties_niveau3: SectieContext[]
  boom: BoomNode[]
  optie_secties: SectieContext[]
  stelpost_regels: StelpostContext[]
  behandelingen_overzicht: BehandelingContext[]
  btw_groepen: BtwGroepContext[]   // top-level alias voor {#btw_groepen}-loops
  heeft_meerdere_btw: boolean      // top-level alias voor {#heeft_meerdere_btw}
  heeft_verlegde_btw: boolean      // minstens één regel met een verlegd tarief
  btw_verlegd_tekst: string        // standaardvermelding; leeg als er niets verlegd is
  heeft_stelposten: boolean
  heeft_opties: boolean
  heeft_terms: boolean
  heeft_behandelingen: boolean
  heeft_betalingscondities: boolean
  voorwaarden: string
  uitsluitingen: string
  opmerkingen: string
  totalen: {
    subtotaal: string          // formatted (€)
    subtotaal_raw: string      // kaal met duizendpunt, 2 decimalen (10.000,00)
    subtotaal_bedrag: string   // 10.000,00 (zonder €)
    btw_pct: number
    btw_bedrag: string         // formatted (€)
    btw_bedrag_raw: string     // kaal met duizendpunt, 2 decimalen
    btw_bedrag_getal: string   // 2.100,00 (zonder €)
    totaal: string             // formatted (€)
    totaal_raw: string         // kaal met duizendpunt, 2 decimalen
    totaal_bedrag: string      // 12.100,00 (zonder €)
    stelposten_subtotaal: string
    stelposten_subtotaal_raw: string
    stelposten_subtotaal_bedrag: string
    stelposten_in_totaal: boolean
    opties_subtotaal: string
    opties_subtotaal_raw: string
    opties_subtotaal_bedrag: string
    btw_groepen: BtwGroepContext[]
    heeft_meerdere_btw: boolean
    heeft_verlegde_btw: boolean
    btw_verlegd_tekst: string
  }
  layout: LayoutContext
}

interface SectieContext {
  id: string
  naam: string
  display_naam: string      // "1.2  Metselwerk"
  nummer: string
  discipline: string
  niveau: number
  volgorde: number
  subtotaal: string         // formatted (€)
  subtotaal_raw: string     // kaal met duizendpunt, 2 decimalen (5.000,00)
  subtotaal_num: number     // intern: numerieke waarde voor de boom-optelling
  subtotaal_bedrag: string  // 5.000,00 (zonder €)
  toon_detail: boolean
  is_optioneel: boolean
  is_stelpost_sectie: boolean
  regels: RegelContext[]
  heeft_regels: boolean
  aantal_regels: number
}

/**
 * Eén knoop in de geneste structuurboom (`boom`). Bevat alle velden van een
 * SectieContext, plus `kinderen` (subgroepen op het volgende niveau) en de
 * opgerolde totalen (`subtotaal_incl*` = eigen regels + alle kinderen).
 */
interface BoomNode extends SectieContext {
  kinderen: BoomNode[]
  heeft_kinderen: boolean
  subtotaal_incl: string        // opgerold, geformatteerd (€ 12.500,00)
  subtotaal_incl_raw: string    // opgerold, kaal met duizendpunt, 2 decimalen (12.500,00)
  subtotaal_incl_bedrag: string // opgerold, zonder € (12.500,00)
}

interface RegelContext {
  id: string
  /** Tekstregel zonder bedrag: hoeveelheid, eenheid, prijs en totaal zijn leeg. */
  is_tekstregel: boolean
  omschrijving: string
  omschrijving_volledig: string  // omschrijving + \n + werkomschrijving (indien gevuld)
  hoeveelheid: string       // formatted number
  eenheid: string
  eenheidsprijs: string     // formatted (€)
  eenheidsprijs_raw: string // kaal met duizendpunt, 2 decimalen
  eenheidsprijs_bedrag: string // 12,50 (zonder €)
  totaal: string            // formatted (€)
  totaal_raw: string        // kaal met duizendpunt, 2 decimalen
  totaal_bedrag: string     // 131,25 (zonder €)
  btw_pct: number           // BTW percentage bijv. 21
  is_stelpost: boolean
  opmerking: string
  werkomschrijving: string  // alias voor opmerking (uitgebreide werkomschrijving)
  heeft_opmerking: boolean
  schilderbehandeling: string       // naam + werkomschrijving, als platte tekst
  heeft_schilderbehandeling: boolean
  // De twee helften waar {schilderbehandeling} bij het renderen in wordt opgesplitst
  // (zie `splitsOnderstreept` in render-docx): de naam komt onderstreept op een eigen
  // regel, de tekst eronder. Los bruikbaar in een template dat ze zelf wil plaatsen.
  behandeling_naam: string          // "2-laags dekkend"
  behandeling_tekst: string         // werkomschrijving, met leidende \n als er een naam boven staat
  // Foto's bij de werkomschrijving. Loop in de template: {#afbeeldingen}{%foto}{/afbeeldingen}
  // `foto_klein` is dezelfde afbeelding met een kleiner max-kader, bedoeld voor
  // gebruik binnen een tabelcel (waar {%foto} anders te breed is en wordt afgesneden).
  afbeeldingen: { foto: string; foto_klein: string }[]
  heeft_afbeeldingen: boolean
  // intern
  kostprijs: string
  uren: string
  marge_pct: string
}

/**
 * Eén unieke schilderbehandeling in `behandelingen_overzicht`.
 *
 * Bewust een object en geen kale string: `{.}` in de template wordt bij het renderen
 * vervangen door de onderstreepte `naam` met `tekst` erachter (zie `splitsOnderstreept`
 * in render-quote-docx). Lukt dat splitsen niet, dan valt `{.}` terug op `volledig`.
 */
interface BehandelingContext {
  naam: string      // "2-laags dekkend"
  tekst: string     // werkomschrijving, met leidende \n als er een naam boven staat
  volledig: string  // naam + werkomschrijving als platte tekst
}

interface StelpostContext {
  omschrijving: string
  sectie_naam: string
  totaal: string
  totaal_raw: string
  totaal_bedrag: string
}

/** Eén betalingstermijn uit het termijnschema van de gekozen betalingsconditie. */
interface TermijnContext {
  nummer: number           // 1-based volgnummer
  percentage: string       // "50" (kaal), leeg als niet gezet
  percentage_str: string   // "50%"
  omschrijving: string     // vrije omschrijving van de termijn
  regel: string            // volledige regel zoals in termijnschema (percentage + omschrijving)
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function euro(n: number | null | undefined): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return '€ ' + num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function datumNL(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function numNL(n: number | null | undefined, dec = 3): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('nl-NL', { maximumFractionDigits: dec })
}

/** Bedrag met duizendscheiding + 2 decimalen, ZONDER euroteken (bv. "10.000,00"). */
function numEuroPlain(n: number | null | undefined): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * "Kaal" bedrag mét duizendscheiding en altijd twee decimalen, zonder euroteken
 * (bv. 10000 → "10.000,00", 12.5 → "12,50", 131.25 → "131,25"). Voor de
 * `*_raw`-variabelen: nummer-look, maar wél met duizendpunt zodat grote bedragen
 * leesbaar blijven.
 *
 * De decimalen zijn verplicht: een offerte met "€ 10.000" naast "€ 131,25" in
 * dezelfde kolom leest slordig. Bedragen horen op de cent uit te lijnen, ook als
 * die cent nul is.
 */
function numRaw(n: number | null | undefined): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Splitst de bevroren schilderbehandeling in de naam en de werkomschrijving.
 *
 * De naam hoort als eerste regel in de offerte te staan (en wordt daar onderstreept);
 * de werkomschrijving komt eronder. Twee gevallen die geen dubbele tekst mogen geven:
 *  - de behandeling heeft geen eigen omschrijving → de tekst ís de naam (bevriezen valt
 *    daarop terug). Dan alleen de naam tonen.
 *  - oude offerteregels zonder bevroren naam → alleen de tekst, precies zoals voorheen.
 *
 * `tekst` krijgt een leidende newline zodra er een naam boven staat, zodat de twee
 * losse Word-runs (onderstreept + normaal) samen één regelovergang opleveren zonder
 * dat het template daar iets voor hoeft te doen.
 */
function splitsBehandeling(
  behandeling: string | null | undefined,
  naam: string | null | undefined,
): { naam: string; tekst: string; volledig: string } {
  const n = (naam ?? '').trim()
  const rauw = (behandeling ?? '').trim()
  const tekst = rauw && rauw !== n ? rauw : ''
  return {
    naam: n,
    tekst: n && tekst ? '\n' + tekst : tekst,
    volledig: [n, tekst].filter(Boolean).join('\n'),
  }
}

/**
 * Bouwt een geneste structuurboom uit een platte, op volgorde gesorteerde lijst
 * secties. Elke sectie wordt kind van de dichtstbijzijnde voorgaande sectie met
 * een lager niveau (stack-algoritme — werkt voor strikte 1→2→3 nesting én als een
 * niveau ooit wordt overgeslagen). Totalen rollen bottom-up op:
 * `subtotaal_incl` = eigen regels + som van alle kinderen.
 */
function bouwBoom(items: SectieContext[]): BoomNode[] {
  const gesorteerd = [...items].sort((a, b) => a.volgorde - b.volgorde)
  const roots: BoomNode[] = []
  const stack: BoomNode[] = []

  for (const s of gesorteerd) {
    const node: BoomNode = {
      ...s,
      kinderen: [],
      heeft_kinderen: false,
      subtotaal_incl: '',
      subtotaal_incl_raw: '',
      subtotaal_incl_bedrag: '',
    }
    // Ga terug tot de bovenkant van de stack een lager niveau heeft: die is de ouder.
    while (stack.length && stack[stack.length - 1].niveau >= node.niveau) stack.pop()
    if (stack.length) stack[stack.length - 1].kinderen.push(node)
    else roots.push(node)
    stack.push(node)
  }

  // Snoei lege takken: een hoofdstuk zonder eigen regels én zonder (overgebleven)
  // kinderen heeft niets te tonen (bv. als het enige kind een optie was die al is
  // uitgefilterd). Bottom-up zodat een ouder pas wegvalt nadat zijn kinderen weg zijn.
  function heeftInhoud(n: BoomNode): boolean {
    n.kinderen = n.kinderen.filter(heeftInhoud)
    return n.aantal_regels > 0 || n.kinderen.length > 0
  }
  const behouden = roots.filter(heeftInhoud)

  // Bottom-up de opgerolde subtotalen berekenen.
  function roll(n: BoomNode): number {
    let som = n.subtotaal_num
    for (const k of n.kinderen) som += roll(k)
    const inclNum = Math.round(som * 100) / 100
    n.subtotaal_incl = euro(inclNum)
    n.subtotaal_incl_raw = numRaw(inclNum)
    n.subtotaal_incl_bedrag = numEuroPlain(inclNum)
    n.heeft_kinderen = n.kinderen.length > 0
    return inclNum
  }
  behouden.forEach(roll)

  return behouden
}

/**
 * BTW-uitsplitsing per tarief over alle niet-optionele regels.
 *
 * Groeperen op percentage alleen zou "Hoog 21%" en "Verlegd Hoog 21%" op één hoop gooien —
 * beide heffen 21%, maar op de offerte horen ze los, want alleen bij de verlegde variant
 * hoort de vermelding dat er een verlegd tarief is gebruikt.
 *
 * Gedeeld door de Word/PDF-render én het offertescherm, zodat die niet uiteen kunnen lopen.
 */
export function groepeerBtwPerTarief(
  sections: QuoteSection[],
  fallbackPct: number | null | undefined,
): BtwGroepContext[] {
  type Bucket = { pct: number; grondslag: number; label: string; verlegd: boolean; nominaal: number }
  const perTarief = new Map<string, Bucket>()
  for (const s of sections) {
    if (s.is_optioneel) continue
    for (const line of (s.lines ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const l = line as any
      // Tekstregels hebben geen bedrag en dus geen BTW-grondslag; anders zou er een
      // lege 0%-rij in de uitsplitsing verschijnen.
      if (l.soort === 'tekst') continue
      const pct = Number(l.btw_pct ?? fallbackPct ?? STANDAARD_BTW_HOOG_PCT)
      const tarief = l.btw_tarief ?? null
      const sleutel = tarief?.id ? `t:${tarief.id}` : `pct:${pct}`
      const bestaand = perTarief.get(sleutel)
      if (bestaand) {
        bestaand.grondslag += line.line_total ?? 0
      } else {
        perTarief.set(sleutel, {
          pct,
          grondslag: line.line_total ?? 0,
          label: tarief?.label ?? `${pct}%`,
          verlegd: tarief?.verlegd ?? false,
          nominaal: tarief ? nominaalPercentage(tarief) : pct,
        })
      }
    }
  }
  return Array.from(perTarief.values())
    .sort((a, b) => b.nominaal - a.nominaal || Number(a.verlegd) - Number(b.verlegd))
    .map(({ pct, grondslag, label, verlegd, nominaal }) => {
      const btwBedrag = Math.round(grondslag * (pct / 100) * 100) / 100
      return {
        pct,
        pct_str: verlegd ? `${nominaal}% verlegd` : `${pct}%`,
        label,
        verlegd,
        nominaal_pct: nominaal,
        grondslag: euro(grondslag),
        grondslag_raw: numRaw(grondslag),
        grondslag_bedrag: numEuroPlain(grondslag),
        btw_bedrag: euro(btwBedrag),
        btw_bedrag_raw: numRaw(btwBedrag),
        btw_bedrag_getal: numEuroPlain(btwBedrag),
      }
    })
}

/**
 * Vermelding welke verlegde tarieven op deze offerte staan. Bewust géén zin over "de
 * afnemer draagt de BTW af": de offerte brengt het tarief wél in rekening (zie de
 * bedrijfskeuze in lib/stamdata/btw.ts). Leeg als er geen verlegd tarief in zit.
 */
function btwVerlegdTekst(groepen: BtwGroepContext[]): string {
  const verlegd = groepen.filter(g => g.verlegd)
  if (verlegd.length === 0) return ''
  const pcten = [...new Set(verlegd.map(g => g.nominaal_pct))].sort((a, b) => b - a)
  return `Verlegd tarief van toepassing (${pcten.map(p => `${p}%`).join(' en ')}).`
}

// ─── Context builder ─────────────────────────────────────────────────────────

export function buildRenderContext(
  quote: Quote,
  bedrijf: BedrijfContext,
  layout: LayoutContext,
  dossier: DossierContext = LEEG_DOSSIER,
): RenderContext {
  const sections = quote.sections ?? []
  const terms = quote.terms ?? []
  const isIntern = quote.type === 'interne_calculatie'

  function mapRegel(line: QuoteLine): RegelContext {
    const kp = line.kostprijs_pe ?? 0
    const vp = line.eenheidsprijs
    const marge = kp > 0 ? ((vp - kp) / vp * 100) : null
    const behandeling = splitsBehandeling(line.schilderbehandeling, line.schilderbehandeling_naam)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTekst = (line as any).soort === 'tekst'
    // Een tekstregel vult dezelfde sjabloonrij als een gewone regel, maar alle
    // getalvelden blijven leeg in plaats van "€ 0,00" en "0 st". Zo tonen bestaande
    // sjablonen hem meteen goed zonder dat iemand zijn Word-document hoeft aan te
    // passen; wie de rij écht anders wil opmaken kan {#is_tekstregel} gebruiken.
    return {
      id: line.id,
      is_tekstregel: isTekst,
      omschrijving: line.omschrijving,
      omschrijving_volledig: line.opmerking
        ? `${line.omschrijving}\n${line.opmerking}`
        : line.omschrijving,
      hoeveelheid: isTekst ? '' : numNL(line.hoeveelheid),
      eenheid: isTekst ? '' : line.eenheid,
      eenheidsprijs: isTekst ? '' : euro(line.eenheidsprijs),
      eenheidsprijs_raw: isTekst ? '' : numRaw(line.eenheidsprijs),
      eenheidsprijs_bedrag: isTekst ? '' : numEuroPlain(line.eenheidsprijs),
      totaal: isTekst ? '' : euro(line.line_total),
      totaal_raw: isTekst ? '' : numRaw(line.line_total),
      totaal_bedrag: isTekst ? '' : numEuroPlain(line.line_total),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      btw_pct: (line as any).btw_pct ?? STANDAARD_BTW_HOOG_PCT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_stelpost: (line as any).is_stelpost ?? false,
      opmerking: line.opmerking ?? '',
      werkomschrijving: line.opmerking ?? '',
      heeft_opmerking: !!line.opmerking,
      schilderbehandeling: behandeling.volledig,
      heeft_schilderbehandeling: !!behandeling.volledig,
      behandeling_naam: behandeling.naam,
      behandeling_tekst: behandeling.tekst,
      afbeeldingen: (line.werkomschrijving_afbeeldingen ?? []).map(foto => ({ foto, foto_klein: foto })),
      heeft_afbeeldingen: (line.werkomschrijving_afbeeldingen ?? []).length > 0,
      kostprijs: kp > 0 ? euro(kp) : '—',
      uren: line.uren_pe != null ? numNL(line.uren_pe) : '—',
      marge_pct: marge != null ? marge.toFixed(1) + '%' : '—',
    }
  }

  function mapSectie(s: QuoteSection): SectieContext {
    const regels = (s.lines ?? []).map(mapRegel)
    return {
      id: s.id,
      naam: s.naam,
      display_naam: s.nummer ? `${s.nummer}  ${s.naam}` : s.naam,
      nummer: s.nummer ?? '',
      discipline: s.discipline ?? '',
      niveau: s.niveau,
      volgorde: s.volgorde,
      subtotaal: euro(s.subtotaal),
      subtotaal_raw: numRaw(s.subtotaal),
      subtotaal_num: s.subtotaal,
      subtotaal_bedrag: numEuroPlain(s.subtotaal),
      toon_detail: s.toon_detail,
      is_optioneel: s.is_optioneel,
      is_stelpost_sectie: regels.some(r => r.is_stelpost),
      regels,
      heeft_regels: regels.length > 0,
      aantal_regels: regels.length,
    }
  }

  const secties = sections.map(mapSectie)
  const normale_secties = secties.filter(s => !s.is_optioneel && s.regels.length > 0)
  const normale_secties_niveau1 = normale_secties.filter(s => s.niveau === 1)
  const normale_secties_niveau2 = normale_secties.filter(s => s.niveau === 2)
  const normale_secties_niveau3 = normale_secties.filter(s => s.niveau === 3)
  const optie_secties = secties.filter(s => s.is_optioneel && s.regels.length > 0)

  // Geneste structuurboom: niveau-1 knopen met kinderen (niveau 2), enz.
  // Kop-groepen zonder eigen regels blijven behouden zodat de boomstructuur klopt.
  const boom = bouwBoom(secties.filter(s => !s.is_optioneel))

  const stelpost_regels: StelpostContext[] = []
  for (const s of normale_secties) {
    for (const r of s.regels) {
      if (r.is_stelpost) {
        stelpost_regels.push({
          omschrijving: r.omschrijving,
          sectie_naam: s.naam,
          totaal: r.totaal,
          totaal_raw: r.totaal_raw,
          totaal_bedrag: r.totaal_bedrag,
        })
      }
    }
  }

  // Unieke schilderbehandelingen (naam + werkomschrijving) over alle secties heen.
  // Ontdubbeld op de volledige tekst, zodat twee behandelingen met dezelfde naam maar
  // een andere werkomschrijving allebei blijven staan.
  const behandelingenSet = new Map<string, BehandelingContext>()
  for (const s of secties) {
    for (const r of s.regels) {
      if (r.schilderbehandeling && !behandelingenSet.has(r.schilderbehandeling)) {
        behandelingenSet.set(r.schilderbehandeling, {
          naam: r.behandeling_naam,
          tekst: r.behandeling_tekst,
          volledig: r.schilderbehandeling,
        })
      }
    }
  }
  const behandelingen_overzicht = Array.from(behandelingenSet.values())

  const voorwaarden   = terms.find(t => t.type === 'voorwaarden')?.inhoud   ?? ''
  const uitsluitingen = terms.find(t => t.type === 'uitsluitingen')?.inhoud ?? ''
  const opmerkingen   = terms.find(t => t.type === 'opmerkingen')?.inhoud   ?? ''

  // Klantgegevens: voorkeur voor de opdrachtgever van het gekoppelde dossier
  // (relaties!klant_id), anders de losse `clients`-tabel van de offerte. De
  // inline-flow vult `clients` alleen met de naam, dus zonder dossier bleef het
  // adres leeg.
  const klant = quote.client
  const d = dossier
  const kNaam     = (d.heeft && d.klant_naam)     || klant?.naam     || ''
  const kAdres    = (d.heeft && d.klant_adres)    || klant?.adres    || ''
  const kPostcode = (d.heeft && d.klant_postcode) || klant?.postcode || ''
  const kPlaats   = (d.heeft && d.klant_plaats)   || klant?.plaats   || ''
  const kEmail    = (d.heeft && d.klant_email)    || klant?.email    || ''
  const kTelefoon = (d.heeft && d.klant_telefoon) || klant?.telefoon || ''
  const kKvk      = (d.heeft && d.klant_kvk)      || klant?.kvk      || ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kBtw      = (d.heeft && d.klant_btw)      || (klant as any)?.btw_nummer || ''
  const kContact  = d.contactpersoon || quote.contactpersoon || ''
  const bedrijfsnaam = klant?.bedrijfsnaam ?? ''
  const postcode_plaats = [kPostcode, kPlaats].filter(Boolean).join(' ')

  // Contactpersoon van de klant (uit de relaties-module via het dossier), zonder
  // het privé-blok. De volledige naam valt terug op de losse offerte-contactpersoon.
  const contactpersoon: ContactpersoonContext = {
    heeft: !!(d.heeft && (d.contactpersoon || d.contactpersoon_email || d.contactpersoon_achternaam)),
    volledige_naam: kContact,
    aanhef: d.contactpersoon_aanhef,
    voornaam: d.contactpersoon_voornaam,
    tussenvoegsel: d.contactpersoon_tussenvoegsel,
    achternaam: d.contactpersoon_achternaam,
    voorletter: d.contactpersoon_voorletter,
    geslacht: d.contactpersoon_geslacht,
    aanspreekvorm: d.contactpersoon_aanspreekvorm,
    email: d.contactpersoon_email,
    telefoon: d.contactpersoon_telefoon,
    mobiel: d.contactpersoon_mobiel,
    linkedin: d.contactpersoon_linkedin,
    opmerkingen: d.contactpersoon_opmerkingen,
  }

  const btw_groepen = groepeerBtwPerTarief(sections, quote.btw_pct)
  const heeft_verlegde_btw = btw_groepen.some(g => g.verlegd)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const betalingsconditie = (quote as any).betalingsconditie ?? null
  const betalingscondities_tekst: string = betalingsconditie?.tekst ?? ''

  // Termijnschema: de termijnen van de gekozen betalingsconditie tekstueel
  // uitgeschreven. `termijnen` is een JSONB-array [{ percentage, omschrijving }].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruweTermijnen: any[] = Array.isArray(betalingsconditie?.termijnen) ? betalingsconditie.termijnen : []
  const betalingstermijnen: TermijnContext[] = ruweTermijnen.map((t, i) => {
    const pct = t?.percentage != null && t.percentage !== '' ? String(t.percentage) : ''
    const oms = (t?.omschrijving ?? '').toString().trim()
    const pctStr = pct ? `${pct}%` : ''
    // Regel: neem de omschrijving als die er is (bevat vaak al het percentage),
    // anders "50% termijn". Nooit een lege regel.
    const regel = oms || (pctStr ? `${pctStr} termijn` : `Termijn ${i + 1}`)
    return { nummer: i + 1, percentage: pct, percentage_str: pctStr, omschrijving: oms, regel }
  })
  const termijnschema: string = betalingstermijnen.map(t => t.regel).join('\n')

  return {
    offerte: {
      nummer: quote.quote_nummer,
      titel: quote.titel,
      datum: datumNL(quote.datum),
      datum_iso: quote.datum,
      geldig_tot: datumNL(quote.geldig_tot),
      geldig_tot_iso: quote.geldig_tot ?? '',
      referentie: quote.referentie ?? '',
      contactpersoon: quote.contactpersoon ?? '',
      aanhef: quote.aanhef,
      inleiding: quote.inleiding ?? '',
      slottekst: quote.slottekst ?? '',
      status: quote.status,
      type: quote.type,
      is_intern: isIntern,
      betalingscondities: betalingscondities_tekst,
      betalingscondities_naam: betalingsconditie?.naam ?? '',
      termijnschema,
      betalingstermijnen,
      heeft_termijnschema: betalingstermijnen.length > 0,
    },
    klant: {
      naam: kNaam,
      bedrijfsnaam,
      bedrijf_of_naam: bedrijfsnaam || kNaam,
      aanhef: quote.aanhef ?? '',
      adres: kAdres,
      postcode: kPostcode,
      plaats: kPlaats,
      postcode_plaats,
      email: kEmail,
      telefoon: kTelefoon,
      contactpersoon: kContact,
      contactpersoon_email: d.contactpersoon_email || '',
      contactpersoon_telefoon: d.contactpersoon_telefoon || '',
      kvk: kKvk,
      btw: kBtw,
      betalingstermijn_dagen: d.klant_betalingstermijn_dagen || '',
    },
    contactpersoon,
    bedrijf,
    dossier,
    secties,
    normale_secties,
    normale_secties_niveau1,
    normale_secties_niveau2,
    normale_secties_niveau3,
    boom,
    optie_secties,
    stelpost_regels,
    behandelingen_overzicht,
    btw_groepen,
    heeft_meerdere_btw: btw_groepen.length > 1,
    heeft_verlegde_btw,
    btw_verlegd_tekst: btwVerlegdTekst(btw_groepen),
    heeft_stelposten: stelpost_regels.length > 0,
    heeft_opties: optie_secties.length > 0,
    heeft_behandelingen: behandelingen_overzicht.length > 0,
    heeft_terms: !!(voorwaarden || uitsluitingen || opmerkingen),
    heeft_betalingscondities: !!betalingscondities_tekst,
    voorwaarden,
    uitsluitingen,
    opmerkingen,
    totalen: {
      subtotaal: euro(quote.subtotaal_ex_btw),
      subtotaal_raw: numRaw(quote.subtotaal_ex_btw),
      subtotaal_bedrag: numEuroPlain(quote.subtotaal_ex_btw),
      btw_pct: quote.btw_pct,
      btw_bedrag: euro(quote.btw_bedrag),
      btw_bedrag_raw: numRaw(quote.btw_bedrag),
      btw_bedrag_getal: numEuroPlain(quote.btw_bedrag),
      totaal: euro(quote.totaal_inc_btw),
      totaal_raw: numRaw(quote.totaal_inc_btw),
      totaal_bedrag: numEuroPlain(quote.totaal_inc_btw),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_subtotaal: euro((quote as any).stelposten_subtotaal ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_subtotaal_raw: numRaw(Number((quote as any).stelposten_subtotaal ?? 0)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_subtotaal_bedrag: numEuroPlain(Number((quote as any).stelposten_subtotaal ?? 0)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_in_totaal: (quote as any).stelposten_in_totaal ?? true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opties_subtotaal: euro((quote as any).opties_subtotaal ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opties_subtotaal_raw: numRaw(Number((quote as any).opties_subtotaal ?? 0)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opties_subtotaal_bedrag: numEuroPlain(Number((quote as any).opties_subtotaal ?? 0)),
      btw_groepen,
      heeft_meerdere_btw: btw_groepen.length > 1,
      heeft_verlegde_btw,
      btw_verlegd_tekst: btwVerlegdTekst(btw_groepen),
    },
    layout,
  }
}

// ─── Standaard layout context ─────────────────────────────────────────────────

export const STANDAARD_LAYOUT: LayoutContext = {
  primaire_kleur: '#1a56db',
  secundaire_kleur: '#f8fafc',
  accent_kleur: '#009439',
  kleur_niveau_2: '#475569',
  kleur_niveau_3: '#e2e8f0',
  lettertype: 'system-ui, -apple-system, sans-serif',
  lettergrootte: 10,
  marge_boven: 15,
  marge_onder: 15,
  marge_links: 18,
  marge_rechts: 18,
  toon_voorblad: true,
  toon_specificatie: true,
  toon_voorwaarden: true,
  toon_paginanummer: true,
  voettekst: 'Pagina {{paginanummer}} van {{totaal_paginas}}',
  koptekst: '',
  footer_html: '',
  papier_formaat: 'A4',
  papier_orientatie: 'portrait',
}

export const BEDRIJF_FALLBACK: BedrijfContext = {
  naam: 'Everts Groep B.V.',
  adres: 'Voorbeeldstraat 1',
  postcode_plaats: '1234 AB Amstelveen',
  telefoon: '020-1234567',
  email: 'info@evertsgroep.nl',
  website: 'www.evertsgroep.nl',
  kvk: '12345678',
  btw: 'NL123456789B01',
  iban: 'NL00 BANK 0000 0000 00',
}
