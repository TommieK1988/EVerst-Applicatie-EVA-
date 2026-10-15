-- Wat is nieuw: uurtarief uit de werkbegroting op de Uren-tab (live op 15-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-15','opgelost','Dossiers','Uurtarief uit de werkbegroting zichtbaar op de Uren-tab',
   'De kolom "Uurtarief wb" in de tabel Uren per bewakingscode bleef altijd leeg, ook als het dossier een werkbegroting had. Die kolom toont nu per code het gemiddelde uurtarief uit de werkbegroting, zodat je de geboekte kosten naast het begrote tarief kunt leggen.',
   'kantoor');
