# Handleiding — Van aanvraag tot de laatste betaling in Eva

*Voor medewerkers. Geen technische kennis nodig. Deze handleiding beschrijft stap voor stap
hoe een klus door Eva loopt: van de binnenkomende aanvraag tot de laatste factuur die betaald
en afgeboekt is.*

> **Belangrijk om te weten voordat je begint.** Eva is niet het enige systeem. Eva werkt
> samen met **Bouw7** (het bedrijfssysteem waarin projecten, financiën en facturen leven).
> Voor veel stappen geldt: **Bouw7 is leidend voor de projectstatus en de cijfers**, en Eva
> haalt die informatie op en zet er een prettige werkomgeving, planning, offertes,
> takenlijsten en signalering bovenop. Twee keer per dag synchroniseert Eva automatisch met
> Bouw7 (zie [Automatiseringen](#3-automatiseringen)). Dat betekent dat sommige statussen die
> je in Bouw7 wijzigt, vanzelf in Eva verschijnen — en andersom.

---

## 1. Korte introductie

### Wat is Eva?

Eva (`apps/dashboard`, port 3000) is het centrale platform van Everts. Alle modules —
dossiers, calculatie & offertes (Everts-Calc), planning, werkbegroting, servicedesk,
facturen/debiteuren, taken, management — zitten in één omgeving. Eva praat op de achtergrond
met Bouw7 en met Microsoft 365 (Outlook voor mail, SharePoint voor het archiveren van
documenten).

### De entiteiten die het systeem kent

Een "entiteit" is een soort kaart of dossier dat het systeem bijhoudt. Dit zijn de
belangrijkste, met per stuk of Eva het écht zelf beheert of alleen toont vanuit Bouw7:

| Entiteit | Wat het is | Beheerd in Eva? |
|---|---|---|
| **Aanvraag** | Een binnengekomen klus die je opneemt en gaat calculeren. Wordt in Eva een *dossier*. | Ja — Eva-dossier |
| **Offerte** | De klantgerichte prijsopgave (uit Everts-Calc), met versiebeheer. | Ja — Everts-Calc |
| **Project / Opdracht** | Een gewonnen offerte die uitgevoerd wordt. Ook een *dossier*. | Ja — status two-way met Bouw7 |
| **Storingsmelding / Servicedesk** | Dagelijks onderhoud en mutatiewerk; wordt op regie (nacalculatie) afgerekend. | Ja — Eva-dossier |
| **Meerwerk** | Extra werk t.o.v. de opdracht, met eigen akkoord en afrekenwijze. | Ja — Eva, sync met Bouw7 |
| **Verkoopfactuur** | De factuur naar de klant. | **Alleen tonen** — factuur ontstaat in Bouw7 |
| **Inkoopfactuur** | De factuur van een leverancier/onderaannemer. | **Alleen tonen + toewijzen** — leeft in Bouw7 |
| **Onderaannemersopdracht** | Vaste-prijs-opdracht aan een onderaannemer. | **Alleen tonen** vanuit Bouw7 (zie kanttekening) |
| **Opleverpunt** | Restpunt na oplevering. | **Nog niet in Eva gebouwd** |

> **Twee zaken die (nog) niet in Eva zitten** — verzin ze dus niet als je de handleiding volgt:
> - **Onderaannemersopdracht** kun je *niet* in Eva aanmaken of beheren. Eva **toont** wel de
>   onderaannemerscontracten die in Bouw7 staan (in de Inkoop-tab van een dossier), inclusief
>   contractbedrag en wat er geboekt is. Aanmaken/wijzigen doe je in Bouw7.
> - **Opleverpunten / oplevering** bestaan niet als functie in Eva. Er is geen scherm om
>   restpunten vast te leggen. (In het bedrijfsproces horen ze er wel bij — ze zijn simpelweg
>   nog niet gebouwd.)
> - **Exact Online** is (nog) niet gekoppeld. In de bedrijfsdocumentatie staat Exact als
>   toekomstige koppeling, maar in de code zit er niets van. Boekhouding loopt via Bouw7.

---

## 2. Het complete proces van A tot Z

Hieronder loopt de hele keten chronologisch. Elke fase heeft:
**(a)** wat jij doet, **(b)** welke status Eva zet, **(c)** wie verantwoordelijk is,
**(d)** welke automatisering voor je werkt.

De statusnamen hieronder zijn exact de statussen uit het systeem
(`apps/dashboard/src/components/dossiers/types.ts`).

### Overzicht van de fases

```
Aanvraag  →  Offerte  →  Opdracht (uitvoering)  →  Facturatie  →  Debiteuren / betaling
   │                                    │
   └── Servicedesk (storing/onderhoud) ─┘  (parallelle, snellere route)
```

---

### FASE 1 — Aanvraag binnen (intake)

**(a) Wat je doet**
- Klik op **Nieuwe aanvraag** en vul de modal in: werkmaatschappij, klant (bestaand of nieuw),
  contactpersoon, werkadres (met postcodecontrole via PDOK), categorie, omschrijving, eventueel
  foto's/bestanden.
- Klik op **Aanmaken**.

**(d) Wat Eva automatisch doet bij het aanmaken** (`NieuweAanvraagModal.tsx` →
`maakAanvraag` in `lib/dossiers/actions.ts`):
1. Maakt het **dossier** aan in Eva.
2. Maakt gelijk een **Bouw7-project** aan (status "01. Offerte") en geeft het projectnummer
   terug. Lukt Bouw7 even niet, dan blijft de aanvraag in Eva staan met een waarschuwing.
3. Maakt een **Everts-Calc calculatieproject** aan en koppelt dat aan het dossier
   (`everts_calc_project_id`), zodat je meteen kunt gaan calculeren.
4. Zet eventuele bijlagen in de **SharePoint-dossiermap**.
- Nieuwe klant of contactpersoon die je in de modal invoert, wordt ook direct in Bouw7
  aangemaakt (best-effort).

**(b) Status die Eva zet:** hoofdstatus `aanvraag`, substatus **`nieuw`**.

**(c) Verantwoordelijk:** Planner / binnendienst.

**Aanvraag-statussen (in volgorde):**
`nieuw` → `inlezen_aanvraag` → `werkopname` → `uitwerken_begroting` → `controle_begroting` →
`offerte_gereed` → `verzonden`. Zijsporen: `afgewezen`, `vervallen` (beide sluiten het dossier
en maken het overal alleen-lezen).

Je verplaatst de aanvraag door deze statussen op het **Aanvragen-bord** (kanban) of via de
Informatie-tab.

---

### FASE 2 — Opnemen & calculeren

**(a) Wat je doet**
- Zet de aanvraag op **`werkopname`** en plan/voer de opname uit.
- Bouw de calculatie op in **Everts-Calc** (calculatiegrid): arbeid eigen dienst, ingehuurde
  arbeid, onderaanneming, materiaal, overige kosten, opslag. BTW per post.
- Zet de status naar **`uitwerken_begroting`** terwijl je werkt.

**(c) Verantwoordelijk:** Calculator / werkvoorbereider.

**(b) Status:** je stuurt deze statussen zelf; er is geen automatische overgang tussen opname
en calculatie.

---

### FASE 3 — Offerte laten goedkeuren (de "poort")

Voordat een offerte de deur uit mag, moet de **controller** hem goedkeuren. Dit is een harde
regel die het systeem afdwingt (`lib/goedkeuring/offerte.ts`).

**(a) Wat je doet**
- Klik op de offerte-preview op **Goedkeuring aanvragen**.

**(d) Automatisch:**
- Bij het aanvragen van goedkeuring zet Eva de aanvraag-substatus automatisch op
  **`controle_begroting`** en maakt een **beoordeeltaak** voor de controller aan (prioriteit
  hoog, deadline morgen).
- Keurt de controller **goed**, dan zet Eva de substatus automatisch op **`offerte_gereed`**,
  sluit de beoordeeltaak en stuurt de aanvrager een melding in Eva.
- Keurt de controller **af**, dan krijgt de aanvrager automatisch een aanpas-taak.

**Wanneer is goedkeuring verplicht?** (`offerteGoedkeuringVereist`)
- Categorie **Dagelijks onderhoud** of **Mutatie**: alleen bij een bedrag **op of boven de
  drempel** (instelbaar, standaard **€ 1.000 excl. btw**).
- **Alle andere categorieën:** altijd.
- **Interne calculaties:** nooit.

De goedkeuring wordt vastgeklonken aan de **exacte inhoud** van de offerte (een "hash"). Pas je
de offerte na goedkeuring nog aan, dan vervalt de goedkeuring en moet je opnieuw laten
goedkeuren. Zonder geldige goedkeuring kun je de offerte **niet versturen en niet als
definitieve PDF/Word downloaden**.

**(c) Verantwoordelijk:** Calculator (aanvragen), Controller/Directie (goedkeuren).

---

### FASE 4 — Offerte versturen

**(a) Wat je doet**
- Klik op **Offerte verzenden** in de offerte-preview. (De knop is grijs zolang de offerte niet
  goedgekeurd is.)
- Controleer de vooringevulde mail (ontvanger, tekst) en verstuur.

**(d) Wat Eva automatisch doet** (`offerte-verzenden.ts` → `verstuurOfferte`):
1. Controleert nogmaals de goedkeuring (de harde poort).
2. Maakt de offerte-PDF én een aparte PDF met de algemene voorwaarden.
3. Verstuurt de mail via **Outlook (Microsoft 365) namens jou** — de mail komt echt uit jouw
   naam, met de PDF's als bijlage.
4. **Pas na een geslaagde verzending** zet Eva de offerte-status op **`verzonden`** en legt vast
   wie, wanneer en naar wie verstuurd is.
5. Archiveert de PDF + de verzonden mail (`.eml`) automatisch in de **SharePoint-dossiermap**.

**(b) Status die Eva zet:**
- De **offerte** (in Everts-Calc) gaat naar **`verzonden`** en wordt daarmee vergrendeld: je kunt
  de inhoud niet meer wijzigen, alleen de status (bv. later naar geaccepteerd).
- Zet je het **dossier** op de Aanvragen-fase naar `verzonden`, dan **promoveert Eva het dossier
  automatisch** naar hoofdstatus **`offerte`** met offerte-substatus **`verzonden`** (dit gebeurt
  door een databasetrigger — zie [Automatiseringen 3.2](#32-automatische-fase-promotie)).

**Offerte-statussen (dossier-fase):**
`verzonden` → `nabellen` → `in_behandeling` → `mondelinge_toezegging` → `gewonnen`.
Zijsporen: `verloren`, `vervallen`.

**Meerdere versies / revisies:** wil je na verzenden nog iets aanpassen, gebruik dan **Kopiëren
naar nieuwe versie**. Er ontstaat een nieuwe offerte in `concept` met een opgehoogd
versienummer (bv. `OFT-2026-046-v2`); de verzonden versie blijft ongewijzigd bewaard.

**(c) Verantwoordelijk:** Calculator / werkvoorbereider.

---

### FASE 5 — Klant reageert

**(a) Wat je doet**
- Volg de offerte op. Zet het dossier op `nabellen`, `in_behandeling` of
  `mondelinge_toezegging` naar gelang het gesprek.
- Accepteert de klant → zet op **`gewonnen`**. Wijst de klant af → `verloren` (leg de reden vast).

**(b) Status → automatische promotie naar Opdracht:**
Zet je de offerte op **`gewonnen`**, dan **promoveert Eva het dossier automatisch** naar
hoofdstatus **`opdracht`** met substatus **`nieuwe_opdracht`** (databasetrigger, zie
[3.2](#32-automatische-fase-promotie)).

**(d) Automatisch bij "gewonnen":**
- Eva neemt de **werkbegroting** automatisch over: de begrote arbeidsuren uit de Everts-Calc
  werkbegroting worden gekopieerd naar de planning-werkbegroting van het dossier
  (`neemWerkbegrotingOverStil`). Dit gebeurt zowel op het moment dat jij "gewonnen" zet, als bij
  de nachtelijke sync als Bouw7 het project op "opdracht" zet.

**Let op — Bouw7 is leidend:** vaak wordt het winnen in **Bouw7** vastgelegd (offertestatus
"Gewonnen" of project naar "02. Nieuwe opdracht"). De sync spiegelt dat dan naar Eva. Je hoeft
het dan niet dubbel te doen.

**(c) Verantwoordelijk:** Calculator / projectleider.

---

### FASE 6 — Werkvoorbereiding, planning & inkoop

Nu is het een **Opdracht**. De opdracht-statussen zijn:
`nieuwe_opdracht` → `werkvoorbereiding` → `onderhanden` → `uitvoering_gereed` →
`financieel_gereed` → `financieel_afgesloten`.

**(a) Wat je doet**
- Sleep de opdracht op het **Opdrachten-bord** door de fasen, of wijzig de status op de
  Informatie-tab.
- Werk de **werkbegroting** af en laat die **accorderen** op regelniveau.
- Plan mensen in (Project- en Medewerkerplanning). Eigen monteurs en ingehuurde krachten (ZZP/
  uitzend) staan in dezelfde planning, herkenbaar aan contractvorm.
- Zet **bestellingen** klaar in de werkbegroting.

**(d) Automatisch / bewaking:**
- **Two-way status:** sleep je een opdracht naar een andere kolom, dan schrijft Eva die status
  **terug naar Bouw7** (`schrijfBouw7Projectstatus`). Lukt dat niet, dan zie je een melding;
  de Eva-status blijft dan wel staan.
- **Werkbegroting-poort:** een bestelling kun je pas **verzenden** als álle regels erachter
  geaccordeerd zijn én de werkbegroting sinds het klaarzetten niet gewijzigd is (hash-controle).
  Wijzig je de werkbegroting na accordering, dan verschijnt de **"WB!"-melding** op het dossier
  en moet er opnieuw geaccordeerd worden.
- **Actielijsten (IFTTT):** bij het bereiken van bepaalde statussen kan Eva automatisch een
  **takenlijst** aan het dossier hangen, als daar een sjabloon-trigger voor is ingesteld (zie
  [3.6](#36-actielijst-triggers-ifttt)).

**Bouw7-eigen statussen:** voor dossiers die uit Bouw7 komen zijn de opdracht-statussen door
Bouw7 beheerd — je kunt ze in Eva verslepen, maar de nachtelijke sync zet ze terug naar wat
Bouw7 zegt. De projectstatus wijzig je dus bij voorkeur op de plek die leidend is.

**(c) Verantwoordelijk:** Uitvoerder / projectleider (bewaakt), werkvoorbereider (inkoop).

---

### FASE 7 — Uitvoering

**(a) Wat je doet / wat er gebeurt**
- Monteurs schrijven **uren** en boeken **materiaal**/kosten (dit loopt via Bouw7; Eva toont
  het live in de dossiertabs Uren, Inkoop en Verkoop).
- **Meerwerk** leg je vast in de **Meerwerk-tab**. Elke meerwerkregel heeft een eigen status:
  `aangevraagd` → `offerte_verstuurd` → `akkoord` → `voltooid` (zijspoor `afgewezen`).
  Pas bij **`akkoord`** of **`voltooid`** telt het meerwerk mee in het contracttotaal.
- Afrekenwijze meerwerk: **aangenomen** (vaste prijs) of **regie** (op basis van geboekte
  uren/kosten op de eigen bewakingscode), of stelpost.

**(d) Automatisch bij meerwerk-akkoord:**
- Zet je een eigen meerwerkregel op **`akkoord`**, dan maakt Eva automatisch de bijbehorende
  **bewakingscode/hoofdstuk in Bouw7** aan (best-effort). Zo kan er op geboekt worden.
- Voor meerwerk kun je met **Meerwerk-offerte** een gekoppelde Everts-Calc offerte maken, die
  door dezelfde goedkeuringspoort loopt.

**(b) Status:** je zet de opdracht op **`onderhanden`** en later **`uitvoering_gereed`**. Uren
mogen (volgens het bedrijfsproces) alleen op lopende opdrachten worden geschreven.

**(c) Verantwoordelijk:** Monteur/vakman (uren, materiaal), uitvoerder (meerwerk-akkoord).

---

### FASE 8 — Facturatie

**Hoe facturen ontstaan hangt af van het soort werk:**

**Reguliere opdracht (aangenomen werk):** de verkoopfactuur wordt **in Bouw7** opgesteld en
verzonden. Eva **maakt deze factuur niet zelf**, maar toont hem live in de **Verkoop-tab** van
het dossier (termijnen, facturen). Termijn-facturen terugschrijven vanuit Eva is nog toekomst.

**Servicedesk / regie (nacalculatie):** hier kan Eva wél een factuur **klaarzetten**. In het
**Servicedesk regie-paneel** bouwt Eva de factuurregels op uit de geboekte uren (verkooptarief
per uursoort uit het klantcontract) en de overige kosten (standaard **+25% opslag**). Je kunt
per regel de prijs/opslag aanpassen of een regel uitsluiten. Met één knop pusht Eva de regels
als **concept-verkoopfactuur naar Bouw7** (`maakRegieFactuurInBouw7`, `POST /invoice`); de
regels worden dan gemarkeerd als "gefactureerd". Het definitief maken en versturen doe je in
Bouw7.

**(b) Status:**
- Opdracht: `financieel_gereed` als het werk klaar is voor eindafrekening.
- Servicedesk: `uitgevoerd` → `kosten_compleet` → `financieel_gereed`.

**(c) Verantwoordelijk:** Projectleider / administratie.

**(d) Automatisch:**
- BTW-splitsing (9% arbeid / 21% materiaal) wordt bij de sync uit Bouw7 afgeleid en op het
  dossier gezet.
- **Onderaannemersopdrachten** en **inkoopfacturen** komen uit Bouw7. In de **Inkoop-tab** kun je
  geboekte kosten handmatig **toewijzen** aan een inkooporder of onderaannemerscontract, of
  hercoderen naar een bewakingscode. Deze correcties leven alleen in Eva en veranderen niets in
  Bouw7. Let op: er is **geen** automatische matching van inkoopfacturen tegen geschreven uren —
  dat is toewijzing op kostenregel-niveau.

---

### FASE 9 — Debiteuren: van openstaande factuur tot betaling

Zodra een verkoopfactuur in Bouw7 openstaat, komt hij via de sync in het **Facturen /
Debiteuren-scherm** van Eva (`app/(platform)/facturen`).

**(a) Wat je doet**
- Werk per openstaande factuur de **opvolging** bij: redencode, actie, actiehouder, verwachte
  betaaldatum, opvolgdatum. Voeg **logboekregels** toe bij elk contact met de klant.
- Zet de **opvolgstatus**: `nieuw` → `loopt` → `wacht_op_klant` → `opgelost` (of `geescaleerd`).

**(d) Wat Eva automatisch doet** (draait mee met elke debiteuren-sync, dus 2× per dag):
- **Verkeerslicht** per factuur op basis van dagen ná vervaldatum: **groen** (niet vervallen),
  **oranje** (<30 dagen te laat), **rood** (30+ dagen).
- **Reminder:** is de opvolgdatum verstreken, dan stuurt Eva de projectleider (of administratie)
  een **melding in Eva** ("Opvolgdatum debiteur verstreken").
- **Auto-taak bij > 60 dagen:** staat een factuur meer dan 60 dagen na de vervaldatum open zonder
  taak, dan maakt Eva automatisch een taak aan ("Debiteur > 60 dagen te laat…", prioriteit hoog,
  deadline +7 dagen) en wijst die toe aan de projectleider (of MT als er geen is).
- **Verplichte-velden-signaal:** bij > 60 dagen te laat markeert Eva de factuur als "incompleet"
  zolang redencode, actie, actiehouder, opvolgdatum én een logboekregel niet allemaal ingevuld
  zijn.

> **Let op:** Eva stuurt **geen** automatische aanmanings-e-mails naar de klant. De reminders en
> taken zijn interne signalen. Het daadwerkelijke aanmanen/incasseren doe je zelf (of in Bouw7).

**(c) Verantwoordelijk:** Administratie / financieel beheer; projectleider voor eigen dossiers.

---

### FASE 10 — Afsluiten

**(a) Wat je doet**
- Is de laatste betaling binnen en alles afgehandeld, dan zet je de opdracht op
  **`financieel_afgesloten`** (definitieve afsluiting via de knop/laatste kolom).

**(b) Status & gevolg:** een dossier met `financieel_afgesloten` (of een Bouw7-projectstatus in
de "07"-reeks) geldt als **afgesloten** en wordt overal **alleen-lezen**. Het verhuist naar de
**Afgesloten-tab**.

**(c) Verantwoordelijk:** Administratie / directie.

> **Storingsdienst-uitzondering:** dagelijks onderhoud en mutatie lopen via de **Servicedesk** —
> een snellere, parallelle route zonder offertetraject. Zie het kader hieronder.

---

### Kader — De Servicedesk (storing / dagelijks onderhoud), parallelle route

Projecten met Bouw7-categorie **Dagelijks onderhoud** of **Mutatie**, of met een "LB"-status
(lopende bonnen), belanden automatisch in de **Servicedesk** in plaats van het reguliere
aanvraag-/offertetraject.

**Servicedesk-statussen:**
`nieuw` → `mandaat_verhoging` → `offerte_uitgebracht` → `uitgezet` → `ingepland` → `loopt` →
`uitgevoerd` → `kosten_compleet` → `financieel_gereed`.

**Kenmerken en hulp van Eva:**
- **Mandaat-indicator:** Eva vergelijkt (geboekte verkoopwaarde + uitgezette opdrachten ×1,25)
  met het ingestelde mandaatbedrag en waarschuwt bij overschrijding. Dit **blokkeert niets** —
  het is een signaal.
- **Regie-facturatie:** zoals in Fase 8 beschreven (uren op contracttarief, kosten +25%, push
  als concept-factuur naar Bouw7).
- **Doorlooptijd per fase:** Eva berekent uit de statushistorie hoelang het dossier in elke fase
  stond.

---

## 3. Automatiseringen

Dit is het complete overzicht van wat Eva **zelf** doet, wanneer het afgaat, en hoe je er het
beste gebruik van maakt. Waar nuttig staat het bestand erbij zodat het te verifiëren is.

### 3.1 De Bouw7-synchronisatie (2× per dag)

**Wat:** Eva haalt alles op uit Bouw7 en werkt de Eva-gegevens bij: relaties/contactpersonen,
medewerkers, verlof, projecten (met status, financiën, BTW), planning, debiteuren en het
management-dashboard.
**Wanneer:** automatisch via Vercel Cron — **04:30** een *volledige* sync (`full`) en **10:45**
een *incrementele* sync (`incremental`). *(`apps/dashboard/vercel.json`;
`lib/bouw7/run-cron-sync.ts`.)*
- *Full* = alles opnieuw ophalen en wegschrijven (corrigeert afwijkingen, vangt heropende
  projecten).
- *Incrementeel* = alleen gewijzigde records (via een vingerafdruk/`bouw7_sync_hash`) — sneller.
**Hoe je het gebruikt:** je hoeft niets te doen; 's ochtends staat alles klaar. Wil je tussendoor
verversen, gebruik dan de **Sync-knop** op de betreffende pagina (die synct alleen die sectie).

### 3.2 Automatische fase-promotie

**Wat:** een databasetrigger promoveert dossiers automatisch bij twee overgangen
*(`supabase/migrations/20260415_platform_core.draft.sql`, functie `tg_dossier_status_change`)*:
- Aanvraag op **`verzonden`** → wordt hoofdstatus **offerte**, substatus **`verzonden`**.
- Offerte op **`gewonnen`** → wordt hoofdstatus **opdracht**, substatus **`nieuwe_opdracht`**.

Elke statuswijziging wordt bovendien **gelogd** in de statushistorie.
**Wanneer:** direct op het moment dat de status wordt gezet (door jou, of door de Bouw7-sync).
**Hoe je het gebruikt:** je hoeft niet handmatig door te klikken naar de volgende fase — zet
gewoon "verzonden" of "gewonnen" en Eva verplaatst het dossier.

### 3.3 Bouw7-status spiegelen naar Eva

**Wat:** bij de sync vertaalt Eva de Bouw7-projectstatus + categorie + offertestatus naar de
Eva-statussen *(`lib/bouw7/sync.ts`, `mapBouw7NaarEvaStatus`; `lib/bouw7/status-map.ts`)*.
Opdracht- en servicedesk-statussen worden **altijd overschreven** vanuit Bouw7.
**Wanneer:** 2× per dag.
**Hoe je het gebruikt:** onthoud dat Bouw7 leidend is voor de projectfase. Een kaart die je in
Eva in de opdracht-fase versleept en die **niet** naar Bouw7 wordt teruggeschreven, springt bij
de volgende sync terug. Wijzig de projectstatus dus op de leidende plek.

### 3.4 Offerte automatisch op "verzonden" na mailen

**Wat:** na een geslaagde verzending via Outlook zet Eva de offerte automatisch op `verzonden`,
legt vast wie/wanneer/naar wie, en archiveert PDF + mail in SharePoint
*(`everts-calc/actions/offerte-verzenden.ts`)*.
**Wanneer:** direct na een succesvolle mail (HTTP 202).
**Hoe je het gebruikt:** verstuur via de knop in Eva (niet buiten Eva om), dan klopt de status en
staat het archief automatisch goed. Handmatig de status op verzonden zetten is niet nodig.

### 3.5 Goedkeuringspoort + automatische taken en statussen

**Wat:** *(`lib/goedkeuring/*.ts`)*
- Goedkeuring aanvragen → aanvraag-substatus automatisch **`controle_begroting`** + **beoordeel-
  taak** voor de controller.
- Goedgekeurd → substatus **`offerte_gereed`**, beoordeeltaak sluit, aanvrager krijgt melding.
- Afgekeurd → automatisch een aanpas-taak voor de aanvrager.
- Een offerte kan **niet verzonden of definitief gedownload** worden zonder geldige, ongewijzigde
  goedkeuring.
**Wanneer:** op het moment van aanvragen/goedkeuren/afkeuren.
**Hoe je het gebruikt:** vraag goedkeuring altijd via de knop in de offerte-preview. Wijzig je na
goedkeuring nog iets, vraag dan opnieuw goedkeuring (de knop laat dat zien).

### 3.6 Actielijst-triggers (IFTTT)

**Wat:** je kunt sjabloon-takenlijsten koppelen aan een status of gebeurtenis. Bereikt een
dossier die situatie, dan hangt Eva de bijbehorende takenlijst er automatisch aan
*(`taken/actions/sjablonen.ts`; migratie `20260610_actielijst_activeringen.sql`)*.
Triggertypen: statuswijziging, dossier aangemaakt, rol toegewezen, veldwaarde, bedragdrempel,
toggle aan. Elk sjabloon wordt **maximaal één keer per dossier** geactiveerd.
**Wanneer:** bij de statuswijziging (verwerkt bij de sync en bij het openen van het dossier).
**Hoe je het gebruikt:** stel de sjablonen en triggers één keer goed in (Taken → sjablonen); daarna
verschijnen de juiste taken vanzelf. Handmatig dezelfde lijst nog eens toevoegen is niet nodig.

### 3.7 Taken die bij afronding iets doen

**Wat:** een taak kan bij het afvinken automatisch een vervolgactie uitvoeren
*(`taken/actions/taken.ts`)*: dossier-substatus wijzigen, een rol toewijzen, een melding sturen of
een sjabloon activeren.
**Wanneer:** zodra je de taak op **gereed** zet.
**Hoe je het gebruikt:** handig om ketens te bouwen (taak af → status verder). Wees je ervan bewust
dat afvinken dus meer kan doen dan alleen de taak sluiten.

### 3.8 Werkbegroting automatisch overnemen

**Wat:** bij offerte → opdracht (of offerte "gewonnen") kopieert Eva de begrote arbeidsuren uit de
Everts-Calc werkbegroting naar de planning-werkbegroting *(`lib/planning/werkbegroting.ts`)*.
**Wanneer:** automatisch bij het winnen/promoveren, én tijdens de sync voor dossiers die die
overgang maakten.
**Hoe je het gebruikt:** je begroting staat meteen klaar in de planning. Er is ook een handmatige
"overnemen"-knop op de Planning-tab als je opnieuw wilt overnemen.

### 3.9 Debiteuren-reminders en auto-taken

**Wat:** verkeerslicht, reminder bij verstreken opvolgdatum, en een automatische taak bij > 60
dagen te laat *(`lib/debiteuren/actions.ts`; `lib/bouw7/sync.ts`,
`verwerkDebiteurTakenEnReminders`)*.
**Wanneer:** bij elke debiteuren-sync (2× per dag).
**Hoe je het gebruikt:** houd de opvolgvelden en het logboek bij; dan werken de reminders en de
"incompleet"-signalering voor je. De taken komen automatisch bij de juiste persoon terecht.

### 3.10 Wat er bewust NIET automatisch gebeurt

- **Geen automatische offerte-vervaldatum.** De "geldig tot"-datum staat wel op de offerte en de
  lijst kleurt hem rood als hij verstreken is, maar Eva zet een offerte **niet** vanzelf op
  `verlopen`. Dat gebeurt alleen als Bouw7 de offertestatus op vervallen/verloren zet en de sync
  dat overneemt. *(→ handmatig bewaken.)*
- **Geen automatische aanmanings-e-mails naar de klant.** Alleen interne reminders/taken.
- **Geen Exact Online-koppeling.** Niet gebouwd.
- **Terugschrijven naar Bouw7 gebeurt niet altijd automatisch:** de opdracht-status wordt
  teruggeschreven bij het verslepen; andere terugschrijf-acties (bv. termijnen) zijn nog toekomst.

---

## 4. Handmatig vs. automatisch — en waar de tijdwinst zit

| Stap | Handmatig (jij) | Automatisch (Eva) | Grootste tijdwinst |
|---|---|---|---|
| Aanvraag aanmaken | Modal invullen | Dossier + **Bouw7-project** + **calculatieproject** + SharePoint-map | Geen dubbele invoer in Bouw7 |
| Klant/contact nieuw | Invullen in modal | Ook in Bouw7 aangemaakt | — |
| Calculeren | Volledig handmatig | — | — |
| Goedkeuring | Aanvragen (knop) | Substatus + **beoordeeltaak**, meldingen, poort | Controle loopt vanzelf, niets glipt door |
| Offerte versturen | Op knop drukken, mail nalopen | Mail via Outlook, status `verzonden`, **archief in SharePoint** | Geen handmatig archiveren/status zetten |
| Offerte → Opdracht | "Gewonnen" zetten | **Promotie** naar opdracht + **werkbegroting overnemen** | Geen handmatige overzetting |
| Opdrachtstatus | Kaart verslepen | Status **terug naar Bouw7** + evt. **takenlijst** koppelen | Eén plek bijwerken |
| Uitvoering (uren/kosten) | Boeken (in Bouw7) | Eva **toont** live, leidt BTW af | Alles op één dossier zichtbaar |
| Meerwerk akkoord | Op `akkoord` zetten | **Bewakingscode in Bouw7** aanmaken | Geen handmatige code in Bouw7 |
| Regie-factuur (servicedesk) | Regels nalopen, knop | Regels opbouwen (uren+kosten+opslag), push **concept-factuur** naar Bouw7 | Factuurregels niet met de hand samenstellen |
| Verkoopfactuur (aangenomen) | In **Bouw7** maken/versturen | Eva toont in Verkoop-tab | — |
| Debiteuren opvolgen | Redencode/actie/logboek invullen | Verkeerslicht, **reminders**, **auto-taak >60d** | Niets vergeten, escalatie vanzelf gesignaleerd |
| Afsluiten | `financieel_afgesloten` zetten | Dossier wordt alleen-lezen, naar Afgesloten-tab | — |

**Kortom — waar Eva je het meeste werk uit handen neemt:**
1. **Aanvraag aanmaken** — één invoer wordt dossier, Bouw7-project én calculatie tegelijk.
2. **De goedkeurings- en verzendketen** — taken, statussen, mail en archivering lopen vanzelf,
   met een harde poort die fouten voorkomt.
3. **Offerte → opdracht** — automatische promotie + werkbegroting overnemen.
4. **Debiteurenbewaking** — verkeerslicht, reminders en de automatische taak bij > 60 dagen te
   laat zorgen dat er geen openstaande factuur blijft liggen.

---

*Deze handleiding is gebaseerd op de daadwerkelijke code (statusmachines in
`components/dossiers/types.ts`, sync in `lib/bouw7/`, goedkeuring in `lib/goedkeuring/`,
debiteuren in `lib/debiteuren/`, servicedesk in `lib/dossiers/servicedesk.ts`, en de
databasetriggers in `supabase/migrations/`). Waar het bedrijfsproces een stap voorschrijft die
nog niet in Eva zit (onderaannemersopdracht aanmaken, opleverpunten, Exact Online, automatische
klant-aanmaningen, offerte auto-verloop), is dat expliciet als "nog niet gebouwd" benoemd.*
