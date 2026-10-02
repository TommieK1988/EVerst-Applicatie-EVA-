# Plan — EVA-app in het Pools en Tamil

**Status:** fase 1–5 gebouwd (branch `claude/app-multilanguage-exploration-ditk5l`), fase 6 nog niet · **Datum:** 1 oktober 2026

## Stand van de bouw

Gebouwd volgens dit plan, met de standaardkeuzes uit "Open beslissingen": automatisch
vertalen met "Toon origineel", 30 dagen bewaren, taal kiezen door de medewerker én kantoor.

- **Taal per medewerker:** `medewerkers.taal`; in de app onder Profiel → Instellingen, op
  kantoor op de medewerkerkaart.
- **Alle schermen van `/m`** in nl/pl/ta, behalve Commercieel (verkoop, blijft Nederlands).
  Ook de onderdelen die ook op kantoor draaien (formulieren, werkbon, toolbox, handboek,
  projectbezoek, dialogen) — op kantoor ongewijzigd Nederlands.
- **Tijdelijk vertalen** van teksten van kantoor (`lib/vertalen`, `components/vertalen`) en
  pushmeldingen in de taal van de ontvanger.
- **Bewaking in CI:** pariteitstest nl/pl/ta, test op `'use client'`, test dat gedeelde
  componenten alleen gedeelde naamruimtes gebruiken, en de lintregel tegen losse tekst in
  `/m` (als fout).
- **Bekijken zonder inloggen:** `/auth/app-taal-preview?taal=ta` (of `pl`, `nl`).
- Technische uitleg en woordenlijst: `apps/dashboard/src/i18n/README.md`.

