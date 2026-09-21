-- Het item van vanochtend beloofde een netwerkpad; dat bleek op onze SharePoint-omgeving
-- onbereikbaar. Het venster wijst nu naar de map op de eigen schijf. Tekst bijwerken in
-- plaats van een tweede item: gebruikers hebben nog geen van beide in het echt gezien.
update public.changelog
   set omschrijving = 'Op een pc zonder de EVA-snelkoppeling gebeurde er bij deze knop helemaal niets. Voortaan verschijnt er een venster dat je wijst waar dezelfde dossiermap op je eigen schijf staat, met een kopieerknop: plakken in de adresbalk van Verkenner en je bent er.'
 where datum = '2026-09-21'
   and titel = 'Open in Verkenner laat nu zien wat er mis is';
