'use server'

// Verlof aanvragen en goedkeuren.
//
// De keten: de medewerker vraagt aan -> iemand van de beoordelende AFDELING (standaard Uitvoering
// -> Projectbureau, al het overige -> Directie; instelbaar op Instellingen > Uren) keurt goed ->
// er ontstaat een rij in `medewerker_afwezigheid`, waardoor de planning en de werkvoorraad meteen
// kloppen -> en het verlof gaat als day-off naar Bouw7. Daarna vult de weekstaat die dagen vanzelf
// voor.
//
// WAAROM EEN AFDELING EN NIET EEN PERSOON. Het ging eerst naar een aangewezen goedkeurder; was die
// op vakantie, dan lag elke aanvraag stil en kon niemand anders erbij. De afdeling wordt bij
// aanvraag bevroren op de rij (`beoordelende_afdeling`): zowel de instelling als iemands afdeling
// kan later wijzigen, en een lopende aanvraag hoort niet stilletjes van groep te wisselen.
//
// WAAROM OOK IN `medewerker_afwezigheid`. Die tabel wordt al gelezen door de planning, de
// werkvoorraad en de wagenpark-controles. Alleen een `verlof_aanvragen`-rij wegschrijven zou
// betekenen dat goedgekeurd verlof nergens in EVA zichtbaar is tot de Bouw7-sync het uren later
// terugleest -- de planner ziet dan een beschikbare monteur die er niet is.
//
// De Bouw7-schrijfactie is FAIL-SOFT. Hij mag de goedkeuring niet tegenhouden: het verlof is dan
// in EVA geregeld en de aanvraag blijft op bouw7_status 'fout' staan om opnieuw aan te bieden.
// Andersom zou een hapering bij Bouw7 betekenen dat een medewerker zijn vakantie niet krijgt.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { getRooster, isoWeekdag, datumSleutel, minutenVanTijd } from './rooster'
import { getUrenInstellingen } from './instellingen'
import {
  bepaalBeoordelendeAfdeling, haalPoolLeden, magVerlofBeoordelen,
  STANDAARD_BEOORDELENDE_AFDELING, type PoolLid,
} from './verlof-pool'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type VerlofStatus = 'aangevraagd' | 'goedgekeurd' | 'afgewezen' | 'ingetrokken'

export type VerlofAanvraag = {
  id: string
  medewerkerNaam: string
  uursoortId: string
  uursoortNaam: string
  startDatum: string
  eindDatum: string
  heleDagen: boolean
  /** Alleen gevuld bij een deel van de dag; 'HH:MM'. */
  startTijd: string | null
  eindTijd: string | null
  urenTotaal: number
  toelichting: string | null
  status: VerlofStatus
  beoordelaarNaam: string | null
  afwijzingReden: string | null
  bouw7Status: string
  aangevraagdOp: string
}

/**
 * Hoeveel verlofuren een periode kost volgens het rooster: alleen roosterdagen tellen, en
 * feestdagen vallen eruit — daar hoef je geen vakantiedag voor op te nemen.
 */
