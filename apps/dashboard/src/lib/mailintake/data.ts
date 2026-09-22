/**
 * mailintake/data.ts
 *
 * Leesfuncties voor de schermen. Bewust géén 'use server': dit wordt door
 * server-componenten aangeroepen en levert getypeerde rijen op, zodat de tabel
 * niet met `unknown` hoeft te werken.
 *
 * Elke query is begrensd. Een postvak dat stil op 1000 rijen afkapt zou precies
 * de berichten verbergen die nog moeten worden opgepakt.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import type { PostbusRij, BijlageRij, PostvakRij, PostvakTab, PostvakTeller } from './types'

export type { PostvakRij, PostvakTab, PostvakTeller }

const LIJST_SELECT = `
  id, groep_id, onderwerp, van_naam, van_adres, ontvangen_op, heeft_bijlagen,
  soort, soort_vertrouwen, samenvatting, status, besluit, dossier_id,
  herkend_via, herkenning_score, duplicaat_topscore, outlook_nabehandeling, laatste_fout,
  postbus:mailintake_postbussen(naam, sleutel),
  relatie:relaties(id, naam),
  dossier:dossiers!mailintake_berichten_dossier_id_fkey(dossiernummer),
  toegewezen:medewerkers!mailintake_berichten_toegewezen_medewerker_id_fkey(voornaam, achternaam)
`

function naam(m: { voornaam?: string | null; achternaam?: string | null } | null): string | null {
  if (!m) return null
  const n = [m.voornaam, m.achternaam].filter(Boolean).join(' ').trim()
  return n || null
}

const DAG = 24 * 3600 * 1000
const gedeeld = (dagen: number) => new Date(Date.now() - dagen * DAG).toISOString()

/**
 * Welke berichten horen bij dit tabblad?
 *
 * Eén definitie, twee lezers: de lijst en de teller boven het tabblad. Dat moet zo
 * blijven. Toen de teller zijn eigen filter had, stond er "Te behandelen 5" boven
 * een lijst van drie -- de lijst vouwt mails over dezelfde klus samen tot één regel
 * en de teller telde losse berichten. Een teller die iets anders belooft dan wat je
 * ziet, laat je zoeken naar post die er niet is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tabFilter<T extends { eq: any; in: any; gte: any }>(q: T, tab: PostvakTab): T {
  switch (tab) {
    case 'te_behandelen': return q.eq('status', 'wacht_op_mens')
    case 'verwerkt':      return q.eq('status', 'verwerkt').gte('behandeld_op', gedeeld(14))
    case 'geen_aanvraag': return q.eq('status', 'geen_aanvraag').gte('ontvangen_op', gedeeld(30))
    case 'genegeerd':     return q.eq('status', 'genegeerd')
    case 'mislukt':       return q.in('status', ['mislukt', 'bezig'])
    default:
      // "Alles" is de laatste 30 dagen -- een echt onbegrensde lijst kapt stil af.
      return q.gte('ontvangen_op', gedeeld(30))
  }
}

/** Het postvak voor één tabblad. */
export async function getPostvakRijen(tab: PostvakTab = 'te_behandelen'): Promise<PostvakRij[]> {
  const supabase = createAdminClient()
  const q = tabFilter(supabase.from('mailintake_berichten').select(LIJST_SELECT), tab)

  const { data, error } = await q.order('ontvangen_op', { ascending: false }).limit(500)
  // Nooit stil leeg teruggeven. Een kapotte select (bijvoorbeeld een dubbelzinnige
  // koppeling) levert hier `data: null` op, en dat ziet er in het scherm precies zo
  // uit als "er is geen post" -- terwijl de teller er wel twee laat zien.
  if (error) throw new Error(`Postvak laden mislukt: ${error.message}`)
  const alle = (data ?? []) as any[]

  // Mails over dezelfde klus worden één regel. Ze staan al op datum aflopend, dus
  // de eerste die we van een groep tegenkomen is de meest recente -- en dat is de
  // mail waarin de laatste afspraak staat. Er wordt alleen binnen het tabblad
  // samengevouwen: een afgehandelde mail verbergt geen wachtende.
  const perGroep = new Map<string, { rij: any; aantal: number }>()
  for (const r of alle) {
    const sleutel = r.groep_id ?? r.id
    const bestaand = perGroep.get(sleutel)
    if (bestaand) bestaand.aantal++
    else perGroep.set(sleutel, { rij: r, aantal: 1 })
  }
  const groepen = [...perGroep.values()]
  const rijen = groepen.map(g => g.rij)
  const aantalPerRij = new Map(groepen.map(g => [g.rij.id, g.aantal]))

  // Het dossiernummer van de sterkste duplicaatkandidaat, voor de badge in de lijst.
  const ids = rijen.filter(r => (r.duplicaat_topscore ?? 0) >= 0.55).map(r => r.id)
  const dupPerBericht = new Map<string, string>()
  if (ids.length) {
    const { data: dups } = await supabase
      .from('mailintake_duplicaat_kandidaten')
      .select('bericht_id, score, dossier:dossiers(dossiernummer)')
      .in('bericht_id', ids)
      .order('score', { ascending: false })
      .limit(1000)
    for (const d of (dups ?? []) as any[]) {
      if (!dupPerBericht.has(d.bericht_id) && d.dossier?.dossiernummer) {
        dupPerBericht.set(d.bericht_id, d.dossier.dossiernummer)
      }
    }
  }

  return rijen.map(r => ({
    id: r.id,
    onderwerp: r.onderwerp,
    vanNaam: r.van_naam,
    vanAdres: r.van_adres,
    ontvangenOp: r.ontvangen_op,
    heeftBijlagen: Boolean(r.heeft_bijlagen),
    soort: r.soort,
    soortVertrouwen: r.soort_vertrouwen != null ? Number(r.soort_vertrouwen) : null,
    samenvatting: r.samenvatting,
    status: r.status,
    besluit: r.besluit,
    postbusNaam: r.postbus?.naam ?? '—',
    postbusSleutel: r.postbus?.sleutel ?? '',
    relatieId: r.relatie?.id ?? null,
    relatieNaam: r.relatie?.naam ?? null,
    herkendVia: r.herkend_via,
    herkenningScore: r.herkenning_score != null ? Number(r.herkenning_score) : null,
    duplicaatTopscore: r.duplicaat_topscore != null ? Number(r.duplicaat_topscore) : null,
    duplicaatDossiernummer: dupPerBericht.get(r.id) ?? null,
    dossierId: r.dossier_id,
    dossiernummer: r.dossier?.dossiernummer ?? null,
    toegewezenNaam: naam(r.toegewezen),
    outlookNabehandeling: r.outlook_nabehandeling ?? 'nvt',
    laatsteFout: r.laatste_fout,
    aantalInGroep: aantalPerRij.get(r.id) ?? 1,
  }))
}

