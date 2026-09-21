import 'server-only'

/**
 * Het klantbeeld: alles wat je van een opdrachtgever wilt weten terwijl je hem spreekt.
 *
 * Eén functie die parallel leest uit vijf bronnen en er de vijf lijsten, de kengetallen, de
 * score en de signalen van maakt. Bewust één leesronde: op een telefoon wacht je niet graag
 * twee keer, en de meeste afgeleide getallen komen toch uit dezelfde dossierrijen.
 *
 * Wat hier NIET in zit, met opzet:
 *
 *  - **De inkoopkant.** `getRelatieDossiers` haalt ook op waar deze relatie onderaannemer of
 *    leverancier is. Dat hoort op de relatiepagina, niet in een commercieel gesprek — en het
 *    kost vijf extra queries.
 *  - **Objecten zonder dossier.** De objectenlijst wordt afgeleid uit de dossiers, niet uit
 *    `getRelatieObjecten`. Dat laatste zit achter het recht `objectenbeheer` (dat de doelgroep
 *    niet per se heeft) en roept `getObjecten()` aan, dat twee onbegrensde selects doet.
 *    Gevolg van deze keuze: een complex waar nog nooit werk voor is gedaan verschijnt niet.
 *    Voor "werk per object" is dat juist wat je wilt.
 *  - **`getOmzetVoorRelatie`.** Die groepeert op `created_at` — de importdag — waardoor alle
 *    omzet in 2026 landt. Zie `jaarVoorKlantbeeld` voor het hele verhaal.
 */

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { getKlantDossiers } from '@/lib/relaties/dossiers'
import { getDebiteurenVoorRelatie } from '@/lib/debiteuren/actions'
import { getContactpersonenVoorOrganisatie } from '@/lib/relaties/contactpersonen-actions'
import { objectAdresRegel } from '@/lib/objecten/adres'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { laadKaartBedragen } from '@/lib/dossiers/kaart-bedragen'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { DossierRij } from '@/components/dossiers/types'
import { kiesOfferteBronnen } from '@/lib/dossiers/offerte-bron'
import { bewakingsStatus, stapOmschrijving } from './types'
import { berekenScore } from './klantbeeld-score'
import {
  FACTUUR_TE_LAAT_DAGEN, LANGLIGGEND_DAGEN, dagenSindsDatum, isBruikbareOpmerking,
  isNietDoorgegaan, isWerkGereed, jaarVoorKlantbeeld,
  type Klantbeeld, type KlantContactpersoon, type KlantFactuur, type KlantObject,
  type KlantOfferte, type KlantSignalen, type OfferteOpmerking, type OfferteStap,
} from './klantbeeld-types'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'

/** Hoeveel jaar terug "uitgevoerd werk" en "niet doorgegaan" tonen: dit jaar en vorig jaar. */
const UITGEVOERD_JAREN_TERUG = 1

const rond = (n: number): number => Math.round(n * 100) / 100

/**
 * Bewakingsstatussen waarbij wíj aan zet zijn — de klant wacht op ons.
 *
 * `verlopen` en `nu` spreken voor zich. `ongetrieerd` hoort erbij omdat "er is niets
 * afgesproken" aan de telefoon hetzelfde betekent: niemand is ermee bezig.
 */
const WIJ_AAN_ZET = new Set(['verlopen', 'nu', 'ongetrieerd'])

type BewakingRij = {
  dossier_id: string | null
  relatie_id: string | null
  stap_soort: 'actie' | 'wachten' | null
  stap_datum: string | null
  wacht_op: 'klant' | 'intern' | 'extern' | null
  afgerond_op: string | null
}

/* ── Deelberekeningen ──────────────────────────────────────────────────────────────────── */

/** Gefactureerd per jaar, uit dezelfde bron als het blok Gekoppelde dossiers op de desktop. */
function omzetPerJaar(dossiers: RelatieDossier[], jaar: number): number {
  return rond(dossiers
    .filter(d => jaarVoorKlantbeeld(d) === jaar)
    .reduce((som, d) => som + (d.bedrag ?? 0), 0))
}

/**
 * Hoeveel offertes bij deze klant liggen er al lang?
 *
 * Alleen openstaande offertes tellen mee: een gewonnen of verloren offerte "ligt" niet meer.
 * Zonder `verzonden_op` valt een dossier af — dan weten we niet hoe lang het ligt, en gokken
 * is hier erger dan zwijgen.
 */
