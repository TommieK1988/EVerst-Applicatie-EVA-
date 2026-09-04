'use server'

// De weekstaat: alles wat een medewerker met zijn eigen uren doet.
//
// AUTORISATIE. Elke functie hier draait op de admin-client (service-role, bypast RLS) omdat een
// monteur een app_gebruiker is en dus géén platformgebruiker — via de anon-client zou hij overal
// nul rijen zien. De afscherming zit daarom in de code: `eigenWeek()` controleert bij élke actie
// dat de week van de ingelogde medewerker zelf is. Zonder die guard zou een geraden week-id de
// uren van een collega blootleggen (zie het IDOR-patroon in m/uren/[id]/page.tsx).
//
// De rekenregel zelf staat in `./rekenregel` — pure functies, ook gebruikt door de
// goedkeurschermen: som >= contracturen om in te dienen, saldo = som mín tijd voor tijd mín norm.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { getContracturen, getVoorgevuldeRegels, isoWeek, weekStartVan, weekDagen } from './rooster'
import { getUrenInstellingen, getIndirectDossierId } from './instellingen'
import { berekenWeekTotalen, indienBlokkade, rondUren, type UrenCategorie } from './rekenregel'
import { bepaalModus, bepaalTeamleider } from './goedkeuring'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type WeekStatus = 'concept' | 'ingediend' | 'teamleider_akkoord' | 'goedgekeurd' | 'afgekeurd'

export type UursoortOptie = {
  id: string
  naam: string
  categorie: UrenCategorie
}

export type WeekRegel = {
  id: string
  datum: string
  uren: number
  uursoort_id: string
  uursoort_naam: string
  categorie: UrenCategorie
  dossier_id: string | null
  dossier_label: string | null
  bewakingscode: string | null
  opmerking: string | null
  bron: string
  afgeweken_van_bron: boolean
  pl_status: string
  gewijzigd_door_goedkeurder: boolean
  bouw7_status: string
}

export type WeekOnkosten = {
  id: string
  datum: string
  soort: 'parkeren' | 'reiskosten' | 'overig'
  bedrag: number
  km: number | null
  omschrijving: string | null
  bon_url: string | null
}

export type Weekstaat = {
  weekId: string
  weekStart: string
  jaar: number
  weekNr: number
  dagen: string[]
  status: WeekStatus
  contracturen: number
  totaalUren: number
  tijdVoorTijdUren: number
  tekort: number
  saldoMutatie: number
  saldoNu: number
  magIndienen: boolean
  blokkade: string | null
  bewerkbaar: boolean
  afkeurReden: string | null
  regels: WeekRegel[]
  onkosten: WeekOnkosten[]
}

/* ── Interne helpers ──────────────────────────────────────────────── */

/**
 * Haalt de week op en controleert dat hij van de ingelogde medewerker is.
 * Dit is de enige plek waar dat gebeurt; elke muterende functie gaat er langs.
 */
async function eigenWeek(weekId: string) {
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, week_start, status, contracturen')
    .eq('id', weekId)
    .maybeSingle()
  if (!week) throw new Error('Week niet gevonden.')
  if (week.medewerker_id !== medewerker.id) throw new Error('Dit is niet jouw weekstaat.')
  return { medewerker, week, supabase }
}

/** Een week is alleen te wijzigen zolang hij nog niet ingediend is (of is afgekeurd). */
function bewerkbaar(status: WeekStatus) {
  return status === 'concept' || status === 'afgekeurd'
}

/* ── Opbouw ───────────────────────────────────────────────────────── */

/**
 * Zorgt dat de week bestaat en vult hem bij aanmaak met de regels die al vaststaan
 * (feestdagen en geregistreerd verlof). Voorvullen gebeurt alleen bij het aanmaken: daarna is de
 * weekstaat van de medewerker, en zou opnieuw voorvullen zijn correcties terugdraaien.
 */