/**
 * Ligt de mailintake stil?
 *
 * Afgeleid uit de post zelf en niet uit een losse vlag: berichten die op een
 * AI-storing stuitten staan terug op `nieuw` met de uitleg in `laatste_fout`.
 * Daarmee ruimt de melding zichzelf op -- zodra de cron ze alsnog leest, zijn ze
 * geen `nieuw` meer en is het bericht weg. Een opgeslagen vlag zou blijven staan
 * tot iemand hem uitzet, en dan is "stil" al gauw een leugen.
 */
export async function getAiStoring(): Promise<{ uitleg: string; aantal: number } | null> {
  const supabase = createAdminClient()
  const { data, count } = await supabase
    .from('mailintake_berichten')
    .select('laatste_fout', { count: 'exact' })
    .eq('status', 'nieuw')
    .ilike('laatste_fout', 'De mailintake ligt stil%')
    .order('ontvangen_op', { ascending: false })
    .limit(1)

  const rij = data?.[0]
  if (!rij?.laatste_fout) return null
  return {
    uitleg: rij.laatste_fout.replace(/^De mailintake ligt stil:\s*/i, ''),
    aantal: count ?? 1,
  }
}

/** Bovengrens per tabblad, gelijk aan die van de lijst. Daarboven staat er "500+". */
const TELLER_GRENS = 500

