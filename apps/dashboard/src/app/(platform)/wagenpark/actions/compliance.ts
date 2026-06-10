'use server'

import { revalidatePath } from 'next/cache'
import {
  Compliance,
  type UluTrip,
  type Voertuig,
  type HandboekRegel,
} from '@everts/wagenpark-core'
import type { UluUserInfo } from '@everts/wagenpark-core/compliance'
import { createServiceRoleClient } from '@/lib/wagenpark/supabase/service-role'
import { pgQuery, getPgPool } from '@/lib/wagenpark/db'

export async function runComplianceAction(): Promise<{ totaal: number; perRegel: Record<string, number> }> {
  const supabase = createServiceRoleClient()

  // Periode: lopend jaar t/m vandaag
  const jaar = new Date().getFullYear()
  const periodeStart = `${jaar}-01-01`
  const periodeEind = new Date().toISOString().slice(0, 10)

  // Laad trips, voertuigen, regels, ulu_users
  const [tripsRes, voertuigenRes, regelsRes, uluUsersRaw] = await Promise.all([
    supabase
      .from('ulu_trips')
      .select('*')
      .gte('start_datum', periodeStart)
      .lte('start_datum', periodeEind),
    supabase.from('voertuigen').select('*'),
    supabase.from('handboek_regels').select('*'),
    pgQuery<UluUserInfo>(
      `select id, volledige_naam, bijtelling_betaald,
              prive_limiet_km_jaar, zakelijk_verwacht_km_jaar,
              werktijd_start::text, werktijd_eind::text
         from public.ulu_users`,
    ),
  ])

  // Substitueer effectief rit_type: handmatige override wint boven berekend
  const trips = ((tripsRes.data ?? []) as (UluTrip & {
    rit_type_override?: 'zakelijk' | 'prive' | null
  })[]).map((t) => ({
    ...t,
    rit_type_berekend: t.rit_type_override ?? t.rit_type_berekend,
  })) as UluTrip[]
  const voertuigen = new Map(
    ((voertuigenRes.data ?? []) as Voertuig[]).map((v) => [v.id, v]),
  )
  const regels = new Map(
    ((regelsRes.data ?? []) as HandboekRegel[]).map((r) => [r.code, r]),
  )
  const uluUsers = new Map(uluUsersRaw.map((u) => [u.id, u]))

  const ctx = { trips, voertuigen, regels, periodeStart, periodeEind, uluUsers }
  const result = Compliance.runComplianceEngine(ctx)

  // R8 — parkeer-analyses (apart, want werkt op ulu_parking i.p.v. ulu_trips)
  if (regels.get('R8')?.actief !== false) {
    const cfg = (regels.get('R8')?.drempel_config ?? {}) as Record<string, number>
    const parkings = await pgQuery<{
      id: string
      voertuig_id: string | null
      kenteken: string
      parkeer_starttijd: string
      parkeerlocatie: string | null
      parkeerkosten: number | null
      duur_seconden: number | null
      bestuurder_naam_raw: string | null
    }>(
      `
      select
        p.id,
        p.voertuig_id,
        p.kenteken,
        p.parkeer_starttijd::text as parkeer_starttijd,
        p.parkeerlocatie,
        p.parkeerkosten::float as parkeerkosten,
        p.duur_seconden,
        (select t.bestuurder_naam_raw from public.ulu_trips t
          where t.kenteken = p.kenteken
            and t.start_datum = (p.parkeer_starttijd::date)
          order by abs(extract(epoch from (t.start_datum::timestamp + t.start_tijd) - p.parkeer_starttijd))
          limit 1) as bestuurder_naam_raw
      from public.ulu_parking p
      where p.parkeer_starttijd::date >= $1::date
        and p.parkeer_starttijd::date <= $2::date
      `,
      [periodeStart, periodeEind],
    )
    if (parkings.length > 0) {
      const parkingBevindingen = Compliance.runParkingRule(parkings, cfg, {
        start: periodeStart,
        eind: periodeEind,
      })
      result.bevindingen.push(...parkingBevindingen)
      result.perRegel.R8 = parkingBevindingen.length
      result.samenvatting.totaal += parkingBevindingen.length
      result.samenvatting.overtredingen += parkingBevindingen.filter((b) => b.ernst === 'overtreding').length
      result.samenvatting.waarschuwingen += parkingBevindingen.filter((b) => b.ernst === 'waarschuwing').length
      result.samenvatting.info += parkingBevindingen.filter((b) => b.ernst === 'info').length
    }
  }

  // Laad actieve allowances om auto-acceptatie toe te passen
  const allowances = await pgQuery<{
    ulu_user_id: number | null
    regel_code: string
    categorie: string | null
  }>(
    `select ulu_user_id, regel_code, categorie
       from public.compliance_allowances
      where actief = true`,
  )

  // Map trip_id → user_id_ulu als fallback (R3/R6 hebben geen data.user_id_ulu)
  const tripToUser = new Map<string, number | null>(
    trips.map((t) => [t.id, t.user_id_ulu ?? null]),
  )

  function isAutoToegestaan(b: typeof result.bevindingen[number]): boolean {
    const data = (b.data ?? {}) as Record<string, unknown>
    const userIdFromData = (data.user_id_ulu as number | undefined) ?? null
    const userIdFromTrip = b.trip_id ? tripToUser.get(b.trip_id) ?? null : null
    const userId = userIdFromData ?? userIdFromTrip
    const categorie =
      (data.reden_prive as string | undefined) ??
      (data.categorie as string | undefined) ??
      null
    return allowances.some((a) => {
      if (a.regel_code !== b.regel_code) return false
      if (a.ulu_user_id != null && userId !== a.ulu_user_id) return false
      if (a.categorie != null && a.categorie !== categorie) return false
      return true
    })
  }

  /**
   * Stabiele fingerprint zodat dezelfde bevinding bij herhaalde compliance-runs
   * dezelfde row raakt (en zijn behandelde status kan behouden).
   */
  function berekenFingerprint(b: typeof result.bevindingen[number]): string {
    const data = (b.data ?? {}) as Record<string, unknown>
    if (b.trip_id) {
      return `${b.regel_code}|trip|${b.trip_id}|${b.ernst}`
    }
    // Aggregaat / parking: combineer stabiele velden
    const parts = [
      b.regel_code,
      'aggr',
      b.ernst,
      (data.user_id_ulu as number | undefined) ?? '',
      (data.parking_id as string | undefined) ?? '',
      (data.maand as string | undefined) ?? '',
      (data.bestuurder as string | undefined) ?? '',
      (b.voertuig_id as string | null) ?? '',
      // Neem alleen het jaar uit de periode — eind_datum schuift dagelijks
      (b.periode_start ?? '').slice(0, 4),
    ]
    return parts.join('|')
  }

  // Dedupliceer bevindingen op fingerprint (een eerste compliance-run kan in
  // principe duplicaten opleveren als data hetzelfde is); eerste wint.
  const byFingerprint = new Map<string, (typeof result.bevindingen)[number] & { fingerprint: string }>()
  for (const b of result.bevindingen) {
    const fp = berekenFingerprint(b)
    if (!byFingerprint.has(fp)) byFingerprint.set(fp, { ...b, fingerprint: fp })
  }
  const uniek = [...byFingerprint.values()]

  // Upsert via directe pg (omzeilt PostgREST cache-trauma's + kan complex SQL)
  // Behoud bestaande status als die != 'open' is. Anders: auto-toegestaan als
  // allowance matcht, anders 'open'.
  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    // Wis eerst de open bevindingen die GEEN nieuwe match hebben — zo raken we
    // verouderde open bevindingen kwijt (trip is bv. verwijderd), maar behouden
    // we behandelde status.
    const nieuweFingerprints = uniek.map((u) => u.fingerprint)
    await client.query(
      `delete from public.compliance_bevindingen
        where status = 'open'
          and periode_start >= $1::date
          and (fingerprint is null or not (fingerprint = any($2::text[])))`,
      [periodeStart, nieuweFingerprints],
    )

    for (const b of uniek) {
      const autoAllowed = isAutoToegestaan(b)
      const nieuweStatus = autoAllowed ? 'geaccepteerd_uitzondering' : 'open'
      await client.query(
        `insert into public.compliance_bevindingen
           (fingerprint, regel_code, voertuig_id, medewerker_id, trip_id,
            periode_start, periode_eind, ernst, omschrijving, data, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         on conflict (fingerprint) do update set
           -- Behoud behandelde status (uitzondering / afgewezen); refresh rest
           status = case
                     when public.compliance_bevindingen.status <> 'open'
                       then public.compliance_bevindingen.status
                     else excluded.status
                    end,
           omschrijving  = excluded.omschrijving,
           data          = excluded.data,
           ernst         = excluded.ernst,
           voertuig_id   = excluded.voertuig_id,
           periode_start = excluded.periode_start,
           periode_eind  = excluded.periode_eind,
           updated_at    = now()`,
        [
          b.fingerprint,
          b.regel_code,
          b.voertuig_id,
          b.medewerker_id,
          b.trip_id,
          b.periode_start,
          b.periode_eind,
          b.ernst,
          b.omschrijving,
          JSON.stringify(b.data ?? {}),
          nieuweStatus,
        ],
      )
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    console.error('[compliance] upsert error', err)
    throw err
  } finally {
    client.release()
  }

  revalidatePath('/wagenpark/bevindingen')
  revalidatePath('/wagenpark/dashboard')
  return { totaal: result.samenvatting.totaal, perRegel: result.perRegel }
}

export async function markeerUitzonderingAction(bevinding_id: string, toelichting: string) {
  const supabase = createServiceRoleClient()
  await supabase
    .from('compliance_bevindingen')
    .update({ status: 'geaccepteerd_uitzondering' })
    .eq('id', bevinding_id)
  await supabase.from('compliance_feedback').insert({
    bevinding_id,
    actie: 'markeer_uitzondering',
    toelichting,
  })
  revalidatePath('/wagenpark/bevindingen')
}

export async function bevestigOvertredingAction(bevinding_id: string, toelichting: string) {
  const supabase = createServiceRoleClient()
  await supabase
    .from('compliance_bevindingen')
    .update({ status: 'afgewezen' })
    .eq('id', bevinding_id)
  await supabase.from('compliance_feedback').insert({
    bevinding_id,
    actie: 'bevestig_overtreding',
    toelichting,
  })
  revalidatePath('/wagenpark/bevindingen')
}
