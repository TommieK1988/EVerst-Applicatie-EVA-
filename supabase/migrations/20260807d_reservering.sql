-- Winkelbudget wordt Reservering.
--
-- Het begrip is verbreed: niet alleen een budgetpot bij een leverancier (winkel), maar ook
-- een reservering voor een onderaannemer waar géén opdracht naartoe gaat — transport, een
-- chemisch toilet — terwijl de inkoopfactuur wél ergens op geboekt moet kunnen worden.
-- Daarom een echte hernoeming en niet alleen een ander label: `is_winkel` zou blijvend
-- verwarren nu het ook onderaanneming dekt.
alter table public.werkbegroting_componenten
  rename column is_winkel to is_reservering;

comment on column public.werkbegroting_componenten.is_reservering is
  'Reservering: wordt als één samengevatte budgetregel vastgelegd i.p.v. per artikel, en gaat zonder document/mail naar de leverancier of onderaannemer.';

-- Op de bestelling zelf, zodat de schermen en het versturen niet telkens uit de
-- componenten hoeven af te leiden wat dit is. Server-side eigendom, net als sjabloon_id
-- en de bouw7_*-velden: `maakBestellingInBouw7` zet hem, de client-sync raakt hem niet aan.
alter table public.werkbegroting_bestellingen
  add column if not exists is_reservering boolean not null default false;

comment on column public.werkbegroting_bestellingen.is_reservering is
  'Reservering: vastgelegd in Bouw7 (contract + leverbon) zonder document en zonder mail.';
