-- Meerwerk in het klantportaal gaat vanzelf aan zodra er meerwerk is.
-- Toegepast op 2026-09-03 via de Supabase MCP.
--
-- Alle portaalonderdelen staan standaard uit en worden bewust aangezet. Voor
-- meerwerk werkt dat averechts: een meerwerkregel ontstaat vaak tijdens de
-- uitvoering, en juist dan wil de opdrachtgever hem zien -- zeker als er een
-- akkoord van hem gevraagd wordt. Wachten tot iemand eraan denkt de schakelaar
-- om te zetten betekent in de praktijk dat het blijft liggen.
--
-- WAAROM ER EEN TWEEDE KOLOM BIJ MOET. Een botte trigger zou een bewust
-- uitgezette schakelaar telkens weer aanzetten: de Bouw7-sync maakt geregeld
-- meerwerkregels aan (bron = 'bouw7_line'), dus dat gebeurt vanzelf en zonder
-- dat iemand het merkt. Met deze kolom onthouden we dat er een mens over
-- geoordeeld heeft, en dat oordeel wint van de automatiek.
alter table public.portaal_dossier_instellingen
  add column if not exists toon_meerwerk_handmatig boolean not null default false;

comment on column public.portaal_dossier_instellingen.toon_meerwerk_handmatig is
  'Iemand heeft toon_meerwerk zelf gezet. Zolang dit false is, zet de trigger het aan zodra er een meerwerkregel bij komt.';

-- ---------------------------------------------------------------------------
-- De trigger
-- ---------------------------------------------------------------------------
-- Bestaat er nog geen instellingenrij voor dit dossier, dan wordt hij aangemaakt
-- met alleen meerwerk aan. `actief` blijft op de standaard false staan, dus er
-- wordt niets zichtbaar: het dossier moet nog steeds bewust worden opengezet.
-- Dit zorgt er alleen voor dat meerwerk er dan meteen bij staat.
create or replace function public.portaal_meerwerk_activeren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portaal_dossier_instellingen (dossier_id, toon_meerwerk)
  values (new.dossier_id, true)
  on conflict (dossier_id) do update
    set toon_meerwerk = true,
        gewijzigd_op = now()
    where public.portaal_dossier_instellingen.toon_meerwerk_handmatig = false;

  return null;
end
$$;

comment on function public.portaal_meerwerk_activeren() is
  'Zet toon_meerwerk aan zodra een dossier een meerwerkregel krijgt, tenzij iemand die schakelaar zelf heeft gezet.';

drop trigger if exists tg_portaal_meerwerk_activeren on public.meerwerk_regels;
create trigger tg_portaal_meerwerk_activeren
  after insert on public.meerwerk_regels
  for each row
  execute function public.portaal_meerwerk_activeren();

-- ---------------------------------------------------------------------------
-- Eenmalig bijtrekken
-- ---------------------------------------------------------------------------
-- Dossiers die nu al meerwerk hebben, krijgen het onderdeel alsnog aan. Alleen
-- waar niemand de schakelaar zelf heeft gezet -- op dit moment is dat overal het
-- geval, maar de voorwaarde staat erbij zodat deze migratie ook klopt als hij
-- later nog eens wordt toegepast.
insert into public.portaal_dossier_instellingen (dossier_id, toon_meerwerk)
select distinct m.dossier_id, true
from public.meerwerk_regels m
on conflict (dossier_id) do update
  set toon_meerwerk = true
  where public.portaal_dossier_instellingen.toon_meerwerk_handmatig = false;
