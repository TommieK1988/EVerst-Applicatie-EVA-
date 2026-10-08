-- Servicedesk: accorderen per opdracht/bestelling in plaats van per werkbegroting.
-- Een bon heeft geen werkbegroting om te beoordelen; de beslissing gaat over één opdracht aan
-- één partij. `object_id` is dan werkbegroting_bestellingen.id, `object_hash` de componenten-hash
-- op het moment van goedkeuren (wijzigt de opdracht daarna, dan is het akkoord vervallen).
alter table public.goedkeuringen drop constraint goedkeuringen_object_type_check;
alter table public.goedkeuringen add constraint goedkeuringen_object_type_check
  check (object_type = any (array['werkbegroting'::text, 'offerte'::text, 'bestelling'::text]));
