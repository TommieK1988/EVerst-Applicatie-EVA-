-- Wat is nieuw: interne factuurnotitie uit Bouw7 op het Facturen-scherm (two-way).
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-01','verbeterd','Financieel','Notities bij facturen staan nu in EVA én Bouw7',
   'Op het Facturen-scherm zie je voortaan de interne notitie die bij de factuur in Bouw7 staat — de aantekeningen over het betaalcontact dus. Je vindt ze als kolom in de lijst en volledig in het zijpaneel. Andersom werkt het ook: elke opmerking die je hier in het logboek zet, wordt automatisch bovenaan diezelfde notitie in Bouw7 bijgeschreven, met de datum en jouw naam erbij. Je hoeft het verhaal dus niet meer op twee plekken bij te houden.');
