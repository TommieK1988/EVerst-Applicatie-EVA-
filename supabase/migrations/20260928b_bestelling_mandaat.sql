-- Mandaatopdracht aan een onderaannemer.
--
-- Gevuld = deze opdracht gaat in regie, met dit bedrag (excl. btw) als bovengrens. Het document
-- en het Bouw7-contract krijgen dan vaste mandaatteksten (lib/everts-calc/mandaat.ts), zodat de
-- partij het bedrag niet als aanneemsom leest. Leeg = gewone opdracht tegen vaste prijs.
--
-- Server-side eigendom, net als sjabloon_id: alleen `maakBestellingInBouw7` schrijft hem.

alter table public.werkbegroting_bestellingen
  add column if not exists mandaat_bedrag numeric(12,2)
    check (mandaat_bedrag is null or mandaat_bedrag > 0);

comment on column public.werkbegroting_bestellingen.mandaat_bedrag is
  'Mandaat (excl. btw) bij een opdracht in regie; null = vaste prijs.';
