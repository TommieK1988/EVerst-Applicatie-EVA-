-- Deel 2 van 20261002h_archiveren_offerte_stamdata (zie daar de aanleiding).

-- 2. Geen stille SET NULL meer: verwijderen van stamdata die op een offerte staat faalt.
alter table public.quotes
  drop constraint if exists quotes_voorwaarden_id_fkey,
  add constraint quotes_voorwaarden_id_fkey
    foreign key (voorwaarden_id) references public.algemene_voorwaarden(id) on delete restrict;
alter table public.quotes
  drop constraint if exists quotes_betalingsconditie_id_fkey,
  add constraint quotes_betalingsconditie_id_fkey
    foreign key (betalingsconditie_id) references public.betalingscondities(id) on delete restrict;
alter table public.quotes
  drop constraint if exists quotes_layout_id_fkey,
  add constraint quotes_layout_id_fkey
    foreign key (layout_id) references public.quote_layouts(id) on delete restrict;

-- 3. Verwijzingen naar een offerte zonder FK kregen een echte FK. Een concept dat
--    vervangen wordt laat de verwijzing leeg achter in plaats van naar niets te wijzen.
--    De twee bestaande verwijzingen naar een al verwijderde offerte worden leeggemaakt.
update public.opdracht_onderdelen o set quote_id = null
  where o.quote_id is not null and not exists (select 1 from public.quotes q where q.id = o.quote_id);
update public.meerwerk_regels m set quote_id = null
  where m.quote_id is not null and not exists (select 1 from public.quotes q where q.id = m.quote_id);

alter table public.opdracht_onderdelen
  drop constraint if exists opdracht_onderdelen_quote_id_fkey,
  add constraint opdracht_onderdelen_quote_id_fkey
    foreign key (quote_id) references public.quotes(id) on delete set null;
alter table public.meerwerk_regels
  drop constraint if exists meerwerk_regels_quote_id_fkey,
  add constraint meerwerk_regels_quote_id_fkey
    foreign key (quote_id) references public.quotes(id) on delete set null;
