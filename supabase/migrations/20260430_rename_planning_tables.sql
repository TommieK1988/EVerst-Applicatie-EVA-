-- =====================================================================
-- Everts Platform — Hernoemen planning-tabellen en kolommen
-- Terminologie-update:
--   planning_taken          → planning_activiteiten  (Activiteit = werkzaamheid)
--   planning_entries        → planning_items         (Planitem = ingeplande blok)
--   planning_secties        → planning_fasen         (Fase = groepering)
--   planning_taak_afh...    → planning_activiteit_afhankelijkheden
--   enum planning_taak_status    → planning_activiteit_status
--   enum planning_entry_status   → planning_item_status
--   kolom taak_id (items)        → activiteit_id
--   kolom van_taak_id / naar_taak_id → van_activiteit_id / naar_activiteit_id
--   kolom sectie_id (activiteiten)   → fase_id
--   kolom planning_entry_id (werkbonnen/uren) → planning_item_id
-- Idempotent: veilig om meerdere keren uit te voeren.
-- =====================================================================

-- ── 1. Enum-types hernoemen ───────────────────────────────────────────
do $$ begin
  if exists (select 1 from pg_type where typname = 'planning_taak_status' and typnamespace = 'public'::regnamespace) then
    alter type public.planning_taak_status rename to planning_activiteit_status;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_type where typname = 'planning_entry_status' and typnamespace = 'public'::regnamespace) then
    alter type public.planning_entry_status rename to planning_item_status;
  end if;
end $$;

-- ── 2. Tabellen hernoemen ─────────────────────────────────────────────

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'planning_taken') then
    alter table public.planning_taken rename to planning_activiteiten;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'planning_entries') then
    alter table public.planning_entries rename to planning_items;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'planning_secties') then
    alter table public.planning_secties rename to planning_fasen;
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'planning_taak_afhankelijkheden') then
    alter table public.planning_taak_afhankelijkheden rename to planning_activiteit_afhankelijkheden;
  end if;
end $$;

-- ── 3. Kolommen hernoemen in planning_items (was planning_entries) ────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_items' and column_name = 'taak_id'
  ) then
    alter table public.planning_items rename column taak_id to activiteit_id;
  end if;
end $$;

-- ── 4. Kolom sectie_id → fase_id in planning_activiteiten ─────────────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_activiteiten' and column_name = 'sectie_id'
  ) then
    alter table public.planning_activiteiten rename column sectie_id to fase_id;
  end if;
end $$;

-- ── 5. Kolommen hernoemen in planning_activiteit_afhankelijkheden ─────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_activiteit_afhankelijkheden' and column_name = 'van_taak_id'
  ) then
    alter table public.planning_activiteit_afhankelijkheden rename column van_taak_id to van_activiteit_id;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_activiteit_afhankelijkheden' and column_name = 'naar_taak_id'
  ) then
    alter table public.planning_activiteit_afhankelijkheden rename column naar_taak_id to naar_activiteit_id;
  end if;
end $$;

-- ── 6. Kolom planning_entry_id → planning_item_id in werkbonnen ───────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'werkbonnen' and column_name = 'planning_entry_id'
  ) then
    alter table public.werkbonnen rename column planning_entry_id to planning_item_id;
  end if;
end $$;

-- ── 7. Kolom planning_entry_id → planning_item_id in uren_regels ──────

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'uren_regels' and column_name = 'planning_entry_id'
  ) then
    alter table public.uren_regels rename column planning_entry_id to planning_item_id;
  end if;
end $$;

-- ── 8. Triggers hernoemen (optioneel, voor consistentie) ──────────────

do $$ begin
  if exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_planning_taken'
  ) then
    alter trigger set_updated_at_planning_taken on public.planning_activiteiten
      rename to set_updated_at_planning_activiteiten;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_planning_entries'
  ) then
    alter trigger set_updated_at_planning_entries on public.planning_items
      rename to set_updated_at_planning_items;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from pg_trigger where tgname = 'tg_planning_secties_updated_at'
  ) then
    alter trigger tg_planning_secties_updated_at on public.planning_fasen
      rename to tg_planning_fasen_updated_at;
  end if;
end $$;
