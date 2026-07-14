# Bouw7 API — Endpoint Reference

Centrale referentie voor alle beschikbare Bouw7-endpoints in EVA.  
Bij twijfel: kijk hier, niet in `client.ts` of `sync.ts`.

> Dit document beschrijft het **lezen** uit Bouw7 (alles GET, read-only).
> Voor **schrijven naar Bouw7** (two-way sync, 104 write-endpoints) → zie [`WRITE-ENDPOINTS.md`](./WRITE-ENDPOINTS.md).

---

## Authenticatie

**Geldt voor zowel Heimdall als Athena.**

```
POST https://heimdall.bouw7.nl/auth/login/{appName}/apiKey
Content-Type: application/x-www-form-urlencoded

Body: apiKey=<sleutel>
Response: { token: string }
```

Token gebruiken als `Authorization: Bearer <token>` op alle verdere requests.  
Bij 401 → token verlopen → opnieuw inloggen.  
`appName` staat opgeslagen in `integraties.config.app_name`.

---

## Heimdall — `https://heimdall.bouw7.nl`

Projectbeheer, relaties, medewerkers, offertes.  
Alle list-endpoints ondersteunen paginatie: `?limit=100&offset=0`.  
Response shape: `{ items: T[], count: number, limit: number, offset: number }`.

### Projecten

| Endpoint | Methode | Paginatie | Gebruik |
|---|---|---|---|
| `/list/projects` | GET | ✓ | Alle projecten ophalen (sync) |

