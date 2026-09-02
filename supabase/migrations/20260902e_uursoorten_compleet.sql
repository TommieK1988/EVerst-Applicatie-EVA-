-- Alle 18 Bouw7-uursoorten in EVA, met hun classificatie voor de weekstaat.
--
-- planning_uursoorten bevatte er maar 10, omdat derive-stamdata.ts ze afleidde uit uren die
-- feitelijk geboekt waren — met als motivering dat Bouw7 geen master-list-endpoint zou hebben.
-- Die aanname is nooit getoetst en klopt niet: GET /organization/hour-types bestaat gewoon en
-- geeft alle 18 terug (geverifieerd sep 2026). Precies de valkuil uit WRITE-ENDPOINTS.md §5:
-- een route waarvan we alleen de GET-op-een-andere-plek kenden nooit geprobeerd.
--
-- Gevolg voor de weekstaat: zonder deze acht kon een medewerker zich niet ziek melden, geen
-- feestdag verantwoorden en geen ATV of ouderschapsverlof kiezen.
--
-- Deze migratie is idempotent: bestaande uursoorten worden op bouw7_id herkend en alleen
-- geclassificeerd; alleen de echt ontbrekende worden ingevoegd.

-- ---------------------------------------------------------------------------
-- De acht ontbrekende uursoorten
-- ---------------------------------------------------------------------------
insert into public.planning_uursoorten (naam, code, bron, bouw7_id, bouw7_naam, volgorde)
select v.naam, 'B7-' || v.bouw7_id, 'bouw7', v.bouw7_id, v.naam,
       coalesce((select max(volgorde) from public.planning_uursoorten), 0) + v.rang
from (values
  ('Aanvullend ouderschapsverlof', '54297', 1),
  ('ATV / Roostervrij',            '54299', 2),
  ('Feestdag',                     '54600', 3),
  ('Generatie-Pact uren',          '54953', 4),
  ('Ouderschapsverlof',            '54296', 5),
  ('TSF uren',                     '52021', 6),
  ('Ziek',                         '52339', 7),
  ('Zorg verlof',                  '54298', 8)
) as v(naam, bouw7_id, rang)
where not exists (
  select 1 from public.planning_uursoorten p where p.bouw7_id = v.bouw7_id
);

-- ---------------------------------------------------------------------------
-- Classificatie
-- ---------------------------------------------------------------------------
-- werk            = projectgebonden; dossier en bewakingscode verplicht, bouwt saldo op.
-- afwezig         = verantwoorde niet-gewerkte tijd; gaat op het indirecte-uren-dossier.
-- tijd_voor_tijd  = opgenomen overuren; telt niet als verantwoording en verlaagt het saldo.
-- feestdag        = wordt voorgevuld uit bouw7_vrije_dagen.
--
-- Reisuren staan bewust onder 'werk': ze horen bij een project en moeten dus op een
-- bewakingscode. Alleen de vier handmatige EVA-uursoorten (Montage, Isolatie, Afwerking,
-- Dakdekking) blijven null — die hebben geen bouw7_id en kunnen dus sowieso niet naar Bouw7.
update public.planning_uursoorten set uren_categorie = 'werk'
  where bouw7_id in ('51049','50285','49727','50237','49729');

update public.planning_uursoorten set uren_categorie = 'tijd_voor_tijd'
  where bouw7_id = '52018';

update public.planning_uursoorten set uren_categorie = 'feestdag'
  where bouw7_id = '54600';

update public.planning_uursoorten set uren_categorie = 'afwezig'
  where bouw7_id in ('54297','54299','52195','54953','52194','54296','54601','52021','52019','52339','54298');
