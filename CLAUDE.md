# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo structure

npm workspaces + Turborepo. Twee actieve Next.js 15 apps onder `apps/`, vijf interne packages onder `packages/`.

**De centrale app is EVA** (`apps/dashboard`, package-naam `eva`). Alle modules (wagenpark, houtrotherstel, taken, everts-calc) zijn geïntegreerd in EVA — ze draaien **niet** meer als losse apps.

| App | Port | Purpose |
|-----|------|---------|
| `apps/dashboard` (EVA) | 3000 | Centraal platform — alle modules geïntegreerd |
| `apps/everts-calc` | 3001 | Legacy standalone (wordt samengevoegd met EVA, tijdelijk actief) |

Gearchiveerde standalone apps (niet meer starten):
- `apps/taken` — geïntegreerd in EVA onder `/taken` (heet in de interface **Acties**/Actielijsten;
  routes, mappen en DB-namen blijven bewust `taken`/`tasks`)
- `apps/wagenpark` — geïntegreerd in EVA onder `/wagenpark`

**Houtrot** is geen aparte app of module meer. `apps/houtrotherstel-app` is verwijderd
(juli 2026) en de losse schermen onder `/houtrotherstel` (dashboard, projecten,
registraties, rapportages) ook. Houtrotherstel zit nu **in het dossier**: zet de
dossier-toggle `houtrot_registreren` aan en er verschijnt een tab Houtrot
(`TAB_TOGGLE_GATES`, zelfde mechaniek als VCA). Registraties hangen aan een
dossier (`houtrotherstel.repair_registrations.dossier_id`), niet aan een
houtrot-project. Onder `/houtrotherstel` blijft alleen de **reparatiebibliotheek**
(`standaard-reparaties`) over: de prijzen/codes die je bij een registratie kiest.

Internal packages:
- `@everts/database` — Supabase client + gegenereerde TypeScript types
- `@everts/config` — Gedeelde Tailwind preset + TS base config
- `@everts/wagenpark-core` — Wagenpark businesslogica (compliance, ULU, RDW)
- `@everts/ui` — Gedeelde UI-componenten (skeleton, nog te vullen)
- `@everts/auth` — Auth utilities (skeleton, nog te vullen)

## Commands

```bash
# EVA starten (hoofdapp, port 3000)
npm run dev

# Specifieke app starten
npm run dev:eva              # EVA — port 3000
npm run dev:everts-calc      # legacy calc — port 3001 (tijdelijk)

# Of via Turbo filter (algemeen patroon)
npx turbo run dev --filter=<app-name>

# Build, lint, type-check
npm run build
npm run lint
npm run type-check
```

Tests zijn nog niet geconfigureerd in deze monorepo.

## Database

Eén gedeeld Supabase-project voor alle apps. Migraties staan in `supabase/migrations/`.

Elke app heeft een `.env.local` nodig:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Gebruik altijd de `@everts/database` package voor Supabase-clients — nooit rechtstreeks `@supabase/supabase-js` importeren in apps.

## Architecture patterns

### Data flow (Next.js 15 App Router)
Alle apps gebruiken de Next.js App Router. Server Components halen data direct via de Supabase server client (`@everts/database/server`). Client Components gebruiken de browser client (`@everts/database/client`).

### Styling
Tailwind CSS met de gedeelde preset uit `@everts/config/tailwind.config.base.js`. Radix UI primitives + `class-variance-authority` + `clsx` + `tailwind-merge` voor component-styling.

### Forms & validation
React Hook Form + Zod schemas. Zod schema's dienen ook als de TypeScript brontypes.

### Shared state / notifications
`react-hot-toast` voor toast-notificaties (gedeeld patroon in alle apps).

## Hoofdproces — statuswaarden

De **code is altijd leidend** boven `domein-proces.md` voor exacte statuswaarden. Raadpleeg bij twijfel altijd eerst de broncode:

- Statusdefinities (labels + keys): `apps/dashboard/src/components/dossiers/types.ts`
- TypeScript types: `packages/database/src/platform-types.ts`
- DB-enums en trigger: `supabase/migrations/20260415_platform_core.draft.sql`

Het domeinproces-document gebruikt soms andere namen dan de code (bijv. `Geaccepteerd` in het document = `gewonnen` in de code). De code-waarden zijn de implementatiewaarheid.

## Wat is nieuw — changelog bijwerken

EVA heeft een changelog-pagina (`/wat-is-nieuw`) met een sterretje in de topbar en een popup bij inloggen. **Voeg zelf een item toe zodra een gebruikersgerichte wijziging op `main` staat** — de gebruiker hoeft dit niet aan te melden.

