-- Inkooporders en OA-contracten krijgen een beheerbare opmaak.
--
-- Tot nu toe werd het document dat de leverancier krijgt in code getekend
-- (lib/bouw7/bestelling-pdf.ts). Vanaf nu kiest de inkoper een Word-sjabloon uit
-- document_sjablonen, zodat de opmaak zonder code aan te passen te beheren is en
-- er meerdere varianten naast elkaar kunnen bestaan.
--
-- Het verzendmoment zelf blijft staan waar het stond: verstuurd_op/_door/_naar
-- uit 20260805a. Alleen de keuze van de opmaak komt erbij.

alter table public.werkbegroting_bestellingen
  add column if not exists sjabloon_id uuid references public.document_sjablonen(id) on delete set null;

comment on column public.werkbegroting_bestellingen.sjabloon_id is
  'Gekozen documentsjabloon (document_sjablonen) voor de inkooporder/het OA-contract. Leeg = de eerste bruikbare van de juiste soort wordt gebruikt.';

create index if not exists werkbegroting_bestellingen_sjabloon_idx
  on public.werkbegroting_bestellingen (sjabloon_id)
  where sjabloon_id is not null;

-- Het verstuurde document wordt geregistreerd in dossier_documenten (dezelfde
-- archief-/registratielaag als de brieven), met een verwijzing terug naar de
-- bestelling zodat het bij de order te herleiden is.
alter table public.dossier_documenten
  add column if not exists bestelling_id uuid references public.werkbegroting_bestellingen(id) on delete set null;

comment on column public.dossier_documenten.bestelling_id is
  'Gevuld bij een inkooporder-/OA-contractdocument: de bestelling waar het bij hoort.';

create index if not exists dossier_documenten_bestelling_idx
  on public.dossier_documenten (bestelling_id)
  where bestelling_id is not null;

-- Opruimen: een eerdere versie van deze migratie zette hier een eigen verzendmoment
-- neer. Dat dupliceert verstuurd_op/_naar uit 20260805a, dus het gaat er weer af.
alter table public.werkbegroting_bestellingen
  drop column if exists document_verzonden_op,
  drop column if exists document_verzonden_naar;
