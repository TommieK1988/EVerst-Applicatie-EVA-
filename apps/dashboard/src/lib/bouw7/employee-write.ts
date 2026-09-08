/**
 * Medewerkers bijwerken en aanmaken in Bouw7 (EVA → Bouw7).
 *
 * `POST /organization/employee` is een partiële upsert: mét `id` wijzigen alleen de meegestuurde
 * velden (geverifieerd sep 2026 op medewerker 195078: `phoneNumber` gewijzigd, de overige 30+
 * velden — adres, tarieven, afdeling, maatwerkvelden — bleven staan).
 *
 * Wat NIET wordt geschreven: `functie` en `afdeling` (EVA-eigen indeling, bewust los van Bouw7
 * `functionTitle`/`department`), en het e-mailadres. Dat laatste is in Bouw7 ook de
 * gebruikersnaam voor inloggen; een tikfout in EVA zou iemand buitensluiten. Het is in EVA
 * gewoon bewerkbaar en blijft daar beschermd, maar gaat niet naar Bouw7.
 *
 * Aanmaken vereist de verplichte maatwerkvelden van Bouw7 (VCA-diploma, sleutel ontvangen,
 * VCA geldig t/m). Die krijgen een neutrale startwaarde ("Geen"); de administratie vult ze in
 * Bouw7 of via de VCA-module aan. Aanmaken is niet live getest — mislukt het, dan blijft de
 * medewerker EVA-only met een melding, en kan hij later alsnog aan Bouw7 gekoppeld worden.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from './sync'
import { getCustomAttributeDefs } from './custom-attributes'
import type { Bouw7Employee, Bouw7ListResponse } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** EVA-kolom → { schrijfveld, leesveld op /list/employees }. */
const VELDEN: Record<string, { post: string; lees: keyof Bouw7Employee }> = {
  voornaam:            { post: 'firstName',         lees: 'firstName' },
  tussenvoegsel:       { post: 'prefix',            lees: 'prefix' },
  achternaam:          { post: 'lastName',          lees: 'lastName' },
  telefoon:            { post: 'phoneNumber',       lees: 'phoneNumber' },
  adres_straat:        { post: 'address',           lees: 'address' },
  adres_postcode:      { post: 'zipCode',           lees: 'zipCode' },
  adres_plaats:        { post: 'city',              lees: 'city' },
  geboortedatum:       { post: 'birthDate',         lees: 'birthDate' },
  in_dienst_vanaf:     { post: 'dateOfEmployment',  lees: 'dateOfEmployment' },
  uit_dienst_per:      { post: 'dateOfResignation', lees: 'dateOfResignation' },
  uurtarief_verkoop:   { post: 'sellingHourlyRate', lees: 'sellingHourlyRate' },
  uurtarief_kostprijs: { post: 'hourlyRate',        lees: 'hourlyRate' },
  extern:              { post: 'external',          lees: 'external' },
}

/** Kolommen die een write kunnen aansturen; `actief` vertaalt naar de uit-dienst-datum. */
export const BOUW7_MEDEWERKER_SCHRIJFVELDEN = [...Object.keys(VELDEN), 'actief'] as const

export type EmployeeWriteResultaat =
  | { ok: true; geschreven: string[]; nietOvergenomen: string[] }
  | { ok: false; error: string; geschreven: string[] }

const norm = (v: unknown): string => (v == null ? '' : String(v)).trim()
/** Bouw7-datums komen als "1988-05-16T00:00:00+02:00" terug; EVA bewaart "1988-05-16". */
const datumNorm = (v: unknown): string => norm(v).slice(0, 10)
const bedragNorm = (v: unknown): string => (v == null || v === '' ? '' : (Math.round(Number(v) * 100) / 100).toFixed(2))
const postcodeNorm = (v: unknown): string => norm(v).replace(/\s+/g, '').toUpperCase()

/**
 * Schrijf de opgegeven medewerkerkolommen naar Bouw7 en lees terug welke echt zijn overgenomen.
 * `actief=false` zonder uit-dienst-datum zet de datum op vandaag; `actief=true` maakt hem leeg.
 */
