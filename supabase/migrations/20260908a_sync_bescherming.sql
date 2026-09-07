-- Bescherming van EVA-invoer tegen de Bouw7-lees-sync.
--
-- Het patroon bestond al voor relaties/contactpersonen (20260807f): `handmatige_velden`
-- houdt per rij bij welke kolommen in EVA zijn bewerkt; de sync schrijft die kolommen
-- niet meer over. Dossiers, medewerkers en bankgegevens misten die kolom, waardoor de
-- ochtendsync EVA-wijzigingen (werkadres via objectkoppeling, opmerkingen bij een
-- aanvraag, medewerker-adres, IBAN) stilzwijgend terugzette.
--
-- Alle wijzigingen zijn additief met een default, dus veilig om vóór de code-deploy toe
-- te passen.

alter table public.dossiers
  add column if not exists handmatige_velden text[] not null default '{}'::text[];
comment on column public.dossiers.handmatige_velden is
  'Kolommen die in EVA zijn bewerkt en die de Bouw7-sync niet meer overschrijft. Voor rollen en statussen: alleen gevuld zolang de write-back naar Bouw7 nog niet is gelukt.';

alter table public.medewerkers
  add column if not exists handmatige_velden text[] not null default '{}'::text[];
comment on column public.medewerkers.handmatige_velden is
  'Kolommen die in EVA zijn bewerkt en die de Bouw7-sync niet meer overschrijft.';

alter table public.relatie_bankgegevens
  add column if not exists handmatige_velden text[] not null default '{}'::text[];
comment on column public.relatie_bankgegevens.handmatige_velden is
  'Kolommen die in EVA zijn bewerkt en die de Bouw7-sync niet meer overschrijft (alleen iban komt uit Bouw7).';

-- De functie op een contactpersoon-koppeling komt uit Bouw7 (jobTitle) maar is in EVA
-- bewerkbaar; de sync deed een volledige upsert en zette hem elke ochtend terug.
alter table public.contactpersoon_organisaties
  add column if not exists functie_handmatig boolean not null default false;
comment on column public.contactpersoon_organisaties.functie_handmatig is
  'True als de functie in EVA is gezet; de Bouw7-sync laat hem dan staan.';

-- Een in EVA verplaatst Bouw7-planitem wordt naar Bouw7 teruggeschreven. Mislukt dat,
-- dan staat deze vlag aan en slaat de planning-sync de herbouw van het dossier over tot
-- de herkansing slaagt — anders zou de rebuild de EVA-wijziging wissen.
alter table public.planning_items
  add column if not exists bouw7_write_pending boolean not null default false;
comment on column public.planning_items.bouw7_write_pending is
  'True zolang een EVA-wijziging op dit planitem nog niet naar Bouw7 is weggeschreven.';

create index if not exists planning_items_bouw7_write_pending_idx
  on public.planning_items (activiteit_id) where bouw7_write_pending;
