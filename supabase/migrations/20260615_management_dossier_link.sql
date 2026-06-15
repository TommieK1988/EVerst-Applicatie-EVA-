-- =====================================================================
-- Management: koppeling naar het EVA-dossier
-- dossier_id     = dossiers.id (voor "open in nieuw tabblad")
-- dossier_sectie = 'opdrachten' | 'servicedesk' (route-prefix)
-- De management-sync neemt alleen opdracht- en servicedesk-dossiers op.
-- =====================================================================

alter table public.management_projecten
  add column if not exists dossier_id uuid,
  add column if not exists dossier_sectie text;

create index if not exists mp_dossier_id_idx on public.management_projecten(dossier_id);