**Velden op `Bouw7Project`** (geverifieerd via live `/list/projects`-response):
```
id, projectNumber, fullProjectNumber, name
contact { id, name, type, emailAddress }   ← de klant-organisatie
contactPerson { id, firstName, lastName, emailAddress, phoneNumber }  ← projectcontactpersoon (kan null)
status  { id, name, plansProject, closesProject, invoicesProject }
category { id, name }
projectLeader, workPlanner, executor { id, firstName, lastName }   ← executor kan null
branch { id, name }
streetName, houseNumber, zipCode, city     ← LET OP: géén `street`/`postCode`; huisnummer staat los
startDate, endDate, deliveryDate
totalExclVat        — HISTORISCH: komt niet meer voor in de response én bevatte incl. BTW. Niet gebruiken.
fixedPrice          — vaste aanneemsom (excl. BTW) als string
budgetAmount        — begroting
information, reference
caVveCode, caVerfleverancier, caWillenWeDezeMaken, caFactuuradres, caEindverantwoordelijkeOfferte,
caOfferteSubstatus, caCalculator
                    — maatwerkvelden (custom attributes), plat met `ca`-prefix; vrije tekst (vaak leeg)
```
> Werkadres = `streetName` + losse `houseNumber` (samenvoegen, net als bij contacten).
> Projectcontactpersoon = `contactPerson` (niet de org-primair) — map op `contactpersonen.bouw7_id`.
> **Maatwerkvelden:** komen plat mee op `/list/projects` (géén apart endpoint). `caEindverantwoordelijkeOfferte`
> bevat de naam van de eindverantwoordelijke (alleen gevuld in de Offerte-fase) en wordt in `syncProjects()`
> via naam-matching op `medewerkers` overgezet naar de dossier-rol **Controller** (`controller_id`).
>
> **Projectleider ≠ werkvoorbereider.** Bouw7 staat niet toe dat dezelfde medewerker `projectLeader`
> én `workPlanner` is (geverifieerd: van de 539 projecten heeft er géén zo'n combinatie). EVA staat dat
> wél toe. Daarom is het maatwerkveld **`caCalculator`** ("Calculator", id 21012, fieldType `employee`
> = vrije-tekstnaam) de tweede drager van de calculator-rol:
> - **Schrijven** (`lib/dossiers/bouw7-rollen.ts`): `caCalculator` krijgt altijd de naam van de
>   EVA-calculator; `workPlanner` alleen als die ≠ projectleider — botst het, dan blijft `workPlanner` leeg.
> - **Lezen** (`syncProjects()`): `calculator_id` = `workPlanner` → anders naam-match op `caCalculator`
>   → anders de bestaande waarde.

**Status-mapping Heimdall → EVA:**
- `01.*` → aanvraag
- `02.`–`07.*` → opdracht (met substatus)
- `08. Afgewezen` → offerte / verloren
- `09. Verzonden` → offerte / verzonden
- `LB.*` of categorie `Dagelijks onderhoud` / `Mutatie` → servicedesk

### Offertes

| Endpoint | Methode | Paginatie | Gebruik |
|---|---|---|---|
| `/list/quotations` | GET | ✓ | Alle offertes (sync, meest recente per project) |
| `/quotation/{id}` | GET | — | Offerte-detail mét regels (chapters[].lines[]) — bron voor gecalculeerde kostprijs |

**Velden op `Bouw7Quotation`** (lijst-endpoint):
```
id, quotationNumber, subject, reference, quotationDate
employee { id, firstName, lastName, prefix }   ← calculator
project  { id, name }
contact  { id, name }
subtotal         — verkoopprijs EXCL. BTW, ínclusief AK- en W&R-opslag ("Totaal excl. BTW" in Bouw7)
total            — verkoopprijs INCL. BTW   ← geverifieerd: total/subtotal is exact de BTW-factor
commissionPercentage                           (1,21 / 1,09 / gemengd / 1,00 bij BTW-verlegd)
quotationStatus  { id, name }
createdAt, updatedAt
```
> **LET OP:** `subtotal` is GEEN kostprijs. De gecalculeerde kostprijs zit in het
> detail-endpoint: `chapters[].lines[].calculationTotal` (som van laborTotal,
> materialTotal, equipmentTotal, subcontractingTotal, purchaseOrderTotal, garbageTotal).
> Null/0 als de offerte niet via de Bouw7-calculatiemodule is opgebouwd.

**Detail-endpoint `/quotation/{id}`** — extra velden voor financiën:
```
chapters[].lines[]
  subtotal              — verkoopprijs van de regel (excl. AK/W&R)
  vatTariffPercentage   — "21" / "9" / "0" (verlegd of geen)
  vatTariffObject       — { label: 'Hoog 21%' | 'Laag 9%' | 'Verlegd 21%' | 'Geen', percentage }
  option                — optionele regel, telt niet mee
  calculationTotal      — gecalculeerde kostprijs van de regel
overheads               — AK-percentage over de regelsom (bv. "10"), met overheadsVatTariff
profitAndRisk           — W&R-percentage over de regelsom (bv. "5"), met profitAndRiskVatTariff
```
> **BTW-splitsing:** grondslag per tarief = regel-subtotalen per tarief + AK-bedrag en
> W&R-bedrag bij hun eigen tarief. Som van de BTW-bedragen == `total` − `subtotal`.
> **Athena `fixedPrice` is de regelsom zónder AK/W&R** — daarom is het offerte-`subtotal`
> leidend voor de aanneemsom zodra de offerte aansluit op het contractbedrag (zie sync.ts).

### Relaties

| Endpoint | Methode | Paginatie | Gebruik |
|---|---|---|---|
| `/list/contacts` | GET | ✓ | Alle klanten, leveranciers, onderaannemers |
| `/list/contactpersons` | GET | ✓ | Contactpersonen bulk (sneller dan per contact) |
| `/contacts/{id}` | GET | — | Contactpersonen per contact (fallback) |

**Velden op `Bouw7Contact`:**
```
id, name
type { id, name }      ← 'supplier' → leverancier, 'subcontractor' → onderaannemer
contactPersons[]
streetName, houseNumber, zipCode, city, countryCode
emailAddress, phoneNumber, mobilePhoneNumber
cocNumber (KvK), vatNumber (BTW), iban
information, isActive
```

**Type-mapping Bouw7 → EVA:**
- `supplier` → `leverancier`
- `subcontractor` → `onderaannemer`
- overig → `opdrachtgever`

### Medewerkers

| Endpoint | Methode | Paginatie | Gebruik |
|---|---|---|---|
| `/list/employees` | GET | ✓ | Alle medewerkers |

**Velden op `Bouw7Employee`:**
```
id, firstName, prefix, lastName
email, phone, function
department { id, name }, branch { id, name }
isActive
hourlyRate   — verkooptarief per uur
costRate     — kostprijstarief per uur
```

### Organisatie (verbindingstest)

| Endpoint | Methode | Gebruik |
|---|---|---|
| `/organization` | GET | Ophalen bedrijfsnaam — testverbinding |

---

## Athena — `https://athena.bouw7.nl`

**Financieel per project.** Dezelfde Bearer token als Heimdall.

| Endpoint | Methode | Gebruik |
|---|---|---|
| `/project-financial/{bouw7_id}` | GET | Volledig financieel projectoverzicht |
| `/project-control/{bouw7_id}/cost-type/total` | GET | Kostentotalen per type (alternatief) |

### `Bouw7ProjectFinancial` — volledig schema

Elk kostenveld heeft drie sub-kolommen: `budgeted` / `prognosis` / `realised`.  
De API kan waarden retourneren als `number` **of als string** — gebruik altijd `toNum()` in de UI.

```
fixedPrice            Vaste aanneemsom (contractbedrag) — soms string
additionalWork        Meerwerk (na opdracht bijgekomen)
provisionalCosts      Stelposten
tailCosts             Nastaartkosten

revenue
  .budgeted           Begrote omzet / aangenomen bedrag
  .prognosis          Omzetprognose
  .realised           Gerealiseerde omzet (= gefactureerd)

costs
  .labor              Uren (arbeid eigen + ingehuurd)
    .budgeted / .prognosis / .realised
  .material           Materialen
    .budgeted / .prognosis / .realised
  .equipment          Materieel / hulpmiddelen
    .budgeted / .prognosis / .realised
  .subcontracting     Onderaanneming
    .budgeted / .prognosis / .realised
  .purchaseOrder      Inkooporders
    .budgeted / .prognosis / .realised
  .other              Overige kosten
    .budgeted / .prognosis / .realised

result
  .budgeted / .prognosis / .realised   Projectresultaat

generalCostsProfit
  .budgeted / .prognosis / .realised   Algemene kosten + winst
```

> **Let op:** Athena-data wordt **niet** opgeslagen in de EVA-database.
> Gebruik `getDossierFinancieel(dossierId)` (server action in `lib/dossiers/actions.ts`)
> om live data op te halen. Gebruik altijd `toNum(v)` (uit `FinancieelTab.tsx`) voor veilige
> nummer-conversie — de API retourneert soms strings i.p.v. numbers.

---

## Planning (Apollo — `https://apollo.bouw7.nl`)

Bouw7's planning zit **niet** in Heimdall maar in de **Apollo** search-API. Auth is dezelfde
Heimdall-JWT (Bearer-token) — `Bouw7Client.getApollo()` / `.getApolloAll()` hergebruiken die.

| Wat | Endpoint | Methode | Query-DSL |
|---|---|---|---|
| Plan-items van een project | `GET /search/plan-items` (Apollo) | read | `project.id = {bouw7_id} limit 1000 page {n}` via `X-Query` header |
| Detail van één plan-item (mét medewerkers) | `GET /plan-item/{id}` (Heimdall) | read | — |

**Query-DSL:** filter + paginatie gaan mee via de `X-Query`-header (geen URL-encoding nodig),
bv. `project.id = 3494115 limit 1000 page 2`. De response is `{ items: PlanItem[], __metadata }`;
`__metadata.page.total` geeft het aantal pagina's.

**`PlanItem` → EVA-mapping** (zie `sync-planning.ts`):

| Bouw7 plan-item | EVA |
|---|---|
| `securityPlanningLink.securityCode.chapter` (WERKZAAMHEDEN, STELPOSTEN, …) = **Hoofdtaak** | `planning_fasen` (bouw7_id `chapter:{id}`) |
| plan-items zónder bewakingscode (crewblok) | fase **"Algemeen"** (`chapter:algemeen`) |
| plan-item zelf = **Taak** | `planning_activiteiten` (bouw7_id `{planItem.id}`) |
| `assignedEmployees[]` (per medewerker) | `planning_items` (bouw7_id `{planItem.id}:{employee.id}`) |

> **Let op:** in de huidige Everts-data heeft géén plan-item `assignedEmployees` — er wordt op
> `department` gepland, niet op individu. De split-per-medewerker is ingebouwd maar levert pas
> planitems op zodra Bouw7 medewerkers aan plan-items koppelt. Tot dan: alleen fasen + activiteiten.
>
> **Read-only:** Apollo `/search/*` is alleen-lezen. Planning terugschrijven via Apollo kan dus niet.
> Voor schrijven naar Bouw7 bestaat een aparte **Heimdall write-API** (zie [`WRITE-ENDPOINTS.md`](./WRITE-ENDPOINTS.md));
> een `plan-item`-write-endpoint lijkt daar echter niet bij te zitten. Het model is two-way-ready (`bouw7_id` + `bron`).

---

## Projectbewaking per bewakingscode (Financieel-tab)

De Financieel-tab toont financiën **per bewakingscode** (security code). Eén endpoint levert
alles — begroting, prognose, geboekte/bestede uren én geboekte kosten — per kostensoort.

**Bron — Athena, per kostensoort:**
```
GET /project-control/{id}/cost-type/{costType}/chapters?include_subprojects=false
```
> **LET OP:** het `/chapters`-achtervoegsel is verplicht; `/project-control/{id}` of
> `/project-control/{id}/cost-type/{n}` zonder `/chapters` geeft 404.
> Optioneel sorteren via `&q=SORT(chapterInfo.code,+ASC)`. Verwante endpoints: `…/graph` (tijdreeks).

**Kostensoort-id's** (`cost-type/{n}`) — geverifieerd: `costAmount` per soort == `/project-financial`
realisatie, `budgetAmount` == budgeted (zie `BOUW7_COST_TYPE`):
```
1 = Arbeid          (hourInfo.costHours = geboekte/bestede uren)
2 = Inkoop
3 = Onderaanneming
4 = Materieel
5 = Materiaal
6 = Afval
(7 bestaat maar is leeg; geen "total"-variant — roep 1..6 los aan en aggregeer)
```

**Response-vorm** (`{ count, totals, items[] }`): `items[].chapterInfo` (hoofdstuk-aggregatie) +
`items[].securityCodes[]` (per code), beide met dezelfde velden. `totals` = projecttotaal voor die soort.
```
budgetAmount         Begroot bedrag            costAmount          Geboekte kosten (besteed)
prognosisAmount      Totale prognose           contractCostAmount  Inkooporders/OA-contracten (verplicht)
progress             % gereed (number)         additionalWorkAmount Meerwerk
hourInfo.budgetHours / .prognosisHours / .costHours (geboekte uren) / .allowedHours
```
> `chapterInfo.name === 'uncoded_costs'` (id 0) = **kosten zonder bewakingscode** (securityCodes leeg;
> data staat op `chapterInfo`). EVA toont dit als één regel "Kosten zonder bewaking".
>
> **Eén code kan onder meerdere kostensoorten begroot zijn** (bv. SW.A onder Arbeid + Materiaal +
> Onderaanneming). `getDossierBewaking()` voegt per code samen: begroting/prognose/kosten **sommeren**,
> `costHours`/arbeidskosten uit kostensoort 1, % gereed van de soort met de grootste begroting.

### Aanvullende bronnen (2 extra kolommen)

De Financieel-tab combineert project-control met twee andere endpoints:

| Kolom | Bron | Berekening |
|---|---|---|
| **Geboekte kosten** | Apollo `GET /search/purchase-invoices` (`project.id = {id}`) | `arbeidskosten` (ct1 `costAmount`, altijd geboekt) **+** inkoop mét inkoopfactuur. Dedupe op `deliveryTicket.id` (termijn-facturen → zelfde bon); som `deliveryTicket.cost` per `deliveryTicket.securityLink.code.code`. **Let op:** géén `costAmount`-som — dat telt ook niet-gefactureerde leverbonnen mee. |
| **Verwachte kosten** | Heimdall `GET /list/contract-order-lines` | `q`-DSL: `project.id = {id} SORT(description, ASC) LIMIT 1000` (ongefilterd, gelijk aan Bouw7's eigen lijsttotaal). **Projecttotaal** = het response-`total`-veld (volledig, ook bij >LIMIT regels). **Per code** = Σ `totalPrice` per `projectSecurityLink.code`. Dit zijn **alle verwachte-kosten-regels** (incl. arbeid/inhuur), niet alleen inkoop — "bestelregel" is een misleidende naam. Een aparte inkoop/OA-splitsing is bewust niet gemaakt (`contact.type`/regel-`costType` zijn te onbetrouwbaar; Everts voert alles als losse regel in). **Let op:** géén statusfilter — eerdere `status IN (0,3) AND projectSecurityLink.status != 2 AND totalPrice >= 0` liet regels vallen waardoor het totaal te laag werd (3830976: €38.706 i.p.v. €46.706). |

> **Niet gebruiken voor geboekte kosten:** `costAmount` (besteed = álle leverbonnen) en
> `contractCostAmount` (klopt niet/0 in de praktijk). Geverifieerd op 3567976: geboekte kosten
> €19.461 (arbeid €14.591 + factuur €4.870), niet €19.509 (incl. €48 niet-gefactureerde bon).
>
> **Historie:** `/search/delivery-tickets` + `/list/security-codes` zijn een alternatieve realisatie-bron;
> de vierde host `hermes.bouw7.nl` (FastAPI) is niet nodig gebleken.

### EVA-server action

| Wat | Server action | Bestand |
|---|---|---|
| Bewaking per bewakingscode (live) | `getDossierBewaking(dossierId)` | `lib/dossiers/actions.ts` |

---

## Inkoop / Verkoop / Uren-tabs (Heimdall `/list/*`, geverifieerd jun 2026)

Heimdall-lijstendpoints met een `q`-HQL-filter (zelfde mechaniek als `/list/contract-order-lines`:
`client.get(path, { q })`). Response-vorm: `{ items: T[], count, limit, offset }` (sommige met extra
totaal-velden). Live opgehaald, géén opslag — defensief met `.catch` per bron + `beschikbaar`-flag.

| Wat | Endpoint | Filter (`q`) | Belangrijke velden |
|---|---|---|---|
| **Projectstatussen** | `GET /list/project-statuses` | `LIMIT 200` | `id`, `name` ("04. Onderhanden") — bron voor status-id bij terugschrijven |
| **Uren per medewerker** | `GET /list/hour-logs/employee` | `project.id = {id}` | item: `employee{firstName,lastName}`, `type{name}` (uursoort), `projectSecurityLink{code,name}`, `hours`, `logDate`, `hourlyRate`, `invoicedAmount`, `isApproved`. Envelope: `totalHours`, `totalCost` |
| **Termijnstaat** | `GET /list/project-invoice-term-statements` | `project.id = {id}` | `id` (= statement-id, nodig voor de termijnen hieronder), `project{id,number,name}`, `contact{name}`, `fixedPrice` (aanneemsom) |
| **Verkooptermijnen** | `GET /list/project-invoice-terms` | **`statement.id = {statementId}`** | `id`, `description`, `percentage`, `subtotal`, `invoiceableAt`, `vatTariffPercentage`, `invoiceLine{invoiceId,invoiceStatusId}` |
| **Verkoopfacturen** | `GET /list/invoices` | `project.id = {id}` | `invoiceNumber`, `status` (int), `isCredit`, `date`, `dueDate`, `datePaid` (gevuld = betaald), `total` |
| **Onderaannemerscontracten** | `GET /list/subcontractor-contracts` | `project.id = {id}` | `subcontractor{name}`, `statusName`, `name`, `price` (contractbedrag), `outstandingCosts`, `projectSecurityLink{code}` |
| **Inkoopfactuur-detail** | `GET /purchase-invoicing/purchase-invoice/{id}` | — (id in het pad) | **`lines[]`** (de échte factuurregels: `description`, `quantity`, `unitPrice`, `subTotal`, `vatTariffPercentage`, `deliveryTicket{ticketNumber, projectSecurityLink{code,name}}`) + **`file{uri, name, extension}`** (de factuur-PDF) |

> **De factuurregels van een inkoopfactuur zitten ALLEEN hier** (geverifieerd jul 2026, gevonden door
> het verzoek van Bouw7's eigen UI af te lezen). De `/purchase-invoicing/`-prefix is de sleutel:
> `/purchase-invoice/{id}`, `/list/purchase-invoice-lines`, `/list/delivery-ticket-lines` en de
> Apollo-varianten geven **allemaal 404** (~45 varianten over Heimdall/Athena/Apollo geprobeerd).
>
> **Gebruik de embedded `deliveryTicket` op `Bouw7PurchaseInvoiceListItem` NIET als regelbron** — die
> geeft één leverbon met alleen een totaalbedrag, zónder aantal/stukprijs. Ook `/list/delivery-tickets`
> is te grof: één leverbon kan meerdere artikelregels bundelen (bv. factuur 10028613 = 1 bon van
> €20,78 die bestaat uit 2 regels van €7,36 + €13,42).
>
> **Document downloaden met `file.uri`, NIET met `file.secureHash`**: `/storage/{uri}/download` levert
> de PDF; `/storage/{secureHash}/…` geeft 404. (Bij `Bouw7ProjectFile` werkt de secureHash juist wél —
> de twee resources gedragen zich verschillend.)
>
> **Kosten: één call per factuur** → alleen on-demand ophalen (bij het uitklappen van een regel), niet
> in bulk voor een heel dossier (>100 facturen komt voor). Zie `getInkoopFactuurDetail`.
> De factuur is voor de gebruiker te openen in Bouw7: `https://start.bouw7.nl/purchase-invoice#/view/{id}`.

> **Termijnen zijn een twee-traps-query** (geverifieerd jul 2026). `statement.project.id` is **niet**
> HQL-mapped op `ProjectInvoiceTermListItem` → **HTTP 400**. Haal eerst de termijnstaat op met
> `/list/project-invoice-term-statements` (`project.id = {id}`), en dan per statement de termijnen
> met `/list/project-invoice-terms` (`statement.id = {statementId}`).
>
> **`invoiceLine.invoiceStatusId` zegt níets over verzonden/concept** — die is 0 voor zowel concept-
> als reeds gemailde facturen. Of een termijn verzonden is, blijkt uit de gekoppelde verkoopfactuur:
> `isMailed` (verzonden) en `datePaid` (betaald). Zo leidt `getDossierVerkoop` de termijnstatus af:
> geen `invoiceLine` → *Nog te factureren*; wel een factuur maar `isMailed=false` → *Concept*.

### EVA-server actions

| Wat | Server action | Bestand |
|---|---|---|
| Inkoop (orders + OA-contracten + geboekte kosten) | `getDossierInkoop(dossierId)` | `lib/dossiers/actions.ts` |
| Uren (per medewerker, fallback per bewakingscode) | `getDossierUren(dossierId)` | `lib/dossiers/actions.ts` |
| Verkoop (termijnen + facturen + betaalgegevens) | `getDossierVerkoop(dossierId)` | `lib/dossiers/actions.ts` |

> **Two-way status** (zie `WRITE-ENDPOINTS.md`): `schrijfBouw7Projectstatus()` in `lib/dossiers/bouw7-status.ts`
> mapt EVA opdracht-substatus → Bouw7-status-id (via `/list/project-statuses` + `lib/bouw7/status-map.ts`)
> en schrijft met read-modify-write: `GET /project/{id}` → `POST /project { id, type, status:{ id } }`.

---

## Offerte-herinneringen · To-do's · Notities (Heimdall `/list/*`, geverifieerd jul 2026)

Bulk-lijstendpoints met `q`-HQL-filter. Beide lijsten zijn klein (tientallen records org-breed),
dus de sync haalt ze **volledig** op en groepeert per `bouw7_id`; per-dossier scoping via `q`.

| Wat | Endpoint | Filter (`q`) | Belangrijke velden |
|---|---|---|---|
| **Offerte-herinneringen** | `GET /list/quotation-reminders` | `processed = false` (open) · `quotation.projectId = {id}` | `id`, `description` (tekst), `remindAt` (datum), `processed` (bool = afgehandeld), `quotation{id,subject,number,employeeId,projectId}`, `createdBy{id,username}` (username = e-mail) |
| **To-do's** | `GET /list/todos` | `isDone = false` (open) · `project.id = {id}` | `id`, `name` (titel), `description` (vaak null), `priority` (int), `executeBefore` (deadline), `isDone` (bool), `project{id,name,number,status}`, `associatedEmployeeNames` (komma-string van volledige namen — **géén** employee-id's) |

**Koppeling → dossier:** herinnering via `quotation.projectId`, to-do via `project.id`, beide = `dossiers.bouw7_id`.

**Notities:** géén lijst-endpoint (`/list/notes`, `/list/project-notes` → 404). De interne projectnotitie is
het enkele veld **`note`** op `GET /project/{id}` (detail-call; **niet** aanwezig op `/list/projects`).
`information` op de projectlijst is de offerte-/projectomschrijving, geen notitie.

> **Geen detail-endpoint per item:** `GET /todo/{id}` en `/list/todos/{id}` geven 404 — alleen de
> lijstvorm bestaat. Toewijzing van een to-do is dus alleen op **naam** te matchen (`associatedEmployeeNames`).

### EVA-mapping (zie `sync.ts`)

| Bron | EVA-doel | idempotentie |
|---|---|---|
| Offerte-herinnering (open) | `dossier_notities` (`bouw7_bron='reminder'`, `bouw7_ref='reminder:{id}'`) | unieke `(dossier_id, bouw7_ref)` |
| Interne projectnotitie (`note`) | `dossier_notities` (`bouw7_bron='note'`, `bouw7_ref='note:project'`) | 1 per dossier; leeg → verwijderd |
| To-do (open) | `tasks` (`bouw7_todo_id`, `dossier_id`) + `task_assignees` | unieke `(dossier_id, bouw7_todo_id)` |

> **Auteur/toewijzing:** herinnering-auteur via `createdBy.username` → `medewerkers.email`. To-do-toewijzing via
> `associatedEmployeeNames` → naam-match op `medewerkers` → `auth_user_id` (alleen medewerkers mét auth-user
> zijn toewijsbaar; `task_assignees.user_id` is NOT NULL). Geen match → notitie zonder auteur / taak ontoegewezen.
>
> **Notitie-sync is duur** (1 detail-call per dossier): draait in `full`-modus en bij de per-dossier verversknop,
> **niet** in de incrementele cron. Herinneringen + to-do's (goedkope bulk) draaien altijd volledig.

---

## EVA-intern (Supabase)

Financiële data die wél in de EVA-database staat.

| Wat | Server action | Tabel |
|---|---|---|
| Dossier bedragen + kostprijs | `getDossierById(id)` | `dossiers.bedrag_excl_btw` (verkoopprijs excl. BTW: Athena `fixedPrice`/`revenue.budgeted`, anders offerte-`subtotal`), `.bedrag_incl_btw` (verkoopprijs incl. BTW: offerte-`total`), `.kostprijs_excl_btw` (som `calculationTotal` van de offerteregels, anders null) |
| Facturatie-instellingen klant | `getDossierFinancieel(id)` | `relatie_facturatie` |
| Betalingscondities | `getBetalingscondities()` | `betalingscondities` |
| Bankgegevens klant | via relaties join | `relatie_bankgegevens` |
| Calculatietotalen | `getQuotesByProject()` | `quotes`, `quote_lines` (everts-calc DB) |

---

## Patronen & valkuilen

- **Nooit `fixedPrice` (Heimdall) gebruiken als financiële waarheid** — gebruik Athena `/project-financial/{id}` voor nauwkeurige bedragen.
- **Athena-aanroepen zijn traag** (externe API per project). Doe ze parallel waar mogelijk, nooit in een loop zonder batching.
- **Quotations zijn 1:n per project** — filter op de recentste per projectId voor de "actuele" offerte.
- **`bouw7_id` kan null zijn** op handmatig aangemaakte dossiers — altijd nullcheck voor Athena-calls.
- Nieuwe sync-functies toevoegen? → voeg ze toe in `lib/bouw7/sync.ts` en log via `logSync()`.
