-- =====================================================================
-- Werkdag-ondergrens voor rit-classificatie: 07:00 → 06:30
-- =====================================================================
-- De grens waarop een doordeweekse rit als zakelijk telt zat hardcoded in de
-- trigger tg_ulu_trips_bereken_rit_type (07:00-17:00). Die gaat naar 06:30, want
-- de vroege ochtendritten zijn in de praktijk werkritten.
--
-- Gevolg: 321 bestaande ritten tussen 06:30 en 07:00 op weekdagen (5.832 km,
-- 14 bestuurders, 5 jan t/m 21 jul) verschuiven van privé naar zakelijk. Dat
-- werkt door in de privé-km-totalen en dus in R1 en R2b (500 km/jaar-limiet).
-- Op verzoek met terugwerkende kracht toegepast.
--
-- Handmatige correcties (rit_type_override) blijven ongemoeid: die winnen
-- downstream via ritTypeEffectiefSql.
--
-- Let op: R1's drempel_config zei werktijd_start "06:00" terwijl de trigger
-- 07:00 gebruikte — die waarde deed dus niets. Hij wordt nu gelijkgetrokken met
-- de werkelijke grens, zodat het instellingen-scherm klopt.
-- =====================================================================

create or replace function public.tg_ulu_trips_bereken_rit_type()
returns trigger
language plpgsql
as $function$
declare
  v_dow int;  -- 0=zondag .. 6=zaterdag
begin
  v_dow := extract(dow from new.start_datum);
  if v_dow in (0, 6) then
    new.rit_type_berekend := 'prive';
  elsif new.start_tijd >= time '06:30' and new.start_tijd < time '17:00' then
    new.rit_type_berekend := 'zakelijk';
  else
    new.rit_type_berekend := 'prive';
  end if;
  return new;
end;
$function$;

-- Instelling gelijktrekken met de werkelijke grens.
update public.handboek_regels
   set drempel_config = drempel_config
         || '{"werktijd_start":"06:30","werktijd_eind":"17:00"}'::jsonb,
       gewijzigd_op = now()
 where code = 'R1';

-- Historie herberekenen. De update-trigger vuurt alleen bij wijziging van
-- start_datum/start_tijd, dus deze waarde blijft staan zoals hier gezet.
update public.ulu_trips t
   set rit_type_berekend = case
         when extract(dow from t.start_datum) in (0, 6) then 'prive'::rit_type_berekend
         when t.start_tijd >= time '06:30' and t.start_tijd < time '17:00'
           then 'zakelijk'::rit_type_berekend
         else 'prive'::rit_type_berekend
       end
 where t.rit_type_berekend is distinct from (case
         when extract(dow from t.start_datum) in (0, 6) then 'prive'::rit_type_berekend
         when t.start_tijd >= time '06:30' and t.start_tijd < time '17:00'
           then 'zakelijk'::rit_type_berekend
         else 'prive'::rit_type_berekend
       end);
