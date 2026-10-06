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
import { getAppVertaler, getAppLocale } from '@/i18n/server'
import { getContracturen, getVoorgevuldeRegels, isoWeek, weekStartVan, weekDagen, datumSleutel } from './rooster'
import { getUrenInstellingen, getUrenBestemming, getIndirecteDossierIds } from './instellingen'
import { berekenWeekTotalen, indienBlokkade, rondUren, type UrenCategorie } from './rekenregel'
import { bepaalModus, bepaalTeamleider } from './goedkeuring'
import { eigenWeek, bewerkbaar, type WeekStatus } from './week-guard'
import type { OnkostenSoort, Vervoermiddel } from './onkosten'
import { signBonnen } from './bonnen'
import { BOEKBAAR_FILTER } from './boekbaar'
import { getBewakingscodesVoorUurlog } from '@/lib/dossiers/actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

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
  /** Staat op een indirecte-urenproject (overhead). Kantoor ziet zo of een regel op een echt project staat. */
  indirect: boolean
}

export type WeekOnkosten = {
  id: string
  datum: string
  soort: OnkostenSoort
  /** Alleen bij reiskosten; auto en bromfiets rekenen per kilometer, OV vraagt een kaartje. */
  vervoermiddel: Vervoermiddel | null
  bedrag: number
  km: number | null
  omschrijving: string | null
  /** Verse signed URL van het bonnetje; de bucket is prive, zie ./bonnen. */
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
  /** De kilometervergoedingen, zodat de sheet het bedrag alvast kan laten zien. */
  kmTarieven: { auto: number; bromfiets: number }
  /** Kantoorafdeling: kiest nooit een project, gewerkte uren landen vanzelf op overhead. */
  kantoor: boolean
  /** Extern (ZZP): alleen gewerkte uren, geen norm en geen tijd-voor-tijdsaldo. */
  extern: boolean
}

/* ── Interne helpers ──────────────────────────────────────────────── */

async function isExtern(medewerkerId: string): Promise<boolean> {
  const { data } = await db().from('medewerkers').select('extern').eq('id', medewerkerId).maybeSingle()
  return !!data?.extern
}

/**
 * De norm van een week: de contracturen uit het rooster, of 0 voor een extern. Een ZZP'er
 * verantwoordt geen contract -- hij boekt wat hij gewerkt heeft, en vult geen gat met verlof.
 */
async function normVoor(medewerkerId: string, weekStart: string): Promise<number> {
  if (await isExtern(medewerkerId)) return 0
  return (await getContracturen(medewerkerId, weekStart)).uren
}

/* ── Opbouw ───────────────────────────────────────────────────────── */

/**
 * Trekt de bevroren norm bij zolang de week nog van de medewerker zelf is.
 *
 * De norm is bewust een momentopname op de weekrij: zodra een week is ingediend hangt het
 * tijd-voor-tijdsaldo eraan, en mag een latere roosterwijziging die niet met terugwerkende kracht
 * verschuiven. Maar zolang de week concept (of afgekeurd) is, hoort hij het rooster gewoon te
 * volgen. Zonder dit bleef een week die werd geopend vóórdat het rooster bestond op nul staan --
 * en daarmee onindienbaar, met de melding "Er staan geen contracturen voor je ingesteld" terwijl
 * het rooster er allang was.
 */
