-- Changelog bijwerken: kolommen zijn nu Prognose | Gepland | Geboekt, en de
-- geplande uren worden herberekend uit werkdagen x contracturen (niet meer uit
-- het onbetrouwbare Bouw7-uren-veld).
update public.changelog
set omschrijving = 'Bovenin de detailplanning van een opdracht staat nu een compacte tabel per bewakingscode met drie kolommen: geprognotiseerde arbeidsuren, ingeplande uren en werkelijk geboekte uren. De ingeplande uren worden voortaan betrouwbaar berekend uit het aantal werkdagen in elke planning (minus verlof) maal de contracturen per dag, in plaats van uit een los uren-veld dat niet altijd klopte. Zo zie je in één oogopslag hoe je per kostengroep staat: begroot, gepland en geboekt naast elkaar.'
where titel = 'Geplande uren afgezet tegen de prognose per bewakingscode'
  and module = 'Planning';