**Bewust nog Nederlands:** foutmeldingen die uit gedeelde server-acties komen (dezelfde code
draait op kantoor), zoeken in handboek en opnamebibliotheek (werkt op de Nederlandse tekst),
de tabtitel van de browser, en alles wat naar klanten gaat (PDF's, rapporten).

## Doel

Monteurs en ingehuurde krachten die geen Nederlands lezen, kunnen de **mobiele app (`/m`)**
volledig in hun eigen taal gebruiken: **Pools** of **Tamil (Sri Lanka)**. Het kantoordeel van
EVA blijft Nederlands.

Twee lagen:

1. **Vaste teksten** — knoppen, labels, meldingen, statusnamen, pushmeldingen. Eén keer
   vertaald, in taalbestanden in de code.
2. **Variabele teksten** — wat kantoor schrijft (taakomschrijvingen, planningnotities,
   meldingen, handboek, toolboxen, formulieren). **Tijdelijk vertaald** op het moment dat een
   monteur het bekijkt; het Nederlands blijft altijd de echte tekst.

## Buiten scope

- Het kantoordeel (desktop) — blijft Nederlands.
- Documenten naar klanten (offertes, facturen, PDF's).
- Namen, adressen, artikelnamen, bedragen — worden nooit vertaald.

## Uitgangssituatie (gemeten)

| | |
|---|---|
| Code achter `/m` | ± 23.000 regels, ± 130 schermcomponenten (`app/m`, `components/mobiel`) |
| Losse teksten | naar schatting 1.500–2.500 |
| Meldingen in beeld (toasts) | ± 90 |
| Vaste `nl-NL`-opmaak | ± 55 plekken |
| Gedeelde onderdelen met desktop | `FormFiller`, `WerkbonFlow`/`HandtekeningPad`, `ToolboxDoorloop`, `BlokRenderer` (handboek), `components/ui` |
| Lettertype | Montserrat — Pools ✓, Tamil ✗ |
| AI-koppeling | Anthropic SDK al aanwezig (mailintake, Vraag EVA) |
| Vertaalsysteem | geen |

---

## Technische keuzes

### Vaste teksten: `next-intl`, zonder taal in de URL
- Taal komt van de medewerker, niet uit de URL: `/m/planning` blijft `/m/planning`.
  Geen gedoe met routes, links of `links.test.ts`.
- Nieuwe kolom `medewerkers.taal` (`'nl' | 'pl' | 'ta'`, standaard `'nl'`).
- `app/m/layout.tsx` leest de taal via `getCurrentMedewerker()` en zet een
  `NextIntlClientProvider` met alleen de berichten voor de app.
- De root-layout krijgt een provider die vast op `nl` staat, zodat gedeelde componenten
  (`FormFiller`, `WerkbonFlow`, …) op desktop gewoon Nederlands blijven tonen.
- Taalbestanden: `apps/dashboard/messages/{nl,pl,ta}.json`, ingedeeld per scherm
  (`planning`, `prikklok`, `uren`, …). `nl.json` is de bron; de types worden daaruit afgeleid,
  dus een tikfout in een sleutel is een type-fout.
- Meervoud via ICU-berichten (`{aantal, plural, one {…} few {…} many {…} other {…}}`). Nodig
  voor het Pools (drie vormen), voor Tamil eenvoudig.
- `<html lang>` en `dir` volgen de taal binnen `/m` (Tamil is links-naar-rechts, geen RTL nodig).

### Datums en getallen
- Eén hulpfunctie (`lib/i18n/opmaak.ts`) die de taal vertaalt naar een locale:
  `nl → nl-NL`, `pl → pl-PL`, `ta → ta-LK`. De ± 55 vaste `nl-NL`-plekken in `/m` gaan
  daarlangs. Westerse cijfers blijven (ook gangbaar in Sri Lanka).

### Lettertype
- `Noto Sans Tamil` via `next/font/google`, alleen geladen in `/m` en alleen als fallback
  achter Montserrat. Nederlandse/Poolse gebruikers merken er niets van.

### Bewaking (CI)
- **Test sleutelpariteit:** `pl.json` en `ta.json` hebben exact dezelfde sleutels als
  `nl.json` — ontbreekt er één, dan wordt CI rood.
- **Lintregel tegen losse tekst** (`eslint-plugin-i18next`, `no-literal-string`), alleen
  voor `app/m/**` en `components/mobiel/**`. Zo sluipt er geen nieuwe Nederlandse tekst in.
- Schuldteller: taalbestanden zijn JSON, tellen niet mee. Componenten worden er niet groter
  van (tekst wordt een `t('…')`-aanroep).

---

## Tijdelijk vertalen van variabele teksten

### Hoe het werkt voor de monteur
- Staat de taal op Pools of Tamil, dan ziet de monteur kantoorteksten **meteen vertaald**.
- Onder elke vertaalde tekst een klein label **"Automatisch vertaald · Toon origineel"**.
  Eén tik toont het Nederlands.
- Bij een fout of als de vertaling nog laadt, wordt het Nederlands getoond — de app loopt
  nooit vast op vertalen.

### Hoe het technisch werkt
- **Cache-tabel** `vertaal_cache`:
  `sleutel` (sha256 van brontekst + doeltaal), `doeltaal`, `vertaling`, `model`,
  `aangemaakt_op`, `laatst_gebruikt_op`.
  Dezelfde tekst wordt dus maar één keer vertaald, hoeveel monteurs hem ook bekijken.
  Verandert kantoor de tekst, dan verandert de hash en komt er vanzelf een nieuwe vertaling.
- **Tijdelijk:** rijen die 30 dagen niet gebruikt zijn worden opgeruimd (bestaande cron).
  Zo blijft er geen persoonsgegevens-archief van vertalingen achter.
- **Serveractie** `vertaalTeksten(teksten[], doeltaal)`:
  - controleert dat er een ingelogde medewerker is (schuldteller: geen service-role zonder
    rechtencontrole);
  - zoekt eerst in de cache, vertaalt alleen wat ontbreekt, in **één** aanroep naar Claude
    per scherm (gebundeld);
  - schrijft de nieuwe vertalingen in de cache.
- **Prompt:** vaste instructies — niet vertalen: namen, adressen, codes, bedragen, datums;
  Markdown-opmaak behouden; Sri Lankaans Tamil.
  Plus een **woordenlijst met vakwoorden** (kozijn, houtrot, steiger, werkbon, VCA, …) die
  samen met een Poolse en een Tamil collega wordt opgesteld.
- **Model:** snel en goedkoop model als standaard; kwaliteit voor Tamil eerst testen in de
  proef en zo nodig een zwaarder model voor Tamil.
- **Component** `<VertaalbareTekst tekst={…} />`: toont de vertaling met het label en de
  terugschakelknop; in het Nederlands geeft hij de tekst ongewijzigd door.

### Waar het gebruikt wordt (in volgorde)
1. Taken (titel, omschrijving, opmerkingen)
2. Planning (activiteit-omschrijving, notities)
3. Notificaties en pushmeldingen (variabel deel)
4. Dossierinformatie op de telefoon (werkomschrijving, bijzonderheden)
5. Formulieren (vragen, uitleg, keuzeopties)
6. Toolboxen
7. Personeelshandboek

**Let op bij toolboxen en handboek:** dat zijn veiligheidsteksten. Met tijdelijk vertalen
staat er altijd "Automatisch vertaald" bij, en blijft het origineel één tik weg. Blijkt in de
praktijk dat een vertaling vaak niet klopt, dan kan per tekst later een **nagekeken vertaling
vastgezet** worden (cache-rij markeren als `vastgezet`, niet opruimen). Dat is een kleine
uitbreiding op hetzelfde mechanisme, geen apart systeem.

### Privacy
- Teksten gaan naar Anthropic, net als nu al bij de mailintake. Geen nieuwe soort verwerking,
  wel even nagaan of de privacyverklaring dit dekt.
- Door het opruimen na 30 dagen blijft er geen permanente kopie bestaan.

---

## Fases

Schattingen zijn ruw en in werkdagen ontwikkeling; nalezen door collega's komt erbij.

### Fase 0 — Voorbereiding (kantoor, geen code)
- Een Poolse en een Tamil collega aanwijzen als nalezer.
- Woordenlijst vakwoorden opstellen (± 50 woorden).
- Bepalen welke medewerkers welke taal krijgen.

### Fase 1 — Fundament · ± 2 dagen
- Migratie `medewerkers.taal`.
- `next-intl` inrichten (root-provider op `nl`, `/m`-provider op de taal van de medewerker).
- Taalkeuze bij **Profiel → Instellingen**; kantoor kan het ook per medewerker instellen.
- Noto Sans Tamil, opmaak-hulpfunctie, pariteitstest, lintregel (eerst als waarschuwing).

### Fase 2 — Proef · ± 2 dagen
- **Startscherm, Planning en Prikklok** volledig in Pools en Tamil.
- `<VertaalbareTekst>` + cache al toepassen op planningnotities, om het mechanisme te testen.
- Collega's testen op hun eigen telefoon. Speciale aandacht: afgekapte teksten in het Tamil.
- **Beslismoment:** kwaliteit Tamil goed genoeg? Model kiezen. Pas daarna verder.

### Fase 3 — Overige schermen · ± 5 dagen
In groepen, elk los live te zetten:
1. Uren, verlof, uren keuren
2. Taken, notificaties
3. Dossiers, opname, oplevering, kwaliteit, bezoek
4. Materieel
5. Handboek, toolbox, formulieren (de schermschil — de inhoud is fase 5)
6. Profiel, inloggen/sessie-meldingen

Commercieel (`/m/commercieel`) is voor de buitendienst-verkoop, niet voor monteurs — **niet
vertalen** tenzij daar vraag naar komt.

### Fase 4 — Statusnamen en pushmeldingen · ± 1 dag
- Statuslabels (oplevering, kwaliteit, taken) krijgen in de app een vertaling via de
  taalbestanden; de Nederlandse labels voor desktop blijven ongewijzigd.
- `stuurPush()` kijkt naar de taal van de ontvanger: vaste titel uit de taalbestanden,
  variabel deel via de vertaalcache.

### Fase 5 — Variabele teksten · ± 3 dagen
- `<VertaalbareTekst>` toepassen in de volgorde hierboven (taken → handboek).
- Opruimtaak voor de cache.
- Lintregel van waarschuwing naar fout.

### Fase 6 (optioneel) — Andersom: monteur → kantoor · ± 2 dagen
- Een monteur typt een opmerking of afwijking in het Pools of Tamil.
- Op kantoor verschijnt bij die tekst "Vertaal naar Nederlands" (zelfde cache, doeltaal `nl`).
- Dit raakt het kantoordeel, daarom apart en pas na de rest.

### Fase 7 — Livegang
- Per groep schermen naar `main`, steeds met nalezen door de collega's.
- Na livegang één item in **Wat is nieuw** (pas als het op `main` staat).

**Totaal:** ± 13 werkdagen voor fase 1–5, plus 2 dagen voor fase 6 als die gewenst is.

---

## Risico's

| Risico | Maatregel |
|---|---|
| Tamil-teksten te lang voor knoppen/tabbladen | Elk scherm in het Tamil bekijken op 360 px breed; knoppen laten afbreken i.p.v. afkappen |
| Slechte vertaling vakwoorden | Woordenlijst in de prompt; collega's lezen na |
| Veiligheidstekst verkeerd begrepen | "Automatisch vertaald"-label, origineel één tik weg, later vastzetten mogelijk |
| Nieuwe Nederlandse tekst sluipt in de app | Lintregel + pariteitstest in CI |
| Vertaaldienst traag of onbereikbaar | Altijd terugvallen op Nederlands; cache vangt het meeste op |
| Kosten | Cache: elke tekst één keer per taal; enkele euro's per maand |

## Open beslissingen

1. **Automatisch vertalen of op knop?** Advies: automatisch, met "Toon origineel".
2. **Wie leest na** voor Pools en Tamil?
3. **Bewaartermijn cache:** 30 dagen voorgesteld.
4. **Fase 6** (monteur → kantoor) meenemen of later?
5. **Mag de medewerker zelf de taal kiezen**, of alleen kantoor? Advies: allebei.