async function zorgVoorWeek(medewerkerId: string, weekStart: string) {
  const supabase = db()
  const { jaar, week } = isoWeek(weekStart)

  const { data: bestaand } = await supabase
    .from('uren_weken')
    .select('id')
    .eq('medewerker_id', medewerkerId)
    .eq('jaar', jaar)
    .eq('week_nr', week)
    .maybeSingle()
  if (bestaand) return bestaand.id as string

  const { uren } = await getContracturen(medewerkerId, weekStart)
  const { data: nieuw, error } = await supabase
    .from('uren_weken')
    .insert({ medewerker_id: medewerkerId, jaar, week_nr: week, week_start: weekStart, contracturen: uren })
    .select('id')
    .single()
  // Race: twee tabbladen die tegelijk dezelfde week openen. De unique-constraint vangt dat af;
  // we lezen dan gewoon de rij die de ander maakte.
  if (error) {
    const { data: alsnog } = await supabase
      .from('uren_weken').select('id')
      .eq('medewerker_id', medewerkerId).eq('jaar', jaar).eq('week_nr', week).maybeSingle()
    if (alsnog) return alsnog.id as string
    throw new Error(error.message)
  }

  await vulVoor(medewerkerId, weekStart, nieuw.id)
  return nieuw.id as string
}

/** Feestdagen en geregistreerd verlof als regels neerzetten. */
async function vulVoor(medewerkerId: string, weekStart: string, weekId: string) {
  const supabase = db()
  const voorgevuld = await getVoorgevuldeRegels(medewerkerId, weekStart)
  if (!voorgevuld.length) return

  const { data: soorten } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, uren_categorie')
    .not('uren_categorie', 'is', null)
  type Soort = { id: string; naam: string; uren_categorie: UrenCategorie }
  const lijst = (soorten ?? []) as Soort[]

  const feestdagSoort = lijst.find(s => s.uren_categorie === 'feestdag')
  // Verlof uit Bouw7 komt binnen als type 'verlof' | 'ziek' | 'training' | 'overig'. We mikken op
  // de best passende afwezigheidssoort en vallen terug op Vakantie uren.
  const afwezig = lijst.filter(s => s.uren_categorie === 'afwezig')
  const zoek = (naam: string) => afwezig.find(s => s.naam.toLowerCase().includes(naam))
  const soortVoorType = (type?: string) =>
    type === 'ziek' ? (zoek('ziek') ?? zoek('vakantie'))
    : type === 'training' ? (zoek('scholing') ?? zoek('vakantie'))
    : (zoek('vakantie') ?? afwezig[0])

  const medewerker = await supabase
    .from('medewerkers').select('werkmaatschappij_id').eq('id', medewerkerId).maybeSingle()
  const indirectDossier = await getIndirectDossierId(medewerker.data?.werkmaatschappij_id ?? null)

  const rijen = voorgevuld.flatMap(r => {
    const soort = r.bron === 'bouw7_feestdag' ? feestdagSoort : soortVoorType(r.afwezigheidType)
    if (!soort) return []
    return [{
      week_id: weekId,
      medewerker_id: medewerkerId,
      datum: r.datum,
      uren: r.uren,
      uursoort_id: soort.id,
      dossier_id: indirectDossier,
      bron: r.bron,
      opmerking: r.omschrijving,
    }]
  })
  if (rijen.length) await supabase.from('uren_regels').insert(rijen)
}

/* ── Lezen ────────────────────────────────────────────────────────── */

