'use server'

/**
 * De ritten van één dag ophalen bij een werktijd-signaal.
 *
 * Waarom: het signaal zegt "22 minuten te laat", maar in een gesprek met de
 * medewerker is de vervolgvraag altijd dezelfde — waar kwam dat vandaan? Dat
 * antwoord staat in de ritten: hoe laat vertrok de auto, waar is onderweg
 * gestopt, en welke rit bepaalde uiteindelijk de aankomst.
 *
 * Op aanvraag geladen (pas als het zijpaneel opengaat) en niet met de lijst mee:
 * een kwartaal telt honderden signalen en de ritten daarvan meesturen zou de
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
  /** Hoort bij de ritketen die de aankomst of het vertrek bepaalde. */
  in_keten: boolean
  /** De rit die de tijd zélf bepaalde (het anker van die keten). */
  is_anker: boolean
}

export type RittenBijBevinding =
  | {
      ok: true
      ritten: DagRit[]
      /**
       * De bepalende rit is door een mens aangewezen in plaats van door de
       * ketenregel gevonden. Bepaalt of het paneel een "terug naar automatisch"
       * aanbiedt; komt uit `werktijd_anker_keuzes` en niet uit de bevinding, want
       * de keuze is de bron en de bevinding slechts de uitkomst ervan.
       */
      handmatigAnker: boolean
    }
  | { ok: false; error: string }

export async function laadRittenBijBevinding(
  bevinding_id: string,
): Promise<RittenBijBevinding> {
  await vereisRecht('wagenpark', 'lezen')
  // Zelfde poort als de rest van dit scherm: ritten met een naam en adressen
  // erbij zijn privacygevoelig, en `pgQuery` gaat buiten RLS om.
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen ritten inzien.' }
  }

  try {
    const ritten = await pgQuery<DagRit>(
      `
      with bev as (
        select b.trip_id,
               b.periode_start,
               (b.data->>'user_id_ulu')                                     as user_id_ulu,
               array(select jsonb_array_elements_text(b.data->'keten_trip_ids')) as keten
          from public.compliance_bevindingen b
         where b.id = $1::uuid
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
             (t.id::text = any(bev.keten))    as in_keten,
             (t.id = bev.trip_id)             as is_anker
        from bev
        join public.ulu_trips t
          on t.user_id_ulu::text = bev.user_id_ulu
         and t.start_datum = bev.periode_start
       order by t.start_tijd, t.stop_tijd
      `,
      [bevinding_id],
    )
    const keuzes = await pgQuery<{ aantal: number }>(
      `select count(*)::int as aantal
         from public.compliance_bevindingen b
         join public.werktijd_anker_keuzes k
           on k.user_id_ulu::text = (b.data->>'user_id_ulu')
          and k.datum = b.periode_start
          and k.regel_code = b.regel_code
        where b.id = $1::uuid`,
      [bevinding_id],
    )

    return { ok: true, ritten, handmatigAnker: (keuzes[0]?.aantal ?? 0) > 0 }
  } catch (e: unknown) {
    // Fail-soft: het paneel blijft bruikbaar om af te vinken, ook als de ritten
    // er even niet bij komen.
    return { ok: false, error: e instanceof Error ? e.message : 'Ritten niet op te halen' }
  }
}
