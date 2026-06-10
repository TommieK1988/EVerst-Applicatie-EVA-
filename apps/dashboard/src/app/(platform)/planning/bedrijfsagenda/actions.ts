'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  getYear, parseISO,
  addDays, addWeeks, addMonths, addYears,
  startOfWeek, endOfMonth, differenceInDays, format, getISODay, getDay,
} from 'date-fns'
import type {
  BedrijfsagendaItem,
  BedrijfsagendaItemMetDoelgroep,
  BedrijfsagendaVirtueel,
  BedrijfsagendaRegel,
} from '@everts/database/platform-types'
import { berekenFeestdagen } from '@/lib/agenda/feestdagen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

// ─── Validatie ────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  type: z.enum(['vca_toolbox', 'audit', 'teamoverleg', 'activiteit', 'herinnering', 'atv_dag', 'overig']),
  titel: z.string().min(1).max(200),
  omschrijving: z.string().nullable().optional(),
  start_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eind_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_tijd: z.string().nullable().optional(),
  eind_tijd: z.string().nullable().optional(),
  hele_dag: z.boolean(),
  locatie: z.string().nullable().optional(),
  kleur: z.string().nullable().optional(),
  herhaling: z.enum(['geen', 'dagelijks', 'wekelijks', 'maandelijks', 'jaarlijks']).default('geen'),
  herhaling_einde: z.string().nullable().optional(),
  herhaling_interval: z.number().int().min(1).max(99).default(1),
  herhaling_weekdagen: z.array(z.number().int().min(1).max(7)).nullable().optional(),
  herhaling_aantal: z.number().int().min(1).nullable().optional(),
  herhaling_maand_type: z.enum(['dag', 'weekdag']).default('dag'),
  herhaling_maand_weekordinal: z.number().int().nullable().optional(),
  in_planning: z.boolean().default(false),
  in_agenda: z.boolean().default(false),
  stuur_herinnering: z.boolean().default(false),
  herinnering_dagen: z.number().int().min(1).default(1),
  doelgroep_afdelingen: z.array(z.string()).default([]),
  doelgroep_medewerkers: z.array(z.string().uuid()).default([]),
})

// ─── Doelgroep helpers ────────────────────────────────────────────────────────

async function upsertDoelgroep(id: string, afdelingen: string[], medewerkers: string[]) {
  await Promise.all([
    db().from('bedrijfsagenda_doelgroep_afdelingen').delete().eq('agenda_item_id', id),
    db().from('bedrijfsagenda_doelgroep_medewerkers').delete().eq('agenda_item_id', id),
  ])
  const inserts: Promise<unknown>[] = []
  if (afdelingen.length) {
    inserts.push(
      db().from('bedrijfsagenda_doelgroep_afdelingen').insert(
        afdelingen.map(naam => ({ agenda_item_id: id, afdeling_naam: naam }))
      )
    )
  }
  if (medewerkers.length) {
    inserts.push(
      db().from('bedrijfsagenda_doelgroep_medewerkers').insert(
        medewerkers.map(mid => ({ agenda_item_id: id, medewerker_id: mid }))
      )
    )
  }
  await Promise.all(inserts)
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function maakAgendaItem(
  input: z.infer<typeof itemSchema>,
): Promise<{ ok: true; data: BedrijfsagendaItem } | { ok: false; error: string }> {
  const parsed = itemSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const { doelgroep_afdelingen, doelgroep_medewerkers, ...itemData } = parsed.data

  const { data, error } = await db()
    .from('bedrijfsagenda_items')
    .insert(itemData)
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  await upsertDoelgroep(data.id, doelgroep_afdelingen, doelgroep_medewerkers)

  revalidatePath('/planning/bedrijfsagenda')
  return { ok: true, data }
}

export async function updateAgendaItem(
  id: string,
  input: Partial<z.infer<typeof itemSchema>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { doelgroep_afdelingen, doelgroep_medewerkers, ...itemData } = input

  const { error } = await db()
    .from('bedrijfsagenda_items')
    .update(itemData)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  if (doelgroep_afdelingen !== undefined || doelgroep_medewerkers !== undefined) {
    await upsertDoelgroep(id, doelgroep_afdelingen ?? [], doelgroep_medewerkers ?? [])
  }

  revalidatePath('/planning/bedrijfsagenda')
  revalidatePath('/planning/medewerker')
  return { ok: true }
}

export async function verwijderAgendaItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('bedrijfsagenda_items')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning/bedrijfsagenda')
  revalidatePath('/planning/medewerker')
  return { ok: true }
}

