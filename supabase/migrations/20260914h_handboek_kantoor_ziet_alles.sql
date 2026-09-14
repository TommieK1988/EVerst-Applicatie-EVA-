-- =====================================================================
-- Handboek: kantoorafdelingen zien altijd het volledige handboek
-- =====================================================================
-- Directie, Projectbureau en Ondersteunend horen het hele medewerkershandboek
-- te zien, ook het hoofdstuk "Auto of bus" en de autoregeling. Dat ging mis:
-- dat hoofdstuk stond op `zichtbaar_voor {voertuig}`, en het voertuig-kenmerk
-- komt uit de wagenpark-koppeling. Van de 16 mensen op kantoor staat er bij 4
-- een voertuig; de andere 12 — inclusief de hele directie — misten het
-- hoofdstuk terwijl de regels wél voor hen gelden.
--
-- Oplossing is een apart kenmerk `kantoor` in plaats van iedereen maar
-- `voertuig` geven: dat laatste zou liegen over wat het kenmerk betekent en het
-- onbruikbaar maken voor inhoud die écht alleen voor bestuurders is.
--
-- `zichtbaar_voor` is een OR, dus {voertuig, kantoor} betekent: je ziet het als
-- je op kantoor zit óf als je een auto van de zaak hebt. Voor Uitvoering blijft
-- het dus aan de wagenparkkoppeling hangen — een timmerman met een werkbus ziet
-- het, een schilder zonder bus niet.

create or replace function public.handboek_kenmerken()
returns text[]
language sql
security definer
set search_path = public
stable
as $fn$
  with mw as (
    select
      m.id,
      -- Eén bron voor beide afleidingen. `is true` en niet gewoon `=`: bij een
      -- lege afdeling levert de vergelijking null op, en dan zou de medewerker
      -- in géén van de takken vallen en helemaal geen kenmerk krijgen.
      (m.afdeling = 'Uitvoering') is true as op_de_bouw,
      m.extern,
      b.code as wm_code
    from public.medewerkers m
    left join public.bedrijfsgegevens b on b.id = m.werkmaatschappij_id
    where m.auth_user_id = auth.uid()
      and m.actief = true
    limit 1
  )
  select coalesce(
    -- Het Flexkrachten-handboek is voor ingehuurde vakmensen op de bouw. Wie
    -- extern is maar op kantoor werkt (ingehuurde directie, projectbureau)
    -- krijgt gewoon het volledige handboek.
       array(select 'intern' from mw where not (extern and op_de_bouw))
    || array(select 'extern' from mw where extern and op_de_bouw)
    -- Alles wat niet Uitvoering is, inclusief een lege afdeling: te ruim tonen
    -- is minder erg dan iemand regels onthouden die wél voor hem gelden.
    || array(select 'kantoor' from mw where not op_de_bouw)
    || array(select 'werkmaatschappij:' || wm_code from mw where wm_code is not null)
    || array(
         select 'voertuig' from mw
          where exists (
            select 1
              from public.voertuig_bestuurders vb
             where vb.eind_datum is null
               and ( vb.medewerker_id = mw.id
                  or vb.ulu_user_id in (
                       select uu.id from public.ulu_users uu where uu.medewerker_id = mw.id) )
          )
       ),
    '{}'::text[]);
$fn$;

comment on function public.handboek_kenmerken() is
  'Kenmerken van de ingelogde medewerker voor de zichtbaarheid van handboek-inhoud. '
  'Enige vertaling van medewerkergegevens naar kenmerk-strings. '
  'intern/extern: de flexversie geldt alleen voor extern OP afdeling Uitvoering. '
  'kantoor: alles wat niet Uitvoering is — die afdelingen zien het volledige handboek.';

-- ── Auto-inhoud openzetten voor kantoor ──────────────────────────────
-- Adresseren op slug/titel en niet op uuid: leesbaar in review, en het werkt
-- ook als een omgeving de seed ooit met andere ids heeft gedraaid.
update public.personeelshandboek_secties
   set zichtbaar_voor = array['voertuig','kantoor']::text[]
 where slug in ('auto-of-bus', 'situatie-schade-aan-je-auto');

update public.personeelshandboek_bijlagen
   set zichtbaar_voor = array['voertuig','kantoor']::text[]
 where titel = 'Aanvullende afspraken autoregeling';
