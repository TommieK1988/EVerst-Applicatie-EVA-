import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { leesScan, zoektermen } from './qr'
import type { MaterieelObject } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Kolommen die de mobiele schermen nodig hebben — niet de hele rij. */
const KORT =
  'id, omschrijving, categorie, merk, type, serienummer, status, qr_code, inventarisnummer, ' +
  'hoofdfoto_path, toewijzing_niveau, toegewezen_medewerker_id, toegewezen_team_id, actief'

export type MaterieelKort = Pick<
  MaterieelObject,
  | 'id' | 'omschrijving' | 'categorie' | 'merk' | 'type' | 'serienummer' | 'status'
  | 'qr_code' | 'inventarisnummer' | 'hoofdfoto_path'
  | 'toewijzing_niveau' | 'toegewezen_medewerker_id' | 'toegewezen_team_id' | 'actief'
>

/** `%`, `_` en `\` zijn jokers in ilike en moeten letterlijk gezocht worden. */
function escapeIlike(waarde: string): string {
  return waarde.replace(/[\\%_]/g, (t) => `\\${t}`)
}

/**
 * Zoek het object dat bij een gescande (of ingetypte) code hoort.
 *
 * Volgorde is bewust:
 *  1. Een QR die EVA zelf printte bevat de object-id → direct raak.
 *  2. Anders: de kandidaten uit `zoektermen()`, van meest naar minst specifiek,
 *     tegen `qr_code` en `inventarisnummer`. Hoofdletterongevoelig, want een
 *     handmatig ingetypte code komt zelden precies zo binnen als hij op de
 *     sticker staat.
 *
 * Geeft `null` als niets past — dat is bij een verse sticker de normale uitkomst
 * en geen fout: het is precies het startsein om materieel toe te voegen.
 */
export async function zoekOpCode(payload: string): Promise<MaterieelKort | null> {
  const gelezen = leesScan(payload)
  if (!gelezen) return null
  const client = db()

  if (gelezen.soort === 'eva') {
    const { data } = await client
      .from('materieel_objecten').select(KORT).eq('id', gelezen.objectId).maybeSingle()
    if (data) return data as MaterieelKort
    // Een uuid die geen object (meer) is: alsnog als losse code proberen.
  }

  // Bewust losse queries per kolom en géén `.or(...)`: die filter wordt als
  // kale string naar PostgREST gestuurd, en een payload met een komma of haakje
  // erin — heel gewoon in een URL — breekt dan de filter-syntax. Via `.ilike()`
  // gaat de waarde netjes als parameter mee.
  const termen = zoektermen(payload)
  for (const kolom of ['qr_code', 'inventarisnummer'] as const) {
    for (const term of termen) {
      const { data } = await client
        .from('materieel_objecten')
        .select(KORT)
        .ilike(kolom, escapeIlike(term))
        .limit(1)
      const rij = (data ?? [])[0]
      if (rij) return rij as MaterieelKort
    }
  }

  return null
}

/**
 * Materieel dat op naam van deze medewerker staat, plus dat van de teams waar
 * hij teamleider van is (een servicebus is zo'n team). Begrensd op medewerker en
 * team, dus geen paginering nodig.
 */
export async function getMijnMaterieel(medewerkerId: string): Promise<MaterieelKort[]> {
  const client = db()

  const { data: teamRijen } = await client
    .from('materieel_teams').select('id').eq('teamleider_id', medewerkerId).eq('actief', true)
  const teamIds = ((teamRijen ?? []) as { id: string }[]).map((t) => t.id)

  const filter = [`toegewezen_medewerker_id.eq.${medewerkerId}`]
  if (teamIds.length > 0) filter.push(`toegewezen_team_id.in.(${teamIds.join(',')})`)

  const { data } = await client
    .from('materieel_objecten')
    .select(KORT)
    .eq('actief', true)
    .or(filter.join(','))
    .order('omschrijving')

  return (data ?? []) as MaterieelKort[]
}

/** De laatste stukken materieel die deze medewerker zelf heeft toegevoegd. */
export async function getRecentToegevoegd(medewerkerId: string, aantal = 10): Promise<MaterieelKort[]> {
  const { data } = await db()
    .from('materieel_objecten')
    .select(KORT)
    .eq('actief', true)
    .eq('created_by', medewerkerId)
    .order('created_at', { ascending: false })
    .limit(aantal)
  return (data ?? []) as MaterieelKort[]
}
