-- Alle meerwerkregels een expliciete termijnkeuze: "Volg offerte termijnstaat" (een_regel) als
-- de gekoppelde offerte een betalingsconditie met termijnen heeft, anders "1 termijn 100%".
-- Alleen de keuze; er wordt niets naar Bouw7 geschreven (bouw7_term_pending blijft ongemoeid).
-- Toegepast 24-09-2026: 4 regels een_regel, 215 een_termijn.
update public.meerwerk_regels m
set termijn_wijze = case
      when exists (
        select 1 from public.quotes q
        join public.betalingscondities bc on bc.id = q.betalingsconditie_id
        where q.id = m.quote_id
          and jsonb_typeof(bc.termijnen) = 'array' and jsonb_array_length(bc.termijnen) > 0
      ) then 'een_regel'
      else 'een_termijn'
    end,
    updated_at = now();
