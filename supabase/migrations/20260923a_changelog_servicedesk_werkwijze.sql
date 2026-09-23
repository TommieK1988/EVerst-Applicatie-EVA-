-- Changelog: de servicedeskbon is opgeruimd en kan nu zonder werkbegroting.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','verbeterd','Servicedesk','Minder tabbladen op een bon',
   'Een servicedeskbon heeft geen werkbegroting en geen uitvraag meer nodig; die tabbladen zijn eruit, net als het dubbele Acties en het tabblad Financieel. Onder Inkoop staan nu de geboekte uren bovenaan en daaronder de inkooporders, onderaannemerscontracten en geboekte kosten — samen het antwoord op "wat heeft dit tot nu toe gekost". Oude links blijven gewoon werken.'),

  ('2026-09-23','nieuw','Servicedesk','Direct iemand inplannen vanaf de bon',
   'De knop "Medewerker inplannen" opent nu een venster op de bon zelf: wie, wanneer en hoeveel uur, en klaar. Je hoeft niet meer via de planning het juiste bord en de juiste week te zoeken. Staat diegene op dat moment al ergens anders ingepland, of heeft hij verlof, dan zie je dat meteen — het houdt je niet tegen, je beslist zelf.'),

  ('2026-09-23','nieuw','Servicedesk','Opdracht in regie met een mandaat',
   'Bij een opdracht aan een onderaannemer kun je aanvinken dat het werk in regie gaat. Je geeft een mandaat en een datum mee, en op de opdracht komt met zoveel woorden te staan dat er tot dat bedrag mag worden doorgewerkt, dat er daarboven eerst overlegd wordt, en dat er op werkelijke uren en kosten gefactureerd wordt.'),

  ('2026-09-23','nieuw','Servicedesk','Kosten, opbrengst en marge bij elkaar',
   'Bovenaan Facturatie staat nu wat de bon gekost heeft naast wat eruit gaat, met het margebedrag en het percentage erbij. De knop "Regiefactuur opstellen" staat er direct naast. Is er een calculatie gemaakt, dan telt de gecalculeerde kostprijs voortaan als prognose mee, zodat de bon ook in het Management Dashboard een realistisch beeld geeft.');
