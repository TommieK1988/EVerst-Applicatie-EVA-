-- =====================================================================
-- Wagenpark — werktijd per bestuurder + R9/R10 regels
-- =====================================================================
-- Voor R9 (te laat aankomen) en R10 (te vroeg vertrek) moeten we de
-- verwachte werkdag-tijden per bestuurder weten. Voor nu op ulu_users;
-- later komt dit uit de medewerkers-tabel zodra die is gebouwd.
-- =====================================================================

alter table public.ulu_users
  add column if not exists werktijd_start time,
  add column if not exists werktijd_eind time;

-- Seed R9/R10 regels
insert into public.handboek_regels (code, titel, beschrijving, drempel_config)
values
  ('R9',  'Te laat aankomen op werk',
          'Eerste rit van de werkdag begint na verwachte werktijd-start. Alleen actief voor bestuurders waar werktijd_start is ingesteld.',
          '{"marge_minuten":15}'::jsonb),
  ('R10', 'Te vroeg weg van werk',
          'Laatste rit van de werkdag eindigt ruim voor verwachte werktijd-eind. Alleen actief voor bestuurders waar werktijd_eind is ingesteld.',
          '{"marge_minuten":30}'::jsonb)
on conflict (code) do update set
  titel = excluded.titel,
  beschrijving = excluded.beschrijving,
  drempel_config = public.handboek_regels.drempel_config || excluded.drempel_config,
  gewijzigd_op = now();
