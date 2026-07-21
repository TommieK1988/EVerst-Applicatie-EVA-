-- Herstel van twee gevolgen van een fout in activeerSjabloon / dubbel toegevoegde subtaken.
--
-- 1. Dubbele subtaken. In het sjabloon "Werkvoorbereiding" was de subtaak "Kleuren"
--    twee keer toegevoegd; elke activering kloonde beide, waardoor een dossier 16 taken
--    toonde waar het sjabloon er 14 telt. Hier blijft per (lijst, hoofdtaak, titel) de
--    oudste staan; alleen duplicaten zónder eigen gegevens worden verwijderd.
--
-- 2. Verdwenen blokkades. activeerSjabloon kopieerde blocked_by_task_id niet mee, dus in
--    alle gekloonde actielijsten stond "wacht op" leeg. Hier hersteld door per instantie
--    de blokkade van de sjabloontaak met dezelfde titel over te nemen.
--
-- Beide stappen zijn idempotent: opnieuw draaien verandert niets meer.

-- ─── 1. Dubbele subtaken opruimen ────────────────────────────────────────────

with genummerd as (
  select t.id,
         row_number() over (
           partition by t.lijst_id, t.parent_task_id, t.titel
           order by t.created_at, t.id
         ) as rn
  from public.tasks t
  where t.parent_task_id is not null
),
te_verwijderen as (
  select g.id
  from genummerd g
  where g.rn > 1
    -- Alleen echt lege duplicaten: alles wat aan de taak hangt is een reden om hem te laten staan.
    -- (Enkele van deze FK's zijn ON DELETE CASCADE — zonder deze checks zou een delete
    --  stilzwijgend inzendingen, koppelingen of toewijzingen meenemen.)
    and not exists (select 1 from public.task_assignees          x where x.task_id = g.id)
    and not exists (select 1 from public.task_comments           x where x.task_id = g.id)
    and not exists (select 1 from public.task_attachments        x where x.task_id = g.id)
    and not exists (select 1 from public.task_completion_acties  x where x.task_id = g.id)
    and not exists (select 1 from public.form_inzendingen        x where x.task_id = g.id)
    and not exists (select 1 from public.task_todo_sync          x where x.task_id = g.id)
    and not exists (select 1 from public.debiteuren              x where x.task_id = g.id)
    and not exists (select 1 from public.toolbox_toewijzingen    x where x.task_id = g.id)
    and not exists (select 1 from public.tasks x where x.parent_task_id        = g.id)
    and not exists (select 1 from public.tasks x where x.blocked_by_task_id    = g.id)
    and not exists (select 1 from public.tasks x where x.herhaling_bron_taak_id = g.id)
)
delete from public.tasks t
using te_verwijderen v
where t.id = v.id;

-- ─── 2. Blokkades (blocked_by_task_id) in gekloonde lijsten herstellen ───────

with sjabloon_relatie as (
  -- Per sjabloonlijst: welke taaktitel wacht op welke andere taaktitel.
  select s.lijst_id                as template_id,
         s.titel                   as taak_titel,
         blokkeerder.titel         as blokkeerder_titel
  from public.tasks s
  join public.tasks blokkeerder on blokkeerder.id = s.blocked_by_task_id
  where s.blocked_by_task_id is not null
),
eenduidig as (
  -- Titels moeten binnen de sjabloonlijst uniek zijn, anders valt niet te bepalen
  -- welke gekloonde taak bedoeld is; die gevallen slaan we over.
  select r.*
  from sjabloon_relatie r
  where (select count(*) from public.tasks x
          where x.lijst_id = r.template_id and x.titel = r.taak_titel) = 1
    and (select count(*) from public.tasks x
          where x.lijst_id = r.template_id and x.titel = r.blokkeerder_titel) = 1
),
koppeling as (
  select doel.id as taak_id, bron.id as blokkeerder_id
  from public.task_lists instantie
  join eenduidig r        on r.template_id = instantie.template_id
  join public.tasks doel  on doel.lijst_id = instantie.id and doel.titel = r.taak_titel
  join public.tasks bron  on bron.lijst_id = instantie.id and bron.titel = r.blokkeerder_titel
  where instantie.is_template = false
    and instantie.template_id is not null
    and doel.blocked_by_task_id is null
    -- Ook binnen de instantie moet de titel eenduidig zijn.
    and (select count(*) from public.tasks x
          where x.lijst_id = instantie.id and x.titel = r.taak_titel) = 1
    and (select count(*) from public.tasks x
          where x.lijst_id = instantie.id and x.titel = r.blokkeerder_titel) = 1
)
update public.tasks t
set    blocked_by_task_id = k.blokkeerder_id
from   koppeling k
where  t.id = k.taak_id;
