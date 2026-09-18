-- Meetstaat: de automatische omtrek vervangen door opgegeven aantallen.
--
-- Tot september 2026 rekende de meetstaat een hoeveelheid uit met de formule op het
-- schilderwerktype; drie m¹-types dragen daar `2*B+2*H`. Die formule is vervallen: de
-- opnemer geeft nu zelf op hoeveel breedtes en hoeveel hoogtes hij meet, en een formule
-- die daar achter zijn rug om nóg eens overheen rekent geeft een onnavolgbaar getal.
--
-- Vier bestaande meetregels draaiden op die formule. Zonder ingreep zouden ze vanaf nu
-- B + H geven in plaats van 2B + 2H — de helft dus, zonder dat iemand iets wijzigde.
-- Deze migratie zet op precies die regels breedte_aantal = 2 en hoogte_aantal = 2, wat
-- exact reproduceert wat de formule deed, en haalt het vervallen veld `formule` weg.
--
-- De meetstaat leeft in de JSONB van calculatie_snapshots, vandaar het herbouwen van de
-- array in plaats van een gewone update. `with ordinality` houdt de volgorde van de
-- meetregels intact.
--
-- Uitkomst per regel (ongewijzigd t.o.v. de oude formule):
--   f8d734c4  divers onderhoud                B 1,5  H 2,5  × 1  ->  8,00 m¹
--   41d39af6  Jaarsveldstraat                 B 2,4  H 1,4  × 6  -> 45,60 m¹
--   ecba96f6  Steenvoordelaan                 B 2,5  H 3,0  × 1  -> 11,00 m¹
--   d6d88e4e  Soesdijksekade                  geen maten        ->  0,00 m¹ (lege regel)

update public.calculatie_snapshots cs
set data = jsonb_set(
      cs.data,
      '{meetregels}',
      (
        select jsonb_agg(
                 case
                   when r->>'id' in (
                     'f8d734c4-675e-4585-ae58-47f83ca97f89',
                     '41d39af6-516e-43d9-84a9-5b8037c8f9ee',
                     'ecba96f6-ff89-4888-9b56-2f03027b747c',
                     'd6d88e4e-7c6d-416b-a57b-25ed1882b41a'
                   )
                   then (r - 'formule')
                        || jsonb_build_object('breedte_aantal', 2, 'hoogte_aantal', 2)
                   else r
                 end
                 order by ord
               )
        from jsonb_array_elements(cs.data->'meetregels') with ordinality as t(r, ord)
      )
    ),
    bijgewerkt_op = now()
where exists (
  select 1
  from jsonb_array_elements(coalesce(cs.data->'meetregels', '[]'::jsonb)) as r
  where r->>'id' in (
    'f8d734c4-675e-4585-ae58-47f83ca97f89',
    '41d39af6-516e-43d9-84a9-5b8037c8f9ee',
    'ecba96f6-ff89-4888-9b56-2f03027b747c',
    'd6d88e4e-7c6d-416b-a57b-25ed1882b41a'
  )
);
