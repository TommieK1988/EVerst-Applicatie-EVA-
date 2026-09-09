-- E-mailsjablonen: één plek voor de teksten van de mails die EVA zelf verstuurt.
--
-- Tot nu toe stonden die op drie plekken: de offertemail in bedrijfsinstellingen.overige, de
-- inkoop- en uitvraagteksten bij een documentsjabloon, en de oplever-, portaal- en
-- uitnodigingsmails alleen in de code. Wie een zin wilde wijzigen moest weten wélke van de drie.
--
-- Deze tabel is de bron voor de mails die NIET aan een Word-document hangen. Blijft hij leeg, dan
-- gaat elke mail met de standaardtekst uit `apps/dashboard/src/lib/mail/sjablonen.ts` de deur uit:
-- de code blijft de terugval, deze tabel is de afwijking. Daarom worden hier ook geen
-- standaardteksten geseed — een geseede kopie zou een latere tekstverbetering in de code stil
-- overschaduwen.
--
-- Meerdere rijen per soort mogen: dat zijn varianten. De verzendkant pakt de eerste actieve op
-- volgorde, hetzelfde patroon als `document_sjablonen`.

create table if not exists public.mail_sjablonen (
  id         uuid primary key default gen_random_uuid(),
  soort      text not null,
  naam       text not null default '',
  onderwerp  text not null default '',
  tekst      text not null default '',
  actief     boolean not null default true,
  volgorde   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mail_sjablonen_soort
  on public.mail_sjablonen (soort, actief, volgorde);

comment on table public.mail_sjablonen is
  'Beheerde onderwerp- en berichtteksten voor de mails die EVA zelf verstuurt (offerte, uitvraag, oplevering, klantportaal, gebruikersuitnodiging). Leeg = de standaardtekst uit de code. Beheerd via Instellingen -> E-mailsjablonen.';

comment on column public.mail_sjablonen.soort is
  'Welk mailmoment dit sjabloon vult; sleutels uit MAIL_SOORTEN in lib/mail/sjablonen.ts. Bewust geen enum: een nieuw mailmoment moet met een code-deploy meekomen, niet met een migratie.';

comment on column public.mail_sjablonen.tekst is
  'Platte tekst met lege regels als alineascheiding. {variabele} wordt gevuld, {blok} is een stuk dat EVA zelf opmaakt (knop, tabel), [klein] zet een alinea in kleine grijze letters, **vet** en [tekst](url) doen wat ze zeggen.';

-- RLS volgens het nieuwere patroon (is_platform_gebruiker): `authenticated` omvat sinds het
-- klantportaal ook opdrachtgever-accounts, en die horen de interne mailteksten niet te lezen.
alter table public.mail_sjablonen enable row level security;
drop policy if exists platform_gebruikers_all on public.mail_sjablonen;
create policy platform_gebruikers_all on public.mail_sjablonen
  for all to authenticated
  using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());

-- De offertemail stond al beheerd in bedrijfsinstellingen.overige. Die tekst verhuist mee, zodat
-- een eerder aangepaste offertemail niet stilletjes terugvalt op de standaard.
insert into public.mail_sjablonen (soort, naam, onderwerp, tekst)
select 'offerte', 'Offerte versturen',
       coalesce(b.overige->>'offerte_mail_onderwerp', ''),
       coalesce(b.overige->>'offerte_mail_tekst', '')
from public.bedrijfsinstellingen b
where b.id = 1
  and coalesce(b.overige->>'offerte_mail_onderwerp', '') <> ''
  and not exists (select 1 from public.mail_sjablonen m where m.soort = 'offerte');