/**
 * Tellers voor de tabbladen: het aantal **regels**, niet het aantal berichten.
 *
 * Telt daarom op groep, precies zoals de lijst samenvouwt. Alleen `id` en `groep_id`
 * over de lijn -- genoeg om te tellen, en niets meer dan dat.
 */
export async function getPostvakTellers(): Promise<Record<string, PostvakTeller>> {
  const supabase = createAdminClient()

  const tel = async (tab: PostvakTab): Promise<PostvakTeller> => {
    // Eén meer dan de grens ophalen: dan weet je of er nog iets achter zit zonder
    // een tweede telling.
    const { data } = await tabFilter(
      supabase.from('mailintake_berichten').select('id, groep_id'), tab,
    ).limit(TELLER_GRENS + 1)
    const rijen = data ?? []
    const groepen = new Set(rijen.map(r => r.groep_id ?? r.id))
    return { aantal: Math.min(groepen.size, TELLER_GRENS), meer: rijen.length > TELLER_GRENS }
  }

  const [teBehandelen, geenAanvraag, genegeerd, mislukt] = await Promise.all([
    tel('te_behandelen'), tel('geen_aanvraag'), tel('genegeerd'), tel('mislukt'),
  ])

  // De wachtrij hoort er los bij: een bericht op 'nieuw' of 'bezig' staat in geen
  // enkel tabblad behalve Alles. Blijft de verwerking hangen, dan is dat onzichtbaar
  // -- en onzichtbare post is precies wat deze module hoort te voorkomen. Hier telt
  // het bericht zelf en niet de groep: het gaat om werk dat blijft liggen.
  const { count: wachtrij } = await supabase
    .from('mailintake_berichten')
    .select('id', { count: 'exact', head: true })
    .in('status', ['nieuw', 'bezig'])

  return {
    wacht_op_mens: teBehandelen,
    geen_aanvraag: geenAanvraag,
    genegeerd,
    mislukt,
    wachtrij: { aantal: wachtrij ?? 0, meer: false },
  }
}

export interface DuplicaatWeergave {
  id: string
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  hoofdstatus: string | null
  score: number
  redenen: string[]
  soort: string
}

/** Een andere mail over dezelfde klus. */
export interface GroepsMail {
  id: string
  onderwerp: string | null
  ontvangenOp: string
  vanNaam: string | null
  vanAdres: string | null
  bodyTekst: string | null
  status: string
  aantalBijlagen: number
}

export interface BerichtDetail {
  bericht: Record<string, any>
  postbus: PostbusRij | null
  bijlagen: BijlageRij[]
  /**
   * De andere mails over dezelfde klus, oudste eerst. EVA heeft ze als geheel
   * gelezen; ze horen dus ook als geheel in beeld te staan, anders kijkt de
   * behandelaar naar een formulier dat is gevuld uit tekst die hij niet ziet.
   */
  groepsMails: GroepsMail[]
  extractie: Record<string, any> | null
  duplicaten: DuplicaatWeergave[]
  log: { id: string; moment: string; actor: string; actie: string; details: Record<string, any> }[]
}