**Timing is kritiek: pas ná `main`, nooit eerder.** De `changelog`-tabel staat in het gedeelde productie-Supabase en de RLS toont elk `gepubliceerd`-item aan iedereen. Een insert is dus meteen voor álle gebruikers zichtbaar, ongeacht op welke branch de code staat. Een item toevoegen vanaf een feature-branch kondigt een functie aan die nog niet bestaat. Wacht daarom met `apply_migration` tot de wijziging naar `main` is gemerged/gepusht (= Vercel-productie). Staat het werk nog op een branch: het item nog niet toevoegen.

**Wel een item:** nieuwe functie, zichtbare verbetering, of een opgeloste fout die gebruikers merkten.
**Geen item:** refactors, build-fixes, interne opschoning, en beveiligings-/RLS-werk zonder zichtbaar effect. Bundel meerdere commits van één feature tot één item.

**Hoe:** voeg een `insert` toe via een nieuwe migratie in `supabase/migrations/` (patroon: `20260714b_changelog.sql`) en pas die toe met de Supabase MCP `apply_migration`. EVA draait op Vercel zonder git-toegang, dus de commit-historie wordt nooit live ingelezen — items zijn altijd data. `aangemaakt_op` bepaalt de ongelezen-teller, dus dat moment moet samenvallen met livegang.

```sql
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-16','nieuw','Offertes','Titel in gewone taal',
   'Eén tot drie zinnen: wat kan de gebruiker nu, en waarom is dat handig.');
```

- `categorie` — `nieuw` (nieuwe functie) | `verbeterd` (uitbreiding van iets bestaands) | `opgelost` (bugfix)
- `module` — tag, bijv. Offertes, Calculatie, Dossiers, Planning, Financieel, Wagenpark
- `datum` — opleverdatum

**Schrijfstijl:** begrijpelijk voor niet-technische collega's. Beschrijf de *functie*, niet de code: geen endpoints, tabelnamen, componentnamen, "RLS" of commit-jargon.

## Migration status (april 2026)

De monorepo-migratie is functioneel maar niet volledig:
- `@everts/ui` en `@everts/auth` zijn nog skeletten — vul deze aan vóór nieuwe apps toevoegen
- `apps/taken` heeft duplicate code (PageHeader, ToastProvider, supabase lib) die naar `@everts/ui` / `@everts/database` moet worden verplaatst
- Geen CI/CD geconfigureerd
# Hoofdproces Onderhoud- en Renovatiebedrijf

## Status van dit document

Dit is **aanvullende domeincontext**, geen greenfield-specificatie. De applicatie is al deels gebouwd en die bestaande code is leidend. Gebruik dit document als:

- Naslagwerk voor business-terminologie en procesvolgorde;
- Referentie voor statusmachines, businessregels en entiteitsrelaties bij *nieuwe* features of bij twijfel;
- Checklist om te zien of iets nog mist of inconsistent is.

**Bij conflict tussen dit document en de bestaande code:**

1. Ga er niet vanuit dat het document gelijk heeft.
2. Meld het conflict expliciet en vraag voordat je iets wijzigt.
3. Refactor geen bestaande modules "om ze in lijn te brengen" zonder expliciete opdracht.

**Niet alles in dit document is al geïmplementeerd.** Secties die buiten de huidige scope vallen (bijv. Exact Online-koppeling, klantportaal, mobiele app) zijn toekomstmuziek en moeten niet proactief worden opgepakt.

---

## Doel

Een gestructureerde, implementatie-onafhankelijke beschrijving van het kernproces van een onderhoud- en renovatiebedrijf, zodanig dat een ontwikkelaar (of een AI-codeerassistent) hieruit zelfstandig een datamodel, statusmachine, rolmodel en gebruikersinteracties kan afleiden. De beschrijving is opzettelijk declaratief: wat er gebeurt, welke gegevens ontstaan, welke beslissingen genomen worden — niet hoe de UI eruitziet.

---

## 1. Scope en uitgangspunten

