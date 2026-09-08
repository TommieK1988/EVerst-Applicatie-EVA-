import 'server-only'
import { Importers } from '@everts/wagenpark-core'
import iconv from 'iconv-lite'
import { getPgPool } from '@/lib/wagenpark/db'

/**
 * Inlezen van een ULU parkeer-export, los van waar hij vandaan komt.
 *
 * WAAROM DIT NAAST DE SERVER ACTION STAAT — de action doet `vereisRecht()` en
 * heeft dus een ingelogde gebruiker nodig. De mail-cron heeft die niet. Zelfde
 * scheiding als bij de rittensync: action → kern → cron, met alle logica in de
 * kern. Deze module importeert bewust niets uit Next (geen `revalidatePath`),
 * zodat hij ook buiten een request aanroepbaar is.
 */

export type ParkingImportResult = {
  ok: boolean
  error?: string
  parkingVerwerkt?: number
  parkingFouten?: number
  parkingOvergeslagen?: number
  periode?: { start: string | null; eind: string | null }
  /** Ids van de zojuist toegevoegde rijen — voedt de toewijzingsronde erna. */
  nieuweIds?: string[]
}

/**
 * Decodeert de bytes van een CSV. ULU levert afhankelijk van de exportinstelling
 * UTF-8 of Windows-1252; in het tweede geval sneuvelen de accenten (Privé →
 * Priv�). Het vervangingsteken is de betrouwbaarste detectie: geldige UTF-8
 * bevat het nooit, tenzij het er letterlijk in stond.
 */
function decodeerTekst(buffer: Buffer): string {
  const alsUtf8 = buffer.toString('utf8')
  if (!alsUtf8.includes('�')) return alsUtf8
  return iconv.decode(buffer, 'win1252')
}

const COLS = [
  'voertuig_id', 'kenteken', 'parkeer_starttijd', 'parkeerlocatie',
  'parkeerkosten', 'duur_seconden', 'import_batch_id',
] as const

export async function verwerkParkingBestand(
  buffer: Buffer,
  bestandsnaam: string,
  bron: 'excel' | 'mail',
): Promise<ParkingImportResult> {
  try {
    const parsed = Importers.parseUluParkingBestand(buffer, bestandsnaam, () =>
      decodeerTekst(buffer),
    )
    if (parsed.rows.length === 0) {
      return {
        ok: false,
        error: `Parser vond 0 rijen (${parsed.errors.length} fouten).`,
        parkingFouten: parsed.errors.length,
      }
    }

    const pool = getPgPool()
    const client = await pool.connect()
    try {
      // Map kenteken → voertuig_id. Onbekende kentekens leveren null op; de rij
      // wordt wel bewaard, want het bedrag telt hoe dan ook mee.
      const kentekens = [...new Set(parsed.rows.map((r) => r.kenteken))]
      const { rows: voertuigRijen } = await client.query<{ id: string; kenteken: string }>(
        `select id, kenteken from public.voertuigen where kenteken = any($1::text[])`,
        [kentekens],
      )
      const kentekenToId = new Map(voertuigRijen.map((r) => [r.kenteken, r.id]))

      const { rows: batchRows } = await client.query<{ id: string }>(
        `insert into public.ulu_imports (bestandsnaam, bron, type, aantal_rijen, periode_start, periode_eind)
           values ($1, $2, 'parking', $3, $4, $5) returning id`,
        [bestandsnaam, bron, parsed.rows.length, parsed.periode.start, parsed.periode.eind],
      )
      const importBatchId = batchRows[0].id

      // Postgres weigert ON CONFLICT DO UPDATE als dezelfde sleutel twee keer in
      // één statement zit, dus eerst binnen de batch ontdubbelen.
      const dedup = new Map<string, (typeof parsed.rows)[number]>()
      for (const r of parsed.rows) {
        dedup.set(`${r.kenteken}|${r.parkeer_starttijd}`, dedup.get(`${r.kenteken}|${r.parkeer_starttijd}`) ?? r)
      }
      const deduped = [...dedup.values()]

      let parkingVerwerkt = 0
      let parkingOvergeslagen = 0
      const nieuweIds: string[] = []

      for (let i = 0; i < deduped.length; i += 500) {
        const chunk = deduped.slice(i, i + 500)
        const values: unknown[] = []
        const placeholders: string[] = []
        chunk.forEach((r, idx) => {
          const offset = idx * COLS.length
          placeholders.push('(' + COLS.map((_, ci) => `$${offset + ci + 1}`).join(', ') + ')')
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

        // `coalesce(excluded.x, bestaand)` vult alleen aan en overschrijft nooit
        // met null. Daardoor kunnen mail- en Excel-import elkaar aanvullen in
        // plaats van elkaars gegevens te wissen.
        const res = await client.query<{ id: string; is_insert: boolean }>(
          `
          insert into public.ulu_parking (${COLS.join(', ')})
          values ${placeholders.join(', ')}
          on conflict (kenteken, parkeer_starttijd) do update set
            voertuig_id    = coalesce(excluded.voertuig_id,    public.ulu_parking.voertuig_id),
            parkeerlocatie = coalesce(excluded.parkeerlocatie, public.ulu_parking.parkeerlocatie),
            parkeerkosten  = coalesce(excluded.parkeerkosten,  public.ulu_parking.parkeerkosten),
            duur_seconden  = coalesce(excluded.duur_seconden,  public.ulu_parking.duur_seconden)
          returning id, (xmax = 0) as is_insert
          `,
          values,
        )
        for (const r of res.rows) {
          if (r.is_insert) {
            parkingVerwerkt++
            nieuweIds.push(r.id)
          } else {
            parkingOvergeslagen++
          }
        }
      }

      return {
        ok: true,
        parkingVerwerkt,
        parkingFouten: parsed.errors.length,
        parkingOvergeslagen,
        periode: parsed.periode,
        nieuweIds,
      }
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[parking import] fout', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
