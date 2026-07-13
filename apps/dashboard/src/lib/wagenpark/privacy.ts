import 'server-only'
import { getCurrentMedewerker, getEffectieveRechten, isBeheerder } from '@/lib/auth/rechten'
import { DIRECTIE_AFDELING } from '@/lib/goedkeuring/types'

/**
 * SQL-fragment dat het effectieve rit-type bepaalt, inclusief verlof-override.
 *
 * Ritten op een dag (en tijd) waarop de gekoppelde medewerker verlof had,
 * gelden altijd als 'prive' — ongeacht de automatische classificatie. De keten
 * trip → medewerker loopt via `ulu_trips.user_id_ulu → ulu_users.medewerker_id`.
 *
 * `alias` is de tabel-alias van `ulu_trips` in de omringende query (bijv. `t`).
 * De waarde komt uitsluitend uit code (geen gebruikersinvoer), dus interpolatie
 * is hier veilig.
 */
export function ritTypeEffectiefSql(alias = 't'): string {
  return `case
    when exists (
      select 1
        from public.ulu_users uu
        join public.medewerker_afwezigheid ma on ma.medewerker_id = uu.medewerker_id
       where uu.id = ${alias}.user_id_ulu
         and ma.type = 'verlof'
         and ${alias}.start_datum between ma.start_datum and ma.eind_datum
         and (ma.start_tijd is null or ${alias}.start_tijd >= ma.start_tijd)
         and (ma.eind_tijd  is null or ${alias}.start_tijd <= ma.eind_tijd)
    ) then 'prive'
    else coalesce(${alias}.rit_type_override, ${alias}.rit_type_berekend)
  end`
}

/**
 * Mag de huidige gebruiker privé-ritten zien?
 *
 * Alleen Directie (afdeling = 'Directie') en beheerders
 * (instellingen = beheren). Overige wagenpark-gebruikers zien uitsluitend
 * effectief-zakelijke ritten. Reads in dit domein gaan via de directe
 * Postgres-pooler (RLS geldt daar niet), dus deze check bepaalt het
 * privacyfilter dat expliciet in de SQL wordt toegevoegd.
 */
export async function magPriveRittenZien(): Promise<boolean> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return false
  const rechten = await getEffectieveRechten(medewerker)
  if (isBeheerder(rechten)) return true
  return (medewerker.afdeling ?? '').trim().toLowerCase() === DIRECTIE_AFDELING.toLowerCase()
}
