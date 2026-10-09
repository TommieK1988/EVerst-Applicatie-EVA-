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
import { magWerktijdenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import type { UluTrip } from '@everts/wagenpark-core'
import { ankerKeuzeSleutel } from '@everts/wagenpark-core/compliance'
import {
  bepaalDagAnkers,
  KETEN_PAUZE_SQL,
  KETEN_PAUZE_STANDAARD,
} from '@/lib/wagenpark/werktijd-aanwezigheid'

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
 * De ritten van die dag. Welke rit de aankomst en het vertrek bepaalt rekenen
 * we hierna uit met `bepaalDagAnkers` — niet uit de bevindingen. Die bestaan
 * alleen op dagen mét een afwijking, en dan stond er op een gewone dag geen
 * enkele rit gemarkeerd: de logica achter "aangekomen om 07:32" was nergens te
 * zien en niet te corrigeren.
 */
const RITTEN_SQL = `
  select t.id::text                       as id,
         t.start_tijd::text               as start_tijd,
         t.stop_tijd::text                as stop_tijd,
         t.adres_start,
         t.adres_stop,
         t.afstand_km::float              as afstand_km,
         t.duur_seconden,
         t.kenteken,
         (${ritTypeEffectiefSql('t')})::text as rit_type,
         t.rit_type_override::text        as rit_type_override
    from public.ulu_trips t
   where t.user_id_ulu::text = $1
     and t.start_datum = $2::date
   order by t.start_tijd, t.stop_tijd
`

type KaleRit = Omit<
  DagRit,
  'in_keten_aankomst' | 'in_keten_vertrek' | 'bepaalt_aankomst' | 'bepaalt_vertrek'
>

export async function laadRittenVanDag(
  user_id_ulu: string,
  datum: string,
): Promise<RittenBijDag> {
  await vereisRecht('wagenpark', 'lezen')
  // Zelfde poort als de rest van dit scherm: ritten met een naam en adressen
  // erbij zijn privacygevoelig, en `pgQuery` gaat buiten RLS om.
  if (!(await magWerktijdenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen ritten inzien.' }
  }
  if (!/^\d+$/.test(user_id_ulu) || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return { ok: false, error: 'Onbekende bestuurder of datum.' }
  }

  try {
    const [kaal, keuzes, ketenPauzes] = await Promise.all([
      pgQuery<KaleRit>(RITTEN_SQL, [user_id_ulu, datum]),
      pgQuery<{ regel_code: string; trip_id: string }>(
        `select regel_code, trip_id::text as trip_id
           from public.werktijd_anker_keuzes
          where user_id_ulu::text = $1 and datum = $2::date`,
        [user_id_ulu, datum],
      ),
      pgQuery<{ code: string; keten_pauze_min: number | null }>(KETEN_PAUZE_SQL, []),
    ])

    const ankerKeuzes = new Map<string, string>()
    for (const k of keuzes) {
      ankerKeuzes.set(
        ankerKeuzeSleutel(user_id_ulu as unknown as UluTrip['user_id_ulu'], datum, k.regel_code),
        k.trip_id,
      )
    }
    const pauze = (code: string) =>
      ketenPauzes.find((r) => r.code === code)?.keten_pauze_min ?? KETEN_PAUZE_STANDAARD

    // Alleen zakelijke ritten tellen mee in de werkdag, net als in R9/R10.
    const { aankomst, vertrek } = bepaalDagAnkers(
      kaal.filter((r) => r.rit_type === 'zakelijk') as unknown as UluTrip[],
      { userId: user_id_ulu, datum, pauzeR9: pauze('R9'), pauzeR10: pauze('R10'), ankerKeuzes },
    )
    const ketenAankomst = new Set(aankomst?.keten.map((t) => t.id) ?? [])
    const ketenVertrek = new Set(vertrek?.keten.map((t) => t.id) ?? [])

    const ritten: DagRit[] = kaal.map((r) => ({
      ...r,
      in_keten_aankomst: ketenAankomst.has(r.id),
      in_keten_vertrek: ketenVertrek.has(r.id),
      bepaalt_aankomst: aankomst?.anker.id === r.id,
      bepaalt_vertrek: vertrek?.anker.id === r.id,
    }))

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