/** De weekstaat van de ingelogde medewerker. `datum` mag elke dag in de week zijn. */
export async function getWeekstaat(datum?: string): Promise<Weekstaat> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const weekStart = weekStartVan(datum ?? new Date())
  const weekId = await zorgVoorWeek(medewerker.id, weekStart)

  const [{ data: week }, { data: regels }, { data: onkosten }, { data: saldoRij }, inst] = await Promise.all([
    supabase.from('uren_weken').select('*').eq('id', weekId).single(),
    supabase
      .from('uren_regels')
      .select('*, planning_uursoorten(naam, uren_categorie), dossiers(dossiernummer, titel)')
      .eq('week_id', weekId)
      .order('datum'),
    supabase.from('uren_onkosten').select('*').eq('week_id', weekId).order('datum'),
    supabase.from('uren_saldo_per_medewerker').select('saldo_uren').eq('medewerker_id', medewerker.id).maybeSingle(),
    getUrenInstellingen(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rij = (regels ?? []) as any[]
  const nette: WeekRegel[] = rij.map(r => ({
    id: r.id,
    datum: r.datum,
    uren: Number(r.uren),
    uursoort_id: r.uursoort_id,
    uursoort_naam: r.planning_uursoorten?.naam ?? '—',
    categorie: (r.planning_uursoorten?.uren_categorie ?? 'afwezig') as UrenCategorie,
    dossier_id: r.dossier_id,
    dossier_label: r.dossiers ? `${r.dossiers.dossiernummer} · ${r.dossiers.titel}` : null,
    bewakingscode: r.bewakingscode,
    opmerking: r.opmerking,
    bron: r.bron,
    afgeweken_van_bron: r.afgeweken_van_bron,
    pl_status: r.pl_status,
    gewijzigd_door_goedkeurder: !!r.gewijzigd_door_goedkeurder_id,
    bouw7_status: r.bouw7_status,
  }))

  const contracturen = Number(week.contracturen ?? 0)
  const totalen = berekenWeekTotalen(nette, contracturen, inst.tolerantie_uren)
  const status = week.status as WeekStatus
  const ongecodeerd = nette.filter(r => r.categorie === 'werk' && (!r.dossier_id || !r.bewakingscode)).length
  const blokkade = indienBlokkade(totalen, contracturen, ongecodeerd)

  return {
    weekId,
    weekStart,
    jaar: week.jaar,
    weekNr: week.week_nr,
    dagen: weekDagen(weekStart),
    status,
    contracturen,
    ...totalen,
    saldoNu: Number(saldoRij?.saldo_uren ?? 0),
    magIndienen: bewerkbaar(status) && !blokkade,
    blokkade,
    bewerkbaar: bewerkbaar(status),
    afkeurReden: week.afkeur_reden,
    regels: nette,
    onkosten: (onkosten ?? []).map((o: Record<string, unknown>) => ({
      id: o.id as string,
      datum: o.datum as string,
      soort: o.soort as WeekOnkosten['soort'],
      bedrag: Number(o.bedrag),
      km: o.km == null ? null : Number(o.km),
      omschrijving: (o.omschrijving as string) ?? null,
      bon_url: (o.bon_url as string) ?? null,
    })),
  }
}

/** De uursoorten die in de weekstaat gekozen mogen worden, eigen soort bovenaan. */
export async function getUursoortOpties(): Promise<UursoortOptie[]> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const [{ data: soorten }, { data: mw }] = await Promise.all([
    supabase
      .from('planning_uursoorten')
      .select('id, naam, uren_categorie')
      .eq('actief', true)
      .not('uren_categorie', 'is', null)
      .order('naam'),
    supabase.from('medewerkers').select('standaard_uursoort_id').eq('id', medewerker.id).maybeSingle(),
  ])

  const lijst: UursoortOptie[] = (soorten ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    naam: s.naam as string,
    categorie: s.uren_categorie as UrenCategorie,
  }))

  // Volgorde die de monteur het minste tikwerk kost: zijn eigen soort eerst, dan de rest van het
  // werk, dan tijd voor tijd, dan afwezigheid. Feestdagen worden voorgevuld en horen onderaan.
  const rang = (o: UursoortOptie) =>
    o.id === mw?.standaard_uursoort_id ? 0
    : o.categorie === 'werk' ? 1
    : o.categorie === 'tijd_voor_tijd' ? 2
    : o.categorie === 'afwezig' ? 3 : 4
  return lijst.sort((a, b) => rang(a) - rang(b) || a.naam.localeCompare(b.naam))
}

/**
 * Dossiers om uit te kiezen bij werk-uren: eerst waar deze medewerker die dag ingepland staat
 * (dat is bijna altijd het goede antwoord), daarna zijn overige lopende opdrachten.
 */
