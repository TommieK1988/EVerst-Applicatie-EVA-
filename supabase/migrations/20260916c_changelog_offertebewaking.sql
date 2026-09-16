-- Changelog-items voor de offertebewaking (op main gezet 16 september 2026).
--
-- Drie items, want het raakt drie verschillende groepen: wie offertes opvolgt, wie erop stuurt,
-- en iedereen die eerder naar de verkoopcijfers heeft gekeken en daar verkeerde aantallen zag.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-16', 'nieuw', 'Offertes',
   'Offertebewaking: in één oogopslag zien wie aan zet is',
   'Elke verzonden offerte heeft nu een tabblad Bewaking met één ding dat je bijhoudt: de volgende stap. Die is óf een actie (wat, wie, wanneer) óf wachten (waarop, bij wie, wanneer we opnieuw kijken). De kleur op het offertebord, de meldingen en de werklijst rollen daar vanzelf uit. Na een klantcontact kies je één uitkomstknop — geen gehoor, ligt bij de ALV, waarschijnlijk opdracht — en EVA vult fase, vervolgstap, actiehouder en datum zelf in. Op de kaart staat wat er als laatste is gebeurd en tot wanneer er gewacht wordt, zodat niemand een klant nabelt die gisteren al gebeld is.'),

  ('2026-09-16', 'nieuw', 'Offertes',
   'Werklijst op urgentie, plus één melding per dag',
   'Op Offertes staat naast Bord en Lijst een derde weergave: Bewaking. Die groepeert niet op dossier maar op urgentie — verlopen, vandaag, nog niet beoordeeld, deze week, hercontrole nadert — met bovenaan hoeveel er openstaat. Uitgesteld werk verdwijnt vanzelf uit dat beeld en komt vanzelf terug op de herbenaderdatum. Je krijgt één samenvatting per werkdag om 07:00 van wat op jouw naam verlopen is of vandaag moet, en een bericht wanneer iemand jou als actiehouder aanwijst. Verder niets: meer meldingen worden toch weggeklikt. Op je startpagina staat dezelfde lijst als widget.'),

  ('2026-09-16', 'opgelost', 'Management',
   'Verkoopcijfers telden 92 dossiers niet mee',
   'Het overzicht onder Management → Verkoop haalde maximaal 1.000 dossiers op terwijl er 1.092 zijn. Dat gebeurde zonder foutmelding, dus de aantallen, bedragen en win-rate waren stilletjes te laag. Dit is verholpen; alle dossiers tellen nu mee. Heb je eerder conclusies getrokken uit die cijfers, kijk er dan opnieuw naar. Tegelijk zijn er nieuwe blokken bijgekomen: verwachte omzet op basis van de ingevulde kansen, hoe lang een offerte gemiddeld in elke fase blijft staan, conversie per commercieel eigenaar, en welke offertes al twee weken of langer stilstaan.');