export async function verwijderEnkelOccurrence(
  seriesId: string,
  datum: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error: fetchError } = await db()
    .from('bedrijfsagenda_items')
    .select('herhaling_uitzonderingen')
    .eq('id', seriesId)
    .single()

  if (fetchError) return { ok: false, error: fetchError.message }

  const huidig: string[] = data?.herhaling_uitzonderingen ?? []
  if (huidig.includes(datum)) return { ok: true }

  const { error } = await db()
    .from('bedrijfsagenda_items')
    .update({ herhaling_uitzonderingen: [...huidig, datum] })
    .eq('id', seriesId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning/bedrijfsagenda')
  revalidatePath('/planning/medewerker')
  return { ok: true }
}

export async function bewerkEnkelOccurrence(
  seriesId: string,
  occurrenceDatum: string,
  input: z.infer<typeof itemSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uitRes = await verwijderEnkelOccurrence(seriesId, occurrenceDatum)
  if (!uitRes.ok) return uitRes

  return maakAgendaItem({
    ...input,
    herhaling:               'geen',
    herhaling_einde:         null,
    herhaling_interval:      1,
    herhaling_weekdagen:     null,
    herhaling_aantal:        null,
    herhaling_maand_type:    'dag',
    herhaling_maand_weekordinal: null,
  })
}

export async function haalAgendaItems(): Promise<BedrijfsagendaItemMetDoelgroep[]> {
  const [itemsRes, afdRes, medRes] = await Promise.all([
    db().from('bedrijfsagenda_items').select('*').order('start_datum', { ascending: true }),
    db().from('bedrijfsagenda_doelgroep_afdelingen').select('agenda_item_id, afdeling_naam'),
    db().from('bedrijfsagenda_doelgroep_medewerkers').select('agenda_item_id, medewerker_id'),
  ])

  const items: BedrijfsagendaItem[] = itemsRes.data ?? []
  const afdMap = new Map<string, string[]>()
  const medMap = new Map<string, string[]>()

  for (const row of afdRes.data ?? []) {
    const list = afdMap.get(row.agenda_item_id) ?? []
    list.push(row.afdeling_naam)
    afdMap.set(row.agenda_item_id, list)
  }
  for (const row of medRes.data ?? []) {
    const list = medMap.get(row.agenda_item_id) ?? []
    list.push(row.medewerker_id)
    medMap.set(row.agenda_item_id, list)
  }

  return items.map(item => ({
    ...item,
    doelgroep_afdelingen:  afdMap.get(item.id) ?? [],
    doelgroep_medewerkers: medMap.get(item.id) ?? [],
  }))
}

export async function haalPlanningItems(): Promise<BedrijfsagendaItemMetDoelgroep[]> {
  const all = await haalAgendaItems()
  return all.filter(i => i.in_planning)
}

// ─── Herhaling uitvouwen ──────────────────────────────────────────────────────

/** Berekent de N-de weekdag (weekdag=1-7 ISO) van een gegeven maand.
 *  n = -1 geeft de laatste. */
function ndeWeekdagVanMaand(jaar: number, maand: number, weekdag: number, n: number): Date {
  if (n === -1) {
    // zoek achteruit vanuit het einde van de maand
    const einde = endOfMonth(new Date(jaar, maand - 1, 1))
    let d = einde
    while (getISODay(d) !== weekdag) {
      d = addDays(d, -1)
    }
    return d
  }
  // eerste voorkomen zoeken
  const eerste = new Date(jaar, maand - 1, 1)
  let d = eerste
  while (getISODay(d) !== weekdag) {
    d = addDays(d, 1)
  }
  return addWeeks(d, n - 1)
}

