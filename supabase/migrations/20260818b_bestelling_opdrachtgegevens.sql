-- Aanvullende gegevens bij een inkoop/opdracht, ingevuld in het opdrachtvenster.
--
-- Tot nu toe kon je bij het aanmaken alleen een omschrijving, een lever-/startmoment en een
-- betaalafspraak kwijt. Voor een opdracht aan een onderaannemer is dat te mager: daar horen een
-- termijnschema, specifieke afspraken en soms een afwijkend werkadres bij (een deel van het werk
-- op één huisadres binnen een dossier met meerdere locaties).
--
-- Alles additief en nullable: bestaande bestellingen blijven werken en vallen terug op het
-- standaard termijnschema uit het documentsjabloon.

alter table public.werkbegroting_bestellingen
  -- Verwachte oplevering. De start staat al in `levering_datum` / `levering_tekst`.
  add column if not exists oplever_datum date,
  -- Betaaltermijnen: [{ "omschrijving": "1e termijn — bij opdracht", "pct": 20 }, …].
  -- Null = het standaardschema van de overeenkomst van onderaanneming (20/20/50/10).
  -- LET OP: dit zijn géén Bouw7-contracttermijnen. Die zijn daar bezet door de bestelregels
  -- (één regel kan maar aan één termijn hangen); dit schema leeft in EVA en op het document,
  -- en gaat als tekst mee in de betaalafspraak.
  add column if not exists termijnschema jsonb,
  -- Opmerkingen en specifieke afspraken die de partij op de opdracht te lezen krijgt.
  -- Anders dan `interne_notitie`, die bewust binnenshuis blijft.
  add column if not exists afspraken text,
  -- Inhouding op de termijnen tot alle opleverpunten weg zijn (bedrijfsstandaard 5%).
  add column if not exists inhouding_pct numeric(5,2),
  -- Boeteclausule bij te late oplevering, als vrije tekst zodat de afspraak per opdracht kan.
  add column if not exists boete_tekst text,
  -- Afwijkend werk-/afleveradres. Leeg = het werkadres van het dossier.
  add column if not exists werkadres text;

comment on column public.werkbegroting_bestellingen.termijnschema is
  'Betaaltermijnen [{omschrijving, pct}] voor document en betaalafspraak; null = standaardschema. Geen Bouw7-contracttermijnen.';
comment on column public.werkbegroting_bestellingen.afspraken is
  'Specifieke afspraken die op de opdracht aan de partij komen (in tegenstelling tot interne_notitie).';
comment on column public.werkbegroting_bestellingen.werkadres is
  'Afwijkend werk-/afleveradres voor deze opdracht; leeg = werkadres van het dossier.';
