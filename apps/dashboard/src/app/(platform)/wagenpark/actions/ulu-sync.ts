'use server'

import { revalidatePath } from 'next/cache'
import type { PoolClient } from 'pg'
import { UluApi, RDW, type UluTripInput } from '@everts/wagenpark-core'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'
import { runComplianceAction } from './compliance'

export type UluSyncResult = {
  ok: boolean
  error?: string
  voertuigenGezien?: number
  voertuigenNieuw?: number
  voertuigenRdwOpgehaald?: number
  gebruikersGecached?: number
  tripsOpgehaald?: number
  tripsNieuw?: number
  tripsOvergeslagen?: number
  tripsVerrijkt?: number
  bevindingen?: number
  duur_ms?: number
  importBatchId?: string
}

/**
 * Eén sync-run: login bij ULU, haal alle voertuigen op, haal per voertuig
 * de trips uit de opgegeven periode, persist via directe Postgres-connectie.
 *
 * @param periodeStart  ISO datum YYYY-MM-DD (default: 1 jan huidig jaar)
 * @param periodeEind   ISO datum YYYY-MM-DD (default: vandaag)
 */
export async function syncUluAction(
  periodeStart?: string,
  periodeEind?: string,
): Promise<UluSyncResult> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const t0 = Date.now()

  const email = process.env.ULU_EMAIL
  const password = process.env.ULU_PASSWORD
  const baseUrl = process.env.ULU_API_BASE_URL

  if (!email || !password) {
    return {
      ok: false,
      error:
        'ULU_EMAIL en ULU_PASSWORD ontbreken in .env.local — vul die aan met de credentials die je van ULU hebt gekregen.',
    }
  }

  const from = periodeStart ?? `${new Date().getFullYear()}-01-01`
  const to = periodeEind ?? new Date().toISOString().slice(0, 10)

  let client: PoolClient | null = null

  try {
    client = await getPgPool().connect()
    // --- Step 1: login + fetch vehicles + company_users ---------------
    // company_users bevat ALLE bestuurders (incl. degenen zonder recente trip);
    // /users is een kleinere subset. We gebruiken company_users als bron.
    const ulu = new UluApi.UluClient({ email, password, baseUrl })
    const [vehicles, companyUsers] = await Promise.all([
      ulu.listVehicles(),
      ulu.listCompanyUsers().catch((err) => {
        console.warn('[ULU sync] /company_users lookup faalde:', err)
        return [] as UluApi.UluCompanyUser[]
      }),
    ])
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]))
    // Ontdubbel op user.id — zelfde user kan meerdere company_user rows hebben
    const userMap = new Map<number, UluApi.UluUser>()
    for (const cu of companyUsers) {
      if (!cu.user?.id) continue
      if (cu.deleted) continue
      const existing = userMap.get(cu.user.id)
      if (!existing) userMap.set(cu.user.id, cu.user)
    }
    const users: UluApi.UluUser[] = [...userMap.values()]

    // Cache users in ulu_users (voor latere medewerker-koppeling)
    let gebruikersGecached = 0
    for (const u of users) {
      const naam = UluApi.composeUserName(u)
      const res = await client.query(
        `insert into public.ulu_users (id, email, firstname, lastname, volledige_naam, laatst_gezien)
           values ($1, $2, $3, $4, $5, now())
           on conflict (id) do update set
             email          = excluded.email,
             firstname      = excluded.firstname,
             lastname       = excluded.lastname,
             volledige_naam = excluded.volledige_naam,
             laatst_gezien  = now(),
             updated_at     = now()`,
        [u.id, u.email ?? null, u.firstname ?? null, u.lastname ?? null, naam],
      )
      gebruikersGecached += res.rowCount ?? 0
    }

    // Backfill-teller: wordt later gevuld nadat trips zijn geüpsert.
    let tripsVerrijkt = 0

    // --- Step 2: upsert voertuigen in onze DB -------------------------
    let voertuigenNieuw = 0
    for (const v of vehicles) {
      const mapped = UluApi.mapApiVehicleToVoertuig(v)
      if (!mapped) continue
      const res = await client.query(
        `insert into public.voertuigen (kenteken, merk, model)
           values ($1, $2, $3)
           on conflict (kenteken) do update set
             merk  = coalesce(excluded.merk,  public.voertuigen.merk),
             model = coalesce(excluded.model, public.voertuigen.model)
           returning (xmax = 0) as inserted`,
        [mapped.kenteken, mapped.merk, mapped.model],
      )
      if (res.rows[0]?.inserted) voertuigenNieuw += 1
    }

    // Bouw map kenteken → voertuig_id
    const kentekens = vehicles.map((v) => v.license_plate).filter((k): k is string => !!k)
    const { rows: voertuigRijen } = await client.query<{ id: string; kenteken: string }>(
      `select id, kenteken from public.voertuigen where kenteken = any($1::text[])`,
      [kentekens.map((k) => k.toUpperCase().replace(/\s+/g, ''))],
    )
    const kentekenToId = new Map(voertuigRijen.map((r) => [r.kenteken, r.id]))

    // RDW-lookup voor voertuigen zonder rdw_data (best-effort, niet-blokkerend)
    let voertuigenRdwOpgehaald = 0
    const { rows: zonderRdw } = await client.query<{ id: string; kenteken: string }>(
      `select v.id, v.kenteken
         from public.voertuigen v
         left join public.rdw_data r on r.voertuig_id = v.id
        where v.id = any($1::uuid[])
          and (r.id is null or r.laatst_opgehaald < now() - interval '30 days')`,
      [[...kentekenToId.values()]],
    )
    for (const v of zonderRdw) {
      try {
        const rdw = await RDW.fetchRdwVoertuig(v.kenteken)
        if (rdw.voertuig) {
          const brandstofOmsch = RDW.brandstofOmschrijvingCombi(rdw.brandstof)
          const emissieklasse = RDW.emissieklasseCombi(rdw.brandstof, rdw.voertuig.milieuklasse_eg_goedkeuring_licht)
          const terugroepStatus = rdw.terugroep.length > 0
            ? rdw.terugroep.map((r) => r.omschrijving ?? r.referentiecode_rdw).filter(Boolean).join('; ').slice(0, 500)
            : null
          await client.query(
            `insert into public.rdw_data (
               voertuig_id, kenteken, apk_vervaldatum, massa_ledig_voertuig,
               massa_rijklaar, toegestane_maximum_massa, aantal_zitplaatsen,
               aantal_cilinders, cilinderinhoud, brandstof_omschrijving,
               milieuclassificatie, wok_status, vervaldatum_tenaamstelling,
               eerste_toelating, datum_tenaamstelling,
               trekgewicht_geremd, trekgewicht_ongeremd, catalogusprijs,
               terugroepactie_open, terugroepactie_status,
               rdw_raw, laatst_opgehaald
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             on conflict (kenteken) do update set
               apk_vervaldatum            = excluded.apk_vervaldatum,
               massa_ledig_voertuig       = excluded.massa_ledig_voertuig,
               massa_rijklaar             = excluded.massa_rijklaar,
               toegestane_maximum_massa   = excluded.toegestane_maximum_massa,
               aantal_zitplaatsen         = excluded.aantal_zitplaatsen,
               aantal_cilinders           = excluded.aantal_cilinders,
               cilinderinhoud             = excluded.cilinderinhoud,
               brandstof_omschrijving     = excluded.brandstof_omschrijving,
               milieuclassificatie        = excluded.milieuclassificatie,
               wok_status                 = excluded.wok_status,
               vervaldatum_tenaamstelling = excluded.vervaldatum_tenaamstelling,
               eerste_toelating           = excluded.eerste_toelating,
               datum_tenaamstelling       = excluded.datum_tenaamstelling,
               trekgewicht_geremd         = excluded.trekgewicht_geremd,
               trekgewicht_ongeremd       = excluded.trekgewicht_ongeremd,
               catalogusprijs             = excluded.catalogusprijs,
               terugroepactie_open        = excluded.terugroepactie_open,
               terugroepactie_status      = excluded.terugroepactie_status,
               rdw_raw                    = excluded.rdw_raw,
               laatst_opgehaald           = excluded.laatst_opgehaald,
               updated_at                 = now()`,
            [
              v.id, v.kenteken,
              RDW.parseRdwDate(rdw.voertuig.vervaldatum_apk),
              RDW.parseRdwNumber(rdw.voertuig.massa_ledig_voertuig),
              RDW.parseRdwNumber(rdw.voertuig.massa_rijklaar),
              RDW.parseRdwNumber(rdw.voertuig.toegestane_maximum_massa_voertuig),
              RDW.parseRdwNumber(rdw.voertuig.aantal_zitplaatsen),
              RDW.parseRdwNumber(rdw.voertuig.aantal_cilinders),
              RDW.parseRdwNumber(rdw.voertuig.cilinderinhoud),
              brandstofOmsch,
              emissieklasse,
              rdw.voertuig.wacht_op_keuren === 'Ja',
              RDW.parseRdwDate(rdw.voertuig.vervaldatum_tenaamstelling),
              RDW.parseRdwDate(rdw.voertuig.datum_eerste_toelating),
              RDW.parseRdwDate(rdw.voertuig.datum_tenaamstelling),
              RDW.parseRdwNumber(rdw.voertuig.maximum_trekken_massa_geremd),
              RDW.parseRdwNumber(rdw.voertuig.maximum_massa_trekken_ongeremd),
              RDW.parseRdwNumber(rdw.voertuig.catalogusprijs),
              rdw.terugroep.length > 0,
              terugroepStatus,
              JSON.stringify({ voertuig: rdw.voertuig, brandstof: rdw.brandstof, terugroep: rdw.terugroep }),
              rdw.opgehaald_op,
            ],
          )
          // Vul voertuig-velden aan waar leeg: brandstof, kleur, carrosserietype
          const rdwKleur = rdw.voertuig.eerste_kleur
          const schoneKleur = rdwKleur && !/n\.v\.t|niet geregistreerd/i.test(rdwKleur)
            ? rdwKleur.charAt(0).toUpperCase() + rdwKleur.slice(1).toLowerCase()
            : null
          await client.query(
            `update public.voertuigen
                set brandstof       = case
                                        when brandstof is null or brandstof = 'onbekend'
                                          then $1::brandstof_type
                                        else brandstof
                                      end,
                    kleur            = coalesce(kleur, $2),
                    carrosserietype  = coalesce(carrosserietype, $3)
              where id = $4`,
            [
              RDW.samengesteldeBrandstof(rdw.brandstof),
              schoneKleur,
              rdw.voertuig.inrichting ?? null,
              v.id,
            ],
          )
          voertuigenRdwOpgehaald += 1
        }
      } catch (err) {
        console.warn('[RDW] lookup faalde voor', v.kenteken, err)
      }
    }

    // --- Step 3: import batch aanmaken --------------------------------
    const { rows: batchRows } = await client.query<{ id: string }>(
      `insert into public.ulu_imports (bestandsnaam, bron, type, periode_start, periode_eind)
         values ($1, 'api', 'trips', $2, $3)
         returning id`,
      [`ULU API sync ${from} → ${to}`, from, to],
    )
    const importBatchId = batchRows[0].id

    // --- Step 4: trips ophalen per voertuig --------------------------
    let tripsOpgehaald = 0
    let tripsNieuw = 0
    let tripsOvergeslagen = 0
    const alleRows: (UluTripInput & { voertuig_id: string | null })[] = []

    for (const v of vehicles) {
      // ULU pagineert met ~75 trips per pagina en negeert date-parameters; de
      // client pagineert door tot de periode gedekt is en filtert client-side.
      // (Eerder stopte die paginering na pagina 1, waardoor er structureel maar
      // ~75 trips per voertuig binnenkwamen en hele maanden ontbraken.)
      const trips = await ulu.listTripsForVehicle(v.id, {
        minStartDatum: from,
        maxStartDatum: to,
      })
      tripsOpgehaald += trips.length
      for (const trip of trips) {
        const row = UluApi.mapApiTripToRow(trip, vehicleMap, userMap)
        if (!row) continue
        alleRows.push({
          ...row,
          voertuig_id: kentekenToId.get(row.kenteken) ?? null,
          import_batch_id: importBatchId,
        })
      }
    }

    // --- Step 5: dedupliceer op conflict-key (kenteken, start_datum, start_tijd)
    // Postgres weigert ON CONFLICT DO UPDATE als dezelfde rij 2× in één batch zit.
    // ULU kan af en toe dubbele trips teruggeven; we houden de 'volste' variant.
    const dedupMap = new Map<string, typeof alleRows[number]>()
    for (const r of alleRows) {
      const key = `${r.kenteken}|${r.start_datum}|${r.start_tijd}`
      const bestaand = dedupMap.get(key)
      if (!bestaand) {
        dedupMap.set(key, r)
        continue
      }
      // Kies de rij met meeste non-null velden (heuristiek voor 'volste')
      const score = (row: typeof r) =>
        [row.voertuig_id, row.bestuurder_naam_raw, row.user_id_ulu, row.adres_start,
         row.adres_stop, row.afstand_km, row.score].filter((v) => v != null).length
      if (score(r) > score(bestaand)) dedupMap.set(key, r)
    }
    const dedupedRows = Array.from(dedupMap.values())
    const duplicatesRemoved = alleRows.length - dedupedRows.length
    if (duplicatesRemoved > 0) {
      console.log(`[ULU sync] ${duplicatesRemoved} dubbele trips gefilterd`)
    }

    // --- Step 6: bulk upsert via directe Postgres --------------------
    // Batches van 500 rijen. Gebruikt parameterized values.
    const COLS = [
      'voertuig_id', 'medewerker_id', 'bestuurder_naam_raw', 'user_id_ulu', 'kenteken',
      'start_datum', 'start_tijd', 'stop_tijd', 'adres_start', 'adres_stop',
      'afstand_km', 'duur_seconden', 'km_stand_start', 'km_stand_stop',
      'rit_type_ulu', 'score', 'import_batch_id',
    ]

    for (let i = 0; i < dedupedRows.length; i += 500) {
      const chunk = dedupedRows.slice(i, i + 500)
      const values: unknown[] = []
      const placeholders: string[] = []
      chunk.forEach((r, idx) => {
        const offset = idx * COLS.length
        const ph = COLS.map((_, ci) => `$${offset + ci + 1}`).join(', ')
        placeholders.push(`(${ph})`)
        values.push(
          r.voertuig_id,
          null, // medewerker_id — koppelen we later apart
          r.bestuurder_naam_raw,
          r.user_id_ulu ?? null,
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
          r.import_batch_id,
        )
      })
      // Upsert met COALESCE: overschrijf alleen waar nieuwe data er is.
      // Zo worden bestaande rijen (die ooit zonder user_id_ulu/name werden
      // geïmporteerd) alsnog verrijkt bij latere syncs.
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

    // --- Step 6: backfill: nog-lege namen uit ulu_users invullen -----
    const backfill = await client.query(
      `update public.ulu_trips t
         set bestuurder_naam_raw = u.volledige_naam
         from public.ulu_users u
         where t.user_id_ulu = u.id
           and (t.bestuurder_naam_raw is null or t.bestuurder_naam_raw = '')
           and u.volledige_naam is not null`,
    )
    tripsVerrijkt = backfill.rowCount ?? 0

    // --- Step 7: aantal rijen in batch bijwerken ---------------------
    await client.query(
      `update public.ulu_imports set aantal_rijen = $1 where id = $2`,
      [tripsOpgehaald, importBatchId],
    )

    // --- Step 7: compliance-check ------------------------------------
    let bevindingen: number | undefined
    try {
      const cRes = await runComplianceAction()
      bevindingen = cRes.totaal
    } catch (err) {
      console.warn('[compliance] fout na sync', err)
    }

    revalidatePath('/wagenpark/dashboard')
    revalidatePath('/wagenpark/ritten')
    revalidatePath('/wagenpark/voertuigen')

    return {
      ok: true,
      voertuigenGezien: vehicles.length,
      voertuigenNieuw,
      voertuigenRdwOpgehaald,
      gebruikersGecached,
      tripsOpgehaald,
      tripsNieuw,
      tripsOvergeslagen,
      tripsVerrijkt,
      bevindingen,
      duur_ms: Date.now() - t0,
      importBatchId,
    }
  } catch (err) {
    console.error('[ULU sync] fout', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      duur_ms: Date.now() - t0,
    }
  } finally {
    client?.release()
  }
}
