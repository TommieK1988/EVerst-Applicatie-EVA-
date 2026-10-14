-- Planning bestaat voortaan ook op mobiel: Lezen opent daar de agenda van een collega
-- (/m/planning?wie=…). Je eigen agenda blijft voor iedereen zonder recht bereikbaar.
--
-- Standaard voor het kantoor wel, voor Uitvoering niet: de vakmannen zien alleen hun
-- eigen agenda. Uitzonderingen per persoon gaan via het rechtenscherm.
-- Alleen de v2-kolom: de platte spiegel `standaard_rechten` kent geen mobiel kanaal.
update public.medewerker_afdelingen
set rechten = jsonb_set(rechten, '{mobiel,modules,planning}', '"lezen"', true)
where naam in ('Directie', 'Projectbureau', 'Ondersteunend')
  and rechten ? 'mobiel'
  and rechten -> 'mobiel' ? 'modules'
  and not (rechten -> 'mobiel' -> 'modules' ? 'planning');
