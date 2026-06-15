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
```
> Werkadres = `streetName` + losse `houseNumber` (samenvoegen, net als bij contacten).
> Projectcontactpersoon = `contactPerson` (niet de org-primair) — map op `contactpersonen.bouw7_id`.

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
