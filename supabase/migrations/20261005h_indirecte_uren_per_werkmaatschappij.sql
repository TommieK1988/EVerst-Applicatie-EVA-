-- Indirecte uren: per werkmaatschappij één project voor gewerkte overhead en één voor
-- niet-gewerkte uren (verlof, ziek, tijd voor tijd, feestdag). De app kiest het juiste project
-- zelf; de medewerker ziet ze niet meer in de projectkeuze.
--
-- `indirect_uren_dossier_id` blijft het project voor de NIET-gewerkte uren (dat was het al).

alter table public.bedrijfsgegevens
  add column if not exists indirect_gewerkt_dossier_id uuid
    references public.dossiers(id) on delete restrict;

comment on column public.bedrijfsgegevens.indirect_gewerkt_dossier_id is
  'Project voor gewerkte overhead (kantoortijd) van medewerkers van deze werkmaatschappij.';

-- Afdelingen die nooit een project kiezen: al hun gewerkte uren zijn overhead.
alter table public.uren_instellingen
  add column if not exists indirecte_afdelingen text[] not null
    default array['Projectbureau', 'Ondersteunend', 'Directie'];

-- Schildersbedrijf Everts B.V. bestaat in Bouw7 (vestiging 5513, code 5) maar nog niet in EVA;
-- kantoor boekt er gewerkte uren op (20265.00183).
insert into public.bedrijfsgegevens (naam, type, code, bouw7_branch_id, parent_id)
select 'Schildersbedrijf Everts B.V.', 'werkmaatschappij', '005', 5513,
       (select id from public.bedrijfsgegevens where type = 'organisatie' order by created_at limit 1)
where not exists (select 1 from public.bedrijfsgegevens where bouw7_branch_id = 5513);

-- De projecten per werkmaatschappij. Onderhoudsschilders wees voor verlof naar het gewerkte
-- overheadproject (00146); dat wordt het niet-gewerkte project 00516.
update public.bedrijfsgegevens b set
  indirect_uren_dossier_id = (select id from public.dossiers where dossiernummer = '20261.00516'),
  indirect_gewerkt_dossier_id = (select id from public.dossiers where dossiernummer = '20261.00146')
where b.bouw7_branch_id = 5249;

update public.bedrijfsgegevens b set
  indirect_uren_dossier_id = (select id from public.dossiers where dossiernummer = '20267.00517'),
  indirect_gewerkt_dossier_id = (select id from public.dossiers where dossiernummer = '20267.00147')
where b.bouw7_branch_id = 5250;

update public.bedrijfsgegevens b set
  indirect_gewerkt_dossier_id = (select id from public.dossiers where dossiernummer = '20265.00183')
where b.bouw7_branch_id = 5513;

-- Werkmaatschappij afleiden uit Bouw7: op welk niet-gewerkt project boekte iemand zijn verlof
-- en ziekte? Alleen waar het veld nog leeg is; niemand boekte op beide.
with logs as (
  select d.dossiernummer, (i->'employee'->>'id') as b7
  from public.bouw7_snapshots s
  join public.dossiers d on d.id = s.dossier_id,
  jsonb_array_elements(s.payload->'items') i
  where s.soort = 'hour_logs' and d.dossiernummer in ('20261.00516', '20267.00517')
), keuze as (
  select m.id as medewerker_id,
    case when bool_or(l.dossiernummer = '20261.00516') then 5249 else 5250 end as branch
  from public.medewerkers m
  join logs l on l.b7 = m.bouw7_id::text
  where m.werkmaatschappij_id is null
  group by m.id
)
update public.medewerkers m
set werkmaatschappij_id = (select id from public.bedrijfsgegevens where bouw7_branch_id = k.branch)
from keuze k
where k.medewerker_id = m.id;
