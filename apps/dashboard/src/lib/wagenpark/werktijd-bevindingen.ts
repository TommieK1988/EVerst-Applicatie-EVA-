import 'server-only'
import { getPgPool } from './db'
import type { BestuurderResultaat } from './werktijd-analyse'

/**
 * Schrijf de uitkomsten van de werktijd-analyse weg als R11-bevindingen, zodat
 * ze bij Wagenpark → Bevindingen verschijnen naast de andere regels.
 *
 * Waarom niet als regel-module in de compliance-engine? Die engine draait
 * synchrone, pure functies over een vaste context (ritten, voertuigen, regels).
 * De werktijd-analyse heeft asynchrone data nodig — planning, roosters,
 * afwezigheid en geocoding — en past daar niet in. Daarom draait de analyse in
 * haar eigen job (dagelijks/maandelijks) en persisteert ze het resultaat hier
 * met dezelfde vorm, statussen en fingerprint-logica als de rest.
 *
 * LET OP: de compliance-run verwijdert open bevindingen die niet in zíjn eigen
 * resultaat zitten. R11 is daar expliciet van uitgezonderd (zie compliance.ts),
 * anders zou een compliance-check deze bevindingen telkens weggooien.
 */

export type WerktijdBevindingResultaat = {
  nieuw: number
  bijgewerkt: number
  verwijderd: number
}

/** Stabiele fingerprint: één bevinding per bestuurder × dag × soort. */
function fingerprint(userId: number, datum: string, soort: 'te_laat' | 'te_vroeg'): string {
  return `R11|werktijd|${userId}|${datum}|${soort}`
}

function hm(min: number): string {
  const u = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return u > 0 ? `${u}u${String(m).padStart(2, '0')}` : `${m} min`
}

/**
 * Upsert de R11-bevindingen voor de geanalyseerde periode.
 * Behandelde status (uitzondering/afgewezen) blijft behouden; open bevindingen
 * die in deze ronde niet meer voorkomen worden opgeruimd.
 */
export async function schrijfWerktijdBevindingen(
  resultaten: BestuurderResultaat[],
  van: string,
  tot: string,
  drempelWaarschuwingMin = 60,
): Promise<WerktijdBevindingResultaat> {
  type Rij = {
    fingerprint: string
    user_id_ulu: number
    trip_id: string | null
    datum: string
    ernst: 'info' | 'waarschuwing'
    omschrijving: string
    data: Record<string, unknown>
  }

  const rijen: Rij[] = []

  for (const r of resultaten) {
    const naam = r.volledige_naam ?? `Bestuurder #${r.user_id_ulu}`
    for (const d of r.dagen) {
      if (!d.is_werkdag) continue

      const teLaat = d.te_laat_minuten ?? 0
      if (teLaat > 0) {
        rijen.push({
          fingerprint: fingerprint(r.user_id_ulu, d.datum, 'te_laat'),
          user_id_ulu: r.user_id_ulu,
          trip_id: d.aankomst_trip_id,
          datum: d.datum,
          ernst: teLaat > drempelWaarschuwingMin ? 'waarschuwing' : 'info',
          omschrijving:
            `${naam}: op ${d.datum} om ${d.aankomst_werk} op de werkplek aangekomen — ` +
            `${hm(teLaat)} na de roostertijd (${d.verwacht_start}).`,
          data: {
            user_id_ulu: r.user_id_ulu,
            soort: 'te_laat',
            datum: d.datum,
            werk_bron: d.werk_bron,
            rooster_benadering: d.rooster_benadering,
            verwacht_start: d.verwacht_start,
            aankomst_werk: d.aankomst_werk,
            verschil_minuten: teLaat,
            uitleg_regel:
              'Aankomst = de eerste rit die eindigt bij de werkplek van die dag: de ' +
              'ingeplande projectlocatie, of het bedrijfsadres als er geen planning is. ' +
              'De grens is de roostertijd (dagstart). Verlof onderdrukt het signaal.',
          },
        })
      }

      const teVroeg = d.te_vroeg_minuten ?? 0
      if (teVroeg > 0) {
        rijen.push({
          fingerprint: fingerprint(r.user_id_ulu, d.datum, 'te_vroeg'),
          user_id_ulu: r.user_id_ulu,
          trip_id: d.vertrek_trip_id,
          datum: d.datum,
          ernst: teVroeg > drempelWaarschuwingMin ? 'waarschuwing' : 'info',
          omschrijving:
            `${naam}: op ${d.datum} om ${d.vertrek_werk} van de werkplek vertrokken — ` +
            `${hm(teVroeg)} voor de roostertijd (${d.verwacht_eind}).`,
          data: {
            user_id_ulu: r.user_id_ulu,
            soort: 'te_vroeg',
            datum: d.datum,
            werk_bron: d.werk_bron,
            rooster_benadering: d.rooster_benadering,
            verwacht_eind: d.verwacht_eind,
            vertrek_werk: d.vertrek_werk,
            verschil_minuten: teVroeg,
            uitleg_regel:
              'Vertrek = de laatste rit die start bij de werkplek van die dag: de ' +
              'ingeplande projectlocatie, of het bedrijfsadres als er geen planning is. ' +
              'De grens is de roostertijd (dageind). Verlof onderdrukt het signaal.',
          },
        })
      }
    }
  }

  const pool = getPgPool()
  const client = await pool.connect()
  let nieuw = 0
  let bijgewerkt = 0
  let verwijderd = 0
  try {
    await client.query('begin')

    // Ruim open R11-bevindingen in deze periode op die nu niet meer gelden
    // (bv. verlof achteraf geboekt, of rit gecorrigeerd). Behandelde blijven staan.
    const del = await client.query(
      `delete from public.compliance_bevindingen
        where regel_code = 'R11'
          and status = 'open'
          and bron = 'automatisch'
          and periode_start between $1::date and $2::date
          and (fingerprint is null or not (fingerprint = any($3::text[])))`,
      [van, tot, rijen.map((r) => r.fingerprint)],
    )
    verwijderd = del.rowCount ?? 0

    for (const r of rijen) {
      const res = await client.query<{ was_insert: boolean }>(
        `insert into public.compliance_bevindingen
           (fingerprint, regel_code, voertuig_id, medewerker_id, trip_id,
            periode_start, periode_eind, ernst, omschrijving, data, status)
         values ($1, 'R11', null, null, $2, $3, $3, $4, $5, $6::jsonb, 'open')
         on conflict (fingerprint) do update set
           status = case
                     when public.compliance_bevindingen.status <> 'open'
                       then public.compliance_bevindingen.status
                     else excluded.status
                    end,
           omschrijving = excluded.omschrijving,
           data         = excluded.data,
           ernst        = excluded.ernst,
           trip_id      = excluded.trip_id,
           updated_at   = now()
         returning (xmax = 0) as was_insert`,
        [r.fingerprint, r.trip_id, r.datum, r.ernst, r.omschrijving, JSON.stringify(r.data)],
      )
      if (res.rows[0]?.was_insert) nieuw++
      else bijgewerkt++
    }

    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }

  return { nieuw, bijgewerkt, verwijderd }
}