/** Alles wat het behandelscherm nodig heeft, in één keer. */
export async function getBerichtDetail(id: string): Promise<BerichtDetail | null> {
  const supabase = createAdminClient()

  const { data: bericht, error: berichtFout } = await supabase
    .from('mailintake_berichten')
    .select(`*,
             postbus:mailintake_postbussen(*),
             relatie:relaties(id, naam),
             contactpersoon:contactpersonen(id, voornaam, achternaam, email),
             dossier:dossiers!mailintake_berichten_dossier_id_fkey(id, dossiernummer, titel),
             object:vastgoed_objecten(id, naam, objectnummer, adres_straat, adres_plaats)`)
    .eq('id', id)
    .maybeSingle()

  if (berichtFout) throw new Error(`Bericht laden mislukt: ${berichtFout.message}`)
  if (!bericht) return null

  // De bijlagen van de hele klus, niet alleen van dit bericht: de bon zit vaak in
  // een andere mail dan degene die je openslaat.
  const groepId = (bericht.groep_id ?? id) as string
  const { data: groepsRijen } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, ontvangen_op, van_naam, van_adres, body_tekst, status')
    .eq('groep_id', groepId)
    .order('ontvangen_op', { ascending: true })
    .limit(20)
  const groepsIds = (groepsRijen ?? []).map(r => r.id)

  const [bijlagen, extractie, duplicaten, log] = await Promise.all([
    supabase.from('mailintake_bijlagen').select('*')
      .in('bericht_id', groepsIds.length ? groepsIds : [id])
      // Ook het ingesloten beeld: een foto die iemand in de mailtekst plakt is
      // vaak het enige beeld van het werk. Wat er niet toe doet is bij het
      // ophalen al niet bewaard.
      .order('bestandsnaam').limit(100),
    // De meest recente gekeurde lezing binnen de hele klus, niet per se die van dit
    // bericht. Zodra een tweede mail erbij komt wordt er één keer over het geheel
    // gelezen, en die lezing hangt aan het bericht dat als laatste is verwerkt. De
    // andere mails dragen dan nog hun eigen halve formulier -- en juist dat gaf een
    // scherm zonder opdrachtreferentie en zonder factuuradres.
    supabase.from('mailintake_extracties').select('*')
      .in('bericht_id', groepsIds.length ? groepsIds : [id])
      .eq('ronde', 'velden')
      .not('gekeurde_velden', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle(),
    supabase.from('mailintake_duplicaat_kandidaten')
      .select('*, dossier:dossiers(id, dossiernummer, titel, hoofdstatus, klant:relaties!dossiers_klant_id_fkey(naam))')
      .eq('bericht_id', id).order('score', { ascending: false }).limit(10),
    supabase.from('mailintake_besluiten').select('*')
      .eq('bericht_id', id).order('moment', { ascending: false }).limit(30),
  ])

  return {
    bericht,
    postbus: (bericht.postbus ?? null) as PostbusRij | null,
    bijlagen: (bijlagen.data ?? []) as BijlageRij[],
    groepsMails: (groepsRijen ?? []).filter(r => r.id !== id).map(r => ({
      id: r.id,
      onderwerp: r.onderwerp,
      ontvangenOp: r.ontvangen_op,
      vanNaam: r.van_naam,
      vanAdres: r.van_adres,
      bodyTekst: r.body_tekst,
      status: r.status,
      aantalBijlagen: (bijlagen.data ?? []).filter((b: any) => b.bericht_id === r.id).length,
    })),
    extractie: extractie.data ?? null,
    duplicaten: ((duplicaten.data ?? []) as any[]).map(d => ({
      id: d.id,
      dossierId: d.dossier_id,
      dossiernummer: d.dossier?.dossiernummer ?? null,
      titel: d.dossier?.titel ?? null,
      klantnaam: d.dossier?.klant?.naam ?? null,
      hoofdstatus: d.dossier?.hoofdstatus ?? null,
      score: Number(d.score),
      redenen: d.redenen ?? [],
      soort: d.soort,
    })),
    log: (log.data ?? []) as any[],
  }
}

export async function getPostbussen(): Promise<PostbusRij[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('mailintake_postbussen').select('*').order('sleutel').limit(20)
  return (data ?? []) as PostbusRij[]
}

export interface AliasRij {
  id: string
  patroon: string
  soort: 'koppel' | 'negeer'
  relatieNaam: string | null
  laatstGebruiktOp: string | null
  createdAt: string
}

export async function getAliassen(): Promise<AliasRij[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_aliassen')
    .select('id, patroon, soort, laatst_gebruikt_op, created_at, relatie:relaties(naam)')
    .order('created_at', { ascending: false })
    .limit(500)
  return ((data ?? []) as any[]).map(a => ({
    id: a.id,
    patroon: a.patroon,
    soort: a.soort,
    relatieNaam: a.relatie?.naam ?? null,
    laatstGebruiktOp: a.laatst_gebruikt_op,
    createdAt: a.created_at,
  }))
}
