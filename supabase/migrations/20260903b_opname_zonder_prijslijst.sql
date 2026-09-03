-- Een opname mag ook zonder prijslijst.
--
-- De eerste opzet ging ervan uit dat elke opname onder een afgesproken prijslijst valt. In de
-- praktijk klopt dat niet: lang niet elke opdrachtgever heeft er een, en ook bij een opdrachtgever
-- die er wél een heeft loopt de opnemer tegen werk aan dat niet in de lijst staat. Dan moet hij een
-- LOS PUNT kunnen vastleggen — omschrijving, locatie, hoeveelheid, foto — en gebeurt het afprijzen
-- later op kantoor in de calculatie.
--
-- Een los punt heeft daarom geen prijs: `verkoop_pe` blijft NULL in plaats van 0. Dat onderscheid
-- is er een die telt. 0 leest als "gratis", NULL als "nog te prijzen", en dat is precies wat de
-- calculator moet zien. De generated kolommen rekenen met coalesce(...,0), dus de totalen blijven
-- kloppen; een opname met alleen losse punten telt op tot 0 en dat is juist.

alter table public.opnames alter column prijslijst_id drop not null;

comment on column public.opnames.prijslijst_id is
  'De afgesproken prijslijst van de opdrachtgever, of NULL. Zonder prijslijst bestaat de opname uit losse punten die op kantoor worden geprijsd. on delete restrict: een lijst waar opnames aan hangen mag niet verdwijnen; uit gebruik nemen gaat via status = vervallen.';

comment on column public.opname_regels.verkoop_pe is
  'Afgesproken prijs per eenheid uit de bibliotheek. NULL = los punt zonder prijs; dat wordt in de calculatie afgeprijsd. Bewust NULL en niet 0, want 0 leest als gratis.';

comment on column public.opname_regels.onderdeel_id is
  'Het bibliotheek-onderdeel waar deze regel uit komt, of NULL bij een los punt.';