export async function getDossierOpties(datum: string): Promise<Array<{
  id: string; label: string; uitPlanning: boolean
}>> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: items } = await supabase
    .from('planning_items')
    .select('planning_activiteiten(dossier_id, dossiers(id, dossiernummer, titel))')
    .eq('medewerker_id', medewerker.id)
    .gte('start_dt', `${datum}T00:00:00`)
    .lte('start_dt', `${datum}T23:59:59`)

  const gepland = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (items ?? []) as any[]) {
    const d = it.planning_activiteiten?.dossiers
    if (d?.id) gepland.set(d.id, `${d.dossiernummer} · ${d.titel}`)
  }

  const { data: opdrachten } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel')
    .eq('hoofdstatus', 'opdracht')
    .eq('gearchiveerd', false)
    .not('bouw7_id', 'is', null)
    .order('dossiernummer', { ascending: false })
    .limit(200)

  const rest = ((opdrachten ?? []) as Array<{ id: string; dossiernummer: string; titel: string }>)
    .filter(d => !gepland.has(d.id))
    .map(d => ({ id: d.id, label: `${d.dossiernummer} · ${d.titel}`, uitPlanning: false }))

  return [
    ...[...gepland].map(([id, label]) => ({ id, label, uitPlanning: true })),
    ...rest,
  ]
}

/* ── Muteren ──────────────────────────────────────────────────────── */

export type RegelInvoer = {
  datum: string
  uren: number
  uursoort_id: string
  dossier_id?: string | null
  bewakingscode?: string | null
  bouw7_psl_id?: number | null
  opmerking?: string | null
}

/**
 * Valideert een regel tegen de categorie van zijn uursoort en levert de rij op die opgeslagen
 * mag worden. Werk-uren eisen een dossier én een bewakingscode; alle andere categorieën landen op
 * het indirecte-uren-dossier, want Bouw7 wil op élke urenregel een project.
 */
async function bouwRegel(medewerkerId: string, invoer: RegelInvoer) {
  const supabase = db()
  if (!(invoer.uren > 0) || invoer.uren > 24) throw new Error('Vul een aantal uren tussen 0 en 24 in.')

  const { data: soort } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, uren_categorie')
    .eq('id', invoer.uursoort_id)
    .maybeSingle()
  if (!soort) throw new Error('Onbekende uursoort.')
  if (!soort.uren_categorie) {
    throw new Error(`"${soort.naam}" is nog niet ingedeeld en kan daarom niet geboekt worden.`)
  }

  const categorie = soort.uren_categorie as UrenCategorie
  if (categorie === 'werk') {
    if (!invoer.dossier_id) throw new Error('Kies een project voor deze uren.')
    if (!invoer.bewakingscode) throw new Error('Kies een bewakingscode voor deze uren.')
    return {
      medewerker_id: medewerkerId,
      datum: invoer.datum,
      uren: invoer.uren,
      uursoort_id: invoer.uursoort_id,
      dossier_id: invoer.dossier_id,
      bewakingscode: invoer.bewakingscode,
      bouw7_psl_id: invoer.bouw7_psl_id ?? null,
      opmerking: invoer.opmerking?.trim() || null,
    }
  }

  const { data: mw } = await supabase
    .from('medewerkers').select('werkmaatschappij_id').eq('id', medewerkerId).maybeSingle()
  const indirect = await getIndirectDossierId(mw?.werkmaatschappij_id ?? null)
  if (!indirect) {
    throw new Error(
      'Er is nog geen dossier voor indirecte uren ingesteld. Vraag de beheerder dit te doen in Instellingen → Urenverantwoording.',
    )
  }
  return {
    medewerker_id: medewerkerId,
    datum: invoer.datum,
    uren: invoer.uren,
    uursoort_id: invoer.uursoort_id,
    dossier_id: indirect,
    bewakingscode: null,
    bouw7_psl_id: null,
    opmerking: invoer.opmerking?.trim() || null,
  }
}

