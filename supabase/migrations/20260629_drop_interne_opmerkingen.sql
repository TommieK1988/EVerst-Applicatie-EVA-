-- Het losse veld interne_opmerkingen is vervangen door het Notities-blok (dossier_notities).
-- Was door 0 dossiers gebruikt; veilig te droppen nadat alle code-referenties verwijderd zijn.
-- Volgorde: pas toe ná 20260629_dossier_notities_en_referentie.sql.
alter table public.dossiers drop column if exists interne_opmerkingen;
