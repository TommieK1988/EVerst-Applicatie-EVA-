'use server'

/**
 * De ritten van één bestuurderdag ophalen voor het zijpaneel.
 *
 * Waarom: het signaal zegt "22 minuten te laat", maar in een gesprek met de
 * medewerker is de vervolgvraag altijd dezelfde — waar kwam dat vandaan? Dat
 * antwoord staat in de ritten: hoe laat vertrok de auto, waar is onderweg
 * gestopt, en welke rit bepaalde uiteindelijk de aankomst.
 *
 * Op (bestuurder, datum) en niet op bevinding-id, want het paneel gaat inmiddels
 * ook open op werkdagen waar géén signaal op zit. Die dagen hebben geen
 * bevinding, maar wel ritten — en juist daar wil je kunnen zien waarom iemand
 * volgens de auto maar zes uur aanwezig was.
 *
 * Op aanvraag geladen (pas als het zijpaneel opengaat) en niet met de lijst mee:
 * een kwartaal telt honderden dagen en de ritten daarvan meesturen zou de
 * pagina onnodig zwaar maken terwijl je er per keer één bekijkt.
 */

import { pgQuery } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'
import { magPriveRittenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'

export type DagRit = {
  id: string
  start_tijd: string | null
  stop_tijd: string | null
  adres_start: string | null
  adres_stop: string | null
  afstand_km: number | null
  duur_seconden: number | null
  kenteken: string | null
  /** Effectief rit-type, inclusief verlof- en handmatige overrides. */
  rit_type: string
  /**
   * De handmatig gezette waarde, of null als de automatische classificatie
   * geldt. Nodig om te laten zien dát er handmatig is ingegrepen, en om die
   * ingreep te kunnen terugdraaien.
   */
  rit_type_override: 'zakelijk' | 'prive' | null
  /** Hoort bij de ritketen die de aankomst bepaalde (R9). */
  in_keten_aankomst: boolean
  /** Hoort bij de ritketen die het vertrek bepaalde (R10). */
  in_keten_vertrek: boolean
  /** Deze rit bepaalt de aankomsttijd. */
  bepaalt_aankomst: boolean
  /** Deze rit bepaalt de vertrektijd. */
  bepaalt_vertrek: boolean
}

export type RittenBijDag =
  | {
      ok: true
      ritten: DagRit[]
      /**
       * De bepalende rit is door een mens aangewezen in plaats van door de
       * ketenregel gevonden, per regel. Bepaalt of het paneel een "terug naar
       * automatisch" aanbiedt; komt uit `werktijd_anker_keuzes` en niet uit de
       * bevinding, want de keuze is de bron en de bevinding slechts de uitkomst.
       */
      handmatigAnker: { R9: boolean; R10: boolean }
    }
  | { ok: false; error: string }

/**
 * De ritten van die dag, met per rit of hij de aankomst of het vertrek bepaalt.
 *
 * De ankermarkering komt uit de bevindingen van die dag: `keten_trip_ids` zegt
 * welke ritten bij de bepalende verplaatsing hoorden en `trip_id` welke rit de
 * tijd droeg. Is er die dag geen signaal, dan blijven die vlaggen leeg — er is
 * dan niets te herrekenen en het paneel toont alleen de ritten.
 */
const RITTEN_SQL = `
  with ankers as (
    select b.regel_code,
           b.trip_id,
           array(select jsonb_array_elements_text(b.data->'keten_trip_ids')) as keten
      from public.compliance_bevindingen b
     where b.regel_code in ('R9', 'R10')
       and b.data->>'keten_rol' = 'anker'
       and b.periode_start = $2::date
       and b.data->>'user_id_ulu' = $1
  )
  select t.id::text                       as id,
         t.start_tijd::text               as start_tijd,
         t.stop_tijd::text                as stop_tijd,
         t.adres_start,
         t.adres_stop,
         t.afstand_km::float              as afstand_km,
         t.duur_seconden,
         t.kenteken,
         (${ritTypeEffectiefSql('t')})::text as rit_type,
         t.rit_type_override::text        as rit_type_override,
         coalesce((select t.id::text = any(a.keten) from ankers a where a.regel_code = 'R9'), false)  as in_keten_aankomst,
         coalesce((select t.id::text = any(a.keten) from ankers a where a.regel_code = 'R10'), false) as in_keten_vertrek,
         coalesce((select t.id = a.trip_id from ankers a where a.regel_code = 'R9'), false)           as bepaalt_aankomst,
         coalesce((select t.id = a.trip_id from ankers a where a.regel_code = 'R10'), false)          as bepaalt_vertrek
    from public.ulu_trips t
   where t.user_id_ulu::text = $1
     and t.start_datum = $2::date
   order by t.start_tijd, t.stop_tijd
`

export async function laadRittenVanDag(
  user_id_ulu: string,
  datum: string,
): Promise<RittenBijDag> {
  await vereisRecht('wagenpark', 'lezen')
  // Zelfde poort als de rest van dit scherm: ritten met een naam en adressen
  // erbij zijn privacygevoelig, en `pgQuery` gaat buiten RLS om.
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen ritten inzien.' }
  }
  if (!/^\d+$/.test(user_id_ulu) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return { ok: false, error: 'Onbekende bestuurder of datum.' }
  }

  try {
    const [ritten, keuzes] = await Promise.all([
      pgQuery<DagRit>(RITTEN_SQL, [user_id_ulu, datum]),
      pgQuery<{ regel_code: string }>(
        `select regel_code
           from public.werktijd_anker_keuzes
          where user_id_ulu::text = $1 and datum = $2::date`,
        [user_id_ulu, datum],
      ),
    ])

    return {
      ok: true,
      ritten,
      handmatigAnker: {
        R9: keuzes.some((k) => k.regel_code === 'R9'),
        R10: keuzes.some((k) => k.regel_code === 'R10'),
      },
    }
  } catch (e: unknown) {
    // Fail-soft: het paneel blijft bruikbaar om af te vinken, ook als de ritten
    // er even niet bij komen.
    return { ok: false, error: e instanceof Error ? e.message : 'Ritten niet op te halen' }
  }
}
