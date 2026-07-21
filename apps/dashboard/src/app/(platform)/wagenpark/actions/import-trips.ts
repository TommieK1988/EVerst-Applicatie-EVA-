'use server'

import { revalidatePath } from 'next/cache'
import { Importers } from '@everts/wagenpark-core'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'
import { runComplianceAction } from './compliance'

export type TripsImportResult = {
  ok: boolean
  error?: string
  tripsVerwerkt?: number
  tripsNieuw?: number
  tripsOvergeslagen?: number
  tripsFouten?: number
  nieuweVoertuigen?: string[]
  naamMatches?: number
  naamGeenMatch?: string[]
  bevindingen?: number
  periode?: { start: string | null; eind: string | null }
}

/**
 * Importeer ULU trips vanuit Excel-export. Voor ouder materiaal dan wat de
 * API geeft (~75 trips per voertuig).
 *
 * Matching:
 *  - Kenteken → voertuig (auto-aanmaak als nieuw)
 *  - Bestuurder-naam → ulu_users (fuzzy op volledige_naam)
 */
export async function importTripsAction(formData: FormData): Promise<TripsImportResult> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const file = formData.get('trips') as File | null
  if (!file || file.size === 0) {
    return { ok: false, error: 'Geen bestand geselecteerd.' }
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = Importers.parseUluTripsXlsx(buf)
    if (parsed.rows.length === 0) {
      return { ok: false, error: `Parser vond 0 rijen (${parsed.errors.length} parse-fouten).` }
    }

    const pool = getPgPool()
    const client = await pool.connect()
    const nieuweVoertuigen: string[] = []
    const naamGeenMatch = new Set<string>()
    let naamMatches = 0

    try {
      await client.query('begin')

      // 1. Kentekens upserten
      const kentekens = [...new Set(parsed.rows.map((r) => r.kenteken))]
      for (const k of kentekens) {
        const res = await client.query<{ inserted: boolean }>(
          `insert into public.voertuigen (kenteken) values ($1)
             on conflict (kenteken) do nothing
             returning (xmax = 0) as inserted`,
          [k],
        )
        if (res.rows[0]?.inserted) nieuweVoertuigen.push(k)
      }

      const { rows: voertuigRijen } = await client.query<{ id: string; kenteken: string }>(
        `select id, kenteken from public.voertuigen where kenteken = any($1::text[])`,
        [kentekens],
      )
      const kentekenToId = new Map(voertuigRijen.map((r) => [r.kenteken, r.id]))

      // 2. Bestuurder-naam matchen met ulu_users
      const uniekeNamen = [...new Set(parsed.rows.map((r) => r.bestuurder_naam_raw).filter((n): n is string => !!n))]
      const { rows: userRijen } = await client.query<{ id: number; volledige_naam: string }>(
        `select id, volledige_naam from public.ulu_users where volledige_naam is not null`,
      )
      function matchNaam(raw: string): number | null {
        const cleaned = raw.replace(/\s+/g, ' ').trim().toLowerCase()
        for (const u of userRijen) {
          if (!u.volledige_naam) continue
          const uName = u.volledige_naam.replace(/\s+/g, ' ').trim().toLowerCase()
          if (uName === cleaned) return u.id
        }
        return null
      }
      const naamToId = new Map<string, number>()
      for (const n of uniekeNamen) {
        const uid = matchNaam(n)
        if (uid != null) naamToId.set(n, uid)
        else naamGeenMatch.add(n)
      }
      naamMatches = naamToId.size

      // 3. Import-batch
      const { rows: batchRows } = await client.query<{ id: string }>(
        `insert into public.ulu_imports (bestandsnaam, bron, type, aantal_rijen, periode_start, periode_eind)
           values ($1, 'excel', 'trips', $2, $3, $4) returning id`,
        [file.name, parsed.rows.length, parsed.periode.start, parsed.periode.eind],
      )
      const importBatchId = batchRows[0].id

      // 4. Dedupliceer op (kenteken, datum, tijd)
      const dedup = new Map<string, typeof parsed.rows[number]>()
      for (const r of parsed.rows) {
        const key = `${r.kenteken}|${r.start_datum}|${r.start_tijd}`
        if (!dedup.has(key)) dedup.set(key, r)
      }
      const deduped = [...dedup.values()]

      // 5. Upsert in batches (coalesce-based merge met bestaande API-data)
      const COLS = [
        'voertuig_id', 'medewerker_id', 'bestuurder_naam_raw', 'user_id_ulu', 'kenteken',
        'start_datum', 'start_tijd', 'stop_tijd', 'adres_start', 'adres_stop',
        'afstand_km', 'duur_seconden', 'km_stand_start', 'km_stand_stop',
        'rit_type_ulu', 'score', 'import_batch_id',
      ]
      let tripsNieuw = 0
      let tripsOvergeslagen = 0
      for (let i = 0; i < deduped.length; i += 500) {
        const chunk = deduped.slice(i, i + 500)
        const values: unknown[] = []
        const placeholders: string[] = []
        chunk.forEach((r, idx) => {
          const offset = idx * COLS.length
          placeholders.push(
            '(' + COLS.map((_, ci) => `$${offset + ci + 1}`).join(', ') + ')',
          )
          const userId = r.bestuurder_naam_raw ? naamToId.get(r.bestuurder_naam_raw) ?? null : null
          values.push(
            kentekenToId.get(r.kenteken) ?? null,
            null,
            r.bestuurder_naam_raw,
            userId,
            r.kenteken,
            r.start_datum,
            r.start_tijd,
            r.stop_tijd,
            r.adres_start,
            r.adres_stop,
            r.afstand_km,
            r.duur_seconden,
            r.km_stand_start,
            r.km_stand_stop,
            r.rit_type_ulu,
            r.score,
            importBatchId,
          )
        })
        const sql = `
          insert into public.ulu_trips (${COLS.join(', ')})
          values ${placeholders.join(', ')}
          on conflict (kenteken, start_datum, start_tijd) do update set
            voertuig_id         = coalesce(excluded.voertuig_id,         public.ulu_trips.voertuig_id),
            bestuurder_naam_raw = coalesce(excluded.bestuurder_naam_raw, public.ulu_trips.bestuurder_naam_raw),
            user_id_ulu         = coalesce(excluded.user_id_ulu,         public.ulu_trips.user_id_ulu),
            stop_tijd           = coalesce(excluded.stop_tijd,           public.ulu_trips.stop_tijd),
            adres_start         = coalesce(excluded.adres_start,         public.ulu_trips.adres_start),
            adres_stop          = coalesce(excluded.adres_stop,          public.ulu_trips.adres_stop),
            afstand_km          = coalesce(excluded.afstand_km,          public.ulu_trips.afstand_km),
            duur_seconden       = coalesce(excluded.duur_seconden,       public.ulu_trips.duur_seconden),
            km_stand_start      = coalesce(excluded.km_stand_start,      public.ulu_trips.km_stand_start),
            km_stand_stop       = coalesce(excluded.km_stand_stop,       public.ulu_trips.km_stand_stop),
            rit_type_ulu        = coalesce(excluded.rit_type_ulu,        public.ulu_trips.rit_type_ulu),
            score               = coalesce(excluded.score,               public.ulu_trips.score)
          returning (xmax = 0) as is_insert
        `
        const res = await client.query<{ is_insert: boolean }>(sql, values)
        const inserted = res.rows.filter((r) => r.is_insert).length
        tripsNieuw += inserted
        tripsOvergeslagen += chunk.length - inserted
      }

      await client.query('commit')

      // 6. Compliance-check
      let bevindingen: number | undefined
      try {
        const res = await runComplianceAction()
        bevindingen = res.totaal
      } catch (err) {
        console.warn('[compliance] fout na trips import', err)
      }

      revalidatePath('/wagenpark/ritten')
      revalidatePath('/wagenpark/bestuurders')
      revalidatePath('/wagenpark/dashboard')

      return {
        ok: true,
        tripsVerwerkt: deduped.length,
        tripsNieuw,
        tripsOvergeslagen,
        tripsFouten: parsed.errors.length,
        nieuweVoertuigen,
        naamMatches,
        naamGeenMatch: [...naamGeenMatch],
        bevindingen,
        periode: parsed.periode,
      }
    } catch (err) {
      await client.query('rollback')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[trips import] fout', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
