'use server'

// De prikklok: in- en uitklokken op het werkadres.
//
// DE SERVER BESLIST, NIET DE TELEFOON. De client stuurt alleen een GPS-positie (of, in de
// schaduwfase, een testlocatie); de afstand tot het werkadres rekenen we hier uit. Zo kan een
// aangepaste client niet zelf "binnen 250 m" beweren.
//
// SCHADUWFASE. Alles hier schrijft uitsluitend in de prikklok-tabellen. `uren_regels` en Bouw7
// worden alleen gelezen (voor de vergelijking op het weekscherm), nooit beschreven.
//
// AUTORISATIE. Admin-client (monteurs zijn app-gebruikers en zien via RLS niets), dus elke actie
// begint met `vereisPrikklokActie()` en filtert op de eigen medewerker-id.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { afstandMeter } from '@/lib/geo/afstand'
import { getBewakingscodesVoorUurlog } from '@/lib/dossiers/actions'
import { isoWeek, weekDagen, weekStartVan } from '@/lib/uren/rooster'
import { BOEKBAAR_FILTER, isBoekbaarDossier } from '@/lib/uren/boekbaar'
import { vereisPrikklokActie } from './auth'
import { amsterdamDatum, amsterdamMoment, amsterdamTijd } from './tijd'
import { berekenDagen, type PrikklokDag } from './bereken'
import type {
  PositieInvoer, PogingReden, PrikklokFase, PrikklokInstellingen, PrikklokSessie, UitWijze, Werklocatie,
} from './types'

const db = () => createAdminClient()


/** Zoekvak rond de positie: ~5,5 km. Houdt de select begrensd (zie de 1000-rijenregel). */
const ZOEK_GRAAD = 0.05

const DOSSIER_SELECT = `
  id, dossiernummer, titel, hoofdstatus, opdracht_substatus, servicedesk_substatus, gearchiveerd, bouw7_id,
  werkadres_straat, werkadres_huisnummer, werkadres_stad, adres_lat, adres_lng,
  relaties!klant_id ( naam )
`

type DossierRij = {
  id: string
  dossiernummer: string | null
  titel: string | null
  hoofdstatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  gearchiveerd: boolean | null
  bouw7_id: string | number | null
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_stad: string | null
  adres_lat: number | null
  adres_lng: number | null
  relaties?: { naam?: string | null } | null
}

const dossierLabel = (d: Pick<DossierRij, 'dossiernummer' | 'titel'>) =>
  [d.dossiernummer, d.titel].filter(Boolean).join(' · ') || 'Dossier'

const adresVan = (d: DossierRij) => {
  // Het huisnummer staat soms al in het straatveld (Bouw7-invoer); dan niet nog eens erachter.
  const st = (d.werkadres_straat ?? '').trim()
  const hn = (d.werkadres_huisnummer ?? '').trim()
  const straat = hn && !st.endsWith(hn) ? `${st} ${hn}`.trim() : st
  return [straat, d.werkadres_stad].filter(Boolean).join(', ') || null
}

/**
 * Waarop uren geschreven mogen worden: lopende opdrachten én open servicedeskbonnen. Dezelfde
 * regel als de weekstaat (lib/uren/boekbaar.ts) — wie hier inklokt, moet straks ook een geldige
 * weekstaatregel opleveren.
 */
const isLopend = (d: DossierRij) => isBoekbaarDossier(d)

