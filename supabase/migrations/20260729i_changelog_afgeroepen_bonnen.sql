insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-29','opgelost','Financieel','Geboekte kosten telt alleen echt gefactureerde inkoop',
   'Afgeroepen bonnen (nog niet gefactureerd door de leverancier) werden meegeteld als geboekte kosten. Voortaan telt geboekte kosten alleen arbeid (uren) en inkoop waarvan we daadwerkelijk een factuur hebben ontvangen. Afgeroepen bonnen blijven zichtbaar als verplichting in de kolom Besteed.');
