-- Changelog: kantoorwerk voor meer dan één werkmaatschappij (commit 729f7a51).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-13','verbeterd','Uren','Kantooruren voor meerdere bedrijven',
   'Werkt iemand op kantoor voor meer dan één bedrijf, vink dan bij de medewerker onder "Kantooruren voor" die bedrijven aan. In de app kiest hij dan bij Kantoorwerk voor welk bedrijf de uren zijn. Met één vinkje (of geen) verandert er niets en hoeft hij niets te kiezen.',
   'kantoor'),
  ('2026-10-13','verbeterd','Uren','Kantoorwerk: kies het bedrijf',
   'Werk je op kantoor voor meer dan één bedrijf? Dan kies je bij Kantoorwerk voor welk bedrijf je de uren schrijft.',
   'mobiel');
