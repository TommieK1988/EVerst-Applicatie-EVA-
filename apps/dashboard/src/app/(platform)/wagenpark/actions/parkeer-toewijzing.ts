'use server'

import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'
import { pgQuery } from '@/lib/wagenpark/db'
import {
  voerParkeerToewijzingUit,
  type ToewijzingRunResultaat,
} from '@/lib/wagenpark/parkeren-toewijzing'

/**
 * Afhandelen van parkeerkosten in de werkvoorraad.
 *
 * Elke actie hier zet `bevestigd_op` en `bevestiging_bron = 'handmatig'`. Dat is
 * niet alleen registratie: de toewijzingsronde slaat rijen met een bevestiging
 * over, dus dit is meteen de grendel die een menselijke keuze beschermt tegen de
 * volgende automatische ronde.
 */

export type ActieResultaat = { ok: boolean; error?: string }

function herlaad(): void {
  revalidatePath('/wagenpark/parkeren/toewijzen')
  revalidatePath('/wagenpark/parkeren')
}

/** Legt een keuze vast op één parkeerkost: één dossier, het hele bedrag. */
export async function bevestigToewijzingAction(
  parkingId: string,
  keuze: { dossierId: string; bewakingscode?: string | null; pslId?: number | null },
): Promise<ActieResultaat> {
  let medewerkerId: string
  try {
    const { medewerker } = await vereisRecht('wagenpark', 'schrijven')
    medewerkerId = medewerker.id
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }
  if (!parkingId || !keuze?.dossierId) return { ok: false, error: 'Geen dossier gekozen.' }

  try {
    await schrijfToewijzing(parkingId, medewerkerId, [
      { dossierId: keuze.dossierId, aandeel: 1, bewakingscode: keuze.bewakingscode ?? null, pslId: keuze.pslId ?? null },
    ])
    herlaad()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Verdeelt één parkeerkost over meerdere dossiers. Dit gebeurt nooit
 * automatisch — de auto stond bij één project, dus verdelen is een bewuste keuze
 * van een mens, bijvoorbeeld als iemand die dag echt twee adressen bezocht.
 */
export async function verdeelToewijzingAction(
  parkingId: string,
  delen: { dossierId: string; aandeel: number; bewakingscode?: string | null; pslId?: number | null }[],
): Promise<ActieResultaat> {
  let medewerkerId: string
  try {
    const { medewerker } = await vereisRecht('wagenpark', 'schrijven')
    medewerkerId = medewerker.id
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }

  if (!delen.length) return { ok: false, error: 'Geen verdeling opgegeven.' }
  const som = delen.reduce((s, d) => s + d.aandeel, 0)
  if (Math.abs(som - 1) > 0.0001) {
    return { ok: false, error: `De verdeling telt op tot ${(som * 100).toFixed(1)}%, dat moet 100% zijn.` }
  }
  if (new Set(delen.map((d) => d.dossierId)).size !== delen.length) {
    return { ok: false, error: 'Hetzelfde dossier staat er twee keer in.' }
  }

  try {
    await schrijfToewijzing(
      parkingId,
      medewerkerId,
      delen.map((d) => ({
        dossierId: d.dossierId,
        aandeel: d.aandeel,
        bewakingscode: d.bewakingscode ?? null,
        pslId: d.pslId ?? null,
      })),
    )
    herlaad()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Privé geparkeerd: hoort op geen enkel project. */
export async function markeerPriveAction(parkingId: string, toelichting?: string): Promise<ActieResultaat> {
  return zetEindstatus(parkingId, 'prive', toelichting)
}

/** Wel zakelijk, maar niet aan een project toe te rekenen (bijv. kantoorbezoek). */
export async function markeerNietDoorbelastenAction(
  parkingId: string,
  toelichting?: string,
): Promise<ActieResultaat> {
  return zetEindstatus(parkingId, 'afgewezen', toelichting)
}

/** Zet een afgehandelde regel terug in de werkvoorraad; de engine pakt hem weer op. */
export async function heropenToewijzingAction(parkingId: string): Promise<ActieResultaat> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }
  try {
    await pgQuery(
      `update public.parkeer_toewijzingen
          set status = 'voorstel', bevestigd_op = null, bevestigd_door = null,
              bevestiging_bron = null, toelichting = null
        where parking_id = $1
          and bouw7_ticket_id is null
          and bouw7_status = 'niet_verzonden'`,
      [parkingId],
    )
    herlaad()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function runParkeerToewijzingAction(
  opties: { van?: string; tot?: string } = {},
): Promise<{ ok: boolean; error?: string; resultaat?: ToewijzingRunResultaat }> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }
  try {
    const resultaat = await voerParkeerToewijzingUit(opties)
    herlaad()
    return { ok: true, resultaat }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── intern ──────────────────────────────────────────────────────────────────

async function zetEindstatus(
  parkingId: string,
  status: 'prive' | 'afgewezen',
  toelichting?: string,
): Promise<ActieResultaat> {
  let medewerkerId: string
  try {
    const { medewerker } = await vereisRecht('wagenpark', 'schrijven')
    medewerkerId = medewerker.id
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }

  try {
    await pgQuery(
      `update public.parkeer_toewijzingen
          set status = $2, dossier_id = null, bedrag = 0, aandeel = 1,
              bevestigd_op = now(), bevestigd_door = $3,
              bevestiging_bron = 'handmatig', toelichting = $4
        where parking_id = $1
          and bouw7_ticket_id is null
          and bouw7_status = 'niet_verzonden'`,
      [parkingId, status, medewerkerId, toelichting ?? null],
    )
    herlaad()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Vervangt de toewijzing(en) van één parkeerkost door een handmatige keuze.
 *
 * Het bedrag wordt in hele centen verdeeld en de restcent gaat naar het grootste
 * aandeel. Zonder die stap telt een verdeling van bijvoorbeeld €2,50 over drie
 * dossiers niet meer op tot €2,50 en lekt er stil een cent uit het dossiertotaal
 * (zie de controleview v_parkeer_toewijzing_controle).
 */
async function schrijfToewijzing(
  parkingId: string,
  medewerkerId: string,
  delen: { dossierId: string; aandeel: number; bewakingscode: string | null; pslId: number | null }[],
): Promise<void> {
  const bron = await pgQuery<{
    parkeerkosten: number | null
    datum: string
    medewerker_id: string | null
    ulu_user_id: number | null
    trip_id: string | null
  }>(
    `select p.parkeerkosten::float as parkeerkosten,
            coalesce(t.datum, (p.parkeer_starttijd at time zone 'Europe/Amsterdam')::date)::text as datum,
            t.medewerker_id, t.ulu_user_id, t.trip_id
       from public.ulu_parking p
       left join public.parkeer_toewijzingen t on t.parking_id = p.id
      where p.id = $1
      limit 1`,
    [parkingId],
  )
  if (bron.length === 0) throw new Error('Deze parkeerkost bestaat niet (meer).')
  const p = bron[0]

  const totaalCent = Math.round((p.parkeerkosten ?? 0) * 100)
  const centen = delen.map((d) => Math.floor(totaalCent * d.aandeel))
  const rest = totaalCent - centen.reduce((s, c) => s + c, 0)
  if (rest > 0) {
    const grootste = delen.reduce((best, d, i) => (d.aandeel > delen[best].aandeel ? i : best), 0)
    centen[grootste] += rest
  }

  const pool = (await import('@/lib/wagenpark/db')).getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    // Alleen wat nog niet naar Bouw7 is gegaan mag wijken.
    await client.query(
      `delete from public.parkeer_toewijzingen
        where parking_id = $1 and bouw7_ticket_id is null and bouw7_status = 'niet_verzonden'`,
      [parkingId],
    )

    for (const [i, d] of delen.entries()) {
      await client.query(
        `insert into public.parkeer_toewijzingen
           (parking_id, dossier_id, aandeel, bedrag, status, zekerheid, medewerker_id,
            ulu_user_id, trip_id, datum, bewakingscode, bouw7_psl_id,
            bevestigd_op, bevestigd_door, bevestiging_bron)
         values ($1, $2, $3, $4, 'bevestigd', 'zeker', $5, $6, $7, $8, $9, $10, now(), $11, 'handmatig')`,
        [
          parkingId, d.dossierId, d.aandeel, centen[i] / 100,
          p.medewerker_id, p.ulu_user_id, p.trip_id, p.datum,
          d.bewakingscode, d.pslId, medewerkerId,
        ],
      )
    }

    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
