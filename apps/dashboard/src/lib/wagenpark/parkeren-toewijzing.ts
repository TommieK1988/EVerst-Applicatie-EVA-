import 'server-only'
import { Parkeren } from '@everts/wagenpark-core'
import { getPgPool, pgQuery } from './db'
import { ritTypeEffectiefSql } from './privacy'

/**
 * Koppelt parkeerkosten aan het dossier waar ze bij horen.
 *
 * De weging zelf staat in `@everts/wagenpark-core` (Parkeren.beoordeelParkeerRij);
 * deze module haalt de context op, schrijft de uitkomst weg, en bewaakt dat een
 * menselijk oordeel nooit door een volgende ronde wordt overschreven.
 *
 * Bewust geen Next-imports (geen `revalidatePath`) en geen `vereisRecht`: de
 * cron heeft geen ingelogde gebruiker. De server actions doen de rechtencontrole
 * en het herladen van de pagina.
 *
 * De ronde is herhaalbaar en kijkt een venster terug in plaats van alleen naar
 * nieuwe rijen. Dat is nodig omdat de parkeer-export dagelijks binnenkomt terwijl
 * de planning schuift en uren pas later in de week worden ingevuld: een rij die
 * vandaag onbeslist is, kan volgende week wél een duidelijk signaal hebben.
 */

export type ToewijzingRunResultaat = {
  bekeken: number
  automatisch: number
  werkvoorraad: number
  prive: number
  geenKandidaat: number
  genegeerd: number
  overgeslagenBeoordeeld: number
  duurMs: number
  /** Alleen bij dryRun gevuld: de losse oordelen, om drempels te kunnen ijken. */
  oordelen?: {
    parkingId: string
    kosten: number | null
    locatie: string | null
    uitkomst: string
    zekerheid: string
    score: number
    dossiernummer: string | null
    signalen: Record<string, unknown>
  }[]
}

type Instellingen = {
  startdatum: string
  venster_dagen: number
  rit_venster_voor_min: number
  rit_venster_na_min: number
  straal_dichtbij_m: number
  straal_nabij_m: number
  straal_ruim_m: number
  min_score_zeker: number
  min_marge_zeker: number
  min_bedrag: number
}

/**
 * Het einde van een rit als tijdstempel. `ulu_trips` bewaart datum en tijd apart
 * en zonevrij (wandklok), `ulu_parking` een timestamptz. Ze vergelijken kan dus
 * alleen door de rit expliciet in Nederlandse tijd te lezen — impliciet laten
 * gaan zou de sessie-tijdzone van de pooler gebruiken (UTC) en er in de zomer
 * twee uur naast zitten.
 */
const RIT_EINDE_SQL = `((t.start_datum + coalesce(t.stop_tijd, t.start_tijd)) at time zone 'Europe/Amsterdam')`

/** De dag waarop een parkeerkost valt, gelezen op de Nederlandse klok. */
const PARKEER_DATUM_SQL = `((p.parkeer_starttijd at time zone 'Europe/Amsterdam')::date)`

type ParkeerRij = {
  id: string
  kenteken: string
  start_iso: string
  datum: string
  parkeerlocatie: string | null
  parkeerkosten: number | null
  trip_id: string | null
  trip_datum: string | null
  user_id_ulu: number | null
  medewerker_id: string | null
  bestuurder_naam: string | null
  rit_type: string | null
  stop_lat: number | null
  stop_lng: number | null
  minuten_na_rit: number | null
  vaste_bestuurder_id: string | null
  vaste_bestuurder_naam: string | null
  verlof: boolean
}

type UrenRij = {
  medewerker_id: string
  datum: string
  dossier_id: string
  uren: number
  week_status: string | null
  bewakingscode: string | null
  bouw7_psl_id: number | null
}

type PlanRij = {
  medewerker_id: string
  datum: string
  dossier_id: string
  start_dt: string
  eind_dt: string
  bewakingscode: string | null
}

type DossierRij = {
  id: string
  dossiernummer: string | null
  titel: string | null
  actief: boolean
  adres_lat: number | null
  adres_lng: number | null
  werkadres_straat: string | null
  werkadres_stad: string | null
}