async function actualiseerNorm(
  medewerkerId: string,
  weekStart: string,
  week: { id: string; status: WeekStatus; contracturen: number | string | null },
) {
  if (!bewerkbaar(week.status)) return
  const uren = await normVoor(medewerkerId, weekStart)
  if (rondUren(uren) === rondUren(Number(week.contracturen ?? 0))) return
  await db().from('uren_weken').update({ contracturen: uren }).eq('id', week.id)
}

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
    .select('id, status, contracturen')
    .eq('medewerker_id', medewerkerId)
    .eq('jaar', jaar)
    .eq('week_nr', week)
    .maybeSingle()
  if (bestaand) {
    await actualiseerNorm(medewerkerId, weekStart, bestaand)
    return bestaand.id as string
  }

  const uren = await normVoor(medewerkerId, weekStart)
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
  // Externen boeken geen verlof of feestdagen: die worden hun niet uitbetaald.
  if (await isExtern(medewerkerId)) return
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

  const indirectDossier = (await getUrenBestemming(medewerkerId)).nietGewerktDossierId

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

  const [{ data: week }, { data: regels }, { data: onkosten }, { data: saldoRij }, inst, indirecteDossiers, bestemming] = await Promise.all([
    supabase.from('uren_weken').select('*').eq('id', weekId).single(),
    supabase
      .from('uren_regels')
      .select('*, planning_uursoorten(naam, uren_categorie), dossiers(dossiernummer, titel)')
      .eq('week_id', weekId)
      .order('datum'),
    supabase.from('uren_onkosten').select('*').eq('week_id', weekId).order('datum'),
    supabase.from('uren_saldo_per_medewerker').select('saldo_uren').eq('medewerker_id', medewerker.id).maybeSingle(),
    getUrenInstellingen(),
    getIndirecteDossierIds(),
    getUrenBestemming(medewerker.id),
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
    indirect: !!r.dossier_id && indirecteDossiers.has(r.dossier_id),
  }))

  const contracturen = Number(week.contracturen ?? 0)
  const berekend = berekenWeekTotalen(nette, contracturen, inst.tolerantie_uren)
  // Een extern bouwt geen saldo op (zie de view uren_week_saldo).
  const totalen = bestemming.extern ? { ...berekend, saldoMutatie: 0 } : berekend
  const status = week.status as WeekStatus
  const ongecodeerd = nette.filter(r => r.categorie === 'werk' && (
    !r.dossier_id || (!r.bewakingscode && !indirecteDossiers.has(r.dossier_id))
  )).length
  const blokkade = indienBlokkade(totalen, contracturen, ongecodeerd, bestemming.extern)
    ? await blokkadeTekst(totalen, contracturen, ongecodeerd, bestemming.extern)
    : null

  // Eén batch-call voor alle bonnen van de week; de bucket is privé, dus elke render een verse link.
  const bonLinks = await signBonnen((onkosten ?? []).map((o: Record<string, unknown>) => o.bon_pad as string))

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
      soort: o.soort as OnkostenSoort,
      vervoermiddel: (o.vervoermiddel as Vervoermiddel) ?? null,
      bedrag: Number(o.bedrag),
      km: o.km == null ? null : Number(o.km),
      omschrijving: (o.omschrijving as string) ?? null,
      bon_url: bonLinks.get(o.bon_pad as string) ?? null,
    })),
    kmTarieven: { auto: inst.km_vergoeding_auto, bromfiets: inst.km_vergoeding_bromfiets },
    kantoor: bestemming.kantoor,
    extern: bestemming.extern,
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
    supabase.from('medewerkers').select('standaard_uursoort_id, extern').eq('id', medewerker.id).maybeSingle(),
  ])

  const lijst: UursoortOptie[] = (soorten ?? []).map((s: Record<string, unknown>) => ({
    id: s.id as string,
    naam: s.naam as string,
    categorie: s.uren_categorie as UrenCategorie,
  }))
    // Een extern boekt alleen wat hij gewerkt heeft: verlof en tijd voor tijd bestaan voor hem niet.
    .filter((o: UursoortOptie) => !mw?.extern || o.categorie === 'werk')

  // Volgorde die de monteur het minste tikwerk kost: zijn eigen soort eerst, dan de rest van het
  // werk, dan tijd voor tijd, dan afwezigheid. Feestdagen worden voorgevuld en horen onderaan.
  const rang = (o: UursoortOptie) =>
    o.id === mw?.standaard_uursoort_id ? 0
    : o.categorie === 'werk' ? 1
    : o.categorie === 'tijd_voor_tijd' ? 2
    : o.categorie === 'afwezig' ? 3 : 4
  return lijst.sort((a, b) => rang(a) - rang(b) || a.naam.localeCompare(b.naam))
}

