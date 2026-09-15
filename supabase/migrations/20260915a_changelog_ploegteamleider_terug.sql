-- De ploegteamleider-terugval in de urengoedkeuring is teruggedraaid: de teamleiderstap komt
-- weer alleen van het dossier. Het changelog-item kondigde een functie aan die niet meer
-- bestaat, dus dat gaat eruit in plaats van dat er een tweede item bijkomt -- voor de lezer was
-- het één dag en één onderwerp.
delete from public.changelog
 where titel = 'Teamleider van de ploeg keurt mee';
