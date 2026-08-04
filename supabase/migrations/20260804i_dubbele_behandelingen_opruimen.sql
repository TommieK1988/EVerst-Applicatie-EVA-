-- Dubbele schilderbehandelingen opruimen
--
-- Vóór de Calc4You-import stonden er zes handmatig aangemaakte behandelingen in
-- de bibliotheek. Vijf daarvan zijn door de import gedupliceerd: de handmatige
-- versie heeft code `OHD03` (zonder spatie), de geïmporteerde `OHD 03`. In de
-- behandeling-picker verschenen ze allebei, met verschillende normen en een
-- ander uurtarief (€ 42 tegenover € 45).
--
-- De geïmporteerde versie wint: die heeft de volledige werkomschrijving uit het
-- OnderhoudNL-bestek, de toepassing (binnen/buiten) en tientallen combinaties in
-- plaats van een handvol.
--
-- `NSD-55` blijft staan: dat is een nieuwbouwsysteem (N-prefix) en heeft geen
-- tegenhanger in de onderhoudsbibliotheek — het is dus geen duplicaat.
--
-- Verwijderen cascadeert naar `schilder_combinaties`, hun normen en de
-- gespiegelde `paint_items`. Daarom eerst de verwijzingen omhangen.

-- ---------------------------------------------------------------------------
-- 1. Lopende calculaties omhangen naar de geïmporteerde behandeling
-- ---------------------------------------------------------------------------
--
-- 22 regels in drie calculaties wijzen naar een handmatige behandeling. Zonder
-- deze stap verliezen ze hun behandelingslabel, want dat wordt live uit de
-- bibliotheek opgehaald (zie lib/everts-calc/behandeling-label.ts).
--
-- De vervanging gaat over de hele JSONB als tekst. Dat mag hier: het zijn UUID's,
-- dus een toevallige deeltreffer op iets anders bestaat niet.

update public.calculatie_snapshots
   set data = replace(
                replace(data::text,
                        'f0010220-16cb-44f9-8159-9fd5ab4fe154',   -- OHD-03 handmatig
                        '556f8ff2-5a8f-460e-b709-5ffff3cecd08'),  -- OHD 03 uit het bestek
                '1c083db4-df45-4a3e-a72c-a23c0261c00b',           -- OMS-03 handmatig
                '58162cdc-9cf9-4adb-a38b-3a006057c0b9'            -- OMS 03 uit het bestek
              )::jsonb,
       bijgewerkt_op = now()
 where data::text like '%f0010220-16cb-44f9-8159-9fd5ab4fe154%'
    or data::text like '%1c083db4-df45-4a3e-a72c-a23c0261c00b%';

-- Bevroren offerteversies (`calculatie_versie_snapshots`) worden bewust NIET
-- aangeraakt. Die dragen de behandelingstekst inline mee — precies waarvoor het
-- bevriezen bedoeld is — dus wat er in een verzonden offerte staat verandert
-- niet door deze opruiming.

-- ---------------------------------------------------------------------------
-- 2. De dubbele behandelingen verwijderen
-- ---------------------------------------------------------------------------
--
-- Alleen rijen die (a) handmatig zijn aangemaakt en (b) een geïmporteerde
-- tegenhanger met dezelfde code hebben. Die twee voorwaarden samen maken dit
-- veilig om opnieuw te draaien: is er niets dubbels, dan gebeurt er niets.

delete from public.schilder_behandelingen b
where b.bron = 'Basisverfbestek 2020'
  and exists (
    select 1 from public.schilder_behandelingen anders
     where anders.id <> b.id
       and anders.bron like 'Calc4You%'
       and replace(anders.code, ' ', '') = replace(b.code, ' ', '')
  );
