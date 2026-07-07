-- Offerte-versiebeheer + verzend-audit
--
-- parent_quote_id : verwijzing naar de oorspronkelijke offerte waarvan dit een kopie/versie is
-- versie          : oplopend versienummer (v1 = origineel)
-- verzonden_*     : audit van de e-mailverzending (Fase 3)

alter table quotes
  add column if not exists parent_quote_id uuid references quotes(id) on delete set null,
  add column if not exists versie integer not null default 1,
  add column if not exists verzonden_at timestamptz,
  add column if not exists verzonden_door uuid,
  add column if not exists verzonden_naar text;

create index if not exists idx_quotes_parent on quotes(parent_quote_id);