export async function voerParkeerToewijzingUit(
  opties: { van?: string; tot?: string; parkingIds?: string[]; dryRun?: boolean } = {},
): Promise<ToewijzingRunResultaat> {
  const start = Date.now()
  const res: ToewijzingRunResultaat = {
    bekeken: 0,
    automatisch: 0,
    werkvoorraad: 0,
    prive: 0,
    geenKandidaat: 0,
    genegeerd: 0,
    overgeslagenBeoordeeld: 0,
    duurMs: 0,
  }

  const instRijen = await pgQuery<Instellingen>(
    `select startdatum::text, venster_dagen, rit_venster_voor_min, rit_venster_na_min,
            straal_dichtbij_m, straal_nabij_m, straal_ruim_m,
            min_score_zeker, min_marge_zeker, min_bedrag::float
       from public.parkeer_toewijzing_instellingen where id = true`,
  )
  const inst = instRijen[0]
  if (!inst) throw new Error('Instellingen voor parkeertoewijzing ontbreken.')

  const instellingen = {
    straalDichtbijM: inst.straal_dichtbij_m,
    straalNabijM: inst.straal_nabij_m,
    straalRuimM: inst.straal_ruim_m,
    minScoreZeker: inst.min_score_zeker,
    minMargeZeker: inst.min_marge_zeker,
    minBedrag: inst.min_bedrag,
  }

  const tot = opties.tot ?? new Date().toISOString().slice(0, 10)
  const van =
    opties.van ??
    new Date(Date.now() - inst.venster_dagen * 86_400_000).toISOString().slice(0, 10)
  const idsFilter = opties.parkingIds ?? null

  // ── 1. De te beoordelen parkeerrijen, mét hun rit en bestuurder ────────────
  // Een parkeerkost waarvan al iemand (of de engine) heeft vastgesteld waar hij
  // hoort, blijft buiten deze selectie. Die grendel zit hier én straks nog eens
  // in de delete: een bevestigde of geboekte rij mag onder geen beding terugkomen.
  const rijen = await pgQuery<ParkeerRij>(
    `
    with te_doen as (
      select p.id
        from public.ulu_parking p
       where ${PARKEER_DATUM_SQL} between greatest($1::date, $3::date) and $2::date
         and coalesce(p.parkeerkosten, 0) >= $4::numeric
         and ($5::uuid[] is null or p.id = any($5::uuid[]))
         and not exists (
           select 1 from public.parkeer_toewijzingen bt
            where bt.parking_id = p.id
              and (bt.status in ('bevestigd','afgewezen')
                   or bt.bevestigd_op is not null
                   or bt.bouw7_ticket_id is not null
                   or bt.bouw7_status = 'verzonden')
         )
    )
    select
      p.id,
      p.kenteken,
      p.parkeer_starttijd::text                            as start_iso,
      ${PARKEER_DATUM_SQL}::text                           as datum,
      p.parkeerlocatie,
      p.parkeerkosten::float                               as parkeerkosten,
      r.trip_id,
      r.trip_datum::text                                   as trip_datum,
      r.user_id_ulu,
      r.medewerker_id,
      r.bestuurder_naam,
      r.rit_type,
      r.stop_lat,
      r.stop_lng,
      r.minuten_na_rit,
      vb.medewerker_id                                     as vaste_bestuurder_id,
      trim(concat_ws(' ', vm.voornaam, vm.tussenvoegsel, vm.achternaam)) as vaste_bestuurder_naam,
      coalesce(r.verlof, false)                            as verlof
    from public.ulu_parking p
    join te_doen on te_doen.id = p.id
    -- De rit die het dichtst bij de parkeerstart EINDIGT. Sorteren op de start
    -- van de rit (zoals elders in deze module gebeurt) pakt op een dag met korte
    -- ritten regelmatig de verkeerde bestuurder: je parkeert na aankomst.
    left join lateral (
      select
        t.id                                               as trip_id,
        t.start_datum                                      as trip_datum,
        t.user_id_ulu,
        uu.medewerker_id,
        t.bestuurder_naam_raw                              as bestuurder_naam,
        (${ritTypeEffectiefSql('t')})::text                as rit_type,
        t.stop_lat, t.stop_lng,
        round(extract(epoch from (p.parkeer_starttijd - ${RIT_EINDE_SQL})) / 60)::int as minuten_na_rit,
        exists (
          select 1 from public.medewerker_afwezigheid ma
           where ma.medewerker_id = uu.medewerker_id
             and ma.type = 'verlof'
             and t.start_datum between ma.start_datum and ma.eind_datum
        )                                                  as verlof
      from public.ulu_trips t
      left join public.ulu_users uu on uu.id = t.user_id_ulu
      where t.kenteken = p.kenteken
        and t.start_datum between ${PARKEER_DATUM_SQL} - 1 and ${PARKEER_DATUM_SQL} + 1
        -- De rit eindigt vóór het parkeren: de parkeerstart mag dus tot
        -- rit_venster_voor_min ná het rit-einde liggen, en maar kort ervoor
        -- (dat is de rit waarmee de auto weer wegrijdt).
        and p.parkeer_starttijd between ${RIT_EINDE_SQL} - make_interval(mins => $7::int)
                                   and ${RIT_EINDE_SQL} + make_interval(mins => $6::int)
      order by abs(extract(epoch from (p.parkeer_starttijd - ${RIT_EINDE_SQL})))
      limit 1
    ) r on true
    -- Terugval als er geen rit is: wie rijdt normaal in deze auto? Indicatief,
    -- want een bus wisselt van bestuurder — nooit genoeg om automatisch te boeken.
    left join lateral (
      select vb.medewerker_id
        from public.voertuig_bestuurders vb
        join public.voertuigen v on v.id = vb.voertuig_id
       where r.medewerker_id is null
         and v.kenteken = p.kenteken
         and vb.start_datum <= ${PARKEER_DATUM_SQL}
         and (vb.eind_datum is null or vb.eind_datum >= ${PARKEER_DATUM_SQL})
       order by vb.is_primair desc nulls last
       limit 1
    ) vb on true
    left join public.medewerkers vm on vm.id = vb.medewerker_id
    order by p.parkeer_starttijd
    `,
    [
      van,
      tot,
      inst.startdatum,
      inst.min_bedrag,
      idsFilter,
      inst.rit_venster_voor_min,
      inst.rit_venster_na_min,
    ],
  )

  if (rijen.length === 0) {
    res.duurMs = Date.now() - start
    return res
  }
  res.bekeken = rijen.length

  // ── 2. Signalen in bulk ────────────────────────────────────────────────────
  // Eén ronde voor alle rijen samen; per parkeerrij een query zou bij honderden
  // rijen per dag onwerkbaar worden.
  const medewerkerIds = [
    ...new Set(
      rijen.flatMap((r) => [r.medewerker_id, r.vaste_bestuurder_id].filter(Boolean) as string[]),
    ),
  ]
  const datums = [...new Set(rijen.map((r) => r.trip_datum ?? r.datum))]

  const [urenRijen, planRijen, dossierRijen] = await Promise.all([
    medewerkerIds.length
      ? pgQuery<UrenRij>(
          `select ur.medewerker_id, ur.datum::text as datum, ur.dossier_id,
                  ur.uren::float as uren, uw.status as week_status,
                  ur.bewakingscode, ur.bouw7_psl_id
             from public.uren_regels ur
             left join public.uren_weken uw on uw.id = ur.week_id
            where ur.medewerker_id = any($1::uuid[])
              and ur.datum = any($2::date[])
              and ur.dossier_id is not null`,
          [medewerkerIds, datums],
        )
      : Promise.resolve([] as UrenRij[]),

    medewerkerIds.length
      ? pgQuery<PlanRij>(
          `select pi.medewerker_id, (pi.start_dt at time zone 'Europe/Amsterdam')::date::text as datum,
                  pa.dossier_id, pi.start_dt::text, pi.eind_dt::text,
                  null::text as bewakingscode
             from public.planning_items pi
             join public.planning_activiteiten pa on pa.id = pi.activiteit_id
            where pi.medewerker_id = any($1::uuid[])
              and (pi.start_dt at time zone 'Europe/Amsterdam')::date = any($2::date[])
              and pa.dossier_id is not null`,
          [medewerkerIds, datums],
        )
      : Promise.resolve([] as PlanRij[]),

    // Alle dossiers met een werkadres. Via de directe pooler, dus geen
    // PostgREST-afkapping op 1000 rijen; ~680 rijen is klein genoeg om in
    // geheugen te houden en scheelt een query per parkeerrij.
    pgQuery<DossierRij>(
      `select d.id, d.dossiernummer, d.titel, coalesce(a.actief, false) as actief,
              d.adres_lat, d.adres_lng, d.werkadres_straat, d.werkadres_stad
         from public.dossiers d
         join public.v_dossier_actief a on a.id = d.id
        where d.adres_lat is not null
           or d.werkadres_straat is not null
           or exists (select 1 from public.uren_regels u where u.dossier_id = d.id)
           or exists (select 1 from public.planning_activiteiten pa where pa.dossier_id = d.id)`,
    ),
  ])

  const dossierInfo: Parkeren.DossierInfo[] = dossierRijen.map((d) => ({
    id: d.id,
    dossiernummer: d.dossiernummer,
    titel: d.titel,
    actief: d.actief,
    punt: d.adres_lat != null && d.adres_lng != null ? { lat: d.adres_lat, lng: d.adres_lng } : null,
    werkadresStraat: d.werkadres_straat,
    werkadresStad: d.werkadres_stad,
  }))

  const urenPer = new Map<string, UrenRij[]>()
  for (const u of urenRijen) {
    const k = `${u.medewerker_id}|${u.datum}`
    ;(urenPer.get(k) ?? urenPer.set(k, []).get(k)!).push(u)
  }
  const planPer = new Map<string, PlanRij[]>()
  for (const p of planRijen) {
    const k = `${p.medewerker_id}|${p.datum}`
    ;(planPer.get(k) ?? planPer.set(k, []).get(k)!).push(p)
  }

  // ── 3. Beoordelen ──────────────────────────────────────────────────────────
  type TeSchrijven = {
    parkingId: string
    dossierId: string | null
    bedrag: number
    aandeel: number
    status: string
    zekerheid: string
    score: number
    signalen: Record<string, unknown>
    medewerkerId: string | null
    uluUserId: number | null
    tripId: string | null
    datum: string
    bewakingscode: string | null
    pslId: number | null
    bron: 'automatisch' | null
  }
  const teSchrijven: TeSchrijven[] = []
  const teVerversen: string[] = []
  const oordelen: NonNullable<ToewijzingRunResultaat['oordelen']> = []

  for (const r of rijen) {
    const medewerkerId = r.medewerker_id ?? r.vaste_bestuurder_id
    const matchdag = r.trip_datum ?? r.datum
    const sleutel = medewerkerId ? `${medewerkerId}|${matchdag}` : ''
    const startMs = new Date(r.start_iso).getTime()

    const bestuurder: Parkeren.ParkeerBestuurder | null = medewerkerId
      ? {
          medewerkerId,
          uluUserId: r.user_id_ulu,
          naam: r.bestuurder_naam ?? r.vaste_bestuurder_naam,
          bron: r.medewerker_id ? 'rit' : 'voertuig_bestuurder',
          tripId: r.trip_id,
          ritTypeEffectief:
            r.rit_type === 'prive' ? 'prive' : r.rit_type === 'zakelijk' ? 'zakelijk' : null,
          ritStop:
            r.stop_lat != null && r.stop_lng != null ? { lat: r.stop_lat, lng: r.stop_lng } : null,
          minutenNaRit: r.minuten_na_rit,
        }
      : null

    const oordeel = Parkeren.beoordeelParkeerRij({
      parking: {
        id: r.id,
        kenteken: r.kenteken,
        startIso: r.start_iso,
        datum: matchdag,
        locatie: r.parkeerlocatie,
        kosten: r.parkeerkosten,
      },
      bestuurder,
      verlof: r.verlof,
      uren: (urenPer.get(sleutel) ?? []).map((u) => ({
        dossierId: u.dossier_id,
        uren: u.uren,
        weekStatus: u.week_status,
        bewakingscode: u.bewakingscode,
        pslId: u.bouw7_psl_id,
      })),
      planning: (planPer.get(sleutel) ?? []).map((p) => ({
        dossierId: p.dossier_id,
        overlapt:
          startMs >= new Date(p.start_dt).getTime() && startMs < new Date(p.eind_dt).getTime(),
        bewakingscode: p.bewakingscode,
      })),
      dossiers: dossierInfo,
      instellingen,
    })

    if (opties.dryRun) {
      oordelen.push({
        parkingId: r.id,
        kosten: r.parkeerkosten,
        locatie: r.parkeerlocatie,
        uitkomst: oordeel.uitkomst,
        zekerheid: oordeel.zekerheid,
        score: oordeel.kandidaten[0]?.score ?? 0,
        dossiernummer: oordeel.kandidaten[0]?.dossiernummer ?? null,
        signalen: oordeel.signalen,
      })
    }

    if (oordeel.uitkomst === 'negeer') {
      res.genegeerd++
      continue
    }

    teVerversen.push(r.id)
    const beste = oordeel.kandidaten[0] ?? null
    const bedrag = r.parkeerkosten ?? 0

    const status =
      oordeel.uitkomst === 'zeker'
        ? 'bevestigd'
        : oordeel.uitkomst === 'prive'
          ? 'prive'
          : oordeel.uitkomst === 'geen_kandidaat'
            ? 'geen_kandidaat'
            : 'voorstel'

    if (oordeel.uitkomst === 'zeker') res.automatisch++
    else if (oordeel.uitkomst === 'prive') res.prive++
    else if (oordeel.uitkomst === 'geen_kandidaat') res.geenKandidaat++
    else res.werkvoorraad++

    teSchrijven.push({
      parkingId: r.id,
      // Bij privé of geen kandidaat blijft het dossier leeg; de rij bestaat dan
      // alleen om vast te leggen dát er gekeken is.
      dossierId: oordeel.uitkomst === 'zeker' || oordeel.uitkomst === 'werkvoorraad'
        ? (beste?.dossierId ?? null)
        : null,
      bedrag,
      aandeel: 1,
      status,
      zekerheid: oordeel.zekerheid,
      score: beste?.score ?? 0,
      signalen: oordeel.signalen,
      medewerkerId,
      uluUserId: r.user_id_ulu,
      tripId: r.trip_id,
      datum: matchdag,
      bewakingscode: beste?.bewakingscode ?? null,
      pslId: beste?.pslId ?? null,
      bron: oordeel.uitkomst === 'zeker' ? 'automatisch' : null,
    })
  }

  if (opties.dryRun) {
    res.oordelen = oordelen
    res.duurMs = Date.now() - start
    return res
  }

  // ── 4. Wegschrijven ────────────────────────────────────────────────────────
  // Verwijderen-en-opnieuw-invoegen in plaats van bijwerken, omdat het aantal
  // rijen per parkeerkost kan wijzigen (een verdeling over twee dossiers). De
  // where-clausules zijn de vangrail: een bevestigd of geboekt oordeel valt
  // buiten de deleteset, ook al staat het in dezelfde batch.
  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    for (let i = 0; i < teVerversen.length; i += 500) {
      await client.query(
        `delete from public.parkeer_toewijzingen
          where parking_id = any($1::uuid[])
            and status in ('voorstel','prive','geen_kandidaat')
            and bevestigd_op is null
            and bouw7_ticket_id is null
            and bouw7_status = 'niet_verzonden'`,
        [teVerversen.slice(i, i + 500)],
      )
    }

    for (let i = 0; i < teSchrijven.length; i += 500) {
      const chunk = teSchrijven.slice(i, i + 500)
      const waarden: unknown[] = []
      const plekken: string[] = []
      chunk.forEach((t, idx) => {
        const o = idx * 15
        plekken.push(
          `($${o + 1}::uuid, $${o + 2}::uuid, $${o + 3}::numeric, $${o + 4}::numeric, $${o + 5}, $${o + 6}, ` +
            `$${o + 7}::smallint, $${o + 8}::jsonb, $${o + 9}::uuid, $${o + 10}::bigint, $${o + 11}::uuid, ` +
            `$${o + 12}::date, $${o + 13}, $${o + 14}::integer, $${o + 15})`,
        )
        waarden.push(
          t.parkingId, t.dossierId, t.bedrag, t.aandeel, t.status, t.zekerheid,
          t.score, JSON.stringify(t.signalen), t.medewerkerId, t.uluUserId, t.tripId,
          t.datum, t.bewakingscode, t.pslId, t.bron,
        )
      })

      await client.query(
        `insert into public.parkeer_toewijzingen
           (parking_id, dossier_id, bedrag, aandeel, status, zekerheid, score, signalen,
            medewerker_id, ulu_user_id, trip_id, datum, bewakingscode, bouw7_psl_id, bevestiging_bron)
         values ${plekken.join(', ')}
         on conflict do nothing`,
        waarden,
      )
    }

    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }

  res.overgeslagenBeoordeeld = rijen.length - teVerversen.length - res.genegeerd
  res.duurMs = Date.now() - start
  return res
}
