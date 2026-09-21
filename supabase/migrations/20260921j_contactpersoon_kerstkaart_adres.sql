-- Waar gaat de kerstkaart naartoe: privé of naar het bedrijf?
--
-- Het vinkje `kerstkaart` stond tot nu toe in het blok Privégegevens, met de stilzwijgende
-- aanname dat de kaart naar het privé-adres gaat. Dat klopt niet voor iedereen: van veel
-- zakelijke contactpersonen kennen we alleen het kantooradres, en die stonden dus wel op de
-- lijst maar zonder bezorgadres. Deze kolom maakt de keuze expliciet.
--
-- 'zakelijk' betekent het bezoekadres van de organisatie waar de persoon voor werkt
-- (`relaties.adres_*`) — nooit een factuuradres: dat is een administratief adres en vaak een
-- postbus of een boekhoudkantoor, daar hoort geen kerstkaart heen.
--
-- Additief met een default, zodat draaiende productiecode die de kolom nog niet kent blijft
-- werken. Default 'prive' houdt de bestaande lijst (de 363 rijen uit het kerstkaart-Excel)
-- precies zoals hij was. Bouw7 kent dit veld niet; de sync raakt het niet aan.

alter table public.contactpersonen
  add column if not exists kerstkaart_adres text not null default 'prive';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contactpersonen_kerstkaart_adres_check'
  ) then
    alter table public.contactpersonen
      add constraint contactpersonen_kerstkaart_adres_check
      check (kerstkaart_adres in ('prive', 'zakelijk'));
  end if;
end $$;

comment on column public.contactpersonen.kerstkaart_adres is
  'Bezorgadres voor de kerstkaart: prive (privé-adres van de persoon) of zakelijk (adres van de organisatie). Nooit een factuuradres. Alleen EVA; komt niet uit Bouw7.';

-- Backfill: wie op de lijst staat maar geen privé-adres heeft, krijgt de kaart op kantoor.
--
-- Van de 299 mensen op de kerstkaartlijst hebben er 243 geen privé-adres — die kwamen uit het
-- kerstkaart-Excel waar alleen het bedrijf bekend was. Ze stonden dus wél op de lijst maar
-- hadden nergens een bezorgadres. Voor iedereen met een gekoppelde organisatie is het
-- kantooradres het enige adres dat we hebben, en dat is ook waar de kaart altijd al heen ging.
--
-- Wie geen organisatie heeft blijft op 'prive': daar is "vul een privé-adres in" de juiste
-- aanwijzing, en die krijgt de gebruiker in het scherm te zien.
--
-- Terugdraaien kan met:
--   update public.contactpersonen set kerstkaart_adres = 'prive' where kerstkaart_adres = 'zakelijk';

update public.contactpersonen c
   set kerstkaart_adres = 'zakelijk'
 where c.kerstkaart
   and c.prive_adres_straat is null
   and exists (select 1 from public.contactpersoon_organisaties co where co.contactpersoon_id = c.id);
