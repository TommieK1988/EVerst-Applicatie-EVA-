-- Verkoopkansen: de kans die blijft bestaan nadat een offerte van tafel is.
--
-- Een offerte die verloren gaat, vervalt of wordt uitgesteld is bijna nooit het einde van de
-- relatie: het werk komt over een jaar terug, de VvE besluit alsnog, de beheerder belt opnieuw.
-- Tot nu toe verdween dat met het dossier in de alleen-lezen-stapel en was er niemand meer die
-- het opnieuw oppakte. Een verkoopkans is precies dat ene restje: wat er nog in zit, wie erachteraan
-- gaat en wanneer.
--
-- GEEN NIEUWE TABEL — bewust. `commercie_bewaking` is bij de bouw al ontworpen om naast
-- offertekaarten ook losse kansen te dragen (`soort = 'signaal'`, `dossier_id` nullable,
-- `titel` gevuld). Een verkoopkans ís zo'n signaal. Daarmee erft hij zonder extra code de
-- eigenaar/actiehouder-scheiding, de "één volgende stap"-regel met zijn check-constraints,
-- de afgeleide bewakingsstatus en de tijdlijn in `commercie_gebeurtenissen`.
--
-- Wat wél ontbrak, zijn deze twee dingen:
--   1. de verwijzing naar het dossier waar de kans uit voortkomt. Die kan niet in `dossier_id`:
--      daar ligt een unieke index op (één bewakingskaart per dossier) en dat dossier heeft al
--      zijn eigen offertekaart. Vandaar een aparte `bron_dossier_id`, zonder die index.
--   2. een manier om een kans af te ronden. Zonder dat groeit de lijst alleen maar en wordt hij
--      binnen een jaar genegeerd — precies wat we met de kans zelf willen voorkomen.

alter table public.commercie_bewaking
  add column if not exists bron_dossier_id uuid references public.dossiers(id) on delete set null,
  add column if not exists afgerond_op     timestamptz,
  add column if not exists afgerond_door   uuid references public.medewerkers(id) on delete set null,
  add column if not exists afgerond_reden  text;

comment on column public.commercie_bewaking.bron_dossier_id is
  'Het dossier waar deze kans uit voortkomt (verloren/vervallen/uitgestelde offerte). Los van dossier_id: dat dossier heeft al een eigen bewakingskaart en dossier_id is uniek.';
comment on column public.commercie_bewaking.afgerond_op is
  'Gezet zodra de kans is afgehandeld. Een afgeronde kans verdwijnt uit het standaardoverzicht maar blijft bewaard.';

-- Draagt "welke kansen horen bij dit dossier" op het dossier zelf.
create index if not exists commercie_bewaking_bron_dossier_idx
  on public.commercie_bewaking (bron_dossier_id) where bron_dossier_id is not null;

-- Draagt het verkoopkansen-overzicht: open kansen op deadline.
create index if not exists commercie_bewaking_open_signalen_idx
  on public.commercie_bewaking (soort, stap_datum) where afgerond_op is null;
