-- Notificaties: dossiernaam als apart, schoon veld zodat de UI een 3-regel-opmaak
-- kan tonen (regel 1 = wat er gebeurd is, regel 2 = welk dossier, regel 3 = tijd).
-- Voorheen zat de dossiernaam verstopt in een volzin in `body`.
alter table public.notificaties add column if not exists dossier_id   uuid;
alter table public.notificaties add column if not exists dossier_naam text;
