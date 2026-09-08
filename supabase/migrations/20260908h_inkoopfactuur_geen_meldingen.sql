-- Inkoopfacturen: geen melding per factuur.
--
-- De eerste versie van `syncInkoopfacturen` stuurde een notificatie zodra er een goedkeurder aan
-- zet kwam, met `notificatie_voor_id` als dedupe-marker. Bij de eerste run leverde dat 114
-- meldingen in een half minuut op, verdeeld over zes collega's — Robert Hoogenbosch kreeg er 66.
--
-- Dat is een verkeerd model: inkoopfacturen komen in bulk binnen. Het is een werkvoorraad, geen
-- gebeurtenis waar je per stuk op geattendeerd wilt worden. De ingang wordt het tabblad
-- "Te accorderen door mij" met een teller, en later een gedeelde goedkeuringen-widget waarin ook
-- uren, offertes en werkbegrotingen samenkomen.
--
-- De marker heeft daarmee geen functie meer. Weg ermee: een ongebruikte kolom die "meldingen"
-- heet nodigt uit tot precies dezelfde fout.

alter table public.inkoopfacturen drop column if exists notificatie_voor_id;
