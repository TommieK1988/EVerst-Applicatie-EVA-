import 'server-only'
import { getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang } from '@/lib/auth/rechten'

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
    -- Handmatige correctie gaat vóór de rooster-regel: incidenteel werken op een
    -- vrije dag moet als zakelijk gemarkeerd kunnen blijven.
    when ${alias}.rit_type_override is not null then ${alias}.rit_type_override
    -- Rijdt de bestuurder op een dag die volgens zijn rooster geen werkdag is
    -- (bv. standaard vrij op vrijdag), dan is de rit privé. Het weekend wordt al
    -- door de DB-trigger afgevangen; dit vangt de individuele vrije dagen.
    when exists (
      select 1
        from public.ulu_users uu
        join public.medewerker_roosters mr on mr.medewerker_id = uu.medewerker_id
       where uu.id = ${alias}.user_id_ulu
         and ${alias}.start_datum >= mr.geldig_vanaf
         and (mr.geldig_tot is null or ${alias}.start_datum <= mr.geldig_tot)
         and not (extract(isodow from ${alias}.start_datum)::smallint = any(mr.werkdagen))
    ) then 'prive'
    else ${alias}.rit_type_berekend
  end`
}

/**
 * Mag de huidige gebruiker privacygevoelige wagenpark-data zien — privé-ritten
 * én de Werktijden-pagina?
 *
 * Gestuurd door het recht `wagenpark_prive` (niveau lezen volstaat). Dat recht
 * krijgt Directie standaard via de seed-migratie; een beheerder passeert sowieso
 * (`heeftModuleToegang` geeft een beheerder overal toegang), dus wie de rechten
 * beheert kan zichzelf nooit buitensluiten. Overige wagenpark-gebruikers zien
 * uitsluitend effectief-zakelijke ritten en niet de Werktijden-pagina.
 *
 * Reads in dit domein gaan via de directe Postgres-pooler (RLS geldt daar niet),
 * dus deze check bepaalt het privacyfilter dat expliciet in de SQL wordt
 * toegevoegd. De functienaam blijft `magPriveRittenZien` omdat alle bestaande
 * call-sites hem zo aanroepen; de betekenis is verbreed naar "privacygevoelige
 * wagenpark-data".
 */
export async function magPriveRittenZien(): Promise<boolean> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return false
  const rechten = await getEffectieveRechten(medewerker)
  return heeftModuleToegang(rechten, 'wagenpark_prive', 'lezen')
}
