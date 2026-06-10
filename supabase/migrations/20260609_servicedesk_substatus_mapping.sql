-- Zet servicedesk_substatus voor bestaande dossiers o.b.v. Bouw7 projectstatus.
-- Na deze migratie wordt de substatus bij elke Bouw7-sync opnieuw afgeleid
-- via BOUW7_NAAR_SERVICEDESK_SUBSTATUS in sync.ts.
UPDATE dossiers
SET servicedesk_substatus = CASE bouw7_projectstatus_naam
  WHEN '01. Offerte'           THEN 'offerte_uitgebracht'
  WHEN '02. Nieuwe opdracht'   THEN 'nieuw'
  WHEN '03. Werkvoorbereiding' THEN 'nieuw'
  WHEN '04. Onderhanden'       THEN 'loopt'
  WHEN '05. Uitvoering gereed' THEN 'uitgevoerd'
  WHEN '06. Financieel gereed' THEN 'financieel_gereed'
  WHEN '08. Afgewezen'         THEN 'financieel_gereed'
  WHEN '09.Verzonden offertes' THEN 'offerte_uitgebracht'
  WHEN 'LB. Lopende bonnen'    THEN 'loopt'
  ELSE 'nieuw'
END
WHERE
  bouw7_projectstatus_naam ILIKE 'LB.%'
  OR bouw7_categorie_naam IN ('Dagelijks onderhoud', 'Mutatie');
