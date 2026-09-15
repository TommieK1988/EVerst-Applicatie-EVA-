-- Welke dossiers "indirecte uren" zijn, voor de goedkeurroute.
--
-- Op zo'n project is gewerkte tijd geen projectwerk maar overhead: voorbereiden, calculeren,
-- kantoorwerk. Er valt voor een projectleider inhoudelijk niets te beoordelen, dus gaan ook die
-- uren naar de eigen goedkeurder van de medewerker (en anders naar de standaard uit
-- `niet_gewerkt_goedkeurder_id`). Op een écht project blijft gewerkte tijd bij de teamleider en
-- de projectleider -- dat is hun budget.
--
-- Bewust een expliciete lijst en geen titel-match: "heet het toevallig Indirecte uren" is geen
-- autorisatieregel, en een hernoemd project zou de route stilletjes verleggen.
alter table public.uren_instellingen
  add column if not exists indirecte_dossier_ids uuid[] not null default '{}';

comment on column public.uren_instellingen.indirecte_dossier_ids is
  'Dossiers waarop ALLE uren (ook gewerkte) naar de eigen goedkeurder van de medewerker gaan in plaats van naar de teamleider/projectleider.';

-- De vijf bestaande indirecte-urenprojecten als startwaarde.
update public.uren_instellingen
   set indirecte_dossier_ids = coalesce((
     select array_agg(id) from public.dossiers where titel ilike 'indirecte uren%'
   ), '{}')
 where id = true
   and indirecte_dossier_ids = '{}';
