-- Changelog: mandaatverhoging aanvragen mailt de opdrachtgever meteen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-28','verbeterd','Servicedesk','Mandaatverhoging aanvragen stuurt meteen een mail',
   'Als je op een bon een mandaatverhoging aanvraagt, gaat het verzoek nu direct als mail naar de opdrachtgever, vanuit je eigen Outlook. De mail staat al klaar met het huidige en het gevraagde bedrag en je toelichting, en je kunt hem nog aanpassen voor je verstuurt. Heb je het al telefonisch gevraagd, dan vink je de mail uit. De standaardtekst pas je aan onder Instellingen → E-mailsjablonen.');
