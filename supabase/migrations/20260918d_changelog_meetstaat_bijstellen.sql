-- Het wat-is-nieuw-item van vanochtend beschreef de aantallen bij breedte en hoogte als
-- vermenigvuldiger ("drie gelijke ruiten in één regel"). Zo werkt het niet meer: die
-- aantallen zeggen hoeveel breedtes en hoeveel hoogtes je meet en tellen alleen mee bij
-- m¹, waar ze de oude omtrekformule vervangen. Tekst bijgesteld in plaats van een tweede
-- item, want de functie is dezelfde dag opgeleverd.
update public.changelog
set omschrijving = 'In de meetstaat staan nieuwe kolommen: Element, een aantal bij de breedte en bij de hoogte, en een factor. Bij strekkende meters geef je met die aantallen zelf op hoeveel breedtes en hoogtes je meet — een kozijnomtrek is twee breedtes plus twee hoogtes — in plaats van dat het systeem dat achter je rug om uitrekent. Het element dat je invult wordt vanzelf overgenomen naar de volgende regel. Je loopt nu ook met de pijltoetsen door het rekenblad, zoals in een spreadsheet. En je kunt meetregels aanvinken en bewaren als Element: bij het invoegen in een andere groep vraagt EVA hoe vaak het voorkomt. De kolom Omschrijving heet voortaan Opmerking, en de kolom Lengte is vervallen.'
where datum = '2026-09-18'
  and module = 'Calculatie'
  and titel = 'Sneller opmeten in de meetstaat';
