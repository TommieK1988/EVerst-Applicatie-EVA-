-- Changelog-item: recepten- en materialenbibliotheek op de standaard overzichtstabel.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-03','verbeterd','Calculatie','Recepten en materialen met kolommen en weergaven',
   'De recepten- en materialenbibliotheek werken nu net als de andere overzichten in EVA: je zoekt en filtert per kolom, sorteert waarop je wilt, zet kolommen aan of uit, versleept ze en bewaart je eigen weergave. Bij de recepten open je een regel door erop te klikken; verwijderen doe je voortaan in dat scherm zelf.');