const meter = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`

/* ── Resultaattypes ───────────────────────────────────────────────── */

export type ZoekResultaat =
  | { ok: true; locaties: Werklocatie[]; gesimuleerd: boolean }
  | { ok: false; reden: PogingReden; melding: string }

export type ActieResultaat =
  | { ok: true; melding: string }
  | { ok: false; melding: string; reden?: PogingReden; afstand_m?: number }

/* ── Positie ──────────────────────────────────────────────────────── */

type BepaaldePositie = { lat: number; lng: number; nauwkeurigheid: number | null; gesimuleerd: boolean }

/**
 * Zet de invoer om in een positie. Een testlocatie mag alleen in de schaduwfase en neemt de
 * coördinaten van het gekozen dossier over — dat is om aan het bureau de schermen te kunnen
 * doorlopen, niet om de straal te omzeilen.
 */
async function bepaalPositie(
  invoer: PositieInvoer,
  fase: PrikklokFase,
): Promise<BepaaldePositie | { fout: string }> {
  if (invoer.soort === 'test') {
    if (fase !== 'schaduw') return { fout: 'Een testlocatie kan alleen in de testfase.' }
    const { data } = await db().from('dossiers').select('adres_lat, adres_lng').eq('id', invoer.dossierId).maybeSingle()
    if (data?.adres_lat == null || data?.adres_lng == null) return { fout: 'Dit dossier heeft geen locatie.' }
    return { lat: data.adres_lat, lng: data.adres_lng, nauwkeurigheid: 5, gesimuleerd: true }
  }
  const { lat, lng, nauwkeurigheid } = invoer.positie
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { fout: 'Ongeldige locatie ontvangen.' }
  }
  return {
    lat, lng,
    nauwkeurigheid: nauwkeurigheid != null && Number.isFinite(nauwkeurigheid) ? nauwkeurigheid : null,
    gesimuleerd: false,
  }
}

/** Een fix met een te grote onzekerheid telt niet: bij 300 m marge zegt "binnen 250 m" niets. */
function teOnnauwkeurig(pos: BepaaldePositie, inst: PrikklokInstellingen): boolean {
  return !pos.gesimuleerd && pos.nauwkeurigheid != null && pos.nauwkeurigheid > inst.max_nauwkeurigheid_m
}

async function logPoging(p: {
  medewerkerId: string
  actie: 'in' | 'uit'
  reden: PogingReden
  pos?: BepaaldePositie | null
  dichtstbij?: { id: string; afstand: number } | null
}) {
  try {
    await db().from('prikklok_pogingen').insert({
      medewerker_id: p.medewerkerId,
      actie: p.actie,
      reden: p.reden,
      lat: p.pos?.lat ?? null,
      lng: p.pos?.lng ?? null,
      nauwkeurigheid_m: p.pos?.nauwkeurigheid ?? null,
      dichtstbij_dossier_id: p.dichtstbij?.id ?? null,
      dichtstbij_afstand_m: p.dichtstbij ? Math.round(p.dichtstbij.afstand) : null,
      gesimuleerd: p.pos?.gesimuleerd ?? false,
    })
  } catch {
    // Het logboek mag het inklokken nooit laten mislukken.
  }
}

/* ── Planning en standaardwaarden ─────────────────────────────────── */

type Ingepland = { planningItemId: string; bewakingscode: string | null }

/**
 * Dossiers waarop de medewerker op `datum` staat ingepland (planitem overlapt de dag). Zelfde
 * overlaptest als `getDossierOpties` in de weekstaat: meerdaagse items tellen elke dag mee, en de
 * momenten gaan eerst terug naar de Nederlandse kalenderdag.
 */
async function ingeplandOp(medewerkerId: string, datum: string): Promise<Map<string, Ingepland>> {
  const van = new Date(`${datum}T12:00:00Z`)
  van.setUTCDate(van.getUTCDate() - 60)
  const { data } = await db()
    .from('planning_items')
    .select('id, start_dt, eind_dt, planning_activiteiten ( dossier_id, bewakingscode )')
    .eq('medewerker_id', medewerkerId)
    .gte('start_dt', van.toISOString())
    .lte('start_dt', amsterdamMoment(datum, '23:59').toISOString())
    .order('start_dt')
    .limit(500)

  const uit = new Map<string, Ingepland>()
  for (const it of data ?? []) {
    const dossierId = it.planning_activiteiten?.dossier_id
    if (!dossierId) continue
    const start = amsterdamDatum(it.start_dt)
    const eind = it.eind_dt ? amsterdamDatum(it.eind_dt) : start
    if (start <= datum && eind >= datum) {
      uit.set(dossierId, { planningItemId: it.id, bewakingscode: it.planning_activiteiten?.bewakingscode ?? null })
    }
  }
  return uit
}

/** Eigen uursoort als die een werk-soort is, anders de eerste werk-soort (zoals de weekstaat). */
async function standaardUursoort(medewerkerId: string): Promise<string | null> {
  const supabase = db()
  const { data: mw } = await supabase
    .from('medewerkers')
    .select('standaard_uursoort_id, planning_uursoorten!standaard_uursoort_id ( uren_categorie, actief )')
    .eq('id', medewerkerId)
    .maybeSingle()
  const eigen = mw?.planning_uursoorten
  if (mw?.standaard_uursoort_id && eigen?.uren_categorie === 'werk' && eigen?.actief) {
    return mw.standaard_uursoort_id
  }
  const { data } = await supabase
    .from('planning_uursoorten')
    .select('id')
    .eq('actief', true)
    .eq('uren_categorie', 'werk')
    .order('naam')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

/** Bouw7-link van een bewakingscode; nodig om de regel straks naar Bouw7 te kunnen sturen. */
async function pslVoorCode(dossierId: string, code: string | null): Promise<number | null> {
  if (!code) return null
  try {
    const opties = await getBewakingscodesVoorUurlog(dossierId)
    return opties.find(o => o.code === code)?.pslId ?? null
  } catch {
    return null
  }
}

/* ── Open sessie ──────────────────────────────────────────────────── */

type OpenSessie = {
  id: string
  datum: string
  dossier_id: string
  in_op: string
  dossiers: DossierRij | null
}

async function haalOpenSessie(medewerkerId: string): Promise<OpenSessie | null> {
  const { data } = await db()
    .from('prikklok_sessies')
    .select(`id, datum, dossier_id, in_op, dossiers ( ${DOSSIER_SELECT} )`)
    .eq('medewerker_id', medewerkerId)
    .is('uit_op', null)
    .maybeSingle()
  return (data as OpenSessie | null) ?? null
}

function vernieuw() {
  revalidatePath('/m/prikklok')
  revalidatePath('/m/prikklok/week')
}

/* ── Zoeken ───────────────────────────────────────────────────────── */

/**
 * Welke werkadressen liggen binnen de straal? Kandidaten zijn álle lopende opdrachten en open
 * servicedeskbonnen, niet alleen die waarop iemand een rol heeft: uitvoerend personeel staat
 * zelden als rolhouder op een dossier.
 * Wat vandaag voor jou is ingepland komt bovenaan.
 */
export async function zoekWerklocaties(invoer: PositieInvoer): Promise<ZoekResultaat> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const pos = await bepaalPositie(invoer, inst.fase)
  if ('fout' in pos) return { ok: false, reden: 'geen_gps', melding: pos.fout }

  if (teOnnauwkeurig(pos, inst)) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'slechte_nauwkeurigheid', pos })
    return {
      ok: false,
      reden: 'slechte_nauwkeurigheid',
      melding: `Je locatie is nog te onnauwkeurig (± ${meter(pos.nauwkeurigheid ?? 0)}). Wacht even of ga naar buiten, en probeer opnieuw.`,
    }
  }

  const graadLng = ZOEK_GRAAD / Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180))
  const [{ data }, ingepland] = await Promise.all([
    db()
      .from('dossiers')
      .select(DOSSIER_SELECT)
      .eq('gearchiveerd', false)
      .gte('adres_lat', pos.lat - ZOEK_GRAAD)
      .lte('adres_lat', pos.lat + ZOEK_GRAAD)
      .gte('adres_lng', pos.lng - graadLng)
      .lte('adres_lng', pos.lng + graadLng)
      .limit(1000),
    ingeplandOp(medewerker.id, amsterdamDatum(new Date())),
  ])

  const metAfstand = ((data ?? []) as DossierRij[])
    .filter(d => d.adres_lat != null && d.adres_lng != null)
    .map(d => ({ d, afstand: afstandMeter(pos.lat, pos.lng, d.adres_lat!, d.adres_lng!) }))
    .sort((a, b) => a.afstand - b.afstand)

  const binnen = metAfstand.filter(x => x.afstand <= inst.straal_m && isLopend(x.d))
  if (binnen.length) {
    const locaties: Werklocatie[] = binnen
      .map(({ d, afstand }) => ({
        id: d.id,
        label: dossierLabel(d),
        adres: adresVan(d),
        klant: d.relaties?.naam ?? null,
        afstand_m: Math.round(afstand),
        ingepland: ingepland.has(d.id),
      }))
      .sort((a, b) => Number(b.ingepland) - Number(a.ingepland) || a.afstand_m - b.afstand_m)
    return { ok: true, locaties, gesimuleerd: pos.gesimuleerd }
  }

  // Niets binnen de straal. Zeg zo precies mogelijk waaróm: dat scheelt een telefoontje.
  const dichtstLopend = metAfstand.find(x => isLopend(x.d)) ?? null
  const dichtbij = dichtstLopend ? { id: dichtstLopend.d.id, afstand: dichtstLopend.afstand } : null

  // 1. Vandaag ingepland op een dossier zonder bekende locatie → dat is de oorzaak.
  const ingeplandIds = [...ingepland.keys()]
  if (ingeplandIds.length) {
    const { data: zonder } = await db()
      .from('dossiers')
      .select('id, dossiernummer, titel')
      .in('id', ingeplandIds)
      .or('adres_lat.is.null,adres_lng.is.null')
      .limit(20)
    const eerste = (zonder ?? [])[0] as Pick<DossierRij, 'dossiernummer' | 'titel'> | undefined
    if (eerste) {
      await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'geen_coordinaten', pos, dichtstbij: dichtbij })
      return {
        ok: false,
        reden: 'geen_coordinaten',
        melding: `Je staat vandaag ingepland op ${dossierLabel(eerste)}, maar van dat werkadres is geen locatie bekend. Inklokken kan daar pas als het adres klopt — meld dit bij de werkvoorbereiding.`,
      }
    }
  }

  // 2. Hier ligt wel een dossier, maar dat staat niet open voor uren.
  const nietLopend = metAfstand.find(x => x.afstand <= inst.straal_m)
  await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'te_ver', pos, dichtstbij: dichtbij })
  if (nietLopend) {
    return {
      ok: false,
      reden: 'te_ver',
      melding: `Hier ligt ${dossierLabel(nietLopend.d)}, maar dat dossier staat niet open voor uren. Inklokken kan alleen op een lopende opdracht of een open servicedeskbon.`,
    }
  }

  // 3. Gewoon te ver weg.
  return {
    ok: false,
    reden: 'te_ver',
    melding: dichtstLopend
      ? `Geen werklocatie binnen ${inst.straal_m} m. Dichtstbij is ${dossierLabel(dichtstLopend.d)} op ${meter(dichtstLopend.afstand)}.`
      : `Geen werklocatie binnen ${inst.straal_m} m.`,
  }
}

/* ── Inklokken ────────────────────────────────────────────────────── */

export async function klokIn(dossierId: string, invoer: PositieInvoer): Promise<ActieResultaat> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const nu = new Date()
  const vandaag = amsterdamDatum(nu)

  const open = await haalOpenSessie(medewerker.id)
  if (open && open.datum < vandaag) {
    return { ok: false, melding: `Vul eerst in hoe laat je vertrok bij ${dossierLabel(open.dossiers ?? { dossiernummer: null, titel: null })}.` }
  }
  if (open && open.dossier_id === dossierId) {
    return { ok: false, melding: 'Je bent hier al ingeklokt.' }
  }

  const pos = await bepaalPositie(invoer, inst.fase)
  if ('fout' in pos) return { ok: false, melding: pos.fout }
  if (teOnnauwkeurig(pos, inst)) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'slechte_nauwkeurigheid', pos })
    return { ok: false, reden: 'slechte_nauwkeurigheid', melding: 'Je locatie is nog te onnauwkeurig. Probeer het zo opnieuw.' }
  }

  const { data: dossier } = await db().from('dossiers').select(DOSSIER_SELECT).eq('id', dossierId).maybeSingle()
  const d = dossier as DossierRij | null
  if (!d || !isLopend(d)) return { ok: false, melding: 'Op dit dossier kun je geen uren schrijven.' }
  if (d.adres_lat == null || d.adres_lng == null) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'geen_coordinaten', pos })
    return { ok: false, reden: 'geen_coordinaten', melding: 'Van dit werkadres is geen locatie bekend.' }
  }
  const afstand = afstandMeter(pos.lat, pos.lng, d.adres_lat, d.adres_lng)
  if (afstand > inst.straal_m) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'in', reden: 'te_ver', pos, dichtstbij: { id: d.id, afstand } })
    return {
      ok: false, reden: 'te_ver', afstand_m: Math.round(afstand),
      melding: `Je bent ${meter(afstand)} van ${dossierLabel(d)}. Inklokken kan binnen ${inst.straal_m} m.`,
    }
  }

  // Wisselen: de lopende sessie sluit op dit moment. De reistijd valt daarmee onder het vorige
  // werk — dat is waar je vandaan kwam.
  if (open) {
    const oud = open.dossiers
    const { error } = await db()
      .from('prikklok_sessies')
      .update({
        uit_op: nu.toISOString(),
        uit_wijze: 'wissel' satisfies UitWijze,
        uit_lat: pos.lat,
        uit_lng: pos.lng,
        uit_nauwkeurigheid_m: pos.nauwkeurigheid,
        uit_afstand_m: oud?.adres_lat != null && oud?.adres_lng != null
          ? Math.round(afstandMeter(pos.lat, pos.lng, oud.adres_lat, oud.adres_lng))
          : null,
        updated_at: nu.toISOString(),
      })
      .eq('id', open.id)
      .is('uit_op', null)
    if (error) return { ok: false, melding: 'Het vorige werkadres kon niet worden afgesloten.' }
  }

  const [ingepland, uursoortId] = await Promise.all([
    ingeplandOp(medewerker.id, vandaag),
    standaardUursoort(medewerker.id),
  ])
  const plan = ingepland.get(d.id) ?? null
  let bewakingscode = plan?.bewakingscode ?? null
  let psl = await pslVoorCode(d.id, bewakingscode)
  // Een servicedeskbon heeft in de regel precies één code (RW01). Die hoeft niemand te kiezen.
  if (!bewakingscode && d.servicedesk_substatus) {
    const codes = await getBewakingscodesVoorUurlog(d.id).catch(() => [])
    if (codes.length === 1) {
      bewakingscode = codes[0].code
      psl = codes[0].pslId
    }
  }

  const { error } = await db().from('prikklok_sessies').insert({
    medewerker_id: medewerker.id,
    dossier_id: d.id,
    datum: vandaag,
    in_op: nu.toISOString(),
    in_lat: pos.lat,
    in_lng: pos.lng,
    in_nauwkeurigheid_m: pos.nauwkeurigheid,
    in_afstand_m: Math.round(afstand),
    uursoort_id: uursoortId,
    bewakingscode,
    bouw7_psl_id: psl,
    planning_item_id: plan?.planningItemId ?? null,
    gesimuleerd: pos.gesimuleerd,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, melding: 'Je bent al ingeklokt.' }
    return { ok: false, melding: 'Inklokken is niet gelukt. Probeer het opnieuw.' }
  }

  vernieuw()
  return {
    ok: true,
    melding: open
      ? `Gewisseld naar ${dossierLabel(d)} om ${amsterdamTijd(nu)}.`
      : `Ingeklokt bij ${dossierLabel(d)} om ${amsterdamTijd(nu)}.`,
  }
}

/* ── Uitklokken ───────────────────────────────────────────────────── */

/** Uitklokken op locatie: net als inklokken alleen binnen de straal van het werkadres. */
export async function klokUit(invoer: PositieInvoer): Promise<ActieResultaat> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const open = await haalOpenSessie(medewerker.id)
  if (!open) return { ok: false, melding: 'Je bent niet ingeklokt.' }
  const nu = new Date()
  if (open.datum < amsterdamDatum(nu)) {
    return { ok: false, melding: 'Deze dag is voorbij. Vul in hoe laat je vertrok.' }
  }

  const pos = await bepaalPositie(invoer, inst.fase)
  if ('fout' in pos) return { ok: false, melding: pos.fout }
  if (teOnnauwkeurig(pos, inst)) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'uit', reden: 'slechte_nauwkeurigheid', pos })
    return { ok: false, reden: 'slechte_nauwkeurigheid', melding: 'Je locatie is nog te onnauwkeurig. Probeer het zo opnieuw.' }
  }

  const d = open.dossiers
  if (d?.adres_lat == null || d?.adres_lng == null) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'uit', reden: 'geen_coordinaten', pos })
    return { ok: false, reden: 'geen_coordinaten', melding: 'Van dit werkadres is geen locatie meer bekend. Gebruik "Ik ben al vertrokken".' }
  }
  const afstand = afstandMeter(pos.lat, pos.lng, d.adres_lat, d.adres_lng)
  if (afstand > inst.straal_m) {
    await logPoging({ medewerkerId: medewerker.id, actie: 'uit', reden: 'te_ver', pos, dichtstbij: { id: d.id, afstand } })
    return {
      ok: false, reden: 'te_ver', afstand_m: Math.round(afstand),
      melding: `Je bent ${meter(afstand)} van het werkadres. Uitklokken kan binnen ${inst.straal_m} m — al weg? Kies "Ik ben al vertrokken".`,
    }
  }

  const { error } = await db()
    .from('prikklok_sessies')
    .update({
      uit_op: nu.toISOString(),
      uit_wijze: 'locatie' satisfies UitWijze,
      uit_lat: pos.lat,
      uit_lng: pos.lng,
      uit_nauwkeurigheid_m: pos.nauwkeurigheid,
      uit_afstand_m: Math.round(afstand),
      gesimuleerd: pos.gesimuleerd || undefined,
      updated_at: nu.toISOString(),
    })
    .eq('id', open.id)
    .is('uit_op', null)
  if (error) return { ok: false, melding: 'Uitklokken is niet gelukt. Probeer het opnieuw.' }

  vernieuw()
  return { ok: true, melding: `Uitgeklokt om ${amsterdamTijd(nu)}.` }
}

/**
 * "Ik ben al vertrokken": de medewerker is niet meer op het werkadres en geeft zelf zijn
 * vertrektijd op. Dat is de uitweg voor wie vergat uit te klokken — geen gok van EVA, maar een
 * opgave die in de weekcontrole als afwijking zichtbaar blijft (`uit_wijze = 'handmatig'`), met
 * de afstand op het moment van melden erbij.
 */
export async function meldVertrokken(tijd: string, invoer: PositieInvoer | null): Promise<ActieResultaat> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const open = await haalOpenSessie(medewerker.id)
  if (!open) return { ok: false, melding: 'Je bent niet ingeklokt.' }
  if (!/^\d{2}:\d{2}$/.test(tijd)) return { ok: false, melding: 'Kies een geldige tijd.' }

  const uit = amsterdamMoment(open.datum, tijd)
  const nu = new Date()
  if (uit.getTime() <= new Date(open.in_op).getTime()) {
    return { ok: false, melding: `Je vertrektijd ligt vóór je inkloktijd (${amsterdamTijd(open.in_op)}).` }
  }
  if (uit.getTime() > nu.getTime()) return { ok: false, melding: 'Die tijd ligt nog in de toekomst.' }

  // De positie is een bijzaak: lukt GPS niet, dan kan de opgave toch door.
  let pos: BepaaldePositie | null = null
  if (invoer) {
    const p = await bepaalPositie(invoer, inst.fase)
    if (!('fout' in p)) pos = p
  }
  const d = open.dossiers
  const afstand = pos && d?.adres_lat != null && d?.adres_lng != null
    ? Math.round(afstandMeter(pos.lat, pos.lng, d.adres_lat, d.adres_lng))
    : null

  const { error } = await db()
    .from('prikklok_sessies')
    .update({
      uit_op: uit.toISOString(),
      uit_wijze: 'handmatig' satisfies UitWijze,
      uit_lat: pos?.lat ?? null,
      uit_lng: pos?.lng ?? null,
      uit_nauwkeurigheid_m: pos?.nauwkeurigheid ?? null,
      uit_afstand_m: afstand,
      updated_at: nu.toISOString(),
    })
    .eq('id', open.id)
    .is('uit_op', null)
  if (error) return { ok: false, melding: 'Opslaan is niet gelukt. Probeer het opnieuw.' }

  vernieuw()
  return { ok: true, melding: `Vertrektijd ${tijd} vastgelegd.` }
}

/** Een GPS-fout aan de telefoonkant (geweigerd, geen GPS) — alleen voor het testlogboek. */
export async function meldGpsFout(actie: 'in' | 'uit', reden: 'geen_gps' | 'geweigerd'): Promise<void> {
  const { medewerker } = await vereisPrikklokActie()
  await logPoging({ medewerkerId: medewerker.id, actie, reden })
}

/** Bewakingscode achteraf kiezen voor een blok (alle sessies van één regel). */
export async function zetBewakingscode(
  sessieIds: string[],
  code: string,
  pslId: number | null,
): Promise<ActieResultaat> {
  const { medewerker } = await vereisPrikklokActie()
  if (!sessieIds.length || !code) return { ok: false, melding: 'Kies een code.' }
  const { error } = await db()
    .from('prikklok_sessies')
    .update({ bewakingscode: code, bouw7_psl_id: pslId, updated_at: new Date().toISOString() })
    .in('id', sessieIds.slice(0, 50))
    .eq('medewerker_id', medewerker.id)
  if (error) return { ok: false, melding: 'Opslaan is niet gelukt.' }
  vernieuw()
  return { ok: true, melding: `Bewakingscode ${code} gekozen.` }
}

/* ── Lezen ────────────────────────────────────────────────────────── */

export type SessieWeergave = {
  id: string
  dossier_label: string
  in_tijd: string
  uit_tijd: string | null
  uit_wijze: UitWijze | null
  uit_afstand_m: number | null
  gesimuleerd: boolean
}

export type PrikklokStatus = {
  fase: PrikklokFase
  straal_m: number
  open: {
    id: string
    dossier_label: string
    adres: string | null
    datum: string
    in_op: string
    in_tijd: string
    /** Open van een eerdere dag: eerst de vertrektijd opgeven. */
    vergeten: boolean
  } | null
  vandaag: PrikklokDag | null
  sessiesVandaag: SessieWeergave[]
  /** Alleen in de schaduwfase: dossiers om als testlocatie te kiezen. */
  testDossiers: Array<{ id: string; label: string }>
}

/** Een sessierij zoals `SESSIE_SELECT` hem oplevert. */
type SessieRij = {
  id: string
  datum: string
  dossier_id: string
  bewakingscode: string | null
  bouw7_psl_id: number | null
  uursoort_id: string | null
  in_op: string
  uit_op: string | null
  uit_wijze: string | null
  uit_afstand_m: number | null
  in_afstand_m: number
  gesimuleerd: boolean
  dossiers: { dossiernummer: string | null; titel: string | null } | null
}

function naarSessie(r: SessieRij): PrikklokSessie {
  return {
    id: r.id,
    datum: r.datum,
    dossier_id: r.dossier_id,
    dossier_label: dossierLabel(r.dossiers ?? { dossiernummer: null, titel: null }),
    bewakingscode: r.bewakingscode ?? null,
    bouw7_psl_id: r.bouw7_psl_id == null ? null : Number(r.bouw7_psl_id),
    uursoort_id: r.uursoort_id ?? null,
    in_op: r.in_op,
    uit_op: r.uit_op ?? null,
    uit_wijze: (r.uit_wijze as UitWijze | null) ?? null,
    uit_afstand_m: r.uit_afstand_m == null ? null : Number(r.uit_afstand_m),
    in_afstand_m: Number(r.in_afstand_m),
    gesimuleerd: !!r.gesimuleerd,
  }
}

const naarWeergave = (s: PrikklokSessie): SessieWeergave => ({
  id: s.id,
  dossier_label: s.dossier_label,
  in_tijd: amsterdamTijd(s.in_op),
  uit_tijd: s.uit_op ? amsterdamTijd(s.uit_op) : null,
  uit_wijze: s.uit_wijze,
  uit_afstand_m: s.uit_afstand_m,
  gesimuleerd: s.gesimuleerd,
})

const SESSIE_SELECT = `
  id, datum, dossier_id, bewakingscode, bouw7_psl_id, uursoort_id, in_op, uit_op, uit_wijze,
  uit_afstand_m, in_afstand_m, gesimuleerd, dossiers ( dossiernummer, titel )
