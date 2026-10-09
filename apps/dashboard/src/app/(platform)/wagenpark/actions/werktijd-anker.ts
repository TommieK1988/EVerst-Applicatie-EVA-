'use server'

/**
 * De bepalende rit van een werktijd-signaal verzetten — of die keuze weer
 * intrekken.
 *
 * R9 en R10 leiden de aankomst en het vertrek af uit ritketens. Dat klopt
 * meestal, maar de registratie is niet de werkelijkheid: een pauze van zes
 * minuten knipt een keten in tweeën, een vergeten privémarkering trekt de
 * eerste keten naar voren, en soms weet alleen de leidinggevende dat het
 * depotbezoek van kwart voor vier gewoon werk was. Tot nu toe kon je zo'n
 * signaal alleen wegzetten als "verklaard"; het getal bleef dan staan en
 * vertekende elk totaal eronder.
 *
 * Wie hier een rit aanwijst, verandert dus niet het oordeel maar het feit. De
 * keuze gaat naar `werktijd_anker_keuzes` en de regels rekenen erop verder —
 * ook bij de nachtelijke controle.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { magWerktijdenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import { pgQuery } from '@/lib/wagenpark/db'
import { herbouwWerktijdDag, type WerktijdRegel } from '@/lib/wagenpark/werktijd-anker'

export type AnkerResultaat =
  | { ok: true; bevinding_id: string | null }
  | { ok: false; error: string }

/** Auth-user-id van de ingelogde gebruiker; zie werktijd-afhandeling.ts. */
async function huidigeAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

function ververs(): void {
  revalidatePath('/wagenpark/ritten')
  revalidatePath('/wagenpark/bestuurders', 'layout')
  revalidatePath('/wagenpark/dashboard')
}

/**
 * Wijs een rit aan als de rit die de aankomst (R9) of het vertrek (R10) van een
 * werkdag bepaalt.
 *
 * Op (bestuurder, datum) en niet op een signaal: ook een dag zónder afwijking
 * heeft een aankomst en een vertrek, en die moet je evengoed kunnen rechtzetten
 * — een dag die op tijd lijkt doordat de verkeerde rit telde, is net zo fout.
 * De regels laten een handmatig aangewezen dag altijd staan (desnoods met nul
 * minuten), zodat de keuze zichtbaar en omkeerbaar blijft.
 *
 * Geeft het id terug van de bevinding die daarna de tijd draagt, of null als de
 * dag geen signaal oplevert (geen werkdag volgens het rooster, verlof).
 */
export async function kiesWerktijdAnkerOpDag(
  user_id_ulu: string,
  datum: string,
  regel_code: WerktijdRegel,
  trip_id: string,
  toelichting = '',
): Promise<AnkerResultaat> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magWerktijdenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden aanpassen.' }
  }
  if (regel_code !== 'R9' && regel_code !== 'R10') {
    return { ok: false, error: 'Onbekende werktijdregel.' }
  }

  // De rit moet van deze bestuurder op deze dag zijn, én zakelijk. Een privérit
  // telt niet mee in de werkdag-regels: de keuze zou stil worden genegeerd en de
  // dag zou onveranderd terugkomen, wat eruitziet alsof de knop niets deed.
  const ritten = await pgQuery<{ zakelijk: boolean }>(
    `select ((${ritTypeEffectiefSql('t')})::text = 'zakelijk') as zakelijk
       from public.ulu_trips t
      where t.id = $1::uuid
        and t.user_id_ulu::text = $2
        and t.start_datum = $3::date`,
    [trip_id, user_id_ulu, datum],
  )
  const rit = ritten[0]
  if (!rit) return { ok: false, error: 'Die rit hoort niet bij deze bestuurder op deze dag.' }
  if (!rit.zakelijk) {
    return {
      ok: false,
      error: 'Een privérit kan de werktijd niet bepalen. Markeer hem eerst als zakelijk.',
    }
  }

  await pgQuery(
    `insert into public.werktijd_anker_keuzes
       (user_id_ulu, datum, regel_code, trip_id, toelichting, gebruiker_id)
     values ($1::bigint, $2::date, $3, $4::uuid, nullif($5::text, ''), $6::uuid)
     on conflict (user_id_ulu, datum, regel_code) do update set
       trip_id      = excluded.trip_id,
       toelichting  = excluded.toelichting,
       gebruiker_id = excluded.gebruiker_id`,
    [user_id_ulu, datum, regel_code, trip_id, toelichting.trim(), await huidigeAuthUserId()],
  )

  return herbouw(user_id_ulu, datum, regel_code)
}

