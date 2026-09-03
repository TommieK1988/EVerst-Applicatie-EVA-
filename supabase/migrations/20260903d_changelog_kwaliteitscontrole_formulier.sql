-- Changelog-item: kwaliteitsronde en formulier volgen voortaan het sjabloon.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-03','opgelost','Acties','Kwaliteitscontrole is weer te starten vanaf de actie',
   'Acties die al klaarstonden voordat de kwaliteitscontrole aan het sjabloon werd toegevoegd, misten de knop om die controle te starten. Alle openstaande acties zijn bijgewerkt, en voortaan werkt een formulier of controle die je later aan een actielijst-sjabloon toevoegt vanzelf door naar de acties die al in de dossiers staan.');