function expandRecurringItem(
  item: BedrijfsagendaItemMetDoelgroep,
  windowStart: string,
  windowEnd: string,
): (BedrijfsagendaItemMetDoelgroep & { series_id: string })[] {
  if (item.herhaling === 'geen') return []

  const duur       = differenceInDays(parseISO(item.eind_datum), parseISO(item.start_datum))
  const origStart  = parseISO(item.start_datum)
  const winEndDate = parseISO(windowEnd)
  const interval   = Math.max(1, item.herhaling_interval ?? 1)
  const eindDate   = item.herhaling_einde ? parseISO(item.herhaling_einde) : null
  const maxCount   = item.herhaling_aantal ?? 500

  const results: (BedrijfsagendaItemMetDoelgroep & { series_id: string })[] = []
  let count = 0

  function addOcc(startDate: Date) {
    if (count >= maxCount) return
    if (eindDate && startDate > eindDate) return
    if (startDate > winEndDate) return

    const startStr = format(startDate, 'yyyy-MM-dd')
    const endStr   = format(addDays(startDate, duur), 'yyyy-MM-dd')

    count++
    if (startStr === item.start_datum) return
    if (item.herhaling_uitzonderingen?.includes(startStr)) return

    if (startStr <= windowEnd && endStr >= windowStart) {
      results.push({
        ...item,
        id:          `${item.id}-${startStr}`,
        start_datum: startStr,
        eind_datum:  endStr,
        series_id:   item.id,
      })
    }
  }

  if (item.herhaling === 'wekelijks') {
    const weekdagen =
      item.herhaling_weekdagen && item.herhaling_weekdagen.length > 0
        ? [...item.herhaling_weekdagen].sort((a, b) => a - b)
        : [getISODay(origStart)]

    let weekBegin = startOfWeek(origStart, { weekStartsOn: 1 })

    while (count < maxCount) {
      if (weekBegin > winEndDate) break
      if (eindDate && weekBegin > eindDate) break

      for (const wd of weekdagen) {
        const d = addDays(weekBegin, wd - 1)
        if (d >= origStart) addOcc(d)
        if (count >= maxCount) break
      }

      weekBegin = addWeeks(weekBegin, interval)
    }
  } else if (item.herhaling === 'maandelijks') {
    count++ // origineel telt als 1e voorkomen
    const weekdag  = getISODay(origStart)
    const ordinal  = item.herhaling_maand_weekordinal ?? Math.ceil(origStart.getDate() / 7)

    let cur = addMonths(origStart, interval)

    while (count < maxCount) {
      if (eindDate && cur > eindDate) break
      if (cur > winEndDate) break

      const d = item.herhaling_maand_type === 'weekdag'
        ? ndeWeekdagVanMaand(cur.getFullYear(), cur.getMonth() + 1, weekdag, ordinal)
        : cur

      addOcc(d)
      cur = addMonths(cur, interval)
    }
  } else {
    count++
    let cur: Date
    switch (item.herhaling) {
      case 'dagelijks':  cur = addDays(origStart, interval);   break
      case 'jaarlijks':  cur = addYears(origStart, interval);  break
      default: return results
    }

    while (count < maxCount) {
      if (eindDate && cur > eindDate) break
      if (cur > winEndDate) break
      addOcc(cur)
      switch (item.herhaling) {
        case 'dagelijks':  cur = addDays(cur, interval);   break
        case 'jaarlijks':  cur = addYears(cur, interval);  break
      }
    }
  }

  return results
}

// ─── Auto-gegenereerde items (verjaardagen, jubilea) ──────────────────────────

function datumInJaar(dateStr: string, jaar: number): string | null {
  const mmdd = dateStr.slice(5)
  if (mmdd === '02-29') {
    const isSchrikkeljaar = jaar % 4 === 0 && (jaar % 100 !== 0 || jaar % 400 === 0)
    return `${jaar}-${isSchrikkeljaar ? '02-29' : '02-28'}`
  }
  return `${jaar}-${mmdd}`
}