export async function voegRegelToe(
  weekId: string, invoer: RegelInvoer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { medewerker, week, supabase } = await eigenWeek(weekId)
    if (!bewerkbaar(week.status)) return { ok: false, error: 'Deze week is al ingediend.' }

    const rij = await bouwRegel(medewerker.id, invoer)
    const { error } = await supabase.from('uren_regels').insert({ ...rij, week_id: weekId, bron: 'eva' })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/m/uren')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Toevoegen mislukt.' }
  }
}

export async function wijzigRegel(
  regelId: string, invoer: RegelInvoer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const medewerker = await vereisSessie()
    const supabase = db()
    const { data: bestaand } = await supabase
      .from('uren_regels')
      .select('id, week_id, medewerker_id, bron, uren_weken(status)')
      .eq('id', regelId)
      .maybeSingle()
    if (!bestaand) return { ok: false, error: 'Regel niet gevonden.' }
    if (bestaand.medewerker_id !== medewerker.id) return { ok: false, error: 'Dit is niet jouw regel.' }
    if (!bewerkbaar(bestaand.uren_weken?.status)) return { ok: false, error: 'Deze week is al ingediend.' }

    const rij = await bouwRegel(medewerker.id, invoer)
    // Wijkt de medewerker af van wat uit Bouw7 kwam, dan blijft dat zichtbaar voor de goedkeurder.
    const afgeweken = bestaand.bron !== 'eva'
    const { error } = await supabase.from('uren_regels')
      .update({ ...rij, afgeweken_van_bron: afgeweken })
      .eq('id', regelId)
    if (error) return { ok: false, error: error.message }

    revalidatePath('/m/uren')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Wijzigen mislukt.' }
  }
}

export async function verwijderRegel(
  regelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: bestaand } = await supabase
    .from('uren_regels')
    .select('id, medewerker_id, uren_weken(status)')
    .eq('id', regelId)
    .maybeSingle()
  if (!bestaand) return { ok: false, error: 'Regel niet gevonden.' }
  if (bestaand.medewerker_id !== medewerker.id) return { ok: false, error: 'Dit is niet jouw regel.' }
  if (!bewerkbaar(bestaand.uren_weken?.status)) return { ok: false, error: 'Deze week is al ingediend.' }

  const { error } = await supabase.from('uren_regels').delete().eq('id', regelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/m/uren')
  return { ok: true }
}

/* ── Onkosten ─────────────────────────────────────────────────────── */