export async function berekenVerlofUren(
  medewerkerId: string, startDatum: string, eindDatum: string,
): Promise<{ uren: number; dagen: number; overgeslagen: string[] }> {
  const rooster = await getRooster(medewerkerId, startDatum)
  if (!rooster || !rooster.werkdagen.length) return { uren: 0, dagen: 0, overgeslagen: [] }

  const perDag = rooster.contracturen_per_week / rooster.werkdagen.length
  const supabase = db()
  const { data: vrij } = await supabase
    .from('bouw7_vrije_dagen')
    .select('start_datum, eind_datum, naam')
    .lte('start_datum', eindDatum)
    .gte('eind_datum', startDatum)

  const isFeestdag = (d: string) =>
    ((vrij ?? []) as Array<{ start_datum: string; eind_datum: string }>)
      .some(v => d >= v.start_datum && d <= v.eind_datum)

  let dagen = 0
  const overgeslagen: string[] = []
  const cursor = new Date(`${startDatum}T12:00:00`)
  const eind = new Date(`${eindDatum}T12:00:00`)
  // Ruime bovengrens tegen een tikfout in de einddatum; een jaar verlof achter elkaar bestaat niet.
  for (let i = 0; cursor <= eind && i < 400; i++) {
    const d = datumSleutel(cursor)
    if (rooster.werkdagen.includes(isoWeekdag(d))) {
      if (isFeestdag(d)) overgeslagen.push(d)
      else dagen++
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return { uren: Math.round(dagen * perDag * 100) / 100, dagen, overgeslagen }
}

/** Hetzelfde rekenwerk voor de ingelogde medewerker zelf — wat de weekstaat-UI aanroept. */
export async function berekenMijnVerlofUren(
  startDatum: string, eindDatum: string,
): Promise<{ uren: number; dagen: number; overgeslagen: string[] }> {
  const medewerker = await vereisSessie()
  if (!startDatum || !eindDatum || eindDatum < startDatum) {
    return { uren: 0, dagen: 0, overgeslagen: [] }
  }
  return berekenVerlofUren(medewerker.id, startDatum, eindDatum)
}

/* ── Aanvragen ────────────────────────────────────────────────────── */

export async function vraagVerlofAan(invoer: {
  uursoortId: string
  startDatum: string
  eindDatum: string
  heleDagen: boolean
  startTijd?: string | null
  eindTijd?: string | null
  toelichting?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  if (invoer.eindDatum < invoer.startDatum) {
    return { ok: false, error: 'De einddatum ligt vóór de startdatum.' }
  }

  const { data: soort } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, uren_categorie')
    .eq('id', invoer.uursoortId)
    .maybeSingle()
  if (!soort) return { ok: false, error: 'Onbekende verlofsoort.' }
  if (soort.uren_categorie !== 'afwezig') {
    return { ok: false, error: `"${soort.naam}" is geen verlofsoort.` }
  }

  // Dubbele aanvragen over dezelfde dagen voorkomen: twee keer vakantie op één dag zou dubbel
  // van het saldo af gaan en de planner twee keer hetzelfde laten zien.
  const { data: overlap } = await supabase
    .from('verlof_aanvragen')
    .select('id, start_datum, eind_datum')
    .eq('medewerker_id', medewerker.id)
    .in('status', ['aangevraagd', 'goedgekeurd'])
    .lte('start_datum', invoer.eindDatum)
    .gte('eind_datum', invoer.startDatum)
    .limit(1)
  if (overlap?.length) {
    return { ok: false, error: 'Je hebt voor (een deel van) deze periode al verlof aangevraagd.' }
  }

  const berekend = await berekenVerlofUren(medewerker.id, invoer.startDatum, invoer.eindDatum)
  if (berekend.dagen === 0) {
    return {
      ok: false,
      error: invoer.heleDagen
        ? 'In deze periode vallen geen roosterdagen — er is dan geen verlof op te nemen.'
        : 'Op deze dag werk je volgens je rooster niet — er is dan geen verlof op te nemen.',
    }
  }

  // Een deel van een dag is per definitie één dag: met een venster over meerdere dagen is niet te
  // zeggen of iemand elke dag die uren vrij is of alleen de eerste, en Bouw7 kan dat ook niet
  // vastleggen. Wie langer weg is, vraagt hele dagen aan.
  let startTijd: string | null = null
  let eindTijd: string | null = null
  let uren = berekend.uren
  if (!invoer.heleDagen) {
    if (invoer.eindDatum !== invoer.startDatum) {
      return { ok: false, error: 'Verlof voor een deel van de dag kan maar voor één dag tegelijk.' }
    }
    startTijd = normaliseerTijd(invoer.startTijd)
    eindTijd = normaliseerTijd(invoer.eindTijd)
    if (!startTijd || !eindTijd) return { ok: false, error: 'Vul een begin- en een eindtijd in.' }
    const minuten = minutenVanTijd(eindTijd) - minutenVanTijd(startTijd)
    if (minuten <= 0) return { ok: false, error: 'De eindtijd moet ná de begintijd liggen.' }
    // Nooit meer dan een hele roosterdag: anders kost 07:00-19:00 meer verlof dan de dag waard is.
    uren = Math.min(berekend.uren, Math.round((minuten / 60) * 100) / 100)
  }
  if (!(uren > 0)) return { ok: false, error: 'Vul het aantal uren in.' }

  // De pool bepalen vóór de insert: we bevriezen alleen een afdeling waar ook echt iemand in zit.
  const inst = await getUrenInstellingen()
  let afdeling: string | null = bepaalBeoordelendeAfdeling(medewerker.afdeling, inst.verlof_routes)
  let pool = await haalPoolLeden(afdeling)
  if (!pool.length && afdeling !== STANDAARD_BEOORDELENDE_AFDELING) {
    afdeling = STANDAARD_BEOORDELENDE_AFDELING
    pool = await haalPoolLeden(afdeling)
  }
  // Laatste redmiddel als geen enkele afdeling bemenst is: de terugvalgoedkeurder als persoon.
  const terugval = pool.length ? null : (inst.terugval_goedkeurder_id ?? null)
  if (!pool.length) {
    afdeling = null
    if (!terugval) {
      return {
        ok: false,
        error: 'Er is niemand die je aanvraag kan goedkeuren. Vraag de beheerder om de beoordelende afdeling of een terugvalgoedkeurder in te stellen.',
      }
    }
  }

  const { data, error } = await supabase.from('verlof_aanvragen').insert({
    medewerker_id: medewerker.id,
    uursoort_id: invoer.uursoortId,
    start_datum: invoer.startDatum,
    eind_datum: invoer.eindDatum,
    hele_dagen: invoer.heleDagen,
    start_tijd: startTijd,
    eind_tijd: eindTijd,
    uren_totaal: uren,
    toelichting: invoer.toelichting?.trim() || null,
    beoordelende_afdeling: afdeling,
    goedkeurder_id: terugval,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }

  const ontvangers = pool.length ? pool : await poolLidVan(terugval)
  const wanneer = startTijd && eindTijd
    ? `${periodeTekst(invoer.startDatum, invoer.eindDatum)} ${startTijd}-${eindTijd}`
    : periodeTekst(invoer.startDatum, invoer.eindDatum)
  await meldAllen(ontvangers, 'Verlofaanvraag',
    `${medewerker.voornaam ?? 'Een collega'} vraagt ${uren.toLocaleString('nl-NL')} uur ${soort.naam.toLowerCase()} aan (${wanneer}).`,
    '/planning/medewerker')

  revalidatePath('/m/verlof')
  return { ok: true, id: data.id }
}

/** Een eigen aanvraag intrekken. Kan zolang hij nog niet beoordeeld is. */
export async function trekVerlofIn(
  aanvraagId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: a } = await supabase
    .from('verlof_aanvragen').select('id, medewerker_id, status').eq('id', aanvraagId).maybeSingle()
  if (!a) return { ok: false, error: 'Aanvraag niet gevonden.' }
  if (a.medewerker_id !== medewerker.id) return { ok: false, error: 'Dit is niet jouw aanvraag.' }
  if (a.status !== 'aangevraagd') {
    return { ok: false, error: 'Deze aanvraag is al beoordeeld en kun je niet meer intrekken.' }
  }

  const { error } = await supabase
    .from('verlof_aanvragen').update({ status: 'ingetrokken' }).eq('id', aanvraagId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/m/verlof')
  return { ok: true }
}

/* ── Lezen ────────────────────────────────────────────────────────── */

export async function getMijnVerlof(): Promise<VerlofAanvraag[]> {
  const medewerker = await vereisSessie()
  return leesAanvragen({ medewerkerId: medewerker.id })
}

/** De open aanvragen die de ingelogde medewerker mag beoordelen: die van zijn afdeling. */
export async function getTeBeoordelenVerlof(): Promise<VerlofAanvraag[]> {
  const medewerker = await vereisSessie()
  return leesAanvragen({
    poolAfdeling: medewerker.afdeling ?? null, kijkerId: medewerker.id, alleenOpen: true,
  })
}

/**
 * Alleen het aantal open aanvragen voor de kijker — de knop op de Medewerkerplanning heeft niet
 * meer nodig dan dat, en zo staat hij bij de eerste weergave al goed zonder de hele lijst te laden.
 */
export async function getVerlofBeoordeelStand(): Promise<{ aantal: number }> {
  const medewerker = await vereisSessie()
  const q = db().from('verlof_aanvragen')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aangevraagd')
  const { count } = await poolFilter(q, medewerker.afdeling ?? null, medewerker.id)
  return { aantal: count ?? 0 }
}

/**
 * Beperkt een query tot wat deze kijker mag beoordelen: alles van zijn eigen afdeling, plus de
 * aanvragen waar hij persoonlijk als goedkeurder op staat (de uitzonderingsroute).
 * `.ilike` zonder % = exact maar hoofdletterongevoelig; `afdeling` is een vrij tekstveld.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poolFilter(q: any, afdeling: string | null, kijkerId: string): any {
  const naam = (afdeling ?? '').trim()
  return naam
    ? q.or(`beoordelende_afdeling.ilike.${naam},goedkeurder_id.eq.${kijkerId}`)
    : q.eq('goedkeurder_id', kijkerId)
}

async function leesAanvragen(filter: {
  medewerkerId?: string; poolAfdeling?: string | null; kijkerId?: string; alleenOpen?: boolean
}): Promise<VerlofAanvraag[]> {
  const supabase = db()
  let q = supabase
    .from('verlof_aanvragen')
    .select('id, uursoort_id, start_datum, eind_datum, hele_dagen, start_tijd, eind_tijd, uren_totaal, toelichting, status, afwijzing_reden, bouw7_status, created_at, planning_uursoorten(naam), aanvrager:medewerkers!verlof_aanvragen_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam), beoordelaar:medewerkers!verlof_aanvragen_beoordeeld_door_fkey(voornaam, tussenvoegsel, achternaam)')
    .order('start_datum', { ascending: false })
    .limit(100)

  if (filter.medewerkerId) q = q.eq('medewerker_id', filter.medewerkerId)
  if (filter.alleenOpen) q = q.eq('status', 'aangevraagd')
  if (filter.kijkerId) q = poolFilter(q, filter.poolAfdeling ?? null, filter.kijkerId)

  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(a => ({
    id: a.id,
    medewerkerNaam: naamVan(a.aanvrager),
    uursoortId: a.uursoort_id,
    uursoortNaam: a.planning_uursoorten?.naam ?? '—',
    startDatum: a.start_datum,
    eindDatum: a.eind_datum,
    heleDagen: a.hele_dagen,
    // Postgres geeft een `time` terug als '13:00:00'; de UI en de invoervelden willen 'HH:MM'.
    startTijd: a.start_tijd ? String(a.start_tijd).slice(0, 5) : null,
    eindTijd: a.eind_tijd ? String(a.eind_tijd).slice(0, 5) : null,
    urenTotaal: Number(a.uren_totaal),
    toelichting: a.toelichting,
    status: a.status as VerlofStatus,
    beoordelaarNaam: naamVan(a.beoordelaar) || null,
    afwijzingReden: a.afwijzing_reden,
    bouw7Status: a.bouw7_status,
    aangevraagdOp: a.created_at,
  }))
}

/** De verlofsoorten waaruit gekozen kan worden (alle 'afwezig'-uursoorten uit Bouw7). */
export async function getVerlofSoorten(): Promise<Array<{ id: string; naam: string }>> {
  await vereisSessie()
  const { data } = await db()
    .from('planning_uursoorten')
    .select('id, naam')
    .eq('uren_categorie', 'afwezig')
    .eq('actief', true)
    .order('naam')
  return (data ?? []) as Array<{ id: string; naam: string }>
}

/* ── Beoordelen ───────────────────────────────────────────────────── */

export async function keurVerlofGoed(
  aanvraagId: string,
): Promise<{ ok: true; bouw7: boolean } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: a } = await supabase
    .from('verlof_aanvragen')
    .select('*, planning_uursoorten(naam), medewerkers!verlof_aanvragen_medewerker_id_fkey(bouw7_id, auth_user_id)')
    .eq('id', aanvraagId)
    .maybeSingle()
  if (!a) return { ok: false, error: 'Aanvraag niet gevonden.' }
  if (!magVerlofBeoordelen(medewerker, a)) {
    return { ok: false, error: 'Je mag deze verlofaanvraag niet beoordelen.' }
  }
  if (a.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag is al beoordeeld.' }

  // Eerst de status claimen, en alleen als hij nog op 'aangevraagd' staat. Een hele afdeling kan
  // meekijken, dus twee collega's kunnen tegelijk op Goedkeuren drukken; zonder deze voorwaarde
  // levert dat twee afwezigheidsrijen en twee day-offs in Bouw7 op.
  const { data: geclaimd } = await supabase.from('verlof_aanvragen').update({
    status: 'goedgekeurd',
    beoordeeld_op: new Date().toISOString(),
    beoordeeld_door: medewerker.id,
  }).eq('id', aanvraagId).eq('status', 'aangevraagd').select('id')
  if (!geclaimd?.length) {
    return { ok: false, error: 'Een collega heeft deze aanvraag net beoordeeld.' }
  }

  // Dan pas de afwezigheidsrij: die voedt de planning en de werkvoorraad, en moet er staan ook als
  // Bouw7 straks hapert.
  const { data: afwezigheid } = await supabase.from('medewerker_afwezigheid').insert({
    medewerker_id: a.medewerker_id,
    type: /ziek/i.test(a.planning_uursoorten?.naam ?? '') ? 'ziek' : 'verlof',
    start_datum: a.start_datum,
    eind_datum: a.eind_datum,
    // Het venster moet mee: de planning laat de monteur dan de rest van de dag beschikbaar zien,
    // en de weekstaat vult alleen die uren voor in plaats van een hele dag.
    start_tijd: a.hele_dagen ? null : a.start_tijd,
    eind_tijd: a.hele_dagen ? null : a.eind_tijd,
    opmerking: a.toelichting ?? a.planning_uursoorten?.naam ?? null,
    bron: 'eva',
  }).select('id').single()

  await supabase.from('verlof_aanvragen')
    .update({ afwezigheid_id: afwezigheid?.id ?? null })
    .eq('id', aanvraagId)

  const bouw7 = await schrijfVerlofNaarBouw7(aanvraagId)

  if (a.medewerkers?.auth_user_id) {
    await maakNotificatie({
      user_id: a.medewerkers.auth_user_id,
      type: 'verlof',
      titel: 'Verlof goedgekeurd',
      // Met een hele afdeling als beoordelaar moet de aanvrager kunnen zien wie het was.
      body: `${naamVan(medewerker)} heeft je ${(a.planning_uursoorten?.naam ?? 'verlof').toLowerCase()} van ${periodeTekst(a.start_datum, a.eind_datum)} goedgekeurd.`,
      url: '/m/verlof',
    }).catch(() => { /* melding is bijzaak */ })
  }

  revalidatePath('/m/verlof')
  revalidatePath('/planning/medewerker')
  return { ok: true, bouw7 }
}

export async function wijsVerlofAf(
  aanvraagId: string, reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  if (!reden.trim()) return { ok: false, error: 'Geef aan waarom je de aanvraag afwijst.' }

  const { data: a } = await supabase
    .from('verlof_aanvragen')
    .select('id, goedkeurder_id, beoordelende_afdeling, status, start_datum, eind_datum, medewerkers!verlof_aanvragen_medewerker_id_fkey(auth_user_id)')
    .eq('id', aanvraagId)
    .maybeSingle()
  if (!a) return { ok: false, error: 'Aanvraag niet gevonden.' }
  if (!magVerlofBeoordelen(medewerker, a)) {
    return { ok: false, error: 'Je mag deze verlofaanvraag niet beoordelen.' }
  }
  if (a.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag is al beoordeeld.' }

  // Zelfde claim als bij goedkeuren: wie het eerst klikt, beoordeelt.
  const { data: geclaimd, error } = await supabase.from('verlof_aanvragen').update({
    status: 'afgewezen',
    afwijzing_reden: reden.trim(),
    beoordeeld_op: new Date().toISOString(),
    beoordeeld_door: medewerker.id,
  }).eq('id', aanvraagId).eq('status', 'aangevraagd').select('id')
  if (error) return { ok: false, error: error.message }
  if (!geclaimd?.length) {
    return { ok: false, error: 'Een collega heeft deze aanvraag net beoordeeld.' }
  }

  if (a.medewerkers?.auth_user_id) {
    await maakNotificatie({
      user_id: a.medewerkers.auth_user_id,
      type: 'verlof',
      titel: 'Verlofaanvraag afgewezen',
      body: `${naamVan(medewerker)} wees je aanvraag van ${periodeTekst(a.start_datum, a.eind_datum)} af: ${reden.trim()}`,
      url: '/m/verlof',
    }).catch(() => { /* melding is bijzaak */ })
  }

  revalidatePath('/m/verlof')
  revalidatePath('/planning/medewerker')
  return { ok: true }
}

/* ── Bouw7 ────────────────────────────────────────────────────────── */

/**
 * Schrijft goedgekeurd verlof als day-off naar Bouw7, zodat de planning daar ook klopt en de
 * bestaande lees-sync het herkent.
 *
 * Levert `false` op als het niet lukte; de aanvraag blijft dan op bouw7_status 'fout' staan en is
 * opnieuw aan te bieden. Bewust geen throw: het verlof is in EVA al geregeld en een storing bij
 * Bouw7 mag een goedgekeurde vakantie niet ongedaan maken.
 */
export async function schrijfVerlofNaarBouw7(aanvraagId: string): Promise<boolean> {
  const supabase = db()
  const { data: a } = await supabase
    .from('verlof_aanvragen')
    .select('id, start_datum, eind_datum, hele_dagen, start_tijd, eind_tijd, uren_totaal, toelichting, bouw7_day_off_id, afwezigheid_id, planning_uursoorten(naam), medewerkers!verlof_aanvragen_medewerker_id_fkey(bouw7_id)')
    .eq('id', aanvraagId)
    .maybeSingle()
  if (!a) return false

  const employeeId = Number(a.medewerkers?.bouw7_id)
  if (!employeeId) {
    await supabase.from('verlof_aanvragen').update({
      bouw7_status: 'fout',
      bouw7_fout: 'Deze medewerker is niet aan Bouw7 gekoppeld.',
    }).eq('id', aanvraagId)
    return false
  }

  try {
    const client = await getBouw7Client()
    // Bouw7 leest startDate/endDate als datum óf datetime. Bij een deel van de dag zetten we het
    // tijdvenster erin, zodat de kalender daar hetzelfde laat zien als EVA; bij hele dagen blijft
    // het een kale datum, precies zoals de lees-sync het terugleest.
    const metTijd = (datum: string, tijd: string | null) =>
      !a.hele_dagen && tijd ? `${datum}T${String(tijd).slice(0, 5)}:00` : datum
    const res = await client.post<{ id?: number }>('/organization/day-off-per-employee', {
      ...(a.bouw7_day_off_id ? { id: Number(a.bouw7_day_off_id) } : {}),
      employee: { id: employeeId },
      startDate: metTijd(a.start_datum, a.start_tijd),
      endDate: metTijd(a.eind_datum, a.eind_tijd),
      isAllDay: a.hele_dagen,
      hours: String(a.uren_totaal),
      remark: a.toelichting || a.planning_uursoorten?.naam || 'Verlof via EVA',
    })
    const dayOffId = res?.id != null ? String(res.id) : a.bouw7_day_off_id
    await supabase.from('verlof_aanvragen').update({
      bouw7_day_off_id: dayOffId,
      bouw7_status: 'verzonden',
      bouw7_fout: null,
    }).eq('id', aanvraagId)
    // Het Bouw7-id óók op de afwezigheidsrij: daaraan herkent `syncDaysOff` dat deze day-off
    // van EVA komt en slaat hem bij het importeren over. Zonder dit kwam hetzelfde verlof de
    // volgende ochtend als tweede rij (bron='bouw7') terug en telde het dubbel.
    if (dayOffId && a.afwezigheid_id) {
      await supabase.from('medewerker_afwezigheid')
        .update({ bouw7_id: dayOffId })
        .eq('id', a.afwezigheid_id)
        .eq('bron', 'eva')
    }
    return true
  } catch (e) {
    await supabase.from('verlof_aanvragen').update({
      bouw7_status: 'fout',
      bouw7_fout: e instanceof Error ? e.message : 'Versturen naar Bouw7 mislukt.',
    }).eq('id', aanvraagId)
    return false
  }
}

/* ── Intern ───────────────────────────────────────────────────────── */

/**
 * 'HH:MM' uit wat de browser stuurt. Een `<input type="time">` geeft 'HH:MM', maar een tijd die
 * uit de database komt heeft seconden ('13:00:00'); beide moeten hier hetzelfde uit komen.
 */
function normaliseerTijd(tijd: string | null | undefined): string | null {
  const t = (tijd ?? '').trim()
  return /^\d{2}:\d{2}(:\d{2})?$/.test(t) ? t.slice(0, 5) : null
}

/** "Jan de Vries" uit los voornaam/tussenvoegsel/achternaam; leeg als er niets is. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naamVan(m: any): string {
  return [m?.voornaam, m?.tussenvoegsel, m?.achternaam].filter(Boolean).join(' ')
}

/** "3 t/m 7 aug" — leesbaarder dan de kale datums in een melding. */
function periodeTekst(start: string, eind: string): string {
  const f = (d: string) => new Date(`${d}T12:00:00`)
    .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return start === eind ? f(start) : `${f(start)} t/m ${f(eind)}`
}

/** De hele beoordelende afdeling een melding geven; één per ontvanger, zoals bij het wagenpark. */
async function meldAllen(ontvangers: PoolLid[], titel: string, body: string, url: string) {
  for (const lid of ontvangers) {
    if (!lid.authUserId) continue
    await maakNotificatie({ user_id: lid.authUserId, type: 'verlof', titel, body, url })
      .catch(() => { /* melding is bijzaak */ })
  }
}

/** De terugvalgoedkeurder als eenmanspool, voor het geval geen enkele afdeling bemenst is. */
async function poolLidVan(medewerkerId: string | null): Promise<PoolLid[]> {
  if (!medewerkerId) return []
  const { data } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, auth_user_id')
    .eq('id', medewerkerId)
    .maybeSingle()
  return data?.auth_user_id
    ? [{ id: data.id, naam: naamVan(data), authUserId: data.auth_user_id }]
    : []
}