export async function haalVirtuelItems(jaar: number): Promise<BedrijfsagendaVirtueel[]> {
  const { data: medewerkers } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, geboortedatum, in_dienst_vanaf')
    .eq('actief', true)

  const items: BedrijfsagendaVirtueel[] = []
  const jaarStart = `${jaar}-01-01`
  const jaarEinde = `${jaar}-12-31`

  for (const m of medewerkers ?? []) {
    const naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')

    if (m.geboortedatum) {
      const datum = datumInJaar(m.geboortedatum, jaar)
      if (datum && datum >= jaarStart && datum <= jaarEinde) {
        const leeftijd = jaar - getYear(parseISO(m.geboortedatum))
        items.push({
          id:            `verjaardag-${m.id}-${jaar}`,
          type:          'verjaardag',
          titel:         `Verjaardag ${naam} (${leeftijd})`,
          start_datum:   datum,
          eind_datum:    datum,
          hele_dag:      true,
          in_planning:   false,
          kleur:         '#f59e0b',
          medewerker_id: m.id,
        })
      }
    }

    if (m.in_dienst_vanaf) {
      const datum = datumInJaar(m.in_dienst_vanaf, jaar)
      if (datum && datum >= jaarStart && datum <= jaarEinde) {
        const jaren = jaar - getYear(parseISO(m.in_dienst_vanaf))
        if (jaren > 0) {
          items.push({
            id:            `jubileum-${m.id}-${jaar}`,
            type:          'jubileum',
            titel:         `Jubileum ${naam} (${jaren} jaar in dienst)`,
            start_datum:   datum,
            eind_datum:    datum,
            hele_dag:      true,
            in_planning:   false,
            kleur:         '#8b5cf6',
            medewerker_id: m.id,
          })
        }
      }
    }
  }

  const feestdagen = berekenFeestdagen(jaar)
  return [...items, ...feestdagen].sort((a, b) => a.start_datum.localeCompare(b.start_datum))
}

export async function haalAlleRegels(jaar: number): Promise<BedrijfsagendaRegel[]> {
  const windowStart = `${jaar}-01-01`
  const windowEnd   = `${jaar}-12-31`

  const [handmatig, virtueel] = await Promise.all([
    haalAgendaItems(),
    haalVirtuelItems(jaar),
  ])

  const handmatigUitgevouwen: (BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig'; series_id?: string })[] = []
  for (const item of handmatig) {
    const origUitgesloten = item.herhaling_uitzonderingen?.includes(item.start_datum)
    if (!origUitgesloten && item.start_datum <= windowEnd && item.eind_datum >= windowStart) {
      handmatigUitgevouwen.push({ ...item, bron: 'handmatig' })
    }
    if (item.herhaling !== 'geen') {
      const extra = expandRecurringItem(item, windowStart, windowEnd)
      for (const occ of extra) {
        handmatigUitgevouwen.push({ ...occ, bron: 'handmatig' })
      }
    }
  }

  return [
    ...handmatigUitgevouwen,
    ...virtueel.map(i => ({ ...i, bron: 'berekend' as const })),
  ].sort((a, b) => a.start_datum.localeCompare(b.start_datum))
}

export async function haalPlanningItemsMetExpansie(jaar: number): Promise<BedrijfsagendaItemMetDoelgroep[]> {
  const windowStart = `${jaar}-01-01`
  const windowEnd   = `${jaar}-12-31`

  const handmatig = await haalPlanningItems()
  const uitgevouwen: BedrijfsagendaItemMetDoelgroep[] = []

  for (const item of handmatig) {
    uitgevouwen.push(item)
    if (item.herhaling !== 'geen') {
      const extra = expandRecurringItem(item, windowStart, windowEnd)
      for (const occ of extra) {
        uitgevouwen.push(occ)
      }
    }
  }

  return uitgevouwen.sort((a, b) => a.start_datum.localeCompare(b.start_datum))
}