export async function voegOnkostenToe(weekId: string, invoer: {
  datum: string
  soort: 'parkeren' | 'reiskosten' | 'overig'
  bedrag: number
  km?: number | null
  omschrijving?: string | null
  dossier_id?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medewerker, week, supabase } = await eigenWeek(weekId)
  if (!bewerkbaar(week.status)) return { ok: false, error: 'Deze week is al ingediend.' }
  if (!(invoer.bedrag >= 0)) return { ok: false, error: 'Vul een geldig bedrag in.' }

  const { error } = await supabase.from('uren_onkosten').insert({
    week_id: weekId,
    medewerker_id: medewerker.id,
    datum: invoer.datum,
    soort: invoer.soort,
    bedrag: invoer.bedrag,
    km: invoer.km ?? null,
    omschrijving: invoer.omschrijving?.trim() || null,
    dossier_id: invoer.dossier_id ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/m/uren')
  return { ok: true }
}

export async function verwijderOnkosten(
  onkostenId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: rij } = await supabase
    .from('uren_onkosten')
    .select('id, medewerker_id, uren_weken(status)')
    .eq('id', onkostenId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Regel niet gevonden.' }
  if (rij.medewerker_id !== medewerker.id) return { ok: false, error: 'Dit is niet jouw regel.' }
  if (!bewerkbaar(rij.uren_weken?.status)) return { ok: false, error: 'Deze week is al ingediend.' }

  const { error } = await supabase.from('uren_onkosten').delete().eq('id', onkostenId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/m/uren')
  return { ok: true }
}

/* ── Indienen ─────────────────────────────────────────────────────── */

/**
 * Dient de week in. Herberekent de totalen server-side: de knop in de browser is een hint, de
 * controle hoort hier — een verouderd scherm mag geen halve week doorlaten.
 *
 * Het bepalen van de goedkeurder en het aanmaken van zijn taak gebeurt in lib/uren/goedkeuring.ts;
 * dat is fase 3.
 */
export async function dienWeekIn(
  weekId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medewerker, week, supabase } = await eigenWeek(weekId)
  if (!bewerkbaar(week.status)) return { ok: false, error: 'Deze week is al ingediend.' }

  const contracturen = Number(week.contracturen ?? 0)
  if (contracturen <= 0) {
    return { ok: false, error: 'Er staan geen contracturen voor je ingesteld. Vraag de planning om je rooster in te vullen.' }
  }

  const [{ data: regels }, inst] = await Promise.all([
    supabase
      .from('uren_regels')
      .select('uren, dossier_id, bewakingscode, planning_uursoorten(uren_categorie)')
      .eq('week_id', weekId),
    getUrenInstellingen(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rij = (regels ?? []) as any[]
  if (!rij.length) return { ok: false, error: 'Je hebt nog geen uren ingevuld.' }

  const totaal = rondUren(rij.reduce((s, r) => s + Number(r.uren), 0))
  if (totaal < contracturen - inst.tolerantie_uren) {
    const tekort = rondUren(contracturen - inst.tolerantie_uren - totaal)
    return { ok: false, error: `Nog ${tekort.toLocaleString('nl-NL')} uur te verantwoorden.` }
  }

  // Werk-uren zonder bewakingscode zouden in Bouw7 op de ongecodeerde hoop belanden.
  const ongecodeerd = rij.filter(
    r => r.planning_uursoorten?.uren_categorie === 'werk' && (!r.dossier_id || !r.bewakingscode),
  ).length
  if (ongecodeerd > 0) {
    return {
      ok: false,
      error: ongecodeerd === 1
        ? '1 regel mist nog een project of bewakingscode.'
        : `${ongecodeerd} regels missen nog een project of bewakingscode.`,
    }
  }

  // De route wordt hier bevroren. Zet iemand de bedrijfsinstelling later om, dan blijft deze week
  // op zijn eigen spoor -- anders zou een week die op de teamleider wacht ineens op een
  // Bouw7-vlag gaan wachten die nooit komt, of andersom.
  const modus = await bepaalModus(medewerker.id)

  // Alleen in de EVA-route is er een teamleider nodig. Ontbreekt die, dan zou de week nergens heen
  // kunnen; dat moet de medewerker weten in plaats van dat zijn week stilletjes blijft hangen.
  let teamleiderId: string | null = null
  if (modus === 'eva') {
    teamleiderId = await bepaalTeamleider(medewerker.id)
    if (!teamleiderId) {
      return {
        ok: false,
        error: 'Er is niemand die je week kan goedkeuren. Vraag de beheerder om een teamleider of terugvalgoedkeurder in te stellen.',
      }
    }
  }

  const { error } = await supabase.from('uren_weken').update({
    status: 'ingediend',
    ingediend_op: new Date().toISOString(),
    ingediend_door: medewerker.id,
    tl_goedkeurder_id: teamleiderId,
    goedkeuring_modus: modus,
    afkeur_reden: null,
  }).eq('id', weekId)
  if (error) return { ok: false, error: error.message }

  // In de Bouw7-route wordt daar geaccordeerd, dus moeten de uren er meteen heen -- met
  // approved = false. In de EVA-route gebeurt dat pas als de hele keten rond is.
  if (modus === 'bouw7') {
    try {
      const { stuurUrenWeekNaarBouw7 } = await import('./bouw7')
      await stuurUrenWeekNaarBouw7(weekId)
    } catch (e) {
      console.error('[uren] versturen naar Bouw7 bij indienen mislukt:', e)
    }
  }

  revalidatePath('/m/uren')
  return { ok: true }
}
