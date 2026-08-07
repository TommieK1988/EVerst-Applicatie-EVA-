-- Werkbegroting-goedkeuring: accordering bewaken op kostprijs in plaats van op
-- de volledige regelinhoud.
--
-- Tot nu toe brak élke wijziging aan een geaccordeerde regel de goedkeuring — ook
-- een andere leverancier of een andere bewakingscode, terwijl dat de opdracht geen
-- cent duurder maakt. De goedkeuring gaat over geld, dus leggen we per regel het
-- geaccordeerde bedrag vast en vergelijken we daarop.
--
-- Additief en nullable: `regel_hash` blijft bestaan en wordt bij elk akkoord nog
-- steeds meegeschreven, zodat een deploy met de oude vergelijking (productie tijdens
-- de uitrol, of een preview-omgeving op dezelfde database) gewoon blijft werken.
-- Bestaande snapshots hebben nog geen bedrag; de applicatie vult dat alsnog in
-- zodra blijkt dat zo'n regel nog ongewijzigd is (dan is de huidige kostprijs ook
-- de geaccordeerde kostprijs).

alter table public.werkbegroting_goedkeuring_regels
  add column if not exists kosten_centen bigint;

comment on column public.werkbegroting_goedkeuring_regels.kosten_centen is
  'Geaccordeerde kostprijs van de regel in centen (hoeveelheid x norm x tarief over de actieve componenten). Null = snapshot van vóór deze kolom; dan geldt regel_hash.';