/** Een dossier in de projectkeuze van de weekstaat. */
export type DossierOptie = {
  id: string
  label: string
  /** Een indirecte-urendossier (overhead); altijd kiesbaar, zonder bewakingscode. */
  indirect: boolean
  servicedesk: boolean
  /** Ingepland op precies de dag die geboekt wordt. */
  vandaag: boolean
}

/**
 * Hoe ver de planning meetelt: twee weken terug en twee weken vooruit, gerekend vanaf de dag die
 * geboekt wordt. Wie de uren van vorige week nog invult, krijgt zo de projecten van toen te zien.
 */
const PLANNING_VENSTER_DAGEN = 14

/**
 * Dossiers om uit te kiezen bij werk-uren: alleen de lopende opdrachten waarop deze medewerker in
 * het venster staat ingepland.
 *
 * De indirecte-urenprojecten staan er niet bij: dat is administratie, geen keuze. Niet-gewerkte
 * uren en de uren van kantoor landen er vanzelf op (`getUrenBestemming`). Alleen een bestaande
 * regel die al op zo'n project staat (`behoudId`) blijft zichtbaar, anders maakt bewerken hem leeg.
 *
 * Eerder stonden hier álle lopende opdrachten (honderden), met de eigen projecten bovenaan. De
 * monteur moest dan alsnog door een lange lijst; in de praktijk boekt hij vrijwel alleen op waar
 * hij ingepland staat (in een steekproef van 60 dagen: elke regel die niet op een ingepland
 * dossier stond, stond op een indirecte-urendossier). Rolhouderschap telt bewust niet meer mee.
 *
 * Een planitem telt als het het venster overlapt, dus een meerdaags item dat vóór het venster
 * begint en erin doorloopt hoort er ook bij. Waarop hij díé dag staat komt bovenaan.
 */
