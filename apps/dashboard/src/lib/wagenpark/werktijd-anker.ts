/**
 * Eén bestuurder-dag opnieuw door R9/R10 halen, nadat iemand de bepalende rit
 * heeft aangewezen of die keuze weer heeft ingetrokken.
 *
 * Waarom niet gewoon de hele compliance-run: die leest een jaar aan ritten,
 * draait alle regels en herschrijft duizenden rijen. Dat duurt te lang voor een
 * klik in het zijpaneel, en hij stuurt bovendien pushmeldingen voor nieuwe
 * signalen — je wilt niet dat het bijstellen van één dag de hele ploeg een
 * melding bezorgt.
 *
 * Waarom dan niet de nieuwe minuten zelf uitrekenen: dan staat dezelfde
 * rekenregel op twee plekken en lopen ze vroeg of laat uiteen. In plaats
 * daarvan draaien we de ECHTE regel over een context van één dag. De uitkomst
 * is per definitie hetzelfde als wat de nachtelijke controle er straks van
 * maakt.
 */
import 'server-only'
import { Compliance, type UluTrip, type HandboekRegel } from '@everts/wagenpark-core'
import type { AfwezigInfo, RoosterInfo, UluUserInfo } from '@everts/wagenpark-core/compliance'
import { pgQuery, getPgPool } from '@/lib/wagenpark/db'
import { ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'

export type WerktijdRegel = 'R9' | 'R10'

/**
 * Zelfde fingerprint als de volledige compliance-run (`compliance-kern.ts`).
 *
 * Moet exact gelijk blijven: wijkt hij af, dan ziet de nachtelijke run onze
 * rijen niet als "dezelfde bevinding" en zet hij er duplicaten naast.
 */
function fingerprint(regelCode: string, tripId: string, ernst: string): string {
  return `${regelCode}|trip|${tripId}|${ernst}`
}

/**
 * De R9/R10-bevindingen van één bestuurder-dag opnieuw opbouwen en wegschrijven.
 *
 * Geeft het id terug van de bevinding die de tijd bepaalt (het anker), zodat het
 * zijpaneel meteen op de nieuwe rij verder kan. `null` betekent dat er voor die
 * dag geen signaal meer overblijft.
 */
export async function herbouwWerktijdDag(
  userIdUlu: string,
  datum: string,
  regelCode: WerktijdRegel,
): Promise<{ ankerBevindingId: string | null }> {
  const [trips, users, regelRij] = await Promise.all([
    pgQuery<UluTrip & { rit_type_effectief?: 'zakelijk' | 'prive' | null }>(
      `select id::text, voertuig_id::text, medewerker_id::text, bestuurder_naam_raw,
              user_id_ulu, kenteken, start_datum::text, start_tijd::text, stop_tijd::text,
              adres_start, adres_stop,
              afstand_km::float     as afstand_km,
              duur_seconden,
              km_stand_start::float as km_stand_start,
              km_stand_stop::float  as km_stand_stop,
              rit_type_ulu, rit_type_berekend::text,
              ${ritTypeEffectiefSql('t')} as rit_type_effectief,
              score, import_batch_id::text, created_at::text
         from public.ulu_trips t
        where t.user_id_ulu::text = $1 and t.start_datum = $2::date`,
      [userIdUlu, datum],
    ),
    pgQuery<UluUserInfo>(
      `select id, volledige_naam, bijtelling_betaald,
              prive_limiet_km_jaar, zakelijk_verwacht_km_jaar,
              medewerker_id::text as medewerker_id,
              werktijd_start::text, werktijd_eind::text
         from public.ulu_users where id::text = $1`,
      [userIdUlu],
    ),
    pgQuery<HandboekRegel>('select * from public.handboek_regels where code = $1', [regelCode]),
  ])

  const user = users[0]
  if (!user) return { ankerBevindingId: null }

  const [roostersRaw, afwezigheidRaw, keuzes] = await Promise.all([
    user.medewerker_id
      ? pgQuery<RoosterInfo>(
          `select medewerker_id::text as medewerker_id, geldig_vanaf::text, geldig_tot::text,
                  werkdagen, dagstart::text, dageind::text
             from public.medewerker_roosters
            where medewerker_id = $1::uuid
            order by geldig_vanaf desc`,
          [user.medewerker_id],
        )
      : Promise.resolve([] as RoosterInfo[]),
    user.medewerker_id
      ? pgQuery<AfwezigInfo>(
          `select medewerker_id::text as medewerker_id, type::text, start_datum::text,
                  eind_datum::text, start_tijd::text, eind_tijd::text
             from public.medewerker_afwezigheid
            where medewerker_id = $1::uuid
              and start_datum <= $2::date and eind_datum >= $2::date`,
          [user.medewerker_id, datum],
        )
      : Promise.resolve([] as AfwezigInfo[]),
    pgQuery<{ trip_id: string }>(
      `select trip_id::text as trip_id
         from public.werktijd_anker_keuzes
        where user_id_ulu::text = $1 and datum = $2::date and regel_code = $3`,
      [userIdUlu, datum, regelCode],
    ),
  ])

  // Zelfde substitutie als de volledige run: verlof en handmatige overrides
  // bepalen of een rit zakelijk is, en alleen zakelijke ritten tellen mee.
  const tripsEffectief = trips.map((t) => ({
    ...t,
    rit_type_berekend: t.rit_type_effectief ?? t.rit_type_berekend,
  })) as UluTrip[]

  const roosters = new Map<string, RoosterInfo[]>()
  if (user.medewerker_id) roosters.set(user.medewerker_id, roostersRaw)
  const afwezigheid = new Map<string, AfwezigInfo[]>()
  if (user.medewerker_id) afwezigheid.set(user.medewerker_id, afwezigheidRaw)

  const ankerKeuzes = new Map<string, string>()
  if (keuzes[0]) {
    ankerKeuzes.set(
      Compliance.ankerKeuzeSleutel(
        userIdUlu as unknown as UluTrip['user_id_ulu'],
        datum,
        regelCode,
      ),
      keuzes[0].trip_id,
    )
  }

  const regel = regelCode === 'R9' ? Compliance.R9 : Compliance.R10
  const bevindingen = regel.runner({
    periodeStart: datum,
    periodeEind: datum,
    trips: tripsEffectief,
    voertuigen: new Map(),
    uluUsers: new Map([[user.id, user]]),
    roosters,
    afwezigheid,
    ankerKeuzes,
    regels: new Map(regelRij[0] ? [[regelCode, regelRij[0]]] : []),
  })

  const rijen = bevindingen.map((b) => ({
    ...b,
    fingerprint: fingerprint(b.regel_code, b.trip_id as string, b.ernst),
  }))
  const ankerFingerprint =
    rijen.find((b) => (b.data as { keten_rol?: string } | undefined)?.keten_rol === 'anker')
      ?.fingerprint ?? null

  // De afhandelstatus van de dag verhuist mee. Verzet je het anker van een dag
  // die al verklaard was, dan blijft hij verklaard — anders zou hij ongemerkt
  // terugkomen in de werklijst van iemand die hem juist net had afgedaan.
  const bestaand = await pgQuery<{ status: string }>(
    `select b.status::text as status
       from public.compliance_bevindingen b
      where b.regel_code = $1 and b.periode_start = $2::date and b.bron = 'automatisch'
        and b.data->>'user_id_ulu' = $3 and b.data->>'keten_rol' = 'anker'
      limit 1`,
    [regelCode, datum, userIdUlu],
  )
  const status = bestaand[0]?.status ?? 'open'

  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    // Alles van deze dag dat de regel niet opnieuw oplevert moet weg, ongeacht
    // status. De volledige run laat afgehandelde rijen bewust staan, maar hier
    // is juist de oude anker-rij het probleem: laat je die staan, dan telt de
    // dag twee keer mee met twee verschillende aantallen minuten.
    await client.query(
      `delete from public.compliance_bevindingen
        where regel_code = $1
          and periode_start = $2::date
          and bron = 'automatisch'
          and data->>'user_id_ulu' = $3
          and (fingerprint is null or not (fingerprint = any($4::text[])))`,
      [regelCode, datum, userIdUlu, rijen.map((b) => b.fingerprint)],
    )

    if (rijen.length > 0) {
      await client.query(
        `insert into public.compliance_bevindingen
           (fingerprint, regel_code, voertuig_id, medewerker_id, trip_id,
            periode_start, periode_eind, ernst, omschrijving, data, status)
         select * from unnest(
           $1::text[], $2::text[], $3::uuid[], $4::uuid[], $5::uuid[],
           $6::date[], $7::date[], $8::bevinding_ernst[], $9::text[], $10::jsonb[],
           $11::bevinding_status[]
         )
         on conflict (fingerprint) do update set
           omschrijving  = excluded.omschrijving,
           data          = excluded.data,
           ernst         = excluded.ernst,
           voertuig_id   = excluded.voertuig_id,
           trip_id       = excluded.trip_id,
           periode_start = excluded.periode_start,
           periode_eind  = excluded.periode_eind,
           status        = excluded.status,
           updated_at    = now()`,
        [
          rijen.map((b) => b.fingerprint),
          rijen.map((b) => b.regel_code),
          rijen.map((b) => b.voertuig_id),
          rijen.map((b) => b.medewerker_id),
          rijen.map((b) => b.trip_id),
          rijen.map((b) => b.periode_start),
          rijen.map((b) => b.periode_eind),
          rijen.map((b) => b.ernst),
          rijen.map((b) => b.omschrijving),
          rijen.map((b) => JSON.stringify(b.data ?? {})),
          rijen.map(() => status),
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

  if (!ankerFingerprint) return { ankerBevindingId: null }
  const nieuw = await pgQuery<{ id: string }>(
    'select id::text as id from public.compliance_bevindingen where fingerprint = $1',
    [ankerFingerprint],
  )
  return { ankerBevindingId: nieuw[0]?.id ?? null }
}
