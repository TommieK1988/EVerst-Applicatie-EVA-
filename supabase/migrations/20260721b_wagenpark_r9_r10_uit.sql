-- =====================================================================
-- R9/R10 uitzetten: vervangen door de adres-bewuste werktijd-analyse
-- =====================================================================
-- R9 (te laat) en R10 (te vroeg) kijken alleen naar de eerste/laatste
-- rit-TIJD van de dag, zonder locatie. Daardoor leveren ze structureel
-- onjuiste bevindingen op. Gemeten over 2026 (simulatie op de echte data):
--
--   * R9: 56 bevindingen, waarvan 20 met een afwijking > 2 uur. Dat zijn
--     dagen met vaak één rit laat in de middag — de medewerker was gewoon
--     aanwezig maar reed niet (kantoordag / meegereden). R9 leest die ene
--     rit als "aankomst op het werk".
--   * R10: 96 bevindingen, met extremen door (a) ritten over middernacht
--     (stop_tijd is een time zonder datum → 00:04 leest als 971 min te
--     vroeg), (b) feestdagen die niet worden overgeslagen (1 januari), en
--     (c) beoordeling van de lopende, nog niet afgeronde dag.
--
-- De werktijd-analyse (Wagenpark → Werktijden) meet hetzelfde maar telt
-- alleen ritten die bij de werkplek beginnen/eindigen, met de roostertijd
-- als grens. Die is leidend; R9/R10 zouden alleen ruis toevoegen.
--
-- De engine slaat inactieve regels over (engine.ts: `if (regelDef &&
-- !regelDef.actief) continue`), dus dit schakelt ze echt uit. Bestaande
-- bevindingen blijven staan (er zijn er nu geen van R9/R10).
-- =====================================================================

update public.handboek_regels
   set actief = false,
       beschrijving = beschrijving
         || ' — UITGEZET: vervangen door de werktijd-analyse (Wagenpark → Werktijden), '
         || 'die de locatie van de ritten meeweegt en de roostertijd als grens gebruikt.',
       gewijzigd_op = now()
 where code in ('R9', 'R10') and actief = true;