export async function getDossierOpties(datum: string, behoudId?: string | null): Promise<DossierOptie[]> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const verschoven = (dagen: number) => {
    const d = new Date(`${datum}T12:00:00`)
    d.setDate(d.getDate() + dagen)
    return datumSleutel(d)
  }
  const van = verschoven(-PLANNING_VENSTER_DAGEN)
  const tot = verschoven(PLANNING_VENSTER_DAGEN)

  // Eén medewerker over vier weken: ruim onder de 1000 rijen.
  const { data: items } = await supabase
    .from('planning_items')
    .select('start_dt, eind_dt, planning_activiteiten(dossier_id)')
    .eq('medewerker_id', medewerker.id)
    .lte('start_dt', `${tot}T23:59:59`)
    .or(`eind_dt.gte.${van}T00:00:00,and(eind_dt.is.null,start_dt.gte.${van}T00:00:00)`)
    .order('start_dt')
    .limit(1000)

  // Ingepland op deze dag = het planitem overlapt de dag. De momenten uit de database worden
  // eerst teruggerekend naar de Nederlandse kalenderdag -- op Vercel draait Node in UTC, en dan
  // schuift een planitem van 's ochtends een dag op.
  const kalenderdag = (dt: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date(dt))

  const ingepland = new Set<string>()
  const vandaagGepland = new Set<string>()
  // Kantoor staat zelden in de planning; wie daar toch op een project werkt, werkt bijna altijd
  // op een dossier waar hij een rol heeft. Voor kantoor tellen die dus wél mee (zie `rolDossierIds`).
  if ((await getUrenBestemming(medewerker.id)).kantoor) {
    for (const id of await rolDossierIds(medewerker.id)) ingepland.add(id)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of (items ?? []) as any[]) {
    const dossierId = it.planning_activiteiten?.dossier_id
    if (!dossierId) continue
    ingepland.add(dossierId)
    const start = kalenderdag(it.start_dt)
    const eind = it.eind_dt ? kalenderdag(it.eind_dt) : start
    if (start <= datum && eind >= datum) vandaagGepland.add(dossierId)
  }

  // Ingepland zijn op een afgerond of nog niet voorbereid project maakt het geen plek om uren op
  // te schrijven: dezelfde inperking tot lopende opdrachten en open bonnen als overal (./boekbaar).
  const idLijst = [...ingepland]
  const { data: mijne } = idLijst.length
    ? await supabase
        .from('dossiers')
        .select('id, dossiernummer, titel, servicedesk_substatus')
        .or(BOEKBAAR_FILTER)
        .eq('gearchiveerd', false)
        .not('bouw7_id', 'is', null)
        .in('id', idLijst)
        .order('dossiernummer', { ascending: false })
    : { data: [] }

  const indirecteIds = await getIndirecteDossierIds()
  const { data: behouden } = behoudId && indirecteIds.has(behoudId)
    ? await supabase.from('dossiers').select('id, dossiernummer, titel').eq('id', behoudId)
    : { data: [] }

  type Rij = { id: string; dossiernummer: string; titel: string; servicedesk_substatus?: string | null }
  const label = (d: Rij) => `${d.dossiernummer} · ${d.titel}`

  const eigen = ((mijne ?? []) as Rij[])
    .filter(d => !indirecteIds.has(d.id))
    .map(d => ({
      id: d.id, label: label(d), indirect: false,
      servicedesk: !!d.servicedesk_substatus, vandaag: vandaagGepland.has(d.id),
    }))
    // Waar hij deze dag staat ingepland bovenaan; de rest op dossiernummer aflopend.
    .sort((a, b) => Number(b.vandaag) - Number(a.vandaag))

  const overhead = ((behouden ?? []) as Rij[])
    .map(d => ({ id: d.id, label: label(d), indirect: true, servicedesk: false, vandaag: false }))

  return [...eigen, ...overhead]
}

/**
 * Dossiers waarop deze medewerker een rol heeft. Alleen voor kantoor: een monteur kiest uit waar
 * hij is ingepland, rolhouderschap telt bij hem bewust niet. De boekbaar-inperking volgt daarna
 * in `getDossierOpties`. Begrensd door de rolfilter: de drukste rolhouder had er in okt 2026
 * 419 niet-gearchiveerde.
 */
