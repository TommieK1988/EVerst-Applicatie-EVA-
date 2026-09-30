-- Servicedesk: één bord — stap B. PAS TOEPASSEN NADAT DE CODE OP MAIN (VERCEL) STAAT.
--
-- Zet de bonnen van de samengevoegde kolommen om en versmalt daarna de constraint. Eerder toepassen
-- breekt de draaiende productiecode: die schrijft nog `uitgezet`, `ingepland` en
-- `mandaat_verhoging`, en die writes worden dan geweigerd.
--
-- `dossier_substatus_historie` blijft bewust ongemoeid: die vertelt wat er toen gebeurde. De
-- oude sleutels houden daar hun label via SERVICEDESK_ALLE_STATUSSEN.

-- Wachten op opdrachtgever = mandaatverhoging aangevraagd + offerte uitgebracht
update public.dossiers
   set servicedesk_substatus = 'wacht_op_opdrachtgever'
 where servicedesk_substatus in ('mandaat_verhoging', 'offerte_uitgebracht');

-- In voorbereiding = uitgezet + ingepland
update public.dossiers
   set servicedesk_substatus = 'in_voorbereiding'
 where servicedesk_substatus in ('uitgezet', 'ingepland');

-- De kolom Opgenomen is vervallen; zo'n bon staat weer op Nieuw.
update public.dossiers
   set servicedesk_substatus = 'nieuw'
 where servicedesk_substatus = 'opgenomen';

-- Bouw7 '08. Afgewezen' is voortaan Vervallen (stond als Financieel gereed). Zelfde uitkomst als
-- de eerstvolgende sync, maar dan meteen en zonder op een statuswissel te wachten.
update public.dossiers
   set servicedesk_substatus = 'vervallen'
 where servicedesk_substatus is not null
   and bouw7_projectstatus_naam = '08. Afgewezen';

alter table public.dossiers
  drop constraint if exists dossiers_servicedesk_substatus_check;

alter table public.dossiers
  add constraint dossiers_servicedesk_substatus_check
  check (servicedesk_substatus is null or servicedesk_substatus in (
    'nieuw',
    'wacht_op_opdrachtgever',
    'in_voorbereiding',
    'loopt',
    'uitgevoerd',
    'kosten_compleet',
    'financieel_gereed',
    'vervallen'
  ));
