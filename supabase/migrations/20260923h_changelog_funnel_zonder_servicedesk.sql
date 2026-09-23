-- Changelog: servicedeskbonnen uit de verkooptrechter.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','opgelost','Management Dashboard','Verkooptrechter telt geen servicedeskbonnen meer',
   'Op het Verkoop-overzicht telde elke servicedeskbon mee als openstaande aanvraag, omdat een bon technisch in de aanvraagfase staat zolang hij loopt. Daardoor stonden er ruim 350 bonnen in de trechter met meer dan twee ton aan pijplijnwaarde die er niet was. Je ziet het aantal open aanvragen en de pijplijnwaarde daardoor flink dalen — dat is geen verloren werk, maar het cijfer dat nu klopt. De conversie en de instroomtrend kloppen daarmee ook. Eerder vastgestelde maanden houden hun oude cijfers.');
