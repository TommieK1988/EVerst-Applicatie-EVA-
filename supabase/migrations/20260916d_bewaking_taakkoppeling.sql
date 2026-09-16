-- Bewakingskaart koppelen aan de actie waar de volgende stap vandaan komt.
--
-- WAAROM: bij livegang toonde de bewaking 82 van de 194 open offertes als "nog niet beoordeeld",
-- terwijl daar een openstaande actie stond — bijna altijd letterlijk "Offerte nabellen", met een
-- deadline en een toegewezen collega. Van die 82 was de deadline in 71 gevallen al verstreken.
-- Het scherm zei dus "hier heeft nog niemand naar gekeken" op precies de dossiers die het langst
-- op een telefoontje wachtten.
--
-- Oorzaak: `bewakingsStatus()` keek uitsluitend naar `commercie_bewaking`, en die tabel was nieuw
-- en leeg. De lege staat van een nieuwe tabel werd daarmee als waarheid gepresenteerd, terwijl
-- het systeem het antwoord al had staan in `tasks`.
--
-- Twee kolommen lossen dat op:
--
--   stap_bron  — 'handmatig' (iemand heeft een uitkomst of stap vastgelegd) of 'actie' (afgeleid
--                uit de actielijst). Alleen 'actie'-stappen worden door de synchronisatie
--                bijgewerkt; een menselijke beslissing wordt nooit overschreven.
--
--   taak_id    — welke actie het is. Daarmee blijven kaart en actielijst één ding: leg je een
--                uitkomst vast, dan gaat die actie mee af; vink je de actie af, dan vraagt de
--                kaart om een vervolgstap.
--
-- Afbakening van "welke actie telt": elke openstaande actie mét deadline op een dossier in de
-- offertefase. Bewust géén filter op de titel. Dat is getoetst: van de 132 openstaande acties op
-- open offertes is er geen één operationeel — het zijn allemaal nabel-, aanpas- of belafspraken.
-- Een titelfilter ('offerte nabellen%') liet er vijf vallen die wél commercieel waren
-- ("Raymond Arends bellen", "Offerte aanpassen na afkeuring"). De kaart toont daarom de bron,
-- zodat een afgeleide stap herkenbaar blijft als afgeleid en niet als commerciële beslissing.

alter table public.commercie_bewaking
  add column if not exists stap_bron text not null default 'handmatig'
    check (stap_bron in ('handmatig', 'actie')),
  add column if not exists taak_id uuid references public.tasks(id) on delete set null;

create index if not exists commercie_bewaking_taak_idx
  on public.commercie_bewaking (taak_id) where taak_id is not null;

comment on column public.commercie_bewaking.stap_bron is
  'handmatig = door een mens vastgelegd (nooit overschrijven); actie = afgeleid uit de actielijst.';
comment on column public.commercie_bewaking.taak_id is
  'De actie waar de afgeleide stap vandaan komt; houdt kaart en actielijst gelijk.';