/** Terug naar wat de ketenregel er zelf van maakt. */
export async function herstelWerktijdAnkerOpDag(
  user_id_ulu: string,
  datum: string,
  regel_code: WerktijdRegel,
): Promise<AnkerResultaat> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magWerktijdenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden aanpassen.' }
  }
  if (regel_code !== 'R9' && regel_code !== 'R10') {
    return { ok: false, error: 'Onbekende werktijdregel.' }
  }

  await pgQuery(
    `delete from public.werktijd_anker_keuzes
      where user_id_ulu::text = $1 and datum = $2::date and regel_code = $3`,
    [user_id_ulu, datum, regel_code],
  )

  return herbouw(user_id_ulu, datum, regel_code)
}

async function herbouw(
  user_id_ulu: string,
  datum: string,
  regel_code: WerktijdRegel,
): Promise<AnkerResultaat> {
  try {
    const { ankerBevindingId } = await herbouwWerktijdDag(user_id_ulu, datum, regel_code)
    ververs()
    return { ok: true, bevinding_id: ankerBevindingId }
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'De dag kon niet worden herberekend.',
    }
  }
}

/**
 * Een rit op zakelijk of privé zetten vanuit het werktijden-zijpaneel, en de dag
 * meteen opnieuw laten doorrekenen.
 *
 * Dit is niet hetzelfde als de toggle op de rittenlijst. Daar verandert alleen
 * de rit; hier verandert de rit én alles wat eruit volgt. De werkdag-regels
 * kijken uitsluitend naar zakelijke ritten, dus een vergeten privémarkering
 * trekt de eerste keten naar voren en levert een aankomst van kwart voor zeven
 * op. Zet je die rit hier op privé zonder te herrekenen, dan blijft het paneel
 * de oude aankomsttijd tonen naast een rit die inmiddels privé heet — precies
 * het soort tegenspraak waar niemand meer uitkomt.
 *
 * Beide regels worden herbouwd: één rit kan zowel de heenreis als de terugreis
 * van kleur laten verschieten.
 *
 * `null` zet de rit terug op de automatische classificatie.
 */
export async function zetRitTypeVoorWerkdag(
  user_id_ulu: string,
  datum: string,
  trip_id: string,
  nieuwType: 'zakelijk' | 'prive' | null,
): Promise<AnkerResultaat> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magWerktijdenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden aanpassen.' }
  }

  // De rit moet echt van deze bestuurder op deze dag zijn. Zonder die controle
  // zou een id uit een ander dossier hier de classificatie kunnen omzetten.
  const eigen = await pgQuery<{ aantal: number }>(
    `select count(*)::int as aantal
       from public.ulu_trips t
      where t.id = $1::uuid and t.user_id_ulu::text = $2 and t.start_datum = $3::date`,
    [trip_id, user_id_ulu, datum],
  )
  if ((eigen[0]?.aantal ?? 0) === 0) {
    return { ok: false, error: 'Die rit hoort niet bij deze bestuurder op deze dag.' }
  }

  await pgQuery(
    `update public.ulu_trips
        set rit_type_override  = $1::rit_type_berekend,
            rit_type_handmatig = $1 is not null
      where id = $2::uuid`,
    [nieuwType, trip_id],
  )

  try {
    // Beide regels opnieuw, en R9 als laatste zodat het paneel op de aankomst
    // verder kan als die er nog is.
    const vertrek = await herbouwWerktijdDag(user_id_ulu, datum, 'R10')
    const aankomst = await herbouwWerktijdDag(user_id_ulu, datum, 'R9')
    ververs()
    return { ok: true, bevinding_id: aankomst.ankerBevindingId ?? vertrek.ankerBevindingId }
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'De dag kon niet worden herberekend.',
    }
  }
}
