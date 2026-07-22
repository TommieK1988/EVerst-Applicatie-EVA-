-- Het urenoverzicht kreeg kort na livegang kolombeheer, opgeslagen weergaven en filteren
-- per kolom. De oorspronkelijke omschrijving beloofde subtotalen "door op een kolomkop te
-- klikken"; dat is nu een aparte Groeperen-keuze. Alleen de omschrijving bijwerken (niet
-- aangemaakt_op), zodat het item niet opnieuw als ongelezen bij iedereen opduikt.
update public.changelog
set omschrijving = 'Onder Financieel staat een nieuw scherm Uren met alle geboekte uren van eigen medewerkers én ingehuurde krachten, over alle dossiers heen. Per boeking zie je bij welk dossier hij hoort en of hij al is geaccordeerd, en bovenin staat direct hoeveel regels nog op accordering wachten. Kies een periode — deze maand, vorige maand, dit kwartaal of dit jaar — en zoek of filter per kolom; de tellingen bovenin lopen mee met wat je filtert. Met Groeperen bundel je de regels per medewerker, dossier, uursoort of intern en extern, met een subtotaal per groep. Welke kolommen je ziet en in welke volgorde bepaal je zelf, en die indeling kun je als eigen weergave bewaren.'
where datum = '2026-07-22' and module = 'Financieel'
  and titel = 'Alle geboekte uren in één overzicht';
