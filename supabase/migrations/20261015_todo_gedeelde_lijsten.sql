-- 20261015_todo_gedeelde_lijsten.sql
--
-- Gedeelde To Do-lijsten standaard uit. In een gedeelde lijst ziet iedereen alle taken,
-- en Microsoft geeft niet door aan wie een taak is toegewezen — dus kwamen de taken van
-- collega's in Mijn acties terecht. De sync vult `gedeeld` uit Graph (isShared); NULL =
-- nog niet gezien. Additief.
alter table public.medewerker_todo_lijsten
  add column if not exists gedeeld boolean;