async function rolDossierIds(medewerkerId: string): Promise<string[]> {
  const rollen = ['project_manager_id', 'teamleider_id', 'werkvoorbereider_id', 'uitvoerder_id', 'calculator_id']
  const { data } = await db()
    .from('dossiers')
    .select('id')
    .or(rollen.map(k => `${k}.eq.${medewerkerId}`).join(','))
    .eq('gearchiveerd', false)
    .order('id')
    .limit(1000)
  return ((data ?? []) as Array<{ id: string }>).map(d => d.id)
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
 * mag worden. Werk-uren eisen een dossier én een bewakingscode; alle andere categorieën -- en het
 * werk van kantoor -- landen op een indirecte-urenproject, want Bouw7 wil op élke urenregel een
 * project.
 */
/**
 * Een servicedeskbon waar (nog) geen enkele bewakingscode op staat. Elke bon krijgt de eigen code
 * RW01, maar de sync maakt die met 25 tegelijk aan; tot dan is er niets te kiezen. Dan mogen de
 * uren zonder code door -- de goedkeurder hercodeert ze op RW01 zodra die er is. Liever dat dan
 * een monteur die zijn werk van vandaag niet kwijt kan.
 */
async function isBonZonderCodes(dossierId: string): Promise<boolean> {
  const { data } = await db().from('dossiers').select('servicedesk_substatus').eq('id', dossierId).maybeSingle()
  if (!data?.servicedesk_substatus) return false
  return (await getBewakingscodesVoorUurlog(dossierId)).length === 0
}

/**
 * Dezelfde reden als `indienBlokkade`, maar in de taal van de app: de weekstaat wordt alleen
 * in EVA Mobiel getoond. De volgorde van de toetsen volgt `indienBlokkade` één op één.
 */
async function blokkadeTekst(
  totalen: { totaalUren: number; tekort: number },
  contracturen: number,
  ongecodeerd: number,
  zonderNorm = false,
): Promise<string> {
  const t = await getAppVertaler('uren')
  if (contracturen <= 0 && !zonderNorm) return t('fout.geenContracturen')
  if (totalen.totaalUren <= 0) return t('fout.nogGeenUren')
  if (totalen.tekort > 0) return t('fout.tekort', { uren: totalen.tekort.toLocaleString(await getAppLocale()) })
  return t('fout.ongecodeerd', { aantal: ongecodeerd })
}

async function bouwRegel(medewerkerId: string, invoer: RegelInvoer) {
  const supabase = db()
  // De meldingen hieronder komen via `e.message` bij de monteur: in de taal van de app.
  const t = await getAppVertaler('uren')
  if (!(invoer.uren > 0) || invoer.uren > 24) throw new Error(t('fout.urenTussen'))

  const { data: soort } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, uren_categorie')
    .eq('id', invoer.uursoort_id)
    .maybeSingle()
  if (!soort) throw new Error(t('fout.onbekendeUursoort'))
  if (!soort.uren_categorie) {
    throw new Error(t('fout.uursoortNietIngedeeld', { naam: soort.naam }))
  }

  const categorie = soort.uren_categorie as UrenCategorie
  const bestemming = await getUrenBestemming(medewerkerId)
  // Kantoor kiest standaard geen project: zijn gewerkte uren zijn overhead en gaan naar het
  // gewerkte overheadproject. Zet hij in het boekscherm "Op een project" aan, dan komt er een
  // dossier mee en volgt de regel dezelfde route als die van een vakman -- met bewakingscode.
  if (categorie !== 'werk' && bestemming.extern) throw new Error(t('fout.externAlleenGewerkt'))
  if (categorie === 'werk' && (!bestemming.kantoor || invoer.dossier_id)) {
    if (!invoer.dossier_id) throw new Error(t('fout.kiesProject'))
    // Op een indirecte-urendossier staat geen begroting en dus geen code om uit te kiezen; daar
    // is de code niet verplicht. Zie `getIndirecteDossierIds`.
    const indirect = (await getIndirecteDossierIds()).has(invoer.dossier_id)
    if (!indirect && !invoer.bewakingscode && !(await isBonZonderCodes(invoer.dossier_id))) {
      throw new Error(t('fout.kiesBewakingscode'))
    }
    return {
      medewerker_id: medewerkerId,
      datum: invoer.datum,
      uren: invoer.uren,
      uursoort_id: invoer.uursoort_id,
      dossier_id: invoer.dossier_id,
      bewakingscode: invoer.bewakingscode ?? null,
      bouw7_psl_id: invoer.bouw7_psl_id ?? null,
      opmerking: invoer.opmerking?.trim() || null,
    }
  }

  if (!bestemming.werkmaatschappijId && !bestemming.extern) throw new Error(t('fout.geenWerkmaatschappij'))
  const indirect = categorie === 'werk' ? bestemming.gewerktDossierId : bestemming.nietGewerktDossierId
  if (!indirect) throw new Error(t('fout.geenIndirectDossier'))
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
  const t = await getAppVertaler('uren')
  try {
    const { medewerker, week, supabase } = await eigenWeek(weekId)
    if (!bewerkbaar(week.status)) return { ok: false, error: t('fout.weekAlIngediend') }

    const rij = await bouwRegel(medewerker.id, invoer)
    const { error } = await supabase.from('uren_regels').insert({ ...rij, week_id: weekId, bron: 'eva' })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/m/uren')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t('fout.toevoegenMislukt') }
  }
}

export async function wijzigRegel(
  regelId: string, invoer: RegelInvoer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getAppVertaler('uren')
  try {
    const medewerker = await vereisSessie()
    const supabase = db()
    const { data: bestaand } = await supabase
      .from('uren_regels')
      .select('id, week_id, medewerker_id, bron, uren_weken(status)')
      .eq('id', regelId)
      .maybeSingle()
    if (!bestaand) return { ok: false, error: t('fout.regelNietGevonden') }
    if (bestaand.medewerker_id !== medewerker.id) return { ok: false, error: t('fout.nietJouwRegel') }
    if (!bewerkbaar(bestaand.uren_weken?.status)) return { ok: false, error: t('fout.weekAlIngediend') }

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
    return { ok: false, error: e instanceof Error ? e.message : t('fout.wijzigenMislukt') }
  }
}

export async function verwijderRegel(
  regelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getAppVertaler('uren')
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: bestaand } = await supabase
    .from('uren_regels')
    .select('id, medewerker_id, uren_weken(status)')
    .eq('id', regelId)
    .maybeSingle()
  if (!bestaand) return { ok: false, error: t('fout.regelNietGevonden') }
  if (bestaand.medewerker_id !== medewerker.id) return { ok: false, error: t('fout.nietJouwRegel') }
  if (!bewerkbaar(bestaand.uren_weken?.status)) return { ok: false, error: t('fout.weekAlIngediend') }

  const { error } = await supabase.from('uren_regels').delete().eq('id', regelId)
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
  const t = await getAppVertaler('uren')
  const { medewerker, week, supabase } = await eigenWeek(weekId)
  if (!bewerkbaar(week.status)) return { ok: false, error: t('fout.weekAlIngediend') }

  const contracturen = Number(week.contracturen ?? 0)
  if (contracturen <= 0 && !(await isExtern(medewerker.id))) {
    return { ok: false, error: t('fout.geenContracturen') }
  }

  const [{ data: regels }, inst, indirecteDossiers] = await Promise.all([
    supabase
      .from('uren_regels')
      .select('uren, dossier_id, bewakingscode, planning_uursoorten(uren_categorie)')
      .eq('week_id', weekId),
    getUrenInstellingen(),
    getIndirecteDossierIds(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rij = (regels ?? []) as any[]
  if (!rij.length) return { ok: false, error: t('fout.nogGeenUren') }

  const totaal = rondUren(rij.reduce((s, r) => s + Number(r.uren), 0))
  if (totaal < contracturen - inst.tolerantie_uren) {
    const tekort = rondUren(contracturen - inst.tolerantie_uren - totaal)
    return { ok: false, error: t('fout.tekort', { uren: tekort.toLocaleString(await getAppLocale()) }) }
  }

  // Werk-uren zonder bewakingscode zouden in Bouw7 op de ongecodeerde hoop belanden. Behalve op
  // een indirecte-urendossier (daar is niets te bewaken) en op een servicedeskbon die nog geen
  // enkele code heeft (zie `isBonZonderCodes`).
  const zonderCode = rij.filter(
    r => r.planning_uursoorten?.uren_categorie === 'werk'
      && (!r.dossier_id || (!r.bewakingscode && !indirecteDossiers.has(r.dossier_id))),
  )
  const bonnenZonderCodes = new Set<string>()
  for (const id of new Set(zonderCode.map(r => r.dossier_id).filter(Boolean) as string[])) {
    if (await isBonZonderCodes(id)) bonnenZonderCodes.add(id)
  }
  const ongecodeerd = zonderCode.filter(r => !r.dossier_id || !bonnenZonderCodes.has(r.dossier_id)).length
  if (ongecodeerd > 0) {
    return {
      ok: false,
      error: t('fout.ongecodeerd', { aantal: ongecodeerd }),
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
        error: t('fout.geenGoedkeurder'),
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
