-- Ernst van R9/R10 op de afwijking t.o.v. de roostertijd: tot en met
-- overtreding_vanaf_min minuten een waarschuwing, daarboven een overtreding.
--
-- Vervangt waarschuwing_vanaf_min (60), waarbij een afwijking onder het uur nog
-- als 'info' wegzakte. Te laat komen is geen informatie maar een afwijking, dus
-- de laagste trede is nu een waarschuwing.
--
-- LET OP: dit is een ándere drempel dan keten_pauze_min, die bepaalt wanneer
-- twee opeenvolgende ritten als één verplaatsing tellen. Beide staan toevallig
-- op 5 minuten, maar ze zijn los in te stellen.

update public.handboek_regels
   set drempel_config = (drempel_config - 'waarschuwing_vanaf_min')
                        || jsonb_build_object('overtreding_vanaf_min', 5),
       beschrijving = regexp_replace(
         beschrijving,
         'Config: marge_minuten, keten_pauze_min, waarschuwing_vanaf_min\.',
         'Een afwijking tot en met overtreding_vanaf_min minuten is een waarschuwing, daarboven '
         || 'een overtreding. Config: marge_minuten, keten_pauze_min, overtreding_vanaf_min.'
       ),
       gewijzigd_op = now()
 where code in ('R9', 'R10');
