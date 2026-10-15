-- Wat is nieuw: projectleider krijgt een melding als er een mail aan zijn dossier wordt gekoppeld (live op 15-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-15','verbeterd','Mailintake','Melding bij een gekoppelde mail',
   'Wordt een mail aan een bestaand dossier gekoppeld, dan krijgt de projectleider van dat dossier een melding: van wie de mail komt, waar hij over gaat, en een link naar het dossier. Zo verdwijnt een mail niet meer ongemerkt uit het Postvak.');
