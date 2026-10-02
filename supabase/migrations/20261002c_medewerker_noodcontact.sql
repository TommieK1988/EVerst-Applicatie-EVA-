-- Noodcontact per medewerker, overgenomen uit het Bouw7-maatwerkveld
-- `caNoodcontact+Nummer`. Vrije tekst (naam, relatie en telefoonnummer in één veld,
-- vaak over meerdere regels), dus bewust één tekstkolom en geen opgesplitste velden.
-- Getoond onder "Mijn gegevens" in EVA Mobiel.
alter table public.medewerkers add column if not exists noodcontact text;