function telLangliggend(offertesOpen: RelatieDossier[], vandaagMs: number): number {
  return offertesOpen.filter(d => {
    const dagen = dagenSindsDatum(d.verzonden_op, vandaagMs)
    return dagen !== null && dagen > LANGLIGGEND_DAGEN
  }).length
}

/**
 * Offertes waar wij aan zet zijn, uit de offertebewaking.
 *
 * Twee filters die we samenvoegen: kaarten die aan een dossier van deze klant hangen, en
 * kaarten die rechtstreeks aan de relatie hangen (verkoopkansen zonder dossier). Beide zijn
 * begrensd — `.in()` op ids die we al hebben, respectievelijk één relatie.
 */
async function telWijAanZet(
  supabase: ReturnType<typeof createAdminClient>,
  relatieId: string,
  dossierIds: string[],
  afgerondPerDossier: Map<string, boolean>,
): Promise<number> {
  const KOLOMMEN = 'dossier_id, relatie_id, stap_soort, stap_datum, wacht_op, afgerond_op'
  const [viaDossier, viaRelatie] = await Promise.all([
    dossierIds.length > 0
      ? supabase.from('commercie_bewaking').select(KOLOMMEN).in('dossier_id', dossierIds)
      : Promise.resolve({ data: [] as BewakingRij[] }),
    supabase.from('commercie_bewaking').select(KOLOMMEN).eq('relatie_id', relatieId),
  ])

  const vandaag = vandaagNL()
  const gezien = new Set<string>()
  let aantal = 0

  for (const rij of [...(viaDossier.data ?? []), ...(viaRelatie.data ?? [])] as BewakingRij[]) {
    // Een kaart die aan zowel het dossier als de relatie hangt komt twee keer langs.
    const sleutel = `${rij.dossier_id ?? ''}|${rij.relatie_id ?? ''}|${rij.stap_datum ?? ''}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)

    // Afgerond = de kaart zelf is afgevinkt, óf het dossier eronder is commercieel klaar.
    // Zonder dat tweede zou een gewonnen offerte eeuwig als "wij aan zet" blijven staan.
    const afgerond = !!rij.afgerond_op
      || (rij.dossier_id ? (afgerondPerDossier.get(rij.dossier_id) ?? false) : false)

    const status = bewakingsStatus(rij, { vandaag, afgerond })
    if (WIJ_AAN_ZET.has(status)) aantal++
  }
  return aantal
}

/**
 * De openstaande offertes verrijken met alles wat je erbij wilt hebben als je met de klant om
 * tafel zit: het bedrag, de offerte-PDF, de afgesproken volgende stap en de opmerkingen.
 *
 * Het bedrag komt uit `berekenKaartBedrag` — dezelfde rekenregel als het offertebord en het
 * Informatie-tab, zodat de telefoon geen derde getal introduceert. De velden die daarvoor nodig
 * zijn staan niet in `RelatieDossier` (dat draagt gefactureerde omzet, en die is bij een offerte
 * per definitie leeg), dus ze worden hier apart gelezen.
 *
 * De stap komt uit `commercie_bewaking` en de opmerkingen uit `dossier_notities`. Beide zijn
 * begrensd met `.in()` op de offerte-ids die we al hebben — dit loopt over de openstaande
 * offertes van één klant, hoogstens twintig op productie en gemiddeld drie.
 */
async function verrijkOffertes(
  supabase: ReturnType<typeof createAdminClient>,
  offertes: RelatieDossier[],
): Promise<KlantOfferte[]> {
  const ids = offertes.map(d => d.id)
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('dossiers')
    .select('id, hoofdstatus, bedrag_excl_btw, offerte_verstuurd_aantal, offerte_verstuurd_som_excl_btw, everts_calc_project_id')
    .in('id', ids)

  type Ruw = {
    id: string
    hoofdstatus: string
    bedrag_excl_btw: number | string | null
    offerte_verstuurd_aantal: number | null
    offerte_verstuurd_som_excl_btw: number | string | null
    everts_calc_project_id: string | null
  }
  const ruw = (data ?? []) as unknown as Ruw[]

  const [kaartVelden, bronnen, stappen, opmerkingen] = await Promise.all([
    laadKaartBedragen(ruw.map(r => ({ id: r.id, everts_calc_project_id: r.everts_calc_project_id }))),
    kiesOfferteBronnen(ids),
    leesStappen(supabase, ids),
    leesOpmerkingen(supabase, ids),
  ])

  const bedragPer = new Map<string, number | null>()
  for (const r of ruw) {
    // `berekenKaartBedrag` leest maar een handvol velden van de rij; een volledige `DossierRij`
    // opbouwen zou hier dertig kolommen extra kosten zonder dat er iets mee gebeurt.
    const rij = { ...r, ...(kaartVelden.get(r.id) ?? {}) } as unknown as DossierRij
    bedragPer.set(r.id, berekenKaartBedrag(rij, 'offerte').totaalExclBtw)
  }

  return offertes.map((d): KlantOfferte => ({
    ...d,
    bedragExclBtw: bedragPer.get(d.id) ?? null,
    offerteDocument: bronnen.get(d.id)?.naam ?? null,
    stap: stappen.get(d.id) ?? null,
    opmerkingen: opmerkingen.get(d.id) ?? [],
  }))
}

/**
 * De afgesproken volgende stap per offerte, uit de offertebewaking.
 *
 * `afgerond: false` staat er hard in: dit draait alleen over openstaande offertes, en een
 * openstaande offerte is per definitie niet commercieel klaar. Een afgevinkte kaart (`afgerond_op`)
 * levert geen stap — dan is er niets meer afgesproken en zegt het scherm dat ook niet.
 *
 * Hangen er meerdere kaarten aan één dossier, dan wint de laatst bijgewerkte: dat is de stap
 * waar iemand het meest recent iets over besloten heeft.
 */
async function leesStappen(
  supabase: ReturnType<typeof createAdminClient>,
  dossierIds: string[],
): Promise<Map<string, OfferteStap>> {
  const per = new Map<string, OfferteStap>()
  if (dossierIds.length === 0) return per

  const { data } = await supabase
    .from('commercie_bewaking')
    .select('dossier_id, stap_soort, stap_tekst, stap_datum, wacht_op, afgerond_op')
    .in('dossier_id', dossierIds)
    .order('updated_at', { ascending: false })

  const vandaag = vandaagNL()
  type Rij = {
    dossier_id: string | null
    stap_soort: 'actie' | 'wachten' | null
    stap_tekst: string | null
    stap_datum: string | null
    wacht_op: 'klant' | 'intern' | 'extern' | null
    afgerond_op: string | null
  }
  for (const rij of (data ?? []) as Rij[]) {
    if (!rij.dossier_id || rij.afgerond_op || per.has(rij.dossier_id)) continue
    const regel = stapOmschrijving(rij)
    if (!regel) continue
    per.set(rij.dossier_id, { status: bewakingsStatus(rij, { vandaag, afgerond: false }), regel })
  }
  return per
}

/** Hoeveel opmerkingen per offerte meegaan naar het scherm. */
const OPMERKINGEN_PER_OFFERTE = 5

/** De opmerkingen per offerte, nieuwste eerst. Zie `isBruikbareOpmerking` voor de selectie. */
async function leesOpmerkingen(
  supabase: ReturnType<typeof createAdminClient>,
  dossierIds: string[],
): Promise<Map<string, OfferteOpmerking[]>> {
  const per = new Map<string, OfferteOpmerking[]>()
  if (dossierIds.length === 0) return per

  const { data } = await supabase
    .from('dossier_notities')
    .select('id, dossier_id, inhoud, bouw7_bron, created_at')
    .in('dossier_id', dossierIds)
    .order('created_at', { ascending: false })

  type Rij = { id: string; dossier_id: string; inhoud: string; bouw7_bron: string | null; created_at: string }
  for (const rij of (data ?? []) as Rij[]) {
    if (!isBruikbareOpmerking(rij)) continue
    const lijst = per.get(rij.dossier_id) ?? []
    if (lijst.length >= OPMERKINGEN_PER_OFFERTE) continue
    lijst.push({ id: rij.id, datum: rij.created_at.slice(0, 10), tekst: rij.inhoud.trim() })
    per.set(rij.dossier_id, lijst)
  }
  return per
}

/** Objecten waar voor deze klant werk aan is of was, met het aantal dossiers per object. */
async function leesObjecten(
  supabase: ReturnType<typeof createAdminClient>,
  dossiers: RelatieDossier[],
): Promise<KlantObject[]> {
  const aantalPerObject = new Map<string, number>()
  for (const d of dossiers) {
    if (!d.object_id) continue
    aantalPerObject.set(d.object_id, (aantalPerObject.get(d.object_id) ?? 0) + 1)
  }
  const ids = [...aantalPerObject.keys()]
  if (ids.length === 0) return []

  const { data } = await supabase
    .from('vastgoed_objecten')
    .select('id, naam, objectnummer, adres_straat, adres_huisnummer, adres_postcode, adres_plaats')
    .in('id', ids)

  return (data ?? [])
    .map((o): KlantObject => ({
      id: o.id,
      // Objecten heten vaak "Complex 1013"; zonder terugval op het nummer sta je met een
      // lege regel.
      naam: o.naam || o.objectnummer || 'Object',
      adres: objectAdresRegel(o) || null,
      aantalDossiers: aantalPerObject.get(o.id) ?? 0,
    }))
    .sort((a, b) => b.aantalDossiers - a.aantalDossiers)
}

/* ── Hoofdfunctie ──────────────────────────────────────────────────────────────────────── */

export async function getKlantbeeld(relatieId: string): Promise<Klantbeeld | null> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return null

  const rechten = await getEffectieveRechten(medewerker)
  const magFacturenZien = heeftModuleToegang(rechten, 'financieel', 'lezen')

  const supabase = createAdminClient()

  const [relatieRes, dossierData, contactRes] = await Promise.all([
    supabase.from('relaties')
      .select('id, naam, adres_straat, adres_postcode, adres_plaats, telefoon, email')
      .eq('id', relatieId).maybeSingle(),
    getKlantDossiers(relatieId),
    getContactpersonenVoorOrganisatie(relatieId),
  ])

  if (!relatieRes.data) return null
  const r = relatieRes.data
  const dossiers = dossierData.rijen

  // Fase per dossier is al bepaald door `bepaalFase` in de leeslaag. Wat niet is doorgegaan
  // gaat er eerst uit: `fase` zet een verloren offerte bij het uitgevoerde werk en een
  // afgewezen aanvraag bij de offertes in de maak, en dat leest allebei als het tegendeel
  // van wat er gebeurd is.
  const nietDoor = dossiers.filter(isNietDoorgegaan)
  const nietDoorIds = new Set(nietDoor.map(d => d.id))
  const lopend = dossiers.filter(d => !nietDoorIds.has(d.id))

  const offertesInDeMaak = lopend.filter(d => d.fase === 'aanvraag')
  const offertesOpen     = lopend.filter(d => d.fase === 'offerte')
  // Opdracht en servicedesk apart: een renovatie van een ton en een lekkagemelding van
  // tweehonderd euro zijn twee gesprekken, ook al noemt `fase` ze allebei lopend.
  // `isWerkGereed` haalt de opdrachten op Financieel gereed er alvast uit — die horen bij het
  // uitgevoerde werk, net als de servicedeskbonnen met diezelfde status.
  const opdrachten  = lopend.filter(d => d.fase === 'opdracht' && !isWerkGereed(d))
  const servicedesk = lopend.filter(d => d.fase === 'servicedesk')

  const ditJaar = new Date().getFullYear()
  const uitgevoerdVanafJaar = ditJaar - UITGEVOERD_JAREN_TERUG
  // Zelfde venster voor beide eindlijsten: wat drie jaar geleden niet doorging draagt geen
  // gesprek meer, en de grootste klant heeft er 34 waarvan 24 binnen dit venster.
  const inVenster = (d: RelatieDossier): boolean => {
    const jaar = jaarVoorKlantbeeld(d)
    return jaar !== null && jaar >= uitgevoerdVanafJaar
  }
  const uitgevoerd = lopend.filter(d => (d.fase === 'afgesloten' || isWerkGereed(d)) && inVenster(d))
  const nietDoorgegaan = nietDoor.filter(inVenster)

  // Voor de bewaking: welke dossiers zijn commercieel klaar? Zelfde regel als `isAfgerond`
  // in actions.ts — let op dat 'gewonnen' als substatus niet bestaat (de trigger promoveert
  // hem meteen naar hoofdstatus 'opdracht').
  const afgerondPerDossier = new Map<string, boolean>(
    dossiers.map(d => [d.id, d.fase === 'opdracht' || d.fase === 'afgesloten']),
  )

  // De facturen zaten eerder in de eerste leesronde, maar hebben nu de dossier-ids nodig: een
  // factuur staat lang niet altijd op naam van de opdrachtgever (zie `getDebiteurenVoorRelatie`).
  // Ze schuiven mee in deze tweede ronde, dus het kost geen extra wachttijd.
  const [objecten, offerteWijAanZet, offertesOpenVerrijkt, facturen] = await Promise.all([
    leesObjecten(supabase, dossiers),
    telWijAanZet(supabase, relatieId, dossiers.map(d => d.id), afgerondPerDossier),
    verrijkOffertes(supabase, offertesOpen),
    // Geeft zelf een lege lijst terug zonder het recht `financieel`.
    getDebiteurenVoorRelatie(relatieId, dossiers.map(d => d.id)),
  ])

  const vandaagMs = Date.parse(`${vandaagNL()}T00:00:00Z`)

  const signalen: KlantSignalen = {
    factuurTeLaat:      facturen.filter(f => (f.dagen_na_vervaldatum ?? 0) > FACTUUR_TE_LAAT_DAGEN).length,
    offerteWijAanZet,
    offerteLangliggend: telLangliggend(offertesOpen, vandaagMs),
  }

  const klantFacturen: KlantFactuur[] = facturen
    .map((f): KlantFactuur => ({
      id: f.id,
      factuurnummer: f.factuurnummer,
      // Alleen invullen als de factuur écht bij een ander hoort; anders zou elke regel de
      // naam herhalen die al boven het scherm staat.
      opNaamVan: f.klant_relatie_id && f.klant_relatie_id !== relatieId ? f.klant_naam : null,
      bedrag: f.bedrag,
      vervaldatum: f.vervaldatum,
      dagenTeLaat: f.dagen_na_vervaldatum,
      stoplicht: f.stoplicht,
    }))
    // Langst openstaand bovenaan: dat is de factuur waar het gesprek over gaat.
    .sort((a, b) => (b.dagenTeLaat ?? 0) - (a.dagenTeLaat ?? 0))

  const contactpersonen: KlantContactpersoon[] = contactRes
    .filter(k => k.contactpersoon?.actief !== false)
    .map((k): KlantContactpersoon => ({
      id: k.contactpersoon.id,
      naam: [k.contactpersoon.voornaam, k.contactpersoon.tussenvoegsel, k.contactpersoon.achternaam]
        .filter(Boolean).join(' ').trim() || 'Naamloos',
      functie:  k.functie ?? null,
      email:    k.contactpersoon.email ?? null,
      telefoon: k.contactpersoon.telefoon ?? null,
      mobiel:   k.contactpersoon.mobiel ?? null,
      isPrimair: !!k.is_primair,
    }))
    .sort((a, b) => Number(b.isPrimair) - Number(a.isPrimair))

  return {
    relatie: {
      id: r.id,
      naam: r.naam,
      plaats: r.adres_plaats ?? null,
      adres: [r.adres_straat, [r.adres_postcode, r.adres_plaats].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ') || null,
      telefoon: r.telefoon ?? null,
      email: r.email ?? null,
    },
    kengetallen: {
      omzetDitJaar:   omzetPerJaar(dossiers, ditJaar),
      omzetVorigJaar: omzetPerJaar(dossiers, ditJaar - 1),
      ditJaar,
      vorigJaar: ditJaar - 1,
      zonderFacturatiegegevens: dossierData.totalen.zonderFacturatiegegevens,
    },
    // De ruwe statuskolommen gaan onveranderd mee: de score moet een verloren offerte van een
    // financieel afgesloten opdracht kunnen onderscheiden, en `fase` gooit die op één hoop.
    score: berekenScore(dossiers),
    signalen,
    offertesOpen: offertesOpenVerrijkt,
    offertesInDeMaak,
    opdrachten,
    servicedesk,
    uitgevoerd,
    nietDoorgegaan,
    facturen: klantFacturen,
    objecten,
    contactpersonen,
    toontFacturen: magFacturenZien,
    uitgevoerdVanafJaar,
  }
}