- Het bedrijf werkt **primair zakelijk** (B2B). Klanttypen: **bedrijven, woningcorporaties, VvE's, vastgoedbeheerders**. VvE's worden administratief behandeld als zakelijke klant. **Particulieren** komen incidenteel voor en lopen door hetzelfde proces, maar met eenvoudiger administratie (geen kredietcheck, geen inkoopnummers, andere BTW-behandeling).
- Het bedrijf voert zowel **planmatig onderhoud** (terugkerende werkzaamheden onder raamcontract of jaarplan) als **projectmatige renovatie** (eenmalig, grotere scope) uit.
- Er is een **24/7 storingsdienst** voor bestaande klanten en verzekeraars — dit is een aparte ingang naast het reguliere offerteproces.
- Werkzaamheden kunnen worden uitgevoerd door:
  - **Eigen monteurs** (loondienst),
  - **Ingehuurde capaciteit** (ZZP'ers en uitzendkrachten) — worden op **uurbasis** ingezet, werken onder regie van de eigen uitvoerder, en zijn in de planning nagenoeg gelijk aan eigen monteurs maar met andere contract- en kostenstructuur,
  - **Onderaannemers** — nemen **altijd een complete opdracht** aan tegen een **vaste prijs** (geen uurbasis). Zij plannen en organiseren hun eigen werk; het bedrijf coördineert alleen start/oplevering en kwaliteit.
- Facturatie wordt **in de applicatie zelf** opgesteld en verzonden. Financiële data wordt doorgezet naar **Exact Online** voor boekhouding (grootboek, debiteurenbewaking). De Exact-koppeling is **nog niet van toepassing in de eerste versie** — wel vanaf begin zo ontwerpen dat de koppeling later zonder datamodelwijziging aangezet kan worden.
- Het proces loopt van **eerste aanvraag** tot **nazorg/garantie**.

---

## 2. Hoofdfases van het proces

Het reguliere proces bestaat uit tien sequentiële fases met duidelijke overgangspunten. Elke fase heeft een **trigger**, **activiteiten**, **output** en **beslispunt**. De **storingsdienst** vormt een parallelle flow (zie sectie 3).

### Fase 1 — Aanvraag (Lead/Intake)

**Trigger:** klant neemt contact op via website-formulier, telefoon, e-mail, doorverwijzing, of een bestaande raamovereenkomst waaronder een deelopdracht wordt aangemeld.

**Activiteiten:**
- Identificeren of de aanvrager een **bestaande klant** is (dan direct koppelen) of **nieuw**.
- Vastleggen klantgegevens: bedrijfsnaam, KvK-nummer, BTW-nummer, factuur- en werkadres, contactpersoon (rol: technisch, financieel, tekenbevoegd). Voor particulieren beperkter.
- Vastleggen aanvraaggegevens: aard van het werk (onderhoud / renovatie / storing / mutatie), locatie, urgentie, beschrijving, eventueel foto's, referentie van de klant (**inkoop- of objectnummer** bij zakelijk belangrijk voor facturering).
- Toekennen van een uniek aanvraagnummer.
- Bron van de aanvraag registreren.

**Output:** een `Aanvraag` met status `Nieuw`.

**Beslispunt:** wel of niet in behandeling nemen. Bij zakelijke nieuwe klanten: lichte kredietcheck voordat er tijd ingestoken wordt.

---

### Fase 2 — Kwalificatie en opnameafspraak

**Trigger:** aanvraag wordt in behandeling genomen.

**Activiteiten:**
- Eerste contact met klant om scope te verhelderen.
- Bepalen of een fysieke opname nodig is. Kleine onderhoudsklussen of herhaalwerk voor bestaande klanten kunnen direct geprijsd worden (→ opname overslaan).
- Afspraak inplannen voor opname, toegewezen aan een **calculator** of **werkvoorbereider**.

**Output:** een `Opnameafspraak` (optioneel), aanvraag krijgt status `Gekwalificeerd`.

**Beslispunt:** opname nodig? Zo nee: direct door naar calculatie op basis van standaardprijzen of raamcontract-tarieven.

---

### Fase 3 — Opname ter plaatse

**Trigger:** geplande opnamedatum.

**Activiteiten:**
- Fysieke inspectie door opnemer.
- Vastleggen: maten, materialen, bestaande situatie, foto's, knelpunten (asbest, vergunningsplicht, stut- en sloopwerk, bereikbaarheid).
- Inventarisatie van benodigde **werkzaamheden** per discipline.
- Vaststellen welke disciplines intern, welke met ingehuurde uren, en welke **als vaste-prijs-pakket aan een onderaannemer** worden uitgegeven (dakwerk, stukadoorwerk, installaties zijn typische voorbeelden).

**Output:** een `Opnamerapport` gekoppeld aan de aanvraag.

**Beslispunt:** is de opdracht uitvoerbaar? Bij asbest of constructieve risico's eerst aanvullend onderzoek.

---

### Fase 4 — Calculatie en werkvoorbereiding

**Trigger:** opname afgerond (of direct bij kleine klussen).

**Activiteiten:**
- Opstellen **werkbegroting** met posten voor:
  - **Arbeid eigen dienst** — uren × intern uurtarief per discipline,
  - **Arbeid ingehuurd** — uren × inhuurtarief (ZZP/uitzend), met eigen marge,
  - **Onderaanneming** — integrale prijs per pakket (op basis van **opgevraagde offertes van onderaannemers**, eventueel met risico-opslag),
  - **Materiaal** — uit artikelbestand of handmatig,
  - **Overige kosten** — afval/stort, huur materieel, voorrij, keten,
  - **Algemene kosten en winst** — als opslagpercentage(s).
- Toepassen BTW per post. Voor woningen ouder dan 2 jaar: 9% over arbeid, 21% over materiaal.
- Bepalen betaalschema-voorstel (bij zakelijke projecten boven een drempel: aanbetaling + termijnen).

**Output:** een `Calculatie` als basis voor de offerte. Van elke calculatie blijven de onderliggende posten traceerbaar (voor nacalculatie achteraf).

**Beslispunt:** review door senior calculator boven een bedragdrempel.

---

### Fase 5 — Offerte

**Trigger:** goedgekeurde calculatie.

**Activiteiten:**
- Genereren van een klantgerichte `Offerte` (PDF) met omschrijving, posten of aanneemsom, voorwaarden, geldigheidsduur, doorlooptijd, betaalschema.
- Versturen via e-mail of klantportaal, met logging (verzonden, geopend).
- **Digitale acceptatie** (tekenlink of bevestigingsknop) of formele opdrachtbevestiging vanuit de klant.
- Opvolging met reminders.
- **Revisies** als aparte versies, met referentie naar voorgaande versie. De geaccepteerde versie blijft juridisch bindend bewaard.

**Output:** een `Offerte` met status `Verzonden`, eventueel meerdere versies.

**Beslispunt:** klant accepteert, wijst af, of onderhandelt. Afwijzingsreden altijd vastleggen.

---

### Fase 6 — Opdracht en contract

**Trigger:** klant accepteert offerte.

**Activiteiten:**
- Omzetten van offerteversie naar een `Project`/`Opdracht`. **Koppeling naar de exacte geaccepteerde offerteversie blijft staan** — ook bij later meerwerk.
- Vastleggen akkoord: datum, methode, door wie namens de klant (tekenbevoegd). Bij zakelijk: inkoopordernummer vastleggen, dit moet op elke factuur terugkomen.
- Bij grotere projecten: aannemingsovereenkomst met algemene voorwaarden (UAV 2012 of eigen AV).
- Openen projectdossier.
- **Uitgaan van onderaannemersopdrachten** — pas definitief bestellen bij onderaannemer na klantakkoord.

**Output:** een `Project` met status `Bevestigd`.

**Beslispunt:** aanbetaling ontvangen (bij zakelijk vaak niet gebruikelijk, bij particulier wel) voordat inkoop start?

---

### Fase 7 — Planning en inkoop

**Trigger:** opdracht bevestigd.

**Activiteiten:**
- **Planning eigen en ingehuurde mensen:** capaciteit verdelen over werkdagen. ZZP'ers en uitzendkrachten staan naast eigen monteurs in dezelfde planning, herkenbaar aan contractvorm.
- **Onderaannemersopdrachten:** formele opdrachtbon met scope, prijs, startdatum, opleverdatum, boetes bij te late oplevering. Onderaannemer bevestigt. Dit is een **subproject** met eigen status binnen het hoofdproject.
- **Inkoop materiaal** op basis van de calculatie. Inkooporders naar leveranciers.
- **Vergunningen/meldingen** waar nodig (omgevingsvergunning, sloopmelding, asbestinventarisatie).
- Klant informeren over definitieve startdatum.

**Output:** `Planning`, `Inkooporders`, `Onderaannemersopdrachten`, projectstatus `Gepland`.

**Beslispunt:** alles op tijd beschikbaar? Zo niet: planning herzien en klant informeren.

---

### Fase 8 — Uitvoering

**Trigger:** startdatum bereikt.

**Activiteiten:**
- Eigen monteurs en ingehuurde krachten registreren **uren** per project/werkbon, per dag. Uren van ingehuurde krachten krijgen ook een **inkoop-kant** (factuur van ZZP'er of uitzendbureau) die later tegen de registratie wordt afgestemd.
- **Materiaalverbruik** bijhouden.
- **Onderaannemers rapporteren voortgang** (percentage gereed of mijlpalen). Hun factuur komt binnen tegen de vooraf afgesproken vaste prijs, eventueel in termijnen. **Geen urenregistratie van onderaannemers** — die zit in hun eigen prijs.
- **Meer- en minderwerk:** wijzigingen t.o.v. de offerte apart vastleggen, **klantakkoord verplicht vóór uitvoering** bij bedragen boven drempel. Geaccepteerde meer-/minderwerkposten worden onderdeel van het projecttotaal.
- **Termijnfacturen** bij langere projecten op basis van voortgang of vaste mijlpalen.
- Voortgangsfoto's en logboek.

**Output:** urenregistraties (intern én ingehuurd), materiaalregistraties, voortgang onderaannemers, meer-/minderwerkposten, termijnfacturen.

**Beslispunt:** is het werk inhoudelijk klaar voor oplevering?

---

### Fase 9 — Oplevering

**Trigger:** werk is gereed.

**Activiteiten:**
- Inspectie met klant.
- Vastleggen **opleverpunten** (restpunten) met verantwoordelijke en deadline.
- Ondertekenen opleverdocument (met of zonder voorbehoud).
- Overdracht documentatie, onderhoudsadvies, garantiebewijzen.
- Start garantietermijn.

**Output:** `Oplevering` met eventuele `Opleverpunten`, projectstatus `Opgeleverd` of `Opgeleverd onder voorbehoud`.

**Beslispunt:** geaccepteerd? Zo nee: terug naar uitvoering.

---

### Fase 10 — Facturatie en nazorg

**Trigger:** oplevering geaccepteerd.

**Activiteiten:**
- **Eindfactuur** in de eigen applicatie opgesteld: contractsom + meerwerk − minderwerk − al betaalde termijnen, met correcte BTW-splitsing en inkoopordernummer van de klant.
- Factuur wordt verzonden én als **boekingsregel naar Exact Online** doorgezet (vanaf het moment dat de koppeling live is). In de eerste versie wordt de factuur alleen in de applicatie aangemaakt en verzonden; doorzetten gebeurt handmatig of later automatisch.
- Opvolging: herinnering, aanmaning, incasso — debiteurenstatus wordt idealiter weer teruggelezen uit Exact zodra de koppeling er is.
- **Opleverpunten** binnen afgesproken termijn afhandelen. Eventuele inhouding (bijv. 5%) wordt vrijgegeven bij afwerken restpunten.
- **Garantieafhandeling:** klachten binnen garantieperiode → nieuwe `Aanvraag`, gekoppeld aan oorspronkelijk project, vaak kosteloos, eigen status `Garantie`.
- **Klanttevredenheid** vastleggen.
- Archivering.

**Output:** betaalde factuur, afgesloten project.

**Beslispunt:** definitief afsluiten pas na verstrijken garantieperiode zonder openstaande claims.

---

## 3. Storingsdienst (parallelle flow)

De storingsdienst is geen variant op het reguliere proces maar een **eigen flow** die tijdens kantooruren en daarbuiten kan worden aangeroepen. Ontwerp hem als een aparte ingang naast Fase 1.

**Kenmerken:**
- **Alleen voor bestaande klanten** (raamcontract of SLA) en voor **verzekeraars** die doorverwijzen. Nieuwe particulieren worden teruggebeld tijdens kantooruren.
- **Snelle triage**: urgentieniveau (spoed/binnen 24u/planbaar), aard (lekkage, inbraakschade, verwarmingsuitval, glas), veiligheidsrisico.
- **Directe uitrol** van een dienstdoende monteur of onderaannemer uit een **piketrooster**; geen opname vooraf, geen offerte vooraf.
- **Werkbon achteraf**: monteur vult uren, materiaal en werkzaamheden direct op locatie in. Foto's verplicht.
- **Nacalculatie**: na afronding wordt op basis van de werkbon een factuur opgesteld volgens de tarieven uit het raamcontract of SLA. Bij verzekeringsschade gaat de factuur naar de verzekeraar (met expertise-akkoord als bijlage).
- **Tweedeling in opvolging**: na een storing kan een vervolgtraject ontstaan (definitieve reparatie, renovatie). Die vervolgopdracht wordt als **nieuw regulier traject** vanaf Fase 1 of 2 opgestart, maar met koppeling naar de storingsmelding.
- **SLA-bewaking**: reactietijd en hersteltijd worden per melding vastgelegd; rapportage richting klant over behaalde SLA-percentages is een harde eis bij corporaties.

**Statusmachine Storingsmelding:** `Ontvangen` → `Getrieerd` → `Toegewezen` → `Onderweg` → `Op locatie` → `Opgelost` | `Tijdelijk verholpen, vervolg nodig` → `Gefactureerd` → `Afgerond`

---

## 4. Kernentiteiten (voorstel datamodel)

De volgende entiteiten volgen uit het proces. Relaties zijn bewust expliciet zodat historie en traceerbaarheid behouden blijven.

- **Klant** (type: zakelijk / VvE / particulier; KvK, BTW, inkoopnummer, factuuradres; contactpersonen met rol)
- **Object/Locatie** (een klant kan meerdere objecten hebben; werkzaamheden horen bij een object)
- **Raamcontract/SLA** (optioneel, per klant; tarieven, reactietijden, facturatieritme)
- **Aanvraag** (bron, urgentie, beschrijving, verwijzing naar raamcontract indien van toepassing)
- **Storingsmelding** (aparte entiteit, aparte flow, koppelt aan klant/object/contract)
- **Opnamerapport** (1:1 met Aanvraag, optioneel)
- **Calculatie** (1:n per Aanvraag; versies; posten per kostensoort: eigen arbeid, ingehuurde arbeid, onderaanneming, materiaal, overige kosten)
- **Offerte** (1:n per Calculatie; versienummer; status; koppeling naar geaccepteerde versie)
- **Project/Opdracht** (1:1 met geaccepteerde Offerteversie, óf ontstaan uit Storingsmelding met nacalculatie, óf uit Raamcontract-deelopdracht)
- **Werkbon** (uitvoeringseenheid binnen Project; één dag of taak)
- **Medewerker** (contractvorm: `intern` / `ZZP` / `uitzend`; discipline; intern uurtarief én kostprijs-uurtarief bij ingehuurd)
- **Urenregistratie** (per Medewerker, per Werkbon/Project, per dag; markering regulier vs. storingsdienst; koppeling naar inkoopfactuur bij ZZP/uitzend)
- **Materiaalregistratie** (ingekocht, verbruikt, retour)
- **Meerwerk/Minderwerk-post** (met klantakkoord, datum, bedrag, akkoord-methode)
- **Inkooporder** (naar Leverancier, voor materiaal)
- **Onderaannemersopdracht** (naar Onderaannemer, **vaste prijs**, mijlpalen, eigen status, eigen inkoopfactuur — geen urenkoppeling)
- **Oplevering** + **Opleverpunten**
- **Factuur** (verkoopfactuur vanuit de applicatie; typen: aanbetaling, termijn, eindfactuur, creditnota; status; referentie naar externe boekingsregel in Exact zodra koppeling actief is)
- **Inkoopfactuur** (van leverancier, onderaannemer, ZZP, uitzendbureau; matching op inkooporder of urenregistratie)
- **Garantieclaim** (gekoppeld aan oorspronkelijk project)
- **Artikel/Materiaalstam**
- **Leverancier**, **Onderaannemer**, **Uitzendbureau** (elk met eigen contractstructuur)

**Let op bij ontwerp:**
- **Onderaannemers** hebben wél een opdracht en inkoopfactuur, **geen urenregistratie**.
- **ZZP'ers en uitzendkrachten** hebben wél een urenregistratie, **en** een inkoopfactuur die later tegen die uren wordt gematcht.
- **Eigen monteurs** hebben alleen een urenregistratie (kosten lopen via salarisadministratie, buiten scope).

---

## 5. Statusmachines per hoofdentiteit

Laat de code statusovergangen expliciet afdwingen. Ongeldige transities geven fouten.

**Aanvraag:** `Nieuw` → `Gekwalificeerd` → `Opname gepland` → `Opgenomen` → `Gecalculeerd` → `Offerte verzonden` → `Geaccepteerd` | `Afgewezen` | `Vervallen`

**Storingsmelding:** `Ontvangen` → `Getrieerd` → `Toegewezen` → `Onderweg` → `Op locatie` → `Opgelost` | `Tijdelijk verholpen` → `Gefactureerd` → `Afgerond`

**Offerte:** `Concept` → `Verzonden` → `Bekeken` → `Geaccepteerd` | `Afgewezen` | `In onderhandeling` → (nieuwe versie) | `Verlopen`

**Project:** `Bevestigd` → `Gepland` → `In uitvoering` → `Opgeleverd onder voorbehoud` → `Opgeleverd` → `Gefactureerd` → `Afgerond` (zijspoor: `Garantietraject`)

**Onderaannemersopdracht:** `Concept` → `Verzonden` → `Bevestigd` → `In uitvoering` → `Opgeleverd` → `Factuur ontvangen` → `Factuur gematcht` → `Afgerond`

**Factuur (verkoop):** `Concept` → `Verzonden` → `Doorgezet naar Exact` → `Gedeeltelijk betaald` → `Betaald` | `Aangemaand` | `In incasso` | `Afgeschreven` | `Gecrediteerd`

**Inkoopfactuur:** `Ontvangen` → `Gecontroleerd` → `Gematcht met order/uren` → `Goedgekeurd voor betaling` → `Doorgezet naar Exact` → `Betaald` | `Geweigerd`

**Opleverpunt:** `Open` → `In behandeling` → `Opgelost` → `Geaccepteerd` | `Geweigerd`

---

## 6. Rollen en verantwoordelijkheden

- **Planner / binnendienst** — aanvragen en storingsmeldingen verwerken, planning, debiteuren.
- **Calculator / werkvoorbereider** — opname, calculatie, offerte, inkoop, aansturen onderaannemers.
- **Uitvoerder / projectleider** — projectverantwoordelijke, bewaakt voortgang, keurt meerwerk, accepteert onderaannemersmijlpalen.
- **Monteur / vakman** — voert werk uit, registreert uren en materiaal via mobiele app.
- **Ingehuurde kracht (ZZP/uitzend)** — werkt als monteur, gebruikt dezelfde mobiele app voor urenregistratie, beperkte rechten op klantgegevens.
- **Onderaannemer** — beperkt portaal: eigen opdrachten, mijlpalen melden, factuur indienen; géén toegang tot klantgegevens of andere projecten.
- **Storingsdienst-coördinator / piket** — 24/7 bereikbaar, triage, toewijzing.
- **Klant-contactpersoon (zakelijk)** — portaaltoegang per object: offertes, projectvoortgang, facturen, opleverpunten, storingshistorie, SLA-rapportage.
- **Financieel beheer / directie** — rapportages, marges, debiteuren, crediteuren, Exact-afstemming.

---

## 7. Businessregels die expliciet in code moeten landen

1. Een offerte heeft een geldigheidsduur; daarna automatisch naar `Verlopen`.
2. Een project start niet zonder bevestigde opdracht. Aanbetaling is voorwaarde bij particulieren boven een drempel, niet standaard bij zakelijk.
3. Meerwerk boven drempel (bijv. > €500 of > 10% contractsom) vereist schriftelijk klantakkoord vóór uitvoering. Het systeem mag deze post niet als `Geaccepteerd` markeren zonder bewijs.
4. BTW: 9% op arbeid aan bestaande woningen ouder dan 2 jaar; 21% op materiaal; 21% op zakelijke projecten die niet onder het verlaagde tarief vallen. Per post te beoordelen.
5. Eindfactuur pas mogelijk na goedgekeurde oplevering. Inhouding (standaard 5%) automatisch totdat alle opleverpunten zijn afgewerkt.
6. Garantieperiode start op opleveringsdatum; duur afhankelijk van aard werk.
7. Uren zijn alleen te schrijven op projecten in status `In uitvoering` of `Opgeleverd onder voorbehoud`, of op `Storingsmeldingen` in actieve status.
8. Bij zakelijke klanten is **inkoopordernummer** verplicht op facturen wanneer de klant dit in zijn profiel aangeeft.
9. Een project behoudt altijd de koppeling naar de **geaccepteerde offerteversie**.
10. **Onderaannemersopdrachten** zijn altijd vaste prijs; het systeem accepteert geen urenregistratie op dit type opdracht.
11. **ZZP/uitzend-uren** moeten uiteindelijk matchen met een inkoopfactuur; discrepanties worden gesignaleerd.
12. Storingsfacturen onder een raamcontract gebruiken de **raamcontract-tarieven**, niet de standaardprijslijst.
13. Elke factuur vanuit de applicatie krijgt een **uniek, oplopend factuurnummer** (fiscaal vereist, geen gaten).
14. Audit trail: elke statuswijziging, prijswijziging en klantcommunicatie is herleidbaar naar wie, wanneer en waarom.

---

## 8. Integratiepunten met externe systemen

Plan hier vanaf het begin voor — retrofit is pijnlijk. Het datamodel wordt vanaf dag 1 zo ontworpen dat Exact Online later zonder migratie aangezet kan worden.

- **Exact Online** — verkoopfacturen, inkoopfacturen, debiteuren- en crediteurenstanden, grootboekboekingen. **Nog niet in scope voor V1**, maar reserveer velden voor externe referentie (`exact_entry_id`, `exact_synced_at`, `exact_sync_status`) op relevante entiteiten.
- **Digitale ondertekening** — offertes en opdrachtbevestigingen.
- **Betaalprovider** (iDEAL) — met name voor particulieren en aanbetalingen.
- **E-mail/SMS** — notificaties naar klant, monteur, onderaannemer.
- **Mobiele app voor buitendienst** — urenregistratie, foto's, werkbonnen, offline werken.
- **Kalender/routeplanning** — voor planning en piket-rooster.
- **KvK / BAG** — automatische klant- en adresgegevens.
- **Verzekeraarsportalen** — bij storingen via verzekeringsschade.

---

## 9. Niet-functionele aandachtspunten

- **Mobiel-first voor buitendienst.** Eigen monteurs én ingehuurde krachten werken op hun telefoon.
- **Offline werken.** Werkbonnen en urenregistratie moeten offline kunnen, conflictvrij synchroniseren.
- **24/7-beschikbaarheid storingsdienst-flow.** Andere onderdelen mogen gepland onderhoud hebben; storingsintake niet.
- **Documentbeheer.** Foto's, PDF's, contracten, opnamerapporten per project doorzoekbaar.
- **Versiebeheer.** Offertes en calculaties kennen meerdere versies; geaccepteerde versie is altijd eenduidig te identificeren.
- **Factuurintegriteit.** Eenmaal verzonden facturen zijn onveranderbaar; correctie gaat via creditnota.
- **AVG/privacy.** Bewaartermijnen voor klantgegevens en foto's regelen.
- **Rapportage/KPI's.** Marge per project (begroot vs. werkelijk), conversie offerte→opdracht, debiteurentermijn, productieve uren per monteur, SLA-performance per raamcontract, doorlooptijd aanvraag→offerte, nacalculatie-afwijking.

---

## 10. Typische alternatieve stromen en uitzonderingen

- **Storingsdienst** — zie sectie 3, parallelle flow.
- **Raamcontracten / SLA's** — deelopdrachten komen als `Aanvraag met raamcontract-referentie` binnen, slaan calculatie/offerte over, worden direct `Project` onder contractuele tarieven. Facturatie vaak periodiek gebundeld.
- **Onderhoudsabonnementen** — terugkerend, automatisch ingepland, vaste prijs per jaar. Systeem genereert periodiek `Werkbonnen` uit het abonnement.
- **Verzekeringsschade** — klant is opdrachtgever voor het werk, verzekeraar is factuuradres. Tweede factuurstroom met expert-akkoord als bijlage.
- **Annulering** — mogelijk in elke fase; annuleringskosten worden op basis van reeds gemaakte kosten (ingekocht materiaal, geplande uren, opdracht onderaannemer) berekend.
- **Mutatiewerk** (vaak bij corporaties) — lijkt op onderhoud maar met strakke doorlooptijd tussen huurders; eigen rapportage-eisen.

---

## 11. Suggestie voor iteratieve bouw

Werkbare volgorde voor Claude Code — bouw niet alles tegelijk. Elke stap levert op zich waarde op zodat het bedrijf stapsgewijs kan invoeren en feedback geeft.

1. **Kern-CRM:** Klant (met zakelijk/particulier-onderscheid), Object, Aanvraag, statusmachine Aanvraag.
2. **Offertetraject:** Calculatie met de vier kostensoorten, Offerte met versiebeheer, acceptatie → Project.
3. **Uitvoering:** Werkbonnen, urenregistratie (intern + ZZP/uitzend met contractvorm-onderscheid), materiaal.
4. **Onderaannemers:** Onderaannemersopdracht als vaste-prijs-subproject, eigen statusmachine, matching met inkoopfactuur.
5. **Facturatie intern:** verkoopfacturen genereren, termijnen, meer-/minderwerk, creditnota's. Velden voor Exact-referentie zijn al aanwezig maar nog niet gekoppeld.
6. **Oplevering & garantie:** oplevering, opleverpunten, garantieclaims.
7. **Storingsdienst:** aparte intake, triage, piketrooster, werkbon-gebaseerde nacalculatie, SLA-koppeling.
8. **Raamcontracten & abonnementen:** contracttarieven, periodieke facturatie, SLA-rapportage.
9. **Klant- en onderaannemersportaal, mobiele app buitendienst.**
10. **Exact Online-koppeling activeren** (verkoop eerst, inkoop daarna).
11. **Rapportage en KPI's.**
