-- Changelog: order/opdracht versturen naar de leverancier, met een nette mail waarvan
-- de standaardtekst in Instellingen te bewerken is.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-05','nieuw','Inkoop','Inkooporder en opdracht versturen vanuit EVA',
   'Een aangemaakte bestelling verstuur je nu zelf naar de leverancier. EVA maakt een order-pdf op '
   'briefpapier, mailt die vanuit jouw eigen Outlook en roept de order daarna pas af in Bouw7 — de '
   'volgorde klopt dus met wat er echt gebeurt. In de mail staat onder je bericht een blokje met '
   'ordernummer, project, werkadres, lever- of startdatum, bedrag en betaalafspraak, zodat de '
   'leverancier de kern ziet zonder de bijlage te openen. De standaardtekst stel je zelf in onder '
   'Instellingen → Inkoop-e-mail, apart voor een inkooporder en voor een onderaannemersopdracht; '
   'bij het versturen kun je hem altijd nog aanpassen.');