export async function schrijfBouw7Medewerker(medewerkerId: string, velden: readonly string[]): Promise<EmployeeWriteResultaat> {
  const geschreven: string[] = []
  try {
    const supabase = db()
    const { data: m } = await supabase
      .from('medewerkers')
      .select('bouw7_id, actief, ' + Object.keys(VELDEN).join(', '))
      .eq('id', medewerkerId)
      .maybeSingle()
    if (!m?.bouw7_id) return { ok: false, error: 'Medewerker staat nog niet in Bouw7.', geschreven }

    const body: Record<string, unknown> = { id: Number(m.bouw7_id) }
    const verwacht = new Map<string, { lees: keyof Bouw7Employee; waarde: string; norm: (v: unknown) => string }>()

    const wil = new Set(velden)
    // Actief ⇄ uit-dienst-datum: één Bouw7-veld, twee EVA-invoeren.
    if (wil.has('actief') || wil.has('uit_dienst_per')) {
      const uitDienst = m.actief === false ? (m.uit_dienst_per ?? new Date().toISOString().slice(0, 10)) : null
      body.dateOfResignation = uitDienst
      const n = (v: unknown) => datumNorm(v)
      verwacht.set(wil.has('uit_dienst_per') ? 'uit_dienst_per' : 'actief', { lees: 'dateOfResignation', waarde: n(uitDienst), norm: n })
      if (wil.has('uit_dienst_per') && wil.has('actief')) geschreven.push('actief')
      wil.delete('actief'); wil.delete('uit_dienst_per')
    }
    for (const k of wil) {
      const def = VELDEN[k]
      if (!def) continue
      const waarde = m[k]
      const n = k === 'adres_postcode' ? postcodeNorm
        : k.startsWith('uurtarief') ? bedragNorm
        : (k === 'geboortedatum' || k === 'in_dienst_vanaf') ? datumNorm
        : k === 'extern' ? (v: unknown) => String(v === true)
        : norm
      body[def.post] = k === 'extern' ? waarde === true
        : k.startsWith('uurtarief') ? (waarde == null ? null : bedragNorm(waarde))
        : k === 'adres_postcode' ? postcodeNorm(waarde)
        : (waarde ?? '')
      verwacht.set(k, { lees: def.lees, waarde: n(waarde), norm: n })
    }
    if (verwacht.size === 0) return { ok: true, geschreven, nietOvergenomen: [] }

    const client = await getBouw7Client()
    await client.post('/organization/employee', body)

    const na = (await client.get<Bouw7ListResponse<Bouw7Employee>>('/list/employees', { q: `id = ${Number(m.bouw7_id)}` })).items?.[0]
    const nietOvergenomen: string[] = []
    for (const [k, v] of verwacht) {
      if (na && v.norm(na[v.lees]) === v.waarde) geschreven.push(k)
      else nietOvergenomen.push(k)
    }
    return { ok: true, geschreven, nietOvergenomen }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij bijwerken van de medewerker in Bouw7.', geschreven }
  }
}

/**
 * Maak een nieuwe medewerker aan in Bouw7 en geef het Bouw7-id terug. De verplichte
 * maatwerkvelden (ownerType 3 = medewerker, `isRequired`) krijgen een neutrale startwaarde:
 * de eerste keuzewaarde van een keuzelijst ("Geen"), anders een lege tekst.
 */
export async function maakBouw7Medewerker(input: {
  voornaam: string
  tussenvoegsel?: string | null
  achternaam: string
  extern?: boolean
}): Promise<{ ok: true; bouw7Id: number } | { ok: false; error: string }> {
  try {
    const client = await getBouw7Client()
    const defs = await getCustomAttributeDefs(client) as (ReturnType<typeof Object>[] & {
      id: number; ownerType?: number; isRequired?: boolean; dropdownValues?: string[] | null
    })[]
    const verplicht = defs.filter(d => d.ownerType === 3 && d.isRequired)
    const customAttributeValues = verplicht.map(d => ({
      customAttribute: { id: d.id },
      value: Array.isArray(d.dropdownValues) && d.dropdownValues.length > 0 ? String(d.dropdownValues[0]) : '',
    }))
    const created = await client.post<{ id?: number }>('/organization/employee', {
      firstName: input.voornaam,
      ...(input.tussenvoegsel ? { prefix: input.tussenvoegsel } : {}),
      lastName: input.achternaam,
      external: input.extern === true,
      ...(customAttributeValues.length ? { customAttributeValues } : {}),
    })
    if (!created?.id) return { ok: false, error: 'Bouw7 gaf geen medewerker-id terug.' }
    return { ok: true, bouw7Id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij aanmaken van de medewerker in Bouw7.' }
  }
}
