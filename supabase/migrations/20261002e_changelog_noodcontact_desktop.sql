-- Het item van vandaag aangevuld: het noodcontact staat nu ook op de medewerkerpagina op kantoor.
update public.changelog
set omschrijving = 'In de app staat onder Mijn gegevens nu je noodcontact, zoals de administratie die in Bouw7 heeft vastgelegd. Tik op het nummer om direct te bellen. Op kantoor staat het noodcontact ook op de medewerkerpagina, bij de persoonlijke gegevens.'
where titel = 'Noodcontact onder Mijn gegevens' and datum = '2026-10-02';
