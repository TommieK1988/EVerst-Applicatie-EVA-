-- ============================================================================
-- De omgezette acties heten voortaan Projectbezoek.
--
-- Hoort bij 20260907d, waarin 38 openstaande kwaliteitsronde-acties projectbezoeken
-- werden. De knop zei toen "Projectbezoek starten" terwijl de actie nog
-- "Kwaliteitscontrole" heette; dat leest als twee verschillende dingen.
--
-- Alleen het eerste woord wordt vervangen, niet de hele titel. De rest draagt
-- betekenis die je kwijtraakt als je hem overschrijft:
--   "Kwaliteitscontrole (2/4)"  -> "Projectbezoek (2/4)"    (herhaling 2 van 4)
--   "Kwaliteitsronde week 35"   -> "Projectbezoek week 35"  (eigen aanduiding)
--
-- Het suffix "(n/m)" wordt sowieso door deadlines.ts opnieuw opgebouwd uit de titel
-- van de sjabloontaak. Omdat die hier meegaat, komen de herhalingen bij de
-- eerstvolgende drain op dezelfde naam uit — geen verschuiving achteraf.
--
-- BEWUST NIET HERNOEMD: 17 acties met "Kwaliteitscontrole" in de titel die op
-- `gereed` staan. Die zijn destijds als kwaliteitscontrole uitgevoerd; ze nu
-- omdopen zou dat verleden herschrijven. Ze dragen `bezoek_ronde` niet, dus de
-- voorwaarde hieronder laat ze met rust.
--
-- Uitgevoerd op productie op 7 sep 2026.
-- ============================================================================

update public.tasks
   set titel = regexp_replace(titel, '^(Kwaliteitscontrole|Kwaliteitsronde)', 'Projectbezoek'),
       updated_at = now()
 where bezoek_ronde
   and titel ~ '^(Kwaliteitscontrole|Kwaliteitsronde)';
