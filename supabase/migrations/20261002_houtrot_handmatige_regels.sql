-- Houtrot: handmatige regels naast bibliotheekregels.
--
-- Een reparatie bestond tot nu toe alleen uit recepten uit de calculatiebibliotheek.
-- In de praktijk komt er werk voor dat daar niet in staat: een afwijkende reparatie,
-- of aanvullend werk (meerwerk) dat op locatie blijkt. Die regels landen in dezelfde
-- tabel als de bibliotheekregels, met dezelfde momentopname-velden, zodat elke
-- optelling (tab, totalen, rapportage, btw-opstelling) ze ongewijzigd meeneemt.
--
-- Handmatige regel → momentopname:
--   arbeid    aantal = uren, unit 'uur', labor_hours 1, labor_rate = verkoop-uurtarief,
--             labor_cost = cost_price = kostprijs per uur, sale_price = verkoop-uurtarief
--   materiaal aantal = hoeveelheid, unit = eenheid, material_cost = cost_price = inkoop,
--             sale_price = inkoop × (1 + opslag/100)
--
-- Geen nieuwe tabel: alleen kolommen erbij, met standaardwaarden die bestaande
-- regels exact laten zoals ze zijn (bron 'bibliotheek', categorie 'reparatie').

alter table houtrotherstel.repair_registration_lines
  add column if not exists bron text not null default 'bibliotheek',
  add column if not exists regel_type text,
  add column if not exists categorie text not null default 'reparatie',
  add column if not exists functie text,
  add column if not exists opslag_pct numeric(6,2),
  add column if not exists btw_tarief text,
  add column if not exists notitie text,
  add column if not exists foto_pad text;

comment on column houtrotherstel.repair_registration_lines.bron is
  'bibliotheek = recept uit de calculatiebibliotheek; handmatig = zelf ingevoerde arbeid of materiaal.';
comment on column houtrotherstel.repair_registration_lines.regel_type is
  'Alleen bij handmatige regels: arbeid | materiaal. Een recept is altijd een mix.';
comment on column houtrotherstel.repair_registration_lines.categorie is
  'reparatie | meerwerk (aanvullende werkzaamheden).';
comment on column houtrotherstel.repair_registration_lines.functie is
  'Bij handmatige arbeid: de uursoort (timmerman, schilder, …) waarop het tarief is gebaseerd.';
comment on column houtrotherstel.repair_registration_lines.btw_tarief is
  'Btw-code (hoog | laag | vrijgesteld) voor regels zonder recept; bibliotheekregels volgen paint_items.btw_tarief.';
comment on column houtrotherstel.repair_registration_lines.foto_pad is
  'Optionele foto bij de regel, pad in de storage-bucket repair-photos.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rrl_bron_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_bron_check check (bron in ('bibliotheek', 'handmatig'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rrl_categorie_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_categorie_check check (categorie in ('reparatie', 'meerwerk'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rrl_regel_type_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_regel_type_check check (regel_type is null or regel_type in ('arbeid', 'materiaal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rrl_btw_tarief_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_btw_tarief_check check (btw_tarief is null or btw_tarief in ('hoog', 'laag', 'vrijgesteld'));
  end if;
  -- Een handmatige regel heeft geen recept, wél een type en een omschrijving.
  if not exists (select 1 from pg_constraint where conname = 'rrl_handmatig_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_handmatig_check check (
        bron <> 'handmatig' or (
          recept_id is null
          and regel_type is not null
          and nullif(btrim(repair_name_snapshot), '') is not null
        )
      );
  end if;
  -- Geen negatieve prijzen of opslag; aantal > 0 stond er al.
  if not exists (select 1 from pg_constraint where conname = 'rrl_niet_negatief_check') then
    alter table houtrotherstel.repair_registration_lines
      add constraint rrl_niet_negatief_check check (
        coalesce(labor_rate_snapshot, 0) >= 0
        and coalesce(labor_cost_snapshot, 0) >= 0
        and coalesce(material_cost_snapshot, 0) >= 0
        and coalesce(cost_price_snapshot, 0) >= 0
        and coalesce(sale_price_snapshot, 0) >= 0
        and coalesce(opslag_pct, 0) >= 0
      );
  end if;
end $$;

-- Gefactureerd: vanaf dit moment liggen de werkzaamheden van de reparatie vast.
-- Een houtrotreparatie kende geen status die dat uitdrukt (alleen geregistreerd /
-- afgerond, en afgerond volgt automatisch uit de na-foto).
alter table houtrotherstel.repair_registrations
  add column if not exists gefactureerd_op timestamptz,
  add column if not exists gefactureerd_door uuid;

comment on column houtrotherstel.repair_registrations.gefactureerd_op is
  'Gezet = gefactureerd; de werkzaamheden-regels (bibliotheek én handmatig) liggen dan vast.';

notify pgrst, 'reload schema';
