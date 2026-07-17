-- Aandachtspunten — opleverpunten die uit een formulier ontstaan.
--
-- Een "aandachtspunt" (gemeld door een bewoner via de publieke feedbacklink, of door een collega
-- bij een oplevering) is inhoudelijk hetzelfde als een opleverpunt: een concrete melding die
-- iemand nog moet oplossen. In plaats van een tweede lijst naast oplever_punten generaliseren we
-- die tabel, zodat een melding meteen alles erft wat er al is: statusmachine, toewijzing aan een
-- eigen medewerker óf een onderaannemer, deadline, foto's, reactiethread en meerwerk-koppeling.
--
-- Drie wijzigingen:
--  1. moment_id nullable — een aandachtspunt hoort bij een dossier, niet bij een inspectie.
--  2. status 'nieuw' (nog te beoordelen) en 'afgewezen' (terminaal, geen opleverpunt).
--  3. herkomst-kolommen, plus 'soort' als voorbereiding op VCA/veiligheid.

-- ── 1. moment_id nullable ─────────────────────────────────────────────────────
-- Punten uit een formulier hangen aan het dossier zonder oplevermoment. Het alternatief — een
-- kunstmatig moment "Meldingen" per dossier — geeft die meldingen een statusmachine, handtekeningen
-- en een rapportage die voor losse meldingen betekenisloos zijn.
alter table public.oplever_punten alter column moment_id drop not null;

-- ── 2. Statussen ──────────────────────────────────────────────────────────────
-- 'nieuw'     : gemeld via een formulier, wacht op triage door de projectleider.
-- 'afgewezen' : terminaal — dit is geen opleverpunt. Bewust géén hergebruik van 'geweigerd': dat is
--               een ACTIEVE status ("de afmelding van de onderaannemer deugt niet, ga terug aan het
--               werk") die terugloopt naar open/in_behandeling/opgelost. Zou 'afgewezen' daarop
--               meeliften, dan blokkeert een afgewezen melding voor eeuwig het betaalsignaal en de
--               ondertekening van het moment.
alter table public.oplever_punten drop constraint if exists oplever_punten_status_check;
alter table public.oplever_punten add constraint oplever_punten_status_check
  check (status in ('nieuw','open','in_behandeling','opgelost','geaccepteerd','geweigerd','afgewezen'));

-- ── 3. Soort en herkomst ──────────────────────────────────────────────────────
-- 'soort' is de volledige VCA-voorbereiding: een veiligheidspunt uit een VCA-formulier wordt straks
-- door dezelfde tabel gedragen. De Oplevering-tab filtert op soort = 'oplever', dus er verandert nu
-- niets zichtbaars.
alter table public.oplever_punten
  add column if not exists soort text not null default 'oplever'
    check (soort in ('oplever','veiligheid')),
  add column if not exists bron text not null default 'handmatig'
    check (bron in ('handmatig','formulier')),
  add column if not exists form_inzending_id uuid references public.form_inzendingen(id) on delete set null,
  add column if not exists bron_veld_id text,
  add column if not exists bron_index int,
  add column if not exists melder_naam text;

comment on column public.oplever_punten.soort is
  'oplever = restpunt/melding op de opleverlijst; veiligheid = onveilige situatie uit een VCA/KAM-formulier (nog niet in gebruik).';
comment on column public.oplever_punten.bron is
  'handmatig = door een medewerker in de Oplevering-tab aangemaakt; formulier = gematerialiseerd uit een form_inzending.';
comment on column public.oplever_punten.bron_veld_id is
  'FormField.id van het aandachtspunt-veld in het bevroren form_versies.schema; samen met bron_index de herkomst van deze rij.';
comment on column public.oplever_punten.melder_naam is
  'Naam van de melder als die bekend is; null bij een anonieme bewoner via de publieke feedbacklink.';

-- Backstop tegen dubbele materialisatie bij een dubbele submit. De materializer controleert zelf al
-- op bestaande punten; deze index vangt de race waarin twee submits elkaar kruisen (tweede krijgt
-- 23505). Bewust niet partieel: Postgres' default NULLS DISTINCT laat onbeperkt veel handmatige
-- rijen toe (form_inzending_id is dan null), precies wat we willen.
create unique index if not exists uq_oplever_punten_bron
  on public.oplever_punten (form_inzending_id, bron_veld_id, bron_index);

create index if not exists idx_oplever_punten_inzending on public.oplever_punten(form_inzending_id);
create index if not exists idx_oplever_punten_dossier_status on public.oplever_punten(dossier_id, status);

-- RLS blijft ongewijzigd: app_authenticated_all dekt de nieuwe kolommen en schrijven loopt
-- uitsluitend via de admin-client in server-actions.