`

export async function getPrikklokStatus(): Promise<PrikklokStatus> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const vandaag = amsterdamDatum(new Date())

  const [open, { data: rijen }, testDossiers] = await Promise.all([
    haalOpenSessie(medewerker.id),
    db()
      .from('prikklok_sessies')
      .select(SESSIE_SELECT)
      .eq('medewerker_id', medewerker.id)
      .eq('datum', vandaag)
      .order('in_op')
      .limit(100),
    inst.fase === 'schaduw' ? haalTestDossiers() : Promise.resolve([]),
  ])

  const sessies = (rijen ?? []).map(naarSessie)
  const dag = berekenDagen(sessies, inst)[0] ?? null

  return {
    fase: inst.fase,
    straal_m: inst.straal_m,
    open: open
      ? {
          id: open.id,
          dossier_label: dossierLabel(open.dossiers ?? { dossiernummer: null, titel: null }),
          adres: open.dossiers ? adresVan(open.dossiers) : null,
          datum: open.datum,
          in_op: open.in_op,
          in_tijd: amsterdamTijd(open.in_op),
          vergeten: open.datum < vandaag,
        }
      : null,
    vandaag: dag,
    sessiesVandaag: sessies.map(naarWeergave),
    testDossiers,
  }
}

/** Boekbare dossiers mét locatie, om in de schaduwfase als testlocatie te kiezen. */
async function haalTestDossiers(): Promise<Array<{ id: string; label: string }>> {
  const { data } = await db()
    .from('dossiers')
    .select('id, dossiernummer, titel')
    .or(BOEKBAAR_FILTER)
    .eq('gearchiveerd', false)
    .not('bouw7_id', 'is', null)
    .not('adres_lat', 'is', null)
    .order('dossiernummer', { ascending: false })
    .limit(300)
  return ((data ?? []) as DossierRij[]).map(d => ({ id: d.id, label: dossierLabel(d) }))
}

export type UrenstaatRegel = { label: string; bewakingscode: string | null; uursoort: string; uren: number }

export type PrikklokWeekDag = {
  datum: string
  prikklok: PrikklokDag | null
  sessies: SessieWeergave[]
  urenstaat: UrenstaatRegel[]
  urenstaatTotaal: number
}

export type PrikklokWeek = {
  fase: PrikklokFase
  weekStart: string
  weekNr: number
  jaar: number
  dagen: PrikklokWeekDag[]
  totaalPrikklok: number
  totaalUrenstaat: number
  /** Regels die nog aandacht vragen vóór de week klopt. */
  openPunten: number
}

/**
 * De week zoals de prikklok hem zou invullen, naast (alleen-lezen) wat er nu in de echte weekstaat
 * staat. Dat laatste is er alleen om in de testfase de rekenregels tegen de werkelijkheid te
 * leggen; hier wordt niets naar de weekstaat geschreven.
 */
export async function getPrikklokWeek(datum?: string): Promise<PrikklokWeek> {
  const { medewerker, instellingen: inst } = await vereisPrikklokActie()
  const weekStart = weekStartVan(datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : amsterdamDatum(new Date()))
  const dagen = weekDagen(weekStart)
  const weekEind = dagen[6]
  const { jaar, week } = isoWeek(weekStart)

  const [{ data: sessieRijen }, { data: urenRijen }] = await Promise.all([
    db()
      .from('prikklok_sessies')
      .select(SESSIE_SELECT)
      .eq('medewerker_id', medewerker.id)
      .gte('datum', weekStart)
      .lte('datum', weekEind)
      .order('in_op')
      .limit(500),
    db()
      .from('uren_regels')
      .select('datum, uren, bewakingscode, dossiers ( dossiernummer, titel ), planning_uursoorten ( naam )')
      .eq('medewerker_id', medewerker.id)
      .gte('datum', weekStart)
      .lte('datum', weekEind)
      .order('datum')
      .limit(200),
  ])

  const sessies = (sessieRijen ?? []).map(naarSessie)
  const berekend = new Map(berekenDagen(sessies, inst).map(d => [d.datum, d]))

  const weekDagenUit: PrikklokWeekDag[] = dagen.map(dag => {
    const urenstaat: UrenstaatRegel[] = (urenRijen ?? [])
      .filter(r => r.datum === dag)
      .map(r => ({
        label: r.dossiers ? dossierLabel(r.dossiers) : 'Geen dossier',
        bewakingscode: r.bewakingscode ?? null,
        uursoort: r.planning_uursoorten?.naam ?? '',
        uren: Number(r.uren),
      }))
    return {
      datum: dag,
      prikklok: berekend.get(dag) ?? null,
      sessies: sessies.filter(s => s.datum === dag).map(naarWeergave),
      urenstaat,
      urenstaatTotaal: urenstaat.reduce((t, r) => t + r.uren, 0),
    }
  })

  const alleRegels = [...berekend.values()].flatMap(d => d.regels)
  return {
    fase: inst.fase,
    weekStart,
    weekNr: week,
    jaar,
    dagen: weekDagenUit,
    totaalPrikklok: alleRegels.reduce((t, r) => t + r.uren, 0),
    totaalUrenstaat: weekDagenUit.reduce((t, d) => t + d.urenstaatTotaal, 0),
    openPunten: alleRegels.filter(r =>
      r.markeringen.includes('nog_open') || r.markeringen.includes('geen_bewakingscode'),
    ).length,
  }
}

