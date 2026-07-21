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
import { ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import { vereisRecht } from '@/lib/auth/rechten'

export async function runComplianceAction(): Promise<{
  totaal: number
  perRegel: Record<string, number>
  ritten: number
}> {
  await vereisRecht('wagenpark', 'schrijven')
  const supabase = createServiceRoleClient()

  // Periode: lopend jaar t/m vandaag
  const jaar = new Date().getFullYear()
  const periodeStart = `${jaar}-01-01`
  const periodeEind = new Date().toISOString().slice(0, 10)

  // Laad trips, voertuigen, regels, ulu_users
  //
  // Trips gaan bewust via de directe Postgres-pool en NIET via PostgREST:
  // PostgREST kapt een `select *` af op zijn max-rows-instelling en de
  // authenticator-rol heeft statement_timeout=8s. Bij zo'n afkapping of time-out
  // kwam er stilletjes een lege lijst terug (de vorige code las alleen
  // `tripsRes.data ?? []` en negeerde `tripsRes.error`), waarna de hele run
  // "geslaagd" meldde met nul bevindingen. Numerieke kolommen worden expliciet
  // naar float gecast, want node-postgres levert `numeric` als string.
  const [trips, voertuigenRes, regelsRes, uluUsersRaw] = await Promise.all([
    pgQuery<UluTrip & {
      rit_type_override?: 'zakelijk' | 'prive' | null
      rit_type_effectief?: 'zakelijk' | 'prive' | null
    }>(
      `select id::text, voertuig_id::text, medewerker_id::text, bestuurder_naam_raw,
              user_id_ulu, kenteken, start_datum::text, start_tijd::text, stop_tijd::text,
              adres_start, adres_stop,
              afstand_km::float     as afstand_km,
              duur_seconden,
              km_stand_start::float as km_stand_start,
              km_stand_stop::float  as km_stand_stop,
              rit_type_ulu, rit_type_berekend::text, rit_type_override::text,
              ${ritTypeEffectiefSql('t')} as rit_type_effectief,
              score, import_batch_id::text, created_at::text
         from public.ulu_trips t
        where start_datum between $1::date and $2::date`,
      [periodeStart, periodeEind],
    ),
    supabase.from('voertuigen').select('*'),
    supabase.from('handboek_regels').select('*'),
    pgQuery<UluUserInfo>(
      `select id, volledige_naam, bijtelling_betaald,
              prive_limiet_km_jaar, zakelijk_verwacht_km_jaar,
              werktijd_start::text, werktijd_eind::text
         from public.ulu_users`,
    ),
  ])

  // Fouten hier niet inslikken: een mislukte laadstap zou anders een lege lijst
  // opleveren en de run ten onrechte als "geen bevindingen" laten eindigen.
  if (voertuigenRes.error) throw new Error(`Voertuigen laden mislukt: ${voertuigenRes.error.message}`)
  if (regelsRes.error) throw new Error(`Handboek-regels laden mislukt: ${regelsRes.error.message}`)

  // Substitueer het EFFECTIEVE rit_type (zie ritTypeEffectiefSql): verlof wint,
  // daarna een handmatige override, daarna de rooster-regel (rijden op een dag
  // die volgens het rooster geen werkdag is telt als privé), anders de
  // trigger-berekening. Voorheen werd hier alleen de override toegepast,
  // waardoor R1/R2 verlof- en vrije-dag-ritten als zakelijk bleven zien.
  const tripsEffectief = trips.map((t) => ({
    ...t,
    rit_type_berekend: t.rit_type_effectief ?? t.rit_type_override ?? t.rit_type_berekend,
  })) as UluTrip[]
  const voertuigen = new Map(
    ((voertuigenRes.data ?? []) as Voertuig[]).map((v) => [v.id, v]),
  )
  const regels = new Map(
    ((regelsRes.data ?? []) as HandboekRegel[]).map((r) => [r.code, r]),
  )
  const uluUsers = new Map(uluUsersRaw.map((u) => [u.id, u]))

  const ctx = { trips: tripsEffectief, voertuigen, regels, periodeStart, periodeEind, uluUsers }
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
    tripsEffectief.map((t) => [t.id, t.user_id_ulu ?? null]),
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
  const nieuweWerktijdSignalen: { regel_code: string; omschrijving: string; user_id_ulu: number | null }[] = []
  try {
    await client.query('begin')

    // Wis eerst de open bevindingen die GEEN nieuwe match hebben — zo raken we
    // verouderde open bevindingen kwijt (trip is bv. verwijderd), maar behouden
    // we behandelde status.
    const nieuweFingerprints = uniek.map((u) => u.fingerprint)
    // R11 uitzonderen: die bevindingen komen uit de werktijd-analyse (eigen job,
    // async data) en zitten dus niet in het resultaat van deze run. Zonder deze
    // uitzondering zou elke compliance-check ze weggooien.
    await client.query(
      `delete from public.compliance_bevindingen
        where status = 'open'
          and regel_code <> 'R11'
          and periode_start >= $1::date
          and (fingerprint is null or not (fingerprint = any($2::text[])))`,
      [periodeStart, nieuweFingerprints],
    )

    for (const b of uniek) {
      const autoAllowed = isAutoToegestaan(b)
      const nieuweStatus = autoAllowed ? 'geaccepteerd_uitzondering' : 'open'
      const ins = await client.query<{ was_insert: boolean }>(
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
           updated_at    = now()
         returning (xmax = 0) as was_insert`,
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
      // Nieuw ingevoegde (xmax = 0), nog openstaande werktijd-signalen verzamelen
      // voor een actieve melding naar beheer. Update-conflicts (bestaande
      // bevindingen) worden niet opnieuw gemeld.
      if (
        ins.rows[0]?.was_insert &&
        nieuweStatus === 'open' &&
        (b.regel_code === 'R9' || b.regel_code === 'R10')
      ) {
        const uid = (b.data as Record<string, unknown> | undefined)?.user_id_ulu
        nieuweWerktijdSignalen.push({
          regel_code: b.regel_code,
          omschrijving: b.omschrijving,
          user_id_ulu: typeof uid === 'number' ? uid : null,
        })
      }
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    console.error('[compliance] upsert error', err)
    throw err
  } finally {
    client.release()
  }

  // Actieve bel-melding naar beheer voor nieuwe werktijd-signalen (te laat / te vroeg).
  if (nieuweWerktijdSignalen.length > 0) {
    try {
      await notificeerWerktijdSignalen(nieuweWerktijdSignalen)
    } catch (err) {
      // Notificatie mag de compliance-run nooit laten falen.
      console.error('[compliance] notificatie werktijd-signalen mislukt', err)
    }
  }

  revalidatePath('/wagenpark/bevindingen')
  revalidatePath('/wagenpark/dashboard')
  return {
    totaal: result.samenvatting.totaal,
    perRegel: result.perRegel,
    ritten: tripsEffectief.length,
  }
}

/**
 * Stuur één in-app melding PER BESTUURDER naar elke beheer-ontvanger, met de
 * nieuwe werktijd-signalen (te laat / te vroeg) van die bestuurder. Ontvangers =
 * Directie (afdeling), beheerders (instellingen=beheren) of wagenpark=beheren.
 * Insert via de directe pooler, consistent met de rest van de wagenpark-module.
 */
async function notificeerWerktijdSignalen(
  signalen: { regel_code: string; omschrijving: string; user_id_ulu: number | null }[],
): Promise<void> {
  const ontvangers = await pgQuery<{ auth_user_id: string }>(
    `
    select distinct m.auth_user_id::text as auth_user_id
      from public.medewerkers m
      left join public.medewerker_afdelingen ad on ad.naam = m.afdeling and ad.actief = true
     where m.actief = true
       and m.auth_user_id is not null
       and (
         lower(coalesce(m.afdeling, '')) = 'directie'
         or coalesce(m.rechten_override->>'instellingen', ad.standaard_rechten->>'instellingen') = 'beheren'
         or coalesce(m.rechten_override->>'wagenpark', ad.standaard_rechten->>'wagenpark') = 'beheren'
       )
    `,
  )
  if (ontvangers.length === 0) return

  // Groepeer de signalen per bestuurder.
  const perBestuurder = new Map<number, string[]>()
  const zonderBestuurder: string[] = []
  for (const s of signalen) {
    if (s.user_id_ulu == null) { zonderBestuurder.push(s.omschrijving); continue }
    const lijst = perBestuurder.get(s.user_id_ulu) ?? []
    lijst.push(s.omschrijving)
    perBestuurder.set(s.user_id_ulu, lijst)
  }

  // Namen van de betrokken bestuurders ophalen.
  const namen = new Map<number, string>()
  const ids = [...perBestuurder.keys()]
  if (ids.length > 0) {
    const rows = await pgQuery<{ id: number; volledige_naam: string | null }>(
      `select id, volledige_naam from public.ulu_users where id = any($1::bigint[])`,
      [ids],
    )
    for (const r of rows) namen.set(r.id, r.volledige_naam ?? `Bestuurder #${r.id}`)
  }

  type Melding = { titel: string; body: string; url: string }
  const meldingen: Melding[] = []
  for (const [uid, omschrijvingen] of perBestuurder) {
    const naam = namen.get(uid) ?? `Bestuurder #${uid}`
    meldingen.push({
      titel: `Werktijd-signaal: ${naam}`,
      body: omschrijvingen.join(' · '),
      url: `/wagenpark/bestuurders/${uid}`,
    })
  }
  for (const omschrijving of zonderBestuurder) {
    meldingen.push({ titel: 'Werktijd-signaal wagenpark', body: omschrijving, url: '/wagenpark/bevindingen' })
  }

  for (const o of ontvangers) {
    for (const m of meldingen) {
      await pgQuery(
        `insert into public.notificaties (user_id, type, titel, body, url, gelezen)
         values ($1, 'algemeen', $2, $3, $4, false)`,
        [o.auth_user_id, m.titel, m.body, m.url],
      )
    }
  }
}

export async function markeerUitzonderingAction(bevinding_id: string, toelichting: string) {
  await vereisRecht('wagenpark', 'schrijven')
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
  await vereisRecht('wagenpark', 'schrijven')
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
