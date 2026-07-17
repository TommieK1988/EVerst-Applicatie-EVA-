-- =====================================================================
-- Actielijst-sjablonen: waar komt de streefdatum vandaan?
--
-- Het anker deadline_basis='streefdatum' (zie 20260717d) werkte alleen bij handmatig
-- activeren: daar typt iemand een datum in de dialoog. Op de trigger-route roept
-- verwerkActiveringen activeerSjabloon zónder streefdatum aan, waardoor die taken stil
-- géén deadline kregen.
--
-- Oplossing: het sjabloon bepaalt zélf wat zijn streefdatum is —
--   handmatig            → iemand vult hem in bij het activeren (huidig gedrag)
--   verwacht_startdatum  → dossiers.verwacht_startdatum (projectstart uit Bouw7)
--   verwacht_einddatum   → dossiers.verwacht_einddatum  (projecteind uit Bouw7)
--
-- task_lists.streefdatum bewaart de uitkomst op de geactiveerde lijst. Dat is nodig om
-- deadlines later te kunnen herberekenen: een handmatig ingetypte datum leefde tot nu toe
-- alleen in het request en was daarna nergens meer terug te vinden.
-- =====================================================================

alter table public.task_lists
  add column if not exists streefdatum_bron text not null default 'handmatig',
  add column if not exists streefdatum      date;

do $$ begin
  alter table public.task_lists add constraint task_lists_streefdatum_bron_check check (
    streefdatum_bron in ('handmatig','verwacht_startdatum','verwacht_einddatum')
  );
exception when duplicate_object then null; end $$;

comment on column public.task_lists.streefdatum_bron is
  'Sjabloon: waar de streefdatum vandaan komt. Op een geactiveerde lijst niet gebruikt — die leest streefdatum.';
comment on column public.task_lists.streefdatum is
  'Geactiveerde lijst: de streefdatum die gold. Bij bron<>handmatig door de herberekening bijgehouden.';

-- ── Trigger: verwachte project-datums gewijzigd → dossier op de wachtrij ──
-- Write-path-agnostisch, want deze datums komen uit de Bouw7-sync en niet uit de UI.
-- De exists-check houdt de wachtrij schoon: een bulk-sync raakt honderden dossiers, maar
-- alleen dossiers mét een geactiveerde actielijst hebben iets te herberekenen.

create or replace function public.tg_dossier_datums_deadline_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.task_lists tl
              where tl.dossier_id = new.id and tl.is_template = false) then
    insert into public.taak_deadline_herberekeningen (dossier_id, status, aangemaakt_op)
    values (new.id, 'pending', now())
    on conflict (dossier_id) do update
      set status        = 'pending',
          aangemaakt_op = now(),
          verwerkt_op   = null,
          foutmelding   = null;
  end if;
  return null;
end $$;

drop trigger if exists tg_dossier_datums_deadline_queue on public.dossiers;
create trigger tg_dossier_datums_deadline_queue
  after update of verwacht_startdatum, verwacht_einddatum
  on public.dossiers
  for each row
  when (old.verwacht_startdatum is distinct from new.verwacht_startdatum
     or old.verwacht_einddatum  is distinct from new.verwacht_einddatum)
  execute function public.tg_dossier_datums_deadline_queue();

create index if not exists task_lists_dossier_instantie_idx
  on public.task_lists (dossier_id) where is_template = false;
