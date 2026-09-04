'use server'

// Verlof aanvragen en goedkeuren.
//
// De keten: de medewerker vraagt aan -> zijn goedkeurder (dezelfde als bij de weekstaat: de
// teamleider, anders de terugvalgoedkeurder) keurt goed -> er ontstaat een rij in
// `medewerker_afwezigheid`, waardoor de planning en de werkvoorraad meteen kloppen -> en het
// verlof gaat als day-off naar Bouw7. Daarna vult de weekstaat die dagen vanzelf voor.
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
import { getRooster, isoWeekdag, datumSleutel } from './rooster'
import { bepaalTeamleider } from './goedkeuring'

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
  urenTotaal: number
  toelichting: string | null
  status: VerlofStatus
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
  urenTotaal?: number | null
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
  const uren = invoer.heleDagen ? berekend.uren : (invoer.urenTotaal ?? 0)
  if (!(uren > 0)) {
    return {
      ok: false,
      error: berekend.dagen === 0
        ? 'In deze periode vallen geen roosterdagen — er is dan geen verlof op te nemen.'
        : 'Vul het aantal uren in.',
    }
  }

  const goedkeurder = await bepaalTeamleider(medewerker.id)
  if (!goedkeurder) {
    return {
      ok: false,
      error: 'Er is niemand die je aanvraag kan goedkeuren. Vraag de beheerder om een teamleider of terugvalgoedkeurder in te stellen.',
    }
  }

  const { data, error } = await supabase.from('verlof_aanvragen').insert({
    medewerker_id: medewerker.id,
    uursoort_id: invoer.uursoortId,
    start_datum: invoer.startDatum,
    eind_datum: invoer.eindDatum,
    hele_dagen: invoer.heleDagen,
    start_tijd: invoer.heleDagen ? null : (invoer.startTijd ?? null),
    eind_tijd: invoer.heleDagen ? null : (invoer.eindTijd ?? null),
    uren_totaal: uren,
    toelichting: invoer.toelichting?.trim() || null,
    goedkeurder_id: goedkeurder,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }

  await meld(goedkeurder, 'Verlofaanvraag',
    `${medewerker.voornaam ?? 'Een collega'} vraagt ${uren.toLocaleString('nl-NL')} uur ${soort.naam.toLowerCase()} aan.`,
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

export async function getTeBeoordelenVerlof(): Promise<VerlofAanvraag[]> {
  const medewerker = await vereisSessie()
  return leesAanvragen({ goedkeurderId: medewerker.id, alleenOpen: true })
}

async function leesAanvragen(filter: {
  medewerkerId?: string; goedkeurderId?: string; alleenOpen?: boolean
}): Promise<VerlofAanvraag[]> {
  const supabase = db()
  let q = supabase
    .from('verlof_aanvragen')
    .select('id, uursoort_id, start_datum, eind_datum, hele_dagen, uren_totaal, toelichting, status, afwijzing_reden, bouw7_status, created_at, planning_uursoorten(naam), medewerkers!verlof_aanvragen_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam)')
    .order('start_datum', { ascending: false })
    .limit(100)

  if (filter.medewerkerId) q = q.eq('medewerker_id', filter.medewerkerId)
  if (filter.goedkeurderId) q = q.eq('goedkeurder_id', filter.goedkeurderId)
  if (filter.alleenOpen) q = q.eq('status', 'aangevraagd')

  const { data } = await q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(a => ({
    id: a.id,
    medewerkerNaam: [a.medewerkers?.voornaam, a.medewerkers?.tussenvoegsel, a.medewerkers?.achternaam]
      .filter(Boolean).join(' '),
    uursoortId: a.uursoort_id,
    uursoortNaam: a.planning_uursoorten?.naam ?? '—',
    startDatum: a.start_datum,
    eindDatum: a.eind_datum,
    heleDagen: a.hele_dagen,
    urenTotaal: Number(a.uren_totaal),
    toelichting: a.toelichting,
    status: a.status as VerlofStatus,
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
  if (a.goedkeurder_id !== medewerker.id) {
    return { ok: false, error: 'Je bent niet de goedkeurder van deze aanvraag.' }
  }
  if (a.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag is al beoordeeld.' }

  // De afwezigheidsrij eerst: die voedt de planning en de werkvoorraad, en moet er staan ook als
  // Bouw7 straks hapert.
  const { data: afwezigheid } = await supabase.from('medewerker_afwezigheid').insert({
    medewerker_id: a.medewerker_id,
    type: /ziek/i.test(a.planning_uursoorten?.naam ?? '') ? 'ziek' : 'verlof',
    start_datum: a.start_datum,
    eind_datum: a.eind_datum,
    opmerking: a.toelichting ?? a.planning_uursoorten?.naam ?? null,
    bron: 'eva',
  }).select('id').single()

  await supabase.from('verlof_aanvragen').update({
    status: 'goedgekeurd',
    beoordeeld_op: new Date().toISOString(),
    beoordeeld_door: medewerker.id,
    afwezigheid_id: afwezigheid?.id ?? null,
  }).eq('id', aanvraagId)

  const bouw7 = await schrijfVerlofNaarBouw7(aanvraagId)

  if (a.medewerkers?.auth_user_id) {
    await maakNotificatie({
      user_id: a.medewerkers.auth_user_id,
      type: 'verlof',
      titel: 'Verlof goedgekeurd',
      body: `Je ${(a.planning_uursoorten?.naam ?? 'verlof').toLowerCase()} van ${a.start_datum} tot en met ${a.eind_datum} is goedgekeurd.`,
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
    .select('id, goedkeurder_id, status, start_datum, eind_datum, medewerkers!verlof_aanvragen_medewerker_id_fkey(auth_user_id)')
    .eq('id', aanvraagId)
    .maybeSingle()
  if (!a) return { ok: false, error: 'Aanvraag niet gevonden.' }
  if (a.goedkeurder_id !== medewerker.id) {
    return { ok: false, error: 'Je bent niet de goedkeurder van deze aanvraag.' }
  }
  if (a.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag is al beoordeeld.' }

  const { error } = await supabase.from('verlof_aanvragen').update({
    status: 'afgewezen',
    afwijzing_reden: reden.trim(),
    beoordeeld_op: new Date().toISOString(),
    beoordeeld_door: medewerker.id,
  }).eq('id', aanvraagId)
  if (error) return { ok: false, error: error.message }

  if (a.medewerkers?.auth_user_id) {
    await maakNotificatie({
      user_id: a.medewerkers.auth_user_id,
      type: 'verlof',
      titel: 'Verlofaanvraag afgewezen',
      body: reden.trim(),
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
    .select('id, start_datum, eind_datum, hele_dagen, uren_totaal, toelichting, bouw7_day_off_id, planning_uursoorten(naam), medewerkers!verlof_aanvragen_medewerker_id_fkey(bouw7_id)')
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
    const res = await client.post<{ id?: number }>('/organization/day-off-per-employee', {
      ...(a.bouw7_day_off_id ? { id: Number(a.bouw7_day_off_id) } : {}),
      employee: { id: employeeId },
      startDate: a.start_datum,
      endDate: a.eind_datum,
      isAllDay: a.hele_dagen,
      hours: String(a.uren_totaal),
      remark: a.toelichting || a.planning_uursoorten?.naam || 'Verlof via EVA',
    })
    await supabase.from('verlof_aanvragen').update({
      bouw7_day_off_id: res?.id != null ? String(res.id) : a.bouw7_day_off_id,
      bouw7_status: 'verzonden',
      bouw7_fout: null,
    }).eq('id', aanvraagId)
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

async function meld(medewerkerId: string, titel: string, body: string, url: string) {
  try {
    const { data } = await db()
      .from('medewerkers').select('auth_user_id').eq('id', medewerkerId).maybeSingle()
    if (!data?.auth_user_id) return
    await maakNotificatie({ user_id: data.auth_user_id, type: 'verlof', titel, body, url })
  } catch {
    /* melding is bijzaak */
  }
}
