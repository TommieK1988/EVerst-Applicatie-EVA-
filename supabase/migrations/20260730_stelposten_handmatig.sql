-- Handmatige stelposten: een deel van de aanneemsom aanwijzen als stelpost, ook als het dossier
-- geen EVA-offerte heeft (Bouw7-import — dat is 107 van de 114 opdrachten).
--
-- Waarom deze velden bestaan (financiële integriteit):
--   • bron              — offerte-geseede stelpost vs. handmatig aangewezen; alleen handmatige zijn
--                         te bewerken/verwijderen, geseede worden door de seed bijgewerkt.
--   • in_aanneemsom     — PER RIJ i.p.v. de globale quotes.stelposten_in_totaal. Een stelpost ín de
--                         aanneemsom is een CARVE-OUT: hij verlaagt de basisscope en mag NOOIT bij het
--                         contracttotaal op. Staat hij erbuiten, dan moet hij er wél bij op. Die twee
--                         door één som halen is de klassieke dubbeltelling.
--   • aanneemsom_snapshot — de aanneemsom op het moment van aanwijzen. dossiers.bedrag_excl_btw wordt
--                         door élke Bouw7-sync overschreven (2× per dag); zonder snapshot verschuift de
--                         basisscope stil mee en kan hij zelfs negatief worden. EVA waarschuwt bij drift
--                         in plaats van stil te herrekenen.
--   • begroot_excl_btw  — KOSTPRIJS-budget, handmatig ingevuld. Bewust NOOIT afgeleid uit
--                         bedrag_excl_btw: dat is omzet (incl. AK en winst). Het verkoopbedrag als
--                         budget naar Bouw7 schrijven blaast de verwachte kosten op en vernielt de marge.
--   • grondslag         — hoe de stelpost afrekent: vast bedrag of op geboekte kosten (verrekening).
--   • bouw7_security_code_id — PSL-id van de aangemaakte bewakingscode (zelfde patroon als meerwerk).

alter table public.opdracht_onderdelen
  add column if not exists bron text not null default 'offerte'
    check (bron in ('offerte', 'handmatig')),
  add column if not exists in_aanneemsom boolean not null default true,
  add column if not exists aanneemsom_snapshot numeric(12,2),
  add column if not exists begroot_excl_btw numeric(12,2),
  add column if not exists grondslag text
    check (grondslag is null or grondslag in ('vast', 'geboekte_kosten')),
  add column if not exists bouw7_security_code_id bigint;

comment on column public.opdracht_onderdelen.in_aanneemsom is
  'Zit deze stelpost in de aanneemsom (carve-out: verlaagt de basisscope, telt NIET extra mee in het contracttotaal) of erbuiten (apart factureren: telt er wél bij op)?';
comment on column public.opdracht_onderdelen.aanneemsom_snapshot is
  'Aanneemsom excl. btw op het moment van aanwijzen. Bouw7-sync overschrijft dossiers.bedrag_excl_btw; hiermee detecteert EVA drift i.p.v. stil te herrekenen.';
comment on column public.opdracht_onderdelen.begroot_excl_btw is
  'Kostprijs-budget voor de bewakingscode, handmatig ingevuld. Nooit afgeleid uit bedrag_excl_btw (= omzet incl. AK/winst).';

-- Verrekening: het verschil tussen stelpost en werkelijk landt als precies één meer-/minderwerkregel.
-- De unieke index is de garantie tegen dubbel boeken van hetzelfde verschil.
alter table public.meerwerk_regels
  add column if not exists opdracht_onderdeel_id uuid
    references public.opdracht_onderdelen(id) on delete set null;

create unique index if not exists uq_meerwerk_regels_onderdeel
  on public.meerwerk_regels(opdracht_onderdeel_id)
  where opdracht_onderdeel_id is not null;

comment on column public.meerwerk_regels.opdracht_onderdeel_id is
  'Verrekening van een stelpost uit opdracht_onderdelen. Uniek: één stelpost kan maximaal één verrekenregel hebben, zodat hetzelfde verschil niet twee keer als meerwerk kan worden geboekt.';
