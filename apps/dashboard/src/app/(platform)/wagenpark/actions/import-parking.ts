'use server'

import { revalidatePath } from 'next/cache'
import { Importers } from '@everts/wagenpark-core'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'

export type ParkingImportResult = {
  ok: boolean
  error?: string
  parkingVerwerkt?: number
  parkingFouten?: number
  parkingOvergeslagen?: number
  periode?: { start: string | null; eind: string | null }
}

export async function importParkingAction(formData: FormData): Promise<ParkingImportResult> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const file = formData.get('parking') as File | null
  if (!file || file.size === 0) {
    return { ok: false, error: 'Geen bestand geselecteerd.' }
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const parsed = Importers.parseUluParkingXlsx(buf)
    if (parsed.rows.length === 0) {
      return { ok: false, error: `Parser vond 0 rijen (${parsed.errors.length} fouten).` }
    }

    const pool = getPgPool()
    const client = await pool.connect()
    try {
      // Map kenteken → voertuig_id
      const kentekens = [...new Set(parsed.rows.map((r) => r.kenteken))]
      const { rows: voertuigRijen } = await client.query<{ id: string; kenteken: string }>(
        `select id, kenteken from public.voertuigen where kenteken = any($1::text[])`,
        [kentekens],
      )
      const kentekenToId = new Map(voertuigRijen.map((r) => [r.kenteken, r.id]))

      // Import batch
      const { rows: batchRows } = await client.query<{ id: string }>(
        `insert into public.ulu_imports (bestandsnaam, bron, type, aantal_rijen, periode_start, periode_eind)
           values ($1, 'excel', 'parking', $2, $3, $4) returning id`,
        [file.name, parsed.rows.length, parsed.periode.start, parsed.periode.eind],
      )
      const importBatchId = batchRows[0].id

      // Dedup op (kenteken, parkeer_starttijd)
      const dedup = new Map<string, typeof parsed.rows[number]>()
      for (const r of parsed.rows) {
        const key = `${r.kenteken}|${r.parkeer_starttijd}`
        if (!dedup.has(key)) dedup.set(key, r)
      }
      const deduped = [...dedup.values()]

      const COLS = [
        'voertuig_id', 'kenteken', 'parkeer_starttijd', 'parkeerlocatie',
        'parkeerkosten', 'duur_seconden', 'import_batch_id',
      ]
      let parkingVerwerkt = 0
      let parkingOvergeslagen = 0

      for (let i = 0; i < deduped.length; i += 500) {
        const chunk = deduped.slice(i, i + 500)
        const values: unknown[] = []
        const placeholders: string[] = []
        chunk.forEach((r, idx) => {
          const offset = idx * COLS.length
          placeholders.push(
            '(' + COLS.map((_, ci) => `$${offset + ci + 1}`).join(', ') + ')',
          )
          values.push(
            kentekenToId.get(r.kenteken) ?? null,
            r.kenteken,
            r.parkeer_starttijd,
            r.parkeerlocatie,
            r.parkeerkosten,
            r.duur_seconden,
            importBatchId,
          )
        })
        const sql = `
          insert into public.ulu_parking (${COLS.join(', ')})
          values ${placeholders.join(', ')}
          on conflict (kenteken, parkeer_starttijd) do update set
            voertuig_id    = coalesce(excluded.voertuig_id,    public.ulu_parking.voertuig_id),
            parkeerlocatie = coalesce(excluded.parkeerlocatie, public.ulu_parking.parkeerlocatie),
            parkeerkosten  = coalesce(excluded.parkeerkosten,  public.ulu_parking.parkeerkosten),
            duur_seconden  = coalesce(excluded.duur_seconden,  public.ulu_parking.duur_seconden)
          returning (xmax = 0) as is_insert
        `
        const res = await client.query<{ is_insert: boolean }>(sql, values)
        const inserted = res.rows.filter((r) => r.is_insert).length
        parkingVerwerkt += inserted
        parkingOvergeslagen += chunk.length - inserted
      }

      revalidatePath('/wagenpark/ritten')
      revalidatePath('/wagenpark/dashboard')

      return {
        ok: true,
        parkingVerwerkt,
        parkingFouten: parsed.errors.length,
        parkingOvergeslagen,
        periode: parsed.periode,
      }
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[parking import] fout', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
