# Bouw7 API — Schrijven (write) naar Bouw7

Planningsreferentie voor het **two-way** maken van de Bouw7-koppeling.
Tegenhanger van [`ENDPOINTS.md`](./ENDPOINTS.md) (dat beschrijft alleen het **lezen**).

> **Status (juni 2026):** Bouw7 (Heimdall) heeft een **volledige write-API** — 104 schrijf-operaties.
> `Bouw7Client` heeft `post()/put()/del()`. **Eerste two-way feature is live:** werkbegroting → prognose
> (zie §0). Bron: Swagger-spec `https://heimdall.bouw7.nl/api/spec.json`.

---

## 0. Geïmplementeerd & live: werkbegroting → prognose (juni 2026)

EVA schrijft de **werkbegroting** terug als **prognose** ("Niet/anders begroot") per bewakingscode in
Bouw7. Kern: `apps/dashboard/src/app/(platform)/everts-calc/actions/werkbegroting.ts`
(`stuurWerkbegrotingPrognoseBouw7`, `previewWerkbegrotingPrognoseBouw7`, `resolveBewakingscodes`,
`getProjectHoofdstukken`, `getBouw7BewakingscodesImport`) + UI in `WerkbegrotingHoofdscherm.tsx` /
`WerkbegrotingGrid.tsx`. Knop **"Prognose naar Bouw7"** met preview.

### Gebruikte endpoints (deels ongedocumenteerd — afgevangen uit de Bouw7-UI)

| Doel | Endpoint | Body / opmerking |
|---|---|---|
| **Prognose zetten** per PSL | `POST /project/update-prognosis-other` (Heimdall) | `{ id: <pslId>, prognosisOtherAmount: "<bedrag>", prognosisOtherHours?: "<uren>" }`. **Prognose = begroot + prognosisOtherAmount.** Uren alleen voor Arbeid. |
| **Structuur lezen** (codes+begroting) | `GET /project/{id}/project-security-links` (Heimdall) | `[{ securityObject, securityCodesPerChapters: [{ securityCodeChapter{id,name}, budgetDataPerSecurityCodes: [{ securityCode{id,code,name}, laborCosts, subcontractorCosts, materialCosts, … }] }] }]` |
| **Structuur schrijven** (PSL aanmaken) | `POST /project/{id}/project-security-links` (Heimdall) | Body `{ securityCodeChaptersPerObjects: [...zelfde array...] }` — **read-modify-write** (vervangt alles). Code+kostensoort toevoegen = kostensoort-veld op `"0"` zetten → PSL ontstaat (begroot 0). |
| **Bewakingscode aanmaken** | `POST /security-code` (Heimdall) | `{ name, code, securityCodeChapter: { id } }` → response `{ id }`. Hoofdstuk-id moet bestaan — zie de rij hieronder. |
| **Hoofdstuk aanmaken** | `POST /security-code-chapter` (Heimdall) | `{ name, code }` → 201 `{ id }`. **Globale stamdata** (lijst: `GET /list/security-code-chapters`), niet project-eigen. `code` mag **niet leeg** zijn. |
| **Bewakingscodes/begroting lezen** | Athena `GET /project-control/{id}/cost-type/{1,3,5}/chapters` | `securityCodes[].pslIds[0]` = PSL-id per (code × kostensoort); `budgetAmount`, `hourInfo.budgetHours`. |
| **Bestelregels** (import) | `GET /list/contract-order-lines` (Heimdall, `q`-DSL) | items: `quantity`, `quantityFactor`, `unitPrice`, `unit`, `totalPrice`, `costType` (regel-enum!), `projectSecurityLink{code,costType}`. Aantal = `quantity × quantityFactor`. |
| **Bestelregels** (schrijven) | `POST /contract-order-line` (Heimdall, **ongedocumenteerd**) | Zie §2b. **Niet** `/project/{id}/contract-order-line` — die is material-only. |

### Kostensoort ↔ structuur-veld
ct1 Arbeid → `laborCosts` (+ `laborHours`/`laborHourlyRate`) · ct2 Inkoop → `purchaseOrderCosts` ·
ct3 OA → `subcontractorCosts` · ct4 Materieel → `equipmentCosts` · ct5 Materiaal → `materialCosts` ·
ct6 Afval → `wasteCosts` · ct7 Overig → `miscellaneousCosts`. EVA voedt alleen **1/3/5**
(arbeid/onderaanneming/materieel → materiaal).

### Sync-logica (belangrijke regels)
- **Match:** EVA `kostengroep` === Bouw7 bewakingscode (kale code). Per (code × kostensoort) één PSL.
- **Bedrag:** `prognosisOtherAmount = werkbegroting − begroot` (verschil). Bij een **nieuw aangemaakte**
  PSL is begroot 0 → prognose = werkbegroting.
- **Nieuwe codes:** worden aangemaakt onder een **bestaand** hoofdstuk dat de gebruiker per dossier kiest
  (dropdown in de preview, onthouden in `localStorage` `eva_prognose_hoofdstuk_{dossierId}`; default "WB").
- **Reset-sync (werkbegroting = leidend):** elke bestaande PSL (1/3/5) die **niet** in de werkbegroting
  staat → `prognosisOtherAmount = −begroot` (prognose 0). Onvoorwaardelijk (chapters-endpoint geeft de
  huidige prognosisOtherAmount niet terug). Codes mét werkbegroting-bedrag (ook als verschil 0) tellen mee
  en worden dus **niet** gereset.
- **Skip alleen** bij leeg werkbegroting-bedrag of lege kostengroep.

### Hoofdstuk aanmaken — kan wél (geverifieerd aug 2026)
Hoofdstukken zijn **globale stamdata**, niet iets van één project: `GET /list/security-code-chapters`
geeft ze allemaal, en een project "heeft" alleen de hoofdstukken waaronder codes hangen. Aanmaken:

```
POST /security-code-chapter   { "name": "Totaal", "code": "Totaal" }   → 201 { id }
```

> ⚠️ **`code` mag niet leeg zijn** — `{ name, code: "" }` geeft
> `400 "SecurityCodeChapter::$code failed. This value should not be blank."` Hierop strandden de
> eerdere pogingen (en op de aanname dat een leeg hoofdstuk in de structuur-POST volstaat: dat blok
> moet minstens één code bevatten, anders valt het weg).

Volledige keten, geverifieerd op testproject 3869371 (en daarna weer opgeruimd):
1. `POST /security-code-chapter {name, code}` → 201 — mag een hoofdstuk zijn dat op géén enkel project staat.
2. `POST /security-code {name, code, securityCodeChapter:{id}}` → 201.
3. Structuur-POST met een nieuw blok `{ securityCodeChapter:{id}, budgetDataPerSecurityCodes:[{…}] }`
   → 200; het hoofdstuk staat daarna op het project (alleen `id` nodig — Bouw7 echoot naam/code als null).
4. Athena `/cost-type/1/chapters` geeft de code mét `pslIds` terug → de PSL bestaat en is beschrijfbaar.

EVA gebruikt dit in `zorgVoorTotaalHoofdstuk`, maar pas als laatste stap. De volgorde bij nieuwe
codes is: **(1)** het door de gebruiker gekozen hoofdstuk → **(2)** een hoofdstuk dat al op het
project staat ("WB" bij voorkeur, anders het eerste) → **(3)** pas bij een project zónder enig
hoofdstuk het gedeelde hoofdstuk **"Totaal"**.

### Niet (betrouwbaar) mogelijk gebleken
- **Prognose direct lezen** per code uit het chapters-endpoint (`prognosisOtherAmount` ontbreekt daar) →
  daarom de onvoorwaardelijke reset.

---

## 1. Hoe schrijven werkt (mechaniek)

| Aspect | Werking |
|---|---|
| **API** | Alle schrijfacties zitten in **Heimdall** (`heimdall.bouw7.nl`). Athena en Apollo zijn read-only. |
| **Auth** | Dezelfde Bearer-token als nu. Geen aparte write-credentials — maar de **app-key heeft mogelijk schrijf-scope nodig** (verifiëren, zie §5). |
| **Create vs. update** | Eén `POST` per resource = **upsert**. `id` in de body aanwezig → **update**; weggelaten → **create**. |
| **Verwijderen** | `DELETE` op het resource-endpoint met een `Condensed{Resource}`-body (alleen `{ id }`). |
| **Statuswijziging** | `PUT .../update-status/{status}` (contracten, in-/verkoopfacturen) — status in de URL, geen body. |
| **Nested referenties** | Verwijzingen (`contact`, `employee`, `status`, …) zijn `Condensed*`-objecten die **alleen `id` vereisen**: bv. `"status": { "id": 42 }`. De overige velden zijn echo/optioneel. |
| **Client-uitbreiding** | `Bouw7Client` heeft een `post()/put()/delete()` nodig met dezelfde token- en 401-retry-logica als `_get()`. |

**Skelet dat nog gebouwd moet worden in [`client.ts`](./client.ts):**
```ts
async post<T>(path: string, body: unknown): Promise<T> {
  await this.ensureAuth()
  const res = await fetch(new URL(path, HEIMDALL_URL).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
    body: JSON.stringify(body),
  })
  if (res.status === 401) { await this.login(); return this.post<T>(path, body) }
  if (!res.ok) throw new Error(`Bouw7 POST ${path} (${res.status}): ${await res.text().catch(() => '')}`)
  return res.json()
}
// put(path, status) en del(path, body) analoog
```

---

## 2. EVA-relevante write-resources (met velden)

Legenda: **REQ** = verplicht · `Ref{id}` = `Condensed*` referentie, alleen `id` nodig.
Audit-velden (`createdAt/By`, `updatedAt/By`) zijn read-only output — niet meesturen.

### `POST /contact` — relatie (klant / leverancier / onderaannemer)
Body: `FullContact` · DELETE-body: `CondensedContact { id }`

| Veld | Type | | Opmerking |
|---|---|---|---|
| `id` | int | opt | aanwezig = update |
| `name` | string | **REQ** | |
| `contactType` | `ContactType { id* }` | **REQ** | bepaalt klant/leverancier/oa |
| `streetName`, `houseNumber`, `zipCode`, `city`, `countryCode` | string | opt | adres (huisnummer los) |
| `email`, `phoneNumber`, `mobileNumber` | string | opt | |
| `cocNumber`, `vatNumber`, `oin`, `glnNumber` | string | opt | KvK / BTW / OIN / GLN |
| `accountNumber`, `debtorNumber` | string | opt | IBAN / debiteurnr |
| `isVatShifted` | bool | opt | BTW verlegd |
| `hourlyRate`, `sellingHourlyRate`, `agreedHourlyRate` | string | opt | tarieven |
| `information`, `planning` | string | opt | vrije tekst |
| `glAccountCodePurchase`, `glAccountCodeInvoice` | string | opt | grootboek (Exact) |
| `invoiceMail`, `invoiceSubject`, `reminderMail`, `invoiceDeliveryType`, `invoiceUblVersion` | — | opt | facturatie-instellingen |
| `hourTypePrices[]`, `surcharges`, `contactDivisions[]`, `customAttributeValues[]` | array/obj | opt | |

### `POST /contact/{contact}/contact-person` — contactpersoon
Body: `ContactPerson` · `{contact}` = parent-contact-id in de URL · DELETE: `CondensedContactPerson { id }`

| Veld | Type | | |
|---|---|---|---|
| `id` | int | opt | aanwezig = update |
| `firstName`, `lastName` | string | **REQ** | |
| `email`, `phoneNumber` | string | opt | |
| `jobTitle`, `salutation` | string | opt | functie / aanhef |
| `streetName`, `houseNumber`, `zipCode`, `city` | string | opt | |

### `POST /project` — project (= EVA-dossier)
Body: `Project` · DELETE: `CondensedProject { id }` (soft-delete; zie `/restore-project`, `/hard-delete-project`)

| Veld | Type | | Opmerking |
|---|---|---|---|
| `id` | int | opt | aanwezig = update |
| `type` | int | **REQ** | projecttype |
| `status` | `CondensedProjectStatus { id* }` | **REQ** | EVA-statusmapping omgekeerd toepassen |
| `name` | string | opt | |
| `parentId` | int | opt | subproject |
| `projectNumber`, `fullProjectNumber`, `reference` | string | opt | |
| `streetName`, `houseNumber`, `zipCode`, `city`, `countryCode`, `workAddress` | string | opt | werkadres |
| `contact` | `CondensedContact { id }` | opt | klant |
| `contactPerson` | `CondensedContactPerson { id }` | opt | |
| `category` | `CondensedProjectCategory { id }` | opt | |
| `branch` | `CondensedBranch { id }` | opt | vestiging |
| `projectLeader`, `workPlanner`, `executor` | `CondensedEmployee { id }` | opt | rollen |
| `employees[]` | `CondensedEmployee[]` | opt | toegewezen team |
| `startDate`, `endDate`, `deliveryDate` | string (ATOM) | opt | |
| `fixedPrice`, `generalCostsAmount`, `additionalWork`, `provisionalCosts`, `profitAndRisk` | string | opt | financieel |
| `hoursEstimate`, `hoursEstimatePerHourTypes[]` | string/array | opt | urenraming |
| `information`, `note`, `planning` | string | opt | |
| `customAttributeValues[]` | array | opt | maatwerkvelden |

### `POST /project/set-internal-note` — interne notitie (laagrisico-test!)
Body: `UpdateInternalNote` → `{ id*: <projectId>, note: string }`. Ideaal eerste test van schrijfrechten.

### `POST /project/hour-log` — urenregistratie
Body: `HourLog`. Vereist een actieve user gekoppeld aan een medewerker.

| Veld | Type | | |
|---|---|---|---|
| `id` | int | opt | aanwezig = update |
| `project` | `CondensedProject { id* }` | **REQ** | |
| `logHours` | string | **REQ** | aantal uren |
| `logDate` | string | **REQ** | datum |
| `hourType` | `CondensedHourType { id* }` | **REQ** | uursoort |
| `employee` | `CondensedEmployee { id }` | opt | |
| `contact` | `CondensedContact { id }` | opt | |
| `comments` | string | opt | |
| `hourlyRate`, `invoiceAmount` | string | opt | |
| `startTime`, `endTime` | string | opt | alleen bij dagstaat-modus |
| `approved`, `paidOff` | bool | opt | |

### `POST /quotation` — offerte — **BEWUST NIET GEBRUIKT**
Body: `Quotation`. Verplicht: `employee{id}`, `subject`, `quotationStatus{id}`, `contact{id}`, `quotationDate`, `language` (bv. `nl-NL`), `layout`. Regels via `chapters[] → QuotationLineChapter`. AK/W&R via `overheads`/`profitAndRisk` (+ hun `CondensedVatTariff`).

> **Besluit aug 2026 (Tom):** EVA maakt géén offertes aan in Bouw7. Bij het verzenden van een
> EVA-offerte volgt alleen de **status** mee: het dossier gaat op substatus `verzonden`, wat via
> `updateDossierSubstatus(..., { schrijfBouw7: true })` → `substatus-attr.ts` als **"07. Verzonden"**
> naar het maatwerkveld *Offerte Sub-status* op het Bouw7-project wordt geschreven.
> Een eerdere poging tot `POST /quotation` liep vast op de regelvalidatie (`QuotationLine::$subtotal`,
> `$vatTariffPercentage` en `$sortIndex` mogen niet null zijn) en is verwijderd.
>
> Die write gaat met `forceerBouw7: true`, dus **zonder** de conflictcheck van `substatus-attr.ts`.
> De mail is op dat moment al verstuurd — "Verzonden" is een feit, geen voorstel, en mag niet
> stranden op drift tussen EVA en het gedeelde maatwerkveld. Handmatige wijzigingen (statuskiezer,
> kanban) hóuden de check wél en leggen bij een botsing de keuze voor: Bouw7 volgen of overschrijven
> (`components/dossiers/substatus-wijzigen.ts`).

### `POST /project/delivery-ticket` — bon/leverbon
Body: `DeliveryTicket`. REQ: `contact{id}`, `project{id}`, `ticketNumber`, `ticketDate`, `purchaseType` (int), `processed` (bool). Optioneel `cost`, `description`, `file`.

### Facturatie-termijnen
- `POST /project/{project}/invoice-term-statement` — termijnstaat (`InvoiceTermStatement`)
- `POST /project/{statement}/invoice-term` — losse termijn (`ProjectInvoiceTerm`)

> Velden, de koppeling termijn ↔ factuurregel en het skelet-endpoint voor een conceptfactuur staan
> in **§7b**. Lees die sectie voordat je hier iets bouwt.

---

## 2b. Bestelregels & prognose — EVA-specifiek (geverifieerd jun 2026)

Afgestemd op wat EVA al **leest** (zie `ENDPOINTS.md` → "Projectbewaking per bewakingscode").

### Bestelregels = "Verwachte kosten" → `POST /contract-order-line` (ongedocumenteerd)
EVA's Financieel-tab toont **"Verwachte kosten"** uit `GET /list/contract-order-lines`, gesommeerd per
`projectSecurityLink.code`. De **schrijf-tegenhanger** van precies dat regeltype is:

```
POST /contract-order-line      (Heimdall — staat NIET in de Swagger-spec)
```

> ### ⚠️ Gebruik NIET `POST /project/{project}/contract-order-line`
> Dat is het enige contract-order-line-endpoint dát in de spec staat (als *deprecated*), en het is
> **material-only**: het negeert een meegestuurd `costType` en weigert elke niet-materiaal-PSL met
> ```
> 400 {"type":"validation_error","message":"The project security link with ID #… does not have cost type \"material\"."}
> ```
> Geverifieerd jul 2026 op project 3869371: `costType` in álle schrijfwijzen (`costType` int/string,
> `cost_type`, `costTypeId`, `type`, `costType:{id}`) gaf exact dezelfde fout → het veld wordt daar
> genegeerd. Het variant **zónder** `/project/{id}`-prefix accepteert `costType` wél. Dat is ook de
> route achter het "Bestelregel aanmaken"-dialoog in de Bouw7-UI (met kostentype-dropdown).

| Veld | | Opmerking |
|---|---|---|
| `project` `{id}` | **REQ** | staat alleen in de body (geen path-param) |
| `costType` | **REQ voor niet-materiaal** | kostentype van de **regel** — zie enum hieronder. Weggelaten = 0 (Materiaal) |
| `projectSecurityLink` `{id}` | **REQ** | **bewakingscode** — moet qua kostensoort bij `costType` passen. Weglaten geeft `400 validation_error "ContractOrderLine::$projectSecurityLink … This value should not be null."` — óók bij een upsert mét `id` (de POST vervangt de hele regel). Zie hieronder. |
| `description` | opt | regelomschrijving |
| `quantity`, `unitPrice` | opt | Bouw7 rekent `totalPrice` = quantity × unitPrice zelf |
| `quantityFactor` | opt | default `1.00` |
| `unit`, `articleNumber` | opt | |
| `contact` `{id}` | opt | leverancier |
| `id` | opt | **upsert**: mét id → 200 + zelfde id, regel bijgewerkt (geen duplicaat). Geverifieerd jul 2026. |

#### ⚠️ Twee verschillende kostentype-enums — niet verwisselen
De `costType` van een **bestelregel** is een eigen, **nul-gebaseerde** enum (de volgorde van de
UI-dropdown) en is *niet* de kostensoort-nummering van de bewakingscode/PSL:

| `ContractOrderLine.costType` | betekenis | bijbehorende **PSL**-kostensoort |
|---|---|---|
| `0` | Materiaal | 5 |
| `1` | Onderaanneming | 3 |
| `2` | Arbeid | 1 |
| `3` | Materieel | 4 |
| `4` | Overig | 6 |

Afgeleid uit 625 bestaande bestelregels (de koppeling is 100% consistent) en bevestigd met
schrijftests op 3869371. Let hierop bij het **lezen**: `ol.costType` als PSL-kostensoort
interpreteren maakt van elke OA-regel (`1`) een arbeid-regel.

#### Geen PSL → 400, en waar de PSL vandaan komt
```
400 {"type":"validation_error","message":"Validation of property
     \"B7\\Schema\\Project\\Contract\\ContractOrderLine::$projectSecurityLink\" failed.
     \"This value should not be null.\""}
```
`resolveBewakingscodes` leest de PSL-ids uit `/cost-type/{ct}/chapters`; een bewakingscode **zonder
begroting** staat daar niet in, dus die levert geen PSL op. `bouwBestelregelPlan` vult de PSL daarom
bij vanuit de **bestaande bestelregel** (`/list/contract-order-lines`, gematcht op `bouw7_line_id`) —
die draagt er per definitie één. Dat dekt *bijwerken* en *neutraliseren*; voor *aanmaken* maakt
`zorgVoorOntbrekendePsls` de PSL alsnog aan (begroot 0).

Blijft de PSL dan nog null (bv. geen doelhoofdstuk gekozen, of het aanmaken van de code mislukte),
dan slaat `stuurWerkbegrotingBestelregelsBouw7` **die ene regel over** met een melding in `fouten`.
Nooit alsnog posten: de 400 hierboven is een harde fout die anders de hele push afbreekt — inclusief
de regels die er niets mee te maken hebben.

#### Verlopen `id` → 404, en waarom dat geen harde fout mag zijn
Een in Bouw7 verwijderde regel waarvan EVA het id nog bewaart (o.a. ids die uit de import komen)
geeft bij de upsert:
```
404 {"type":"entity_not_found","message":"Property with name \"id\", that contains a reference
     to an Object with ID #<id> of type \"ContractOrderLine\" does not exist."}
```
`stuurWerkbegrotingBestelregelsBouw7` vangt dit af (`isOnbekendLineId`): bij *bijwerken* maakt het
de regel opnieuw aan, bij *neutraliseren* is 'ie al weg. De koppeling wordt daarna zowel
server-side als in localStorage gewist — beide zijn nodig, want `syncWerkbegrotingNaarSupabase`
upsert `bouw7_line_id` vanuit de client-payload en zou het verlopen id anders terugschrijven.

Let op de **discriminatie**: dezelfde 404 met `"Property with name \"id\""` verschijnt óók voor een
onbekende PSL, maar dan met `of type "ProjectSecurityLink"`. Daarom checkt `isOnbekendLineId` op
zowel het type `ContractOrderLine` als op ons eigen id-nummer — anders zou een verkeerde PSL
stilletjes als "regel bestaat niet" worden weggeslikt.

> **Partiële mislukking:** de push schrijft de al uitgedeelde `bouw7_line_id`'s ook weg als 'ie
> halverwege afbreekt (`persisteerKoppelingen()` in de catch, plus `lineIdPerComponent` op het
> `ok: false`-resultaat). Zonder dat staan die regels wél in Bouw7 maar kent EVA hun id niet, en
> maakt de volgende push duplicaten.

> **Delete** — twee routes, allebei ongedocumenteerd en allebei 204 (geverifieerd jul 2026):
> - **`DELETE /contract-order-line`** met body `{ id }` → verwijdert **één** regel.
> - **`DELETE /project/{project}/contract-order-lines`** → wist **álle** bestelregels van het
>   project. Zie `resetBouw7Bestelregels`.
> Niet te verwarren met `POST /contracts/purchase-order` (formele inkooporder met leverancier/status/termijnen →
> voedt `contractCostAmount`, dat volgens EVA's eigen docs "klopt niet/0 in de praktijk"). Voor EVA-bestelregels
> is `contract-order-line` de juiste route.

EVA-implementatie: `createBouw7Bestelregels(projectId, regels)` + read-only `discoverBouw7Bestelregels(projectId?)`
in `instellingen/integraties/actions.ts`; de werkbegroting-push in
`everts-calc/actions/werkbegroting.ts` (`TYPE_NAAR_BOUW7` bevat zowel `ct` als `lineCt`).

### Prognose — wél schrijfbaar via "Niet/anders begroot" (ongedocumenteerd Heimdall-endpoint)
In Bouw7 zet je de prognose niet direct, maar via het veld **"Niet/anders begroot"** (`prognosisOtherAmount`)
per kostensoort/bewakingscode. Geldt: **`prognose = budgetAmount + prognosisOtherAmount`**. De UI-call
(afgevangen via DevTools, jun 2026) is een **ongedocumenteerd** Heimdall-endpoint:

```
POST /project/update-prognosis-other
body: { id: <projectSecurityLink-id>, prognosisOtherAmount: "<bedrag>", prognosisOtherHours: "<uren>" }
```
- `id` = **PSL-id** (uit `pslIds` van de `GET /project-control/{id}/total/cost-types`-respons, per kostensoort).
- `prognosisOtherAmount` = string; **absolute** "Niet/anders begroot"-waarde (overschrijft, telt niet op).
- `prognosisOtherHours` = string; alleen relevant voor **Arbeid** (≈ `bedrag / uurtarief`).
- Staat **niet** in de Swagger-spec; afgeleid uit de live UI-call. Host = **Heimdall** → bestaande `client.post()`.

EVA-implementatie (`everts-calc/actions/werkbegroting.ts`): `previewWerkbegrotingPrognoseBouw7()` +
`stuurWerkbegrotingPrognoseBouw7(dossierId, totalen)` — schrijft per kostensoort het **verschil**
`werkbegroting − Bouw7-begroot`. Knop "Prognose naar Bouw7" in `WerkbegrotingHoofdscherm.tsx` (met
bevestiging/preview). Schrijft alleen kostensoorten met **precies één PSL** (anders niet eenduidig → overgeslagen).

### Athena read-surface die EVA al gebruikt (context)
`GET /project-financial/{id}` · `GET /project-control/{id}/cost-type/{1..6}/chapters` · `GET /wip/report`
· Apollo `GET /search/purchase-invoices` · `GET /search/delivery-tickets` · Heimdall `GET /list/contract-order-lines`.

### Inkoopfacturen: het fiscale document blijft onaangeroerd — de bewakingscode niet meer (jul 2026)

Het **factuurdocument** schrijft EVA nog steeds niet: géén `POST /purchase-invoice`, géén
`PUT /purchase-invoice/{id}/update-status`. Bedrag, BTW, factuurnummer en boekstuk zijn fiscaal
relevant en blijven van Bouw7. Dat besluit staat.

**Wel gewijzigd:** de **bewakingscode** van een geboekte kost zit niet op de factuur maar op de
**leverbon** eronder (`DeliveryTicket.projectSecurityLink`). Die is schrijfbaar, en sinds juli 2026
schrijft EVA hem — anders week het Financieel-tab (leest per code rechtstreeks uit Bouw7) af van
een hercodering in het Inkoop-tab.

```
POST /project/delivery-ticket   (upsert op id; read-modify-write)
{ id, contact{id}, project{id}, ticketNumber, ticketDate, purchaseType, cost, processed,
  description, projectSecurityLink: { id: <pslId> } }
```

Geverifieerd jul 2026 op project 3869371 (bon 11326492, daarna teruggezet): 200, code gewijzigd,
`purchaseInvoice` (id/nummer/`isBooked`), `cost` en `initialCost` ongewijzigd — óók op een bon met
`hasImmutablePurchaseInvoice: true`. Apollo `/search/purchase-invoices` gaf de nieuwe code direct terug.
In de spec zijn `contract`, `purchaseInvoice`, `initialCost` en `file` `readOnly`, `projectSecurityLink` niet.

**Drie regels die je niet mag omzeilen.**
1. **Contract-gebonden kosten nooit verplaatsen.** Bij een afroepbon (`<contractnummer>B<nr>`) komt de
   code uit de contracttermijn/bestelregel; de bon losweken laat contract en geboekte kosten uit elkaar
   lopen. `getDossierInkoop` zet daarvoor `contractGebonden` op de regel (bonnummer-match op de
   bestaande order-/contractnummers — **niet** `DeliveryTicket.contract`, dat is in de praktijk vaak `null`).
2. **Kostensoort moet matchen.** `deliveryTicket.purchaseType === projectSecurityLink.costType` in
   701/701 gemeten bonnen. De doel-PSL wordt daarom gekozen op de `purchaseType` van de bon zelf
   (vers opgehaald), niet op lijstdata. **Uitzondering `purchaseType: 0`** ("delivery_ticket" — de
   bon die Bouw7 maakt bij het inboeken van een losse factuur zónder inkooptype): die telt in de
   projectbewaking mee onder **kostensoort 2 (Inkoop)**. Bewijs: op project 3582730 is de som van de
   pt0-bonnen (€2.138,72) exact het bestede bedrag van ct2, en een pt0-bon met een ct2-PSL landt
   aantoonbaar onder die code in ct2. In de Bouw7-UI krijgen pt0-bonnen nooit een code (0 van 229),
   maar via de API kan het wél.
3. **Terugcontrole na de write.** De spec bewijst niets over schrijfbaarheid (zie `linkedDeliveryTicket`):
   na de POST leest `schrijfBouw7BonBewakingscode` de bon opnieuw en meldt een fout als de code er niet staat.

Bewakingscodes zijn **hoofdstuk-gebonden** — dezelfde codetekst kan meerdere PSL's hebben. De doelcode
wordt daarom altijd als hoofdstuk + code gekozen (`ProjectBewakingscode.hoofdstukId` + `pslPerKostensoort`).

**Ontbreekt de code onder die kostensoort, dan maakt EVA de bewakingslink zelf aan** (`zorgVoorPsl`):
begroot `'0'` zetten in `GET/POST /project/{id}/project-security-links` laat de PSL ontstaan, waarna de
nieuwe PSL-id uit het Athena-chapters-endpoint komt. Zelfde mechaniek als `zorgVoorOntbrekendePsls` in
de werkbegroting-prognose, met twee verschillen: het zoeken is **gescoped op het hoofdstuk** (anders pak
je een gelijknamige code uit een ander hoofdstuk), en de **code zelf wordt nooit aangemaakt** — hercoderen
kan alleen naar codes die al op het project staan. Kostensoort → structuurveld: 1 `laborCosts`
(+ `laborHours`/`laborHourlyRate`, anders weigert Bouw7) · 2 `purchaseOrderCosts` · 3 `subcontractorCosts`
· 4 `equipmentCosts` · 5 `materialCosts` · 6 `wasteCosts`. Geverifieerd op 3869371: de structuur-POST
voegde exact één veld toe (`purchaseOrderCosts=0`) en liet de overige 8 rijen ongemoeid.

> ⚠️ Die POST **vervangt de hele bewakingsstructuur** van het project. Alleen velden toevoegen, nooit
> verwijderen, en altijd read-modify-write op de verse GET.

De **toewijzing aan een inkooporder/OA-contract** (`inkoop_correcties.toegewezen_*`) blijft een pure
EVA-rekenlaag zonder Bouw7-tegenhanger. De oude `bewakingscode_override` blijft op read gemerged voor
bestaande correcties, maar wordt niet meer geschreven; bij een geslaagde Bouw7-write wist EVA hem.

EVA-implementatie: `lib/dossiers/bouw7-bewakingscode.ts` + `hercodeerGeboekteKost(-Bulk)` in
`lib/dossiers/actions.ts`. Geboekte kosten leest EVA via Heimdall `GET /list/purchase-invoices`
(rijke financiën) + Apollo `GET /search/purchase-invoices` (bewakingscode), gemerged op `deliveryTicket.id`.

---

## 2d. Inkooporders & OA-contracten — LIVE (geverifieerd jul 2026)

EVA maakt vanuit de **werkbegroting-bestellingen** het formele inkoopdocument in Bouw7, altijd in
**concept**. Versturen naar de leverancier gebeurt in Bouw7 — EVA mailt nooit zelf.

| Doel | Endpoint | Body |
|---|---|---|
| **Inkooporder** aanmaken/bijwerken | `POST /contracts/purchase-order` | `PurchaseOrderContract` (upsert op `id`) |
| **OA-contract** aanmaken/bijwerken | `POST /contracts/subcontractor` | `SubcontractorContract` (upsert op `id`) |
| Verwijderen | `DELETE /contracts/{purchase-order,subcontractor}` | **niet** alleen `{id}` — zie hieronder |
| Statuslijst | `GET /contracts/{soort}/statuses` | — |
| Kostentypes inkooporder | `GET /contracts/purchase-order/cost-types` | — |
| Detail (incl. termijnen) | `GET /contracts/{soort}/{id}` | — |
| Losse termijn muteren | `POST /contracts/purchase-order/contract-term` · `POST /contracts/subcontract/contract-term` | let op: bij OA heet de POST-route `subcontract`, de DELETE `subcontractor` |

### Vier bevindingen uit de schrijftest (project 3869371, testcontract weer verwijderd)

1. **Termijnen mogen inline mee.** `contractTerms[]` in dezelfde POST als het contract werkt; er is
   geen losse call per regel nodig. Eén contract met N regels = één request.
2. **`contractOrderLines: [{ id }]` koppelt een BESTAANDE bestelregel** — het maakt er geen nieuwe.
   Dit is de spil van het ontwerp: `stuurWerkbegrotingBestelregelsBouw7` blijft de enige bron van
   contract-order-lines, het contract hangt ze alleen onder zich. Zou het contract eigen regels
   aanmaken, dan stonden dezelfde kosten **twee keer** in de verwachte kosten per bewakingscode.
   Na koppeling: de regel krijgt `status: 1` en `subcontractorContract`/`purchaseOrderContract`, en
   Bouw7 zet zelf de leverancier van het contract op de regel.
3. **DELETE wil een condensed contract, geen `{id}`.** Alleen id geeft
   `400 … CondensedSubcontractorContract::$project … should not be null` (idem `$cost`). Stuur
   `{ id, project:{id}, supplier|subcontractor:{id}, cost, status, type }`.
4. **Opruimvolgorde:** een bestelregel die aan een termijn hangt is niet los te verwijderen
   (`cannot be deleted because it is linked to contract term`). Eerst het contract weg, dan de regel.

### Status- en type-enums (live opgehaald, **niet** hardcoden)
- Inkooporder-status: `0 to_order` (= concept, wat EVA schrijft) · 1 ordered · 2 confirmed ·
  3 delivered · 4 waiting_for_response · 5 denied · 6 canceled
- OA-status: `0 to_send` (= concept) · 1 waiting_for_approval · 2 accepted · 3 denied · 4 planned ·
  5 in_progress · 6 completed · 7 canceled
- `purchaseType` (inkooporder): 2 purchase_order · 4 equipment · 5 material · 6 remaining
- `type`: 0 = vaste prijs · 1 = regie · (OA ook 2 = uitbesteed)

EVA leest de statuslijst alsnog live op (`getConceptStatusId`) en faalt met een duidelijke melding
als de concept-status ontbreekt — een gegokte id zet een contract stilzwijgend op "geleverd".

### Hoe een inkoopfactuur op het contract landt (uitgezocht jul 2026)

De keten is **contract → leverbon → inkoopfactuur**; er is geen directe factuur→contract-verwijzing.

```
contract 20267.00605IO001  (price 250)
  └─ leverbon 20267.00605IO001B001   cost 175   ← DeliveryTicket.contract = {id, contractNumber}
       └─ inkoopfactuur 102436       orderNumber = "20267.00605IO001B001"
                                     deliveryTicket = { id, number, … }
  └─ leverbon 20267.00605IO001B001-1 cost 75    ← deelbon, nog geen factuur
```

- **Bonnummer = contractnummer + `B<nr>`** (deelbonnen krijgen `-1`, `-2`, …). Dat is een
  Bouw7-nummerconventie, geen toeval — daarop draait de bestaande matching in `getDossierInkoop`
  (`bon === nummer || bon.startsWith(nummer + 'B')`). Doordat EVA-contracten een echt Bouw7-
  contractnummer krijgen, landen hun facturen daar **automatisch** onder; er is geen extra
  koppelstap in EVA nodig.
- **Exacte koppeling bestaat ook**, als de nummer-heuristiek ooit tekortschiet:
  `GET /project/delivery-ticket/{id}` geeft `contract: { id, type, contractNumber }` én
  `purchaseInvoice`. Kost wel één call per bon — `/list/delivery-tickets` bevat de contract-
  referentie **niet** (wel `purchaseInvoiceId` + `bookingStatus`).
- ⚠️ **`outstandingCosts` is NIET "nog te factureren"** maar *nog af te roepen*. Contract 1129226
  staat op `outstandingCosts: 0.00` terwijl er van de 250 pas 175 daadwerkelijk gefactureerd is
  (de resterende 75 staat op een open bon). Gebruik het dus nooit als "geboekt"-bron; EVA rekent
  bewust met de échte inkoopfacturen en toont `openstaand` als aparte kolom.
- **Afroepen (`called-receipts`) wordt bij Everts niet gebruikt** — `calledReceiptCount` was 0 op
  alle onderzochte contracten en beide `…/called-receipts/{id}`-endpoints gaven `[]`. De bonnen
  ontstaan bij het inboeken van de factuur. Daarom schrijft EVA `createDeliveryTicket: false`,
  net als de bestaande handmatig gemaakte contracten die correct doorlopen.

### ✅ Leverbon mét contractkoppeling: `approve-contract-terms` (UI-capture jul 2026, WERKT)

**Dit is de oplossing** voor het probleem in de volgende paragraaf. De bon wordt niet los aangemaakt,
maar ontstaat als **bijproduct van het afroepen** van contracttermijnen — en dan legt Bouw7 zelf de
contractkoppeling, het bonnummer, de bewakingscode én het `purchaseType`.

```
POST /contracts/subcontractor/approve-contract-terms      (OA)
POST /contracts/purchase-order/approve-contract-terms     (inkooporder)
→ 204 No Content
```

```jsonc
{
  "items": [ /* volledige ContractTerm-objecten zoals GET /contracts/{soort}/{id} ze teruggeeft,
                aangevuld met: */
    { "...": "...",
      "partiallyAmountReceived": "10",     // hoeveel er wordt afgeroepen (= amount voor 100%)
      "partiallyCostReceived":  "1000.00"  // bijbehorend bedrag (= subTotal voor 100%)
    }
  ],
  "createDeliveryTickets": true,   // ← maakt de leverbon(nen)
  "createPdf": false,              // true genereert een afroepbon-PDF
  "signee": "EVA",                 // vrije naam; ondertekenaar
  "signatureImage": null,          // OPTIONEEL — weglaten werkt gewoon
  "recipient": null,               // ← null houden: gevuld mailt Bouw7 de leverancier
  "ccRecipients": null, "bccRecipients": null,
  "comments": ""
}
```

**Voorwaarde: het contract mag niet in concept staan.** De validatiefout noemt de toegestane statussen:

| Soort | Toegestaan om af te roepen | Laagste bruikbare |
|---|---|---|
| OA-contract | `waiting_for_approval, accepted, planned, in_progress, completed` | **1** `waiting_for_approval` |
| Inkooporder | `ordered, waiting_for_response, confirmed, delivered` | **1** `ordered` |

Dus: aanmaken in concept (0) → `PUT /contracts/{soort}/{id}/update-status/1` → afroepen.

> ### ⚠️ Roep PER TERMIJN af — nooit alle termijnen in één call
> Geverifieerd (aug 2026, wegwerpcontract met 3 regels):
> - **Alle termijnen in één `approve-contract-terms`-call** → **één gebundelde leverbon** voor het
>   hele contractbedrag (`…B001` van €1.500). Een inkoopfactuur voor één regel matcht dan tegen het
>   volle bedrag; Bouw7 ziet het contract als volledig ontvangen en de afboeking klopt niet.
> - **Eén call per termijn** → **één leverbon per contractregel** (`…B001`, `…B002`, `…B003`, elk
>   het regelbedrag). Een factuur per regel boekt dan schoon af op zijn eigen bon. **Dit is wat je
>   wilt.** `roepBouw7ContractAf` loopt dus over de termijnen en doet een aparte call per stuk
>   (al afgeroepen — `approved: true` — termijnen overslaan, zodat een herstelpad geen duplicaten maakt).

**Bewezen resultaat** (project 3869371, beide soorten, testobjecten weer verwijderd):
- termijn krijgt `approved: true`, `amountReceived`/`costReceived` gevuld, `costToReceive: 0`;
- er ontstaat bon `<contractnummer>B00x` met **`contract: { id, type, contractNumber }`** — de
  koppeling die via `POST /project/delivery-ticket` onbereikbaar is;
- bon krijgt automatisch de juiste `projectSecurityLink` en `purchaseType` (3 bij OA, 5 bij materiaal);
- bon is `processed: false` (nog geen factuur) — pas een echte inkoopfactuur zet dat op `true`.

**Volgorde in EVA (herzien aug 2026):** aanmaken en versturen zijn nu **twee stappen**.
1. **Aanmaken** (`maakBestellingInBouw7`) — bestelregels → contract als **concept** (status 0).
   Géén statuswissel, géén afroep. Nog geen leverbon.
2. **Versturen** (`verstuurBestelling`) — EVA maakt een order-PDF (`lib/bouw7/bestelling-pdf.ts`,
   pdf-lib + briefpapier), mailt die via Outlook (`verstuurMailNamensMedewerker`, namens de
   ingelogde medewerker, `recipient` in Bouw7 blijft dus `null`), en pas ná een geslaagde mail:
   status → 1 + **per-regel afroepen** (leverbonnen). Zo klopt de volgorde met Bouw7 — je roept pas
   af als de order echt de deur uit is.

**Uitzondering: een reservering** (`is_reservering`, alle componenten van de bestelling).
Dat is een budgetpot bij een leverancier (de oude "winkel") of bij een onderaannemer waar géén
opdracht naartoe gaat — transport, een chemisch toilet — terwijl de inkoopfactuur wél ergens op
moet afboeken. Stap 2 bestaat daar niet: `maakBestellingInBouw7` schrijft één samengevatte
termijn en roept **meteen** af, zonder document en zonder mail. `verstuurBestelling` weigert een
reservering, anders ontstaat er een tweede leverbon.

Opruimen (`trekBestellingIn`) in omgekeerde volgorde: **alle** bonnen
(`verwijderBouw7ContractLeverbonnen`, weigert zodra één bon `processed` is) → contract → de
bestelregels blijven staan.

**Implementatie:** `lib/bouw7/contracten.ts` (`getAfroepStatusId`, `zetBouw7ContractStatus`,
`roepBouw7ContractAf` (per termijn), `verwijderBouw7ContractLeverbonnen`, `leesBouw7Contract`) ·
`lib/bouw7/bestelling-pdf.ts` (order-PDF) · `everts-calc/actions/bestellingen.ts`
(`maakBestellingInBouw7` = alleen concept, `verstuurBestelling` = mail + afroep, `voerAfroepUit`,
`getBestellingMailConcept`) · migraties `20260722a_leverbon_winkel.sql` (`bouw7_leverbon_id`,
`bouw7_bonnummer`, `bouw7_afroep_op`, `is_winkel`), `20260805a_bestelling_versturen.sql`
(`verstuurd_op`, `verstuurd_door`, `verstuurd_naar`) en `20260807d_reservering.sql`
(`is_winkel` → `is_reservering`, plus `werkbegroting_bestellingen.is_reservering`).

Toestanden van een bestelling: **concept** (nog niet in Bouw7) → **aangemaakt**
(`bouw7_contract_id` gezet, concept in Bouw7, wijzigbaar) → **verstuurd** (`verstuurd_op` gezet,
gemaild + leverbonnen, onwijzigbaar).

> **Twee dingen die je niet mag omdraaien.**
> 1. Bij een mislukte afroep blijft `bouw7_contract_id` staan en wordt alleen de bon als fout
>    gemeld. Zou je de contract-koppeling wissen, dan maakt de volgende poging een tweede contract
>    en verdubbelen de kosten. Er is daarvoor een expliciet herstelpad: staat het contract er wél
>    maar de bon niet, dan doet `maakBestellingInBouw7` alléén de afroep opnieuw.
> 2. Bij intrekken gaat de **bon eerst**, dan het contract. Een bestelregel die aan een
>    contracttermijn hangt is niet verwijderbaar, en een achtergebleven bon telt door als kosten.

**Gevolg voor de cijfers:** een afgeroepen bon telt in Bouw7 direct volledig mee in `costAmount`
van de bewakingscode (zie de meting verderop). In EVA komt dat terug in de kolommen Onderaanneming
/ Materiaal / Inkoop-Mat.-Afval, terwijl *Geboekte kosten* alleen facturen telt. Dat verschil staat
nu als toelichting onder de Financieel-tab.

---

### ⛔ Een leverbon los aanmaken en koppelen kán niet (4 routes uitgeput, jul 2026)

*Historisch — opgelost door `approve-contract-terms` hierboven. Bewaard zodat niemand deze vier
routes opnieuw probeert.*

Dit is de blokkade voor "bon en contract gelijktijdig laten ontstaan". Bouw7 heeft de leverbon nodig
om een inkoopfactuur aan een order/contract te matchen — maar een via de API aangemaakte bon blijft
los hangen. Vier routes geprobeerd, alle vier zonder resultaat:

| Poging | Uitkomst |
|---|---|
| `createDeliveryTicket: true` op contract **én** termijn | Genegeerd — komt terug als `false`, geen bon |
| Statuswissel `PUT …/update-status/{2,5,6}` (accepted → in_progress → completed) | Status wijzigt, maar geen bon en `calledReceipts` blijft 0 |
| `POST /project/delivery-ticket` mét `contract: { id }` in de body | Bon ontstaat, maar **`contract` = `null`**; termijn ziet hem niet, `outstandingCosts` ongewijzigd |
| **`linkedDeliveryTicket: { id }` op het contract** — béide volgordes: (a) bon → contract, (b) contract → bon → contract-update | **Genegeerd, komt terug als `null`.** Ook `outstandingCosts` blijft staan |

Die laatste was de meest kansrijke: `PurchaseOrderContract.linkedDeliveryTicket` en
`SubcontractorContract.linkedDeliveryTicket` staan in de Swagger-spec **niet** als `readOnly`
gemarkeerd — anders dan `DeliveryTicket.contract` en `ContractTerm.deliveryTickets`, die dat wél zijn.
Toch wordt het veld bij het schrijven genegeerd. **Les: het ontbreken van `readOnly` in deze spec
bewijst niets over schrijfbaarheid.**

> ⚠️ Het **Allow-orakel is hier onbruikbaar** om routes te zoeken: `GET /project/delivery-ticket`
> geeft `404 No route found` terwijl `POST` op datzelfde pad aantoonbaar werkt. Een 404 bewijst in
> deze route-tak dus niet dat een endpoint ontbreekt. (Controlegeval `GET /contracts/purchase-order`
> geeft wél netjes `403 Method Not Allowed`.)

**Wat rest: een UI-capture.** Iemand opent in Bouw7 een contract, maakt daar een leverbon/afroep, en
legt de netwerkcall vast met DevTools. Dat is dezelfde methode waarmee de prognose (§2b), de
voortgang (§2c) en het to-do-terugschrijven (§5a) zijn gevonden — alle drie stonden ook niet in de
spec. Zolang die call onbekend is, heeft het geen zin bonnen vanuit EVA aan te maken: ze doen in
Bouw7 niet wat ze moeten doen.

Voor de volledigheid: de bestaande contract-bonnen zijn **handmatig door medewerkers in de UI**
gemaakt (marga 69×, chris 32×, marco 20×, …) en hebben stuk voor stuk wél een `contract`-referentie
— 14 van 14 in een steekproef. De UI kan het dus; de API niet.

> **Bouw hier geen omweg omheen.** Een bon die EVA los aanmaakt met het juiste nummer
> (`<contractnummer>B001`) zou door EVA's eigen bonnummer-matching wél worden meegeteld, maar door
> Bouw7 niet — het contract blijft volledig openstaan. Dat is een *schijnkoppeling* en daarmee
> erger dan niets doen. Wat EVA wél oplevert: het contract staat mét de juiste regels en bedragen
> klaar, zodat afroepen in Bouw7 een paar klikken is in plaats van overtypen.

### Bon-bedrag ≠ factuurbedrag — wat Bouw7 dan doet (148 bonnen geanalyseerd)

Van 148 contract-bonnen: 104 gelijk · 36 factuur **lager** dan afgeroepen · 8 factuur **hoger** ·
21 deel-/restbonnen · 137 van 148 met contract-koppeling.

1. **De bon wordt altijd gelijkgetrokken met het factuurbedrag.** `cost` = wat er gefactureerd is;
   `initialCost` (read-only) bewaart de oorspronkelijke afroepwaarde. Er is géén blokkade of
   waarschuwing bij afwijking — ook niet bij fors hoger (750 afgeroepen → 1.750 gefactureerd).
2. **Het verschil komt op een deelbon `B00x-1`** — en dat werkt beide kanten op:
   - factuur lager → **positieve** restbon met het restant, die open blijft staan
     (`20267.00605IO001B001`: 250 → 175, restbon `-1` van 75);
   - factuur hoger → **negatieve** restbon met de overschrijding
     (`20267.00402IO001B001`: 500 → 534,55, restbon `-1` van **−34,55**).
3. **Een restbon is een keuze bij het inboeken, geen automatisme.** `20267.00542OA001B001` ging van
   250 naar 193,67 *zonder* restbon: de termijn werd afgesloten, `outstandingCosts` naar 0, en het
   verschil van 56,33 verviel gewoon.
4. ⚠️ **`costReceived` op de termijn is het AFGEROEPEN bedrag, niet het gefactureerde.** Bij dat
   laatste contract staat `costReceived: "250"` terwijl er 193,67 is gefactureerd.

**Consequentie voor EVA:** noch `outstandingCosts`, noch `costReceived`, noch de bon-`cost` is een
betrouwbare "werkelijke kosten"-bron. Alleen de échte inkoopfacturen zijn dat — precies wat
`getDossierInkoop` al doet. Dit is nu met 44 afwijkende gevallen hard onderbouwd; ga dat niet
"vereenvoudigen" naar `price − outstandingCosts`.

Terzijde: 11 van de 148 bonnen misten de contract-referentie terwijl het bonnummer wél klopte.
EVA's nummer-matching is daar dus zelfs robuuster dan `deliveryTicket.contract`.

**EVA-implementatie:** `lib/bouw7/contracten.ts` (schrijflaag) ·
`everts-calc/actions/bestellingen.ts` (`stelBestellingenVoor`, `maakBestellingInBouw7`,
`trekBestellingIn`) · gedeelde poortwachter `lib/everts-calc/bestelling-gates.ts` ·
UI in `components/everts-calc/werkbegroting/BestellingenPaneel.tsx` ·
opslag: nieuwe kolommen op `werkbegroting_bestellingen` (migratie `20260721a_bestellingen_bouw7.sql`).

> **Idempotentie:** `bouw7_contract_id` op de bestelling is het anker — aanwezig = update, leeg =
> create. `syncBestellingenNaarSupabase` schrijft die kolom bewust **niet** mee vanuit de client:
> een lege waarde uit een oude localStorage-cache zou de koppeling wissen en de volgende push een
> duplicaat-contract laten maken (zelfde les als bij `bouw7_line_id`).

---

## 2c. Voortgang / "% gereed" — schrijven (gecaptured jun 2026, LIVE)

EVA **leest** % gereed al op twee niveaus: project-breed via Athena `GET /wip/report` (`progress`,
→ `management_projecten.pct_gereed`) en per bewakingscode via `…/project-control/.../chapters`
(`progress`). De **schrijf**-endpoints staan niet in de Swagger-catalogus en zijn (net als de prognose,
§2b) uit de Bouw7-UI afgevangen. Bouw7 ondersteunt **beide wijzes** (per project kiesbaar).

| Doel | Endpoint | Body |
|---|---|---|
| **Project-niveau % gereed** | **Athena** `POST /wip/project-progress` | `{ projectId, progressType, progress: "<pct>", prognosisType, prognosisAmount }` |
| **Per bewakingscode (standopname)** | **Heimdall** `POST /project/progress-log` | `{ projectSecurityLink: { id: <pslId> }, dateRecorded: "YYYY-MM-DD", progress: "<pct>" }` |

**Project-niveau (Athena!):** één call zet zowel `progress` als de WIP-**prognose**
(`prognosisType`/`prognosisAmount`). EVA doet daarom **read-modify-write**: huidige instellingen lezen,
alléén `progress` vervangen. `progressType`/`prognosisType` = `1` = handmatig in de capture.
`progress`/bedragen als **string**/number; `progress` overschrijft (absoluut). Let op: `post()` op de
client gaat naar Heimdall — gebruik **`postAthena()`** (toegevoegd aan `Bouw7Client`).

**Per bewakingscode (Heimdall):** append-style logregel per PSL — clobbert niets. De
`projectSecurityLink.id` (bv. `4226378`, code `" TIM.A"`) resolven we uit Athena
`/project-control/{id}/cost-type/{ct}/chapters` → `securityCodes[].pslIds` (zelfde PSL-ids als de
prognose-feature en de progress-read). **NIET** `securityCode.id` uit `/project-security-links` —
dat is de code-*definitie*-id en geeft een 403 `protection_error` ("Access denied … ProjectSecurityLink").
Een code kan onder meerdere kostensoorten een eigen PSL hebben → de standopname wordt op **elke**
kostensoort-PSL van de code geschreven (één progress-log per PSL).

**EVA-implementatie:**
- Opslag: `public.dossier_voortgang` (`niveau` = `project` | `bewakingscode`), `bouw7_sync_status`.
- Server actions: `lib/dossiers/voortgang.ts` (`bewaarVoortgang`, `getVoortgang`, `getVoortgangProjectMap`).
- Bouw7-write: `lib/dossiers/bouw7-voortgang.ts` (`schrijfBouw7VoortgangProject/Code`), vlag
  `BOUW7_VOORTGANG_WRITE = true`.
- UI: Management-tabel (`PctGereedCelEditable`), Financieel-tab project-editor + per-code editor
  (`components/dossiers/tabs/VoortgangEditors.tsx`).
- Overlay: EVA-waarde wint op read in `getDossierBewaking` en `getManagementProjecten` (incl. herberekende
  `omzet_obv_pct`/`resultaat_obv_pct`).

**Open punten:**
- **Read-endpoint project-niveau onbevestigd.** De read-modify-write leest via `GET /wip/project-progress?projectId=`
  (gespiegeld op de POST). Klopt dat niet, dan **schrijft EVA de project-% bewust NIET** (prognose niet
  geclobberd) en blijft de waarde EVA-only. Capture zo nodig de GET van het WIP/standopname-scherm.
- **Reconciliatie.** De overlay laat de EVA-waarde altijd winnen; zodra de read-sync de Bouw7-waarde
  bevestigt zou de override losgelaten/op `synced` gezet moeten worden (nog te bouwen).

---

## 3. Volledige write-catalogus (104 ops, gegroepeerd)

> Patroon overal gelijk: `POST` = upsert · `DELETE` = `Condensed*{id}` · `PUT .../update-status/{status}`.

**Projecten** `POST/DELETE /project` · `POST /project/set-internal-note` · `POST /restore-project/{id}` · `DELETE /hard-delete-project/{id}` · `POST/DELETE /project/delivery-ticket` · `POST /project/{project}/invoice-term-statement` · `POST /project/{statement}/invoice-term` · `DELETE /project/term-statement` · `POST /project/hour-log` · `POST /project/{project}/contract-order-line` *(deprecated — material-only, niet gebruiken; zie §2b)*

**Relaties** `POST/DELETE /contact` · `POST/DELETE /contact/{contact}/contact-person`

**Offertes** `POST /quotation` · `POST/DELETE /quotation/reminder`

**Verkoopfacturen** `POST /invoice` · `DELETE /invoice/{invoice}` · `POST /invoice/{invoice}/make-attachments`

**Inkoopfacturen** `POST/DELETE /purchase-invoice` · `PUT /purchase-invoice/{id}/update-status/{status}`

**Contracten — inkoop** `POST/DELETE /contracts/purchase-order` · `PUT .../{id}/update-status/{status}` · `POST/DELETE /contracts/purchase-order/contract-term`

**Contracten — onderaanneming** `POST/DELETE /contracts/subcontractor` · `PUT .../{id}/update-status/{status}` · `POST /contracts/subcontract/contract-term` · `DELETE /contracts/subcontractor/contract-term`

**Goedkeuringen (workflow)** `POST /approval/{id}/vote-on-contract` · `POST /approval/{id}/vote-on-purchase-invoice` · `POST/DELETE /approval-template/criteria` · `POST /approval-template/match-criteria` · `POST/DELETE /approval-template/workflow` · `POST /approval-template/default-settings`

**Organisatie/stamdata** `POST /organization/branch` · `POST/DELETE /organization/department` (+ `/work-in-progress-settings`) · `POST/DELETE /organization/employee` · `POST/DELETE /organization/project-category` · `POST/DELETE /organization/hour-type` · `POST /organization/hour-type-price` · `POST/DELETE /organization/project-file-category` · `POST/DELETE /organization/custom-attribute(s)` · `POST/DELETE /organization/text-template` · `POST/DELETE /organization/quotation-status`

**Verlof/kalender** `POST/DELETE /day-off` · `POST/DELETE /organization/day-off-per-employee`

**Materiaal** `POST/DELETE /material` · `POST/DELETE /material-booking` · `POST/DELETE /material-per-unit` · `POST/DELETE /material-unit`

**Materieel (equipment)** `POST/DELETE /equipment` · `POST/DELETE /equipment-booking` · `POST/DELETE /equipment-group` · `POST/DELETE /equipment-unit`

**Resources** `POST/DELETE /resource` · `POST/DELETE /resource-booking` · `POST/DELETE /resource-group` · `POST/DELETE /resource-unit`

**Afval (waste)** `POST/DELETE /waste` · `POST /import/waste-per-unit` · `DELETE /waste-per-unit` · `POST/DELETE /waste-unit` · `DELETE /waste-booking`

**Overig** `POST /mileage-registration` (km-registratie) · `POST/DELETE /property-asset` (vastgoedobject) · `POST /security-object` (bewakingscode-object) · `POST /storage/{modelType}/{modelId}` + `DELETE /storage/file` (bestanden/uploads)

---

## 4. Voorgestelde incrementele uitrol

Volgorde gekozen op **risico (laag→hoog)** en **afhankelijkheid van bestaande sync**.

| Fase | Wat | Endpoint(s) | Waarom hier |
|---|---|---|---|
| **0** | **Verifieer schrijfrechten** | `POST /project/set-internal-note` op een testproject | Laagste risico (1 tekstveld), bewijst of de app-key write-scope heeft |
| **1** | **Notitie + losse velden op dossier** | `POST /project` (update: alleen gewijzigde velden + `id`/`status`/`type`) | Bouwt direct op bestaande project-sync; heft het [Bouw7-readonly-velden besluit](../../../../../.claude/projects/C--Users-t-kamminga-everts-platform/memory/project_bouw7_readonly_velden.md) per veld op |
| **2** | **Contactpersonen** | `POST/DELETE /contact/{contact}/contact-person` | Klein schema, duidelijke EVA-tegenhanger (`contactpersonen`) |
| **3** | **Relaties** | `POST/DELETE /contact` | Groter schema, raakt facturatie-instellingen |
| **4** | **Urenregistratie** | `POST /project/hour-log` | Hoge businesswaarde (mobiele buitendienst), maar vereist medewerker-koppeling + uursoort-mapping |
| **5** | **Bonnen / leverbonnen** | `POST /project/delivery-ticket` | |
| ~~**6**~~ | ~~**Offertes**~~ | ~~`POST /quotation`~~ | **Vervallen** — EVA schrijft alleen de offerte-substatus naar Bouw7, geen offertes (zie hierboven) |
| **7** | **Facturatie & termijnen** | `/invoice`, `/project/.../invoice-term-statement` | Raakt fiscale integriteit (factuurnummers) — uiterste zorg. **Live en met een schrijftest bewezen** (§7b): termijnstaat schrijven en conceptfacturen klaarzetten. Interne factuurnotitie in §7a |

**Per fase telkens dezelfde stappen:** (a) `Condensed*`-mapper EVA→Bouw7 schrijven, (b) `client.post/del` aanroepen, (c) resultaat (id) terugschrijven naar `bouw7_id`, (d) `logSync()`, (e) `sync_vergrendeld`/`bron`-velden respecteren om schrijf-loops te voorkomen.

---

## 5. Open punten / valkuilen

- **Schrijf-scope van de app-key onbekend.** Eerst fase 0 draaien; bij 403 → in Bouw7 (`start.bouw7.nl/my-account/api-access`) een key met schrijfrechten regelen.
- ~~**Plan-items schrijven lijkt niet te bestaan.**~~ **Achterhaald — zie §5b.** `POST /plan-item` bestaat gewoon op Heimdall en werkt met onze API-key (geverifieerd sep 2026). De aanname kwam voort uit één en dezelfde denkfout als bij de to-do's: nooit een POST geprobeerd op de route waarvan we alleen de GET kenden. Uren blijven een aparte stroom (`/project/hour-log`, ≠ plan-items).
- **Gegokte URL's bewijzen niets.** Een 404 op `/todo/{id}` betekende níét dat to-do-detail/-write niet bestaan: ze zitten onder `/project/timeline/…` (zie §5a). Ook de Swagger-spec is incompleet (`/list/todos` ontbreekt erin). Bij "bestaat niet"-conclusies: eerst de UI-call capturen.
- **Loop-preventie.** Lees-sync en schrijf-sync mogen elkaar niet triggeren. Hergebruik `bron` + `sync_vergrendeld` (al aanwezig in het datamodel) zodat door EVA gewijzigde velden niet door de lees-sync overschreven worden en vice versa.
- **Idempotentie.** Upsert op `id` is veilig; create zonder `id` twee keer = dubbele records. Altijd eerst `bouw7_id` checken.
- ~~Achterhaalde "write-API nog niet bekend"-notitie~~ — gecorrigeerd in [`ENDPOINTS.md`](./ENDPOINTS.md) (Apollo-sectie). `client.ts` heeft nu `post()/put()/del()`.
- **Audit/fiscaal.** Verzonden facturen zijn onveranderbaar (creditnota i.p.v. wijzigen) — relevant vanaf fase 7.

---

## 7a. Interne factuurnotitie terugschrijven — LIVE (geverifieerd sep 2026)

De interne notitie op een verkoopfactuur (`InvoiceListItem.note` = `InvoiceDocument.internalNote`) is
het enige factuurveld dat EVA schrijft. De administratie houdt daar het debiteurencontact bij; het
Facturen-scherm leest hem én schrijft er nieuwe logboekregels in bij.

| Doel | Endpoint | Body |
|---|---|---|
| Huidige notitie + document lezen | `GET /invoice/{id}` | — |
| Notitie schrijven | `POST /invoice` | het complete `InvoiceDocument` terug, met alléén `internalNote` vervangen |

**Er is geen smal notitie-endpoint.** `/invoice/{id}` staat alleen `GET, DELETE` toe (een POST geeft
"Method Not Allowed") en `/invoice/set-internal-note` bestaat niet — ondanks het wél bestaande
`/project/set-internal-note`. Beide geverifieerd tegen de live API.

**Read-modify-write met het volledige document, letterlijk zoals opgehaald** — inclusief de
audit-velden `createdAt/createdBy/updatedAt/updatedBy` (bij to-do's strippen we die juist; hier staan
ze in de spec als `required`). Op een factuur is elke afwijking van wat de UI stuurt er één te veel.

**Gemeten:** een volledige round-trip (`GET` → `POST` met alleen `internalNote` anders) veranderde
op een openstaande, in Exact geboekte factuur *niets* behalve `updatedAt`/`updatedBy` — alle 60+ velden
identiek, inclusief factuurnummer, status, datums, bijlagen, verzonden e-mails, regel-id's en bedragen.
`updatedBy` wordt wel de API-gebruiker (Beheerder EOB); de auteursnaam staat daarom in de notitietekst zelf.

**Controle na de write:** de POST geeft het bijgewerkte document terug. `voegRegelToeAanInterneNotitie`
vergelijkt daarop de fiscale kern (id, factuurnummer, status, `isCredit`, datums, aantal regels,
regelsom) met de stand vóór de write en meldt een afwijking hard — stil falen mag hier niet.

**Opmaak:** nieuwste regel bovenaan, gescheiden door `<hr>`, in de huisstijl die de administratie zelf
gebruikt: `<p><strong>1-9-26</strong>, Naam (EVA)<br>tekst</p>`. Onderaan aanplakken zou de leesvolgorde
omkeren. De tekst uit EVA wordt HTML-escaped.

Code: [`lib/bouw7/invoice-note.ts`](./invoice-note.ts) · aanroep vanuit `addDebiteurLogboek`
(`lib/debiteuren/actions.ts`), fail-soft: mislukt de write, dan blijft de EVA-logboekregel staan en
krijgt de gebruiker een waarschuwing.

---

## 5a. To-do's terugschrijven (`isDone`) — LIVE (gecaptured jul 2026)

Een in EVA afgevinkte taak wordt ook in Bouw7 afgevinkt. De endpoints staan **niet** in de Swagger-spec
en zitten onder een onvoorspelbare prefix — `/project/timeline/…`, niet `/todo`:

| Doel | Endpoint | Body |
|---|---|---|
| **To-do lezen (detail)** | **Heimdall** `GET /project/timeline/todo/{id}` | — |
| **To-do schrijven** | **Heimdall** `POST /project/timeline/todo` | volledig to-do-object met `id` (upsert) |

**Let op — dit corrigeert een oudere aanname:** [`ENDPOINTS.md`](./ENDPOINTS.md) stelde dat er "geen
detail-endpoint per item" is omdat `GET /todo/{id}` een 404 geeft. Dat klopt voor díé prefix, maar
`GET /project/timeline/todo/{id}` geeft gewoon **200**. De 404 bewees alleen dat de gegokte URL fout was,
niet dat de functie ontbrak.

**Detail-respons = write-body.** `GET /project/timeline/todo/{id}` geeft exact de vorm die de UI ook
terugPOST: `id, name, project{…}, description, priority, executeBefore, visibility, isDone,
sendNotifications, employees[{id,firstName,lastName}], createdAt/By, updatedAt/By`. Rijker dan
`/list/todos`, dat alleen `associatedEmployeeNames` (namen, géén id's) heeft — met alléén de lijstdata
kun je dus geen veilige write doen zonder de toewijzing te verliezen.

**Werkwijze in EVA** (`lib/bouw7/todo-write.ts`, `schrijfBouw7TodoIsDone`):
1. `GET /project/timeline/todo/{id}` → huidig object;
2. `createdAt/By` + `updatedAt/By` eruit (server-side), **alleen `isDone` vervangen**, `sendNotifications:
   false` (anders mailt Bouw7 de toegewezen medewerkers om een vinkje uit EVA);
3. `POST /project/timeline/todo` met het volledige object.

Read-modify-write met het hele object, net als de UI. Of een minimale body (`{ id, isDone }`) de rest
laat staan dan wel leegmaakt is **niet uitgezocht** — een verkeerde gok wist stilletjes omschrijving en
toewijzing van élke afgevinkte to-do, en de winst (één GET minder) weegt daar niet tegenop.

**Loop-preventie:** na een geslaagde write zet EVA `tasks.bouw7_todo_done = isDone`. Dat is geen
administratie maar functioneel — die vlag is de laatst bekende Bouw7-stand waarmee `syncBouw7Todos` een
échte heropening in Bouw7 (true→false) onderscheidt van een EVA-afvinking. Blijft de vlag achter, dan
mist de sync een latere heropening in Bouw7.

**Fail-soft:** mislukt de write, dan blijft de EVA-status gewoon staan en blijft `bouw7_todo_done` op de
oude waarde — waardoor de lees-sync de nog-open Bouw7-to-do **niet** als heropening ziet en het vinkje
met rust laat (migratie `20260717_tasks_bouw7_todo_done.sql`). Kosten van een mislukte write zijn dus
alleen dat Bouw7 de spiegeling mist.

**Niet gespiegeld:** EVA-status `vervallen`. Bouw7 kent alleen open/afgevinkt; een geannuleerde taak als
"afgevinkt" doorgeven zou liegen tegen wie in Bouw7 kijkt. Zo'n taak blijft daar open.

**Vindmethode (herbruikbaar) — het Allow-orakel:** Heimdall antwoordt op een bestáánde route met een
verkeerde methode `403 … Method Not Allowed (Allow: POST, DELETE)`, en op een onbestaande route
`404 entity_not_found … No route found`. Eén GET onthult dus welke schrijfmethodes een route heeft,
zónder iets te muteren (`GET /project/timeline/todo` → `Allow: POST, DELETE`). Nuttig om een uit de UI
gecapturede call te bevestigen — maar het orakel kan een endpoint niet *vinden*: raden werkt niet
(`/todo`, `/todos`, `/todo/{id}`, `/list/todos/{id}`, `/project/{id}/todo`, `/task(s)`, `/action(s)`
geven allemaal 404, op Heimdall én Athena én Apollo). Alleen de UI-capture wees de echte prefix aan.
Afwezigheid in de Swagger-spec bewijst niets: ook het werkende `/list/todos` staat er niet in.

---

## 5b. Plan-items schrijven — LIVE op Heimdall (geverifieerd sep 2026)

**Dit corrigeert §5, punt 2** ("Plan-items schrijven lijkt niet te bestaan"). Die aanname was fout, en
op dezelfde manier fout als destijds bij de to-do's: er was nooit een POST geprobeerd op de route
waarvan we alleen de GET kenden. `POST /plan-item` bestaat gewoon op Heimdall en accepteert onze
**eigen API-key** — er is geen sessiecookie en geen `start.bouw7.nl` voor nodig.

| Doel | Endpoint | Body |
|---|---|---|
| **Lezen (detail)** | `GET /plan-item/{id}` | — |
| **Aanmaken** | `POST /plan-item` | object zónder `id` → 201 met `id` |
| **Wijzigen** | `POST /plan-item` | zelfde object **mét** `id` → 200 (upsert) |
| **Verwijderen** | `DELETE /plan-item` | `{ "id": 8019818 }` → 204 |

Let op: `DELETE`/`PUT`/`POST` op `/plan-item/{id}` bestaan **niet** (`Allow: GET`). Het id gaat bij
verwijderen in de **body** van een DELETE op het collectie-pad, niet in de URL.

### Verplichte velden

Uitgevraagd door de validator te laten klagen (lege body → 400 met de ontbrekende property):

```
name        string    niet leeg
project     object    { id }  — een kaal integer geeft "expects PlanItemProject, got integer"
startDate   string    ISO8601 MÉT tijdzone: "2026-09-10T07:00:00+02:00" of "...Z"
endDate     string    idem
hours       number
```

Optioneel en geverifieerd werkend: `requisite`, `isAllDay`, `isProcessed`, `notes`, `color`,
`department {id}`, `securityPlanningLink {id}`, `employees [{id}]`, `contacts`, `equipment`.

**Datumformaat is een valkuil.** `"2026-09-10 07:00:00"` (de vorm die de UI-endpoints op
`start.bouw7.nl` gebruiken, en die de Apollo-search teruggeeft) wordt hier geweigerd met "not a valid
datetime". Heimdall eist een expliciete offset. Epoch-seconden worden ook geweigerd.

### Medewerkers

`employees: [{ id }]` werkt en komt bij teruglezen terug als `[{id, firstName, lastName}]`. De id is de
Bouw7-medewerker-id (`medewerkers.bouw7_id` in EVA), niet de `plan_item_per_employee`-koppel-id die het
UI-endpoint `/planning/employee/generic-move` verlangt. Die koppel-id is via de API niet op te vragen —
en is ook niet nodig, want verplaatsen is gewoon een upsert met andere datums.

**Weglaten ≠ leegmaken.** Bij een upsert zonder `employees`-veld bleef de toewijzing staan. Of
`employees: []` de toewijzing daadwerkelijk leegt is **niet getest**; ga daar niet blind vanuit
(zelfde reden als bij de to-do's hierboven: een verkeerde gok wist stilletjes toewijzingen).

### Auteur is niet stuurbaar

`createdBy`/`updatedBy` komen bij lezen terug als string (`"Chris Glas <chris@everts.chat>"`), maar zijn
bij schrijven **read-only**: meegestuurd worden ze genegeerd en Bouw7 logt altijd de eigenaar van de
API-key (`"Beheerder EOB <abonnementen@everts.chat>"`). Wie de wijziging deed is in Bouw7 dus niet te
herleiden tot de EVA-gebruiker; wil je dat, dan moet het in EVA zelf worden vastgelegd. De *toegewezen*
medewerker is wél stuurbaar — dat is `employees`, een andere vraag dan de audittrail.

### Balkkleur = projectleider (`GET /plan-item-colors`)

De planning heeft één globale kleurenlegenda, en bij Everts staat in elk label de **voornaam van een
projectleider**:

| id | hex | label |
|---|---|---|
| 98071 | `#FF0000` | Marco |
| 98072 | `#2E9AFE` | Chris |
| 98074 | `#1E6B03` | Tom |
| 100631 | `#E908F1` | Marga |
| 104451 | `#33E50D` | Richard |
| 104452 | `#03EDF8` | Justin |

Het endpoint is `GET /plan-item-colors` op Heimdall — **meervoud**; `/plan-item-color` geeft
"No route found" en `/plan-item-color/{id}` een 403. Het staat niet in de Swagger-spec.

Op het plan-item zelf is `color` gewoon een **hex-string**, geen `{ id }`-referentie naar de legenda.
Bouw7 dwingt ook niet af dát het een legenda-kleur is: er staan historische items met vrije hexen
(`#FE2E64`). Wij schrijven daarom exact de hex uit de legenda — een net-niet-gelijke waarde
(`medewerkers.kleur` in EVA is `#2478ff` waar de legenda `#2E9AFE` zegt) zet de balk buiten de indeling.

Geverifieerd op een tijdelijk plan-item (aangemaakt en direct weer verwijderd, sep 2026):

| Handeling | Resultaat |
|---|---|
| create mét `color` | 201, kleur staat erop |
| upsert met andere `color` | 200, kleur gewijzigd |
| upsert **zonder** `color`-veld | 200, **bestaande kleur blijft staan** |
| upsert met **alleen** `{ id, color }` | 200 — naam, datums, `isAllDay`, uren, `requisite`, notities, afdeling, `securityPlanningLink`, medewerkers en contacten **allemaal onveranderd** |

Die laatste is de belangrijkste: `POST /plan-item` gedraagt zich bij een bestaande `id` als een
**partiële update**, niet als een vervanging. Herkleuren kan dus met een body van twee velden — geen
read-modify-write, en daarmee geen risico dat we een veld dat we niet begrijpen terugschrijven. (De
verplichte velden uit de tabel hierboven gelden alleen bij *aanmaken*.)

`herkleurPlanningInBouw7()` gebruikt dat na een rolwissel op het dossier: alle plan-items van het
project krijgen de kleur van de nieuwe projectleider. Bewust **alle** items en niet alleen de door EVA
aangemaakte — het overgrote deel van de planning (1210 van 1230 planitems) staat in Bouw7 zelf, dus
anders bleef een project na een rolwissel vrijwel volledig in de oude kleur staan.

Dat laatste is de reden dat `plan-item-write.ts` het veld weglaat zodra er geen legenda-regel bij de
projectleider hoort: weglaten is hier geen leegmaken, en een handmatig in Bouw7 gezette kleur wissen is
schadelijker dan hem laten staan.

### Afgeleid uit de leeskant

Elk veld dat de write nodig heeft, komt uit data die we al synchroniseren — geverifieerd op plan-item
7182158: `security_code_planning_id` 416299 = `securityPlanningLink.id`, `department_id` 57159 =
`department.id`. Er zijn dus geen verborgen id's.

### De UI-endpoints (niet gebruiken)

Ter documentatie, gecaptured uit `start.bouw7.nl`: `POST /api/plan-item/create`, `POST
/api/plan-item/update?id=`, `POST /api/plan-item/delete`, `POST /planning/employee/generic-move`,
`POST /planning/employee/get-calendar-data`. Die draaien op sessiecookie + `x-csrf-token`, hanteren
snake_case én drie verschillende datumnotaties door elkaar, en zijn ongedocumenteerd intern. Ze waren
nuttig om te bewijzen dát planning schrijfbaar is; voor EVA is `POST /plan-item` op Heimdall de weg.

---

## 7c. Inkoopfactuur accorderen — ⛔ KAN NIET met onze app-sleutel (uitgezocht sep 2026)

**Status: half.** Het endpoint bestaat en zit op Heimdall (dus bereikbaar met onze app-key), maar
de body-vorm is nog niet gecaptured. Er is dus nog **niets geschreven**.

### Waarom dit géén inbreuk is op §2c

§2c sluit `POST /purchase-invoice` en `PUT /purchase-invoice/{id}/update-status/{status}` bewust
uit: bedrag, BTW, factuurnummer en boekstuk zijn fiscaal en blijven van Bouw7. Dat besluit staat
en verandert hier niet. De **vote raakt geen van die velden**: hij zet een `approvalStatus` +
`comment` op een apart `approval`-object naast de factuur. Zelfde categorie als het
to-do-terugschrijven (§5a) en de bewakingscode op de leverbon (§2b), beide al live. EVA zet de
factuurstatus **nooit zelf** op 2 (goedgekeurd) — die overgang is Bouw7's eigen gevolg van een
afgeronde workflow.

### De leeskant (LIVE, in gebruik door `sync-inkoopfacturen.ts`)

Het `approval`-object zit **alleen** op `GET /purchase-invoicing/purchase-invoice/{id}`. De lijst
`/list/purchase-invoices` geeft enkel `currentApprover` als **naam-string** — niet als object en
zonder id. Match daar dus nooit op; gebruik `approval.currentApprover.employee.id`, dat is het
Bouw7-medewerker-id en mapt op `medewerkers.bouw7_id`.

```jsonc
"approval": {
  "id": 5495517,            // ← dit id hoort in de vote-URL, niet het factuur-id
  "currentIndex": 1,
  "workflowId": null,
  "currentApprover": { "id": 8345870, "index": 1,
                       "employee": { "id": 194082, "firstName": "Robert", "lastName": "Hoogenbosch" },
                       "approvalStatus": 0, "approvalDate": null, "comment": null },
  "lastActionDate": null,
  "isApproved": false,
  "canApprove": false,      // ← voor ONZE sleutel altijd false: die is geen medewerker
  "approvers": [ /* zelfde vorm, één per stap */ ]
}
```

`approvalStatus`: **0** = open · **1** = afgekeurd/bezwaar (mét `comment` als reden) · **2** =
goedgekeurd. Gemeten over alle 3040 facturen op 8 sep 2026. Factuurstatus:
**0** concept · **1** ter goedkeuring · **2** goedgekeurd/te betalen · **4** betaald ·
**5** afgekeurd/bezwaar. Status 3 komt niet voor.

`GET /approval-template/default-settings` (200) geeft de actieve standaardworkflow —
"Inkoopfacturen goedkeuren", één goedkeurstap. Alle 144 openstaande ketens hebben er inderdaad
precies één; `workflowId` op de factuur zelf is `null` (de goedkeurder wordt handmatig gezet).

### De schrijfkant — wat we weten en wat niet

Met het **Allow-orakel** (§5a) vastgesteld op approval 5495517:

```
GET /approval/{approvalId}/vote-on-purchase-invoice
  → 403 "Method Not Allowed (Allow: POST)"      ← route bestaat, accepteert POST
GET /approval/{approvalId}/vote-on-contract
  → 403 (Allow: POST)
GET /approval/{approvalId}   → 404 entity_not_found
GET /approval                → 404 entity_not_found
GET /list/approvals          → 404   (idem /list/approval-templates, /list/purchase-invoice-approvals)
```

Belangrijk: de route zit op **`heimdall.bouw7.nl`**, niet op `start.bouw7.nl`. Onze app-key kan er
dus bij — dat was de grootste twijfel. Er is géén OpenAPI-spec om de body uit af te leiden
(`/doc`, `/doc.json`, `/api/doc`, `/swagger(.json)`, `/openapi.json` → allemaal 404).

### De capture (Chrome DevTools, 8 sep 2026) — en waarom het hierop stukloopt

```
POST https://heimdall.bouw7.nl/approval/5653325/vote-on-purchase-invoice
Content-Type: application/json
Authorization: Bearer <token van de ingelogde medewerker>

{"approve":true,"comment":""}
```

De body bevat **geen goedkeurder**. Geen `approverId`, geen `employeeId`, geen `index`. Bouw7
leidt de stemmer dus volledig af uit het token — en dáár zit het verschil:

| | token van een medewerker | onze app-sleutel |
|---|---|---|
| `sub.type` | 3 | 1 |
| `sub.user` | tom@everts.chat | abonnementen@everts.chat |
| **`sub.employee`** | **`{ id: 195078, … }`** | **`null`** |

Onze sleutel hoort bij een Bouw7-*gebruiker* zonder gekoppeld *medewerker*-record. Er is dus
niemand om een stem aan toe te schrijven, en dat is precies wat `canApprove: false` op élke
factuur al liet zien.

Er is ook geen uitweg in de API: `/auth/impersonate`, `/auth/employee`, `/auth/switch-employee`,
`/auth/login`, `/me` en `/current-user` geven allemaal 404 op Heimdall. Een per-gebruiker-token
is met de app-key-login (`/auth/login/{appName}/apiKey`) niet te krijgen — die is per app, niet
per persoon.

### Waarom we het dan ook niet half doen

De verleiding is om `abonnementen@everts.chat` in Bouw7 aan een medewerker te koppelen. Dan
krijgt onze sleutel wél een `employee`-claim en kan hij stemmen — maar elke goedkeuring uit EVA
komt dan in Bouw7 te staan op naam van díé medewerker, niet op naam van wie in EVA op de knop
drukte. Een goedkeuringsspoor dat liegt over wie akkoord gaf is erger dan geen goedkeuring
kunnen geven; bij een inkoopfactuur is dat precies het stuk dat moet kloppen. **Niet doen.**

### Wat er wél moet gebeuren als dit ooit moet werken

Eén vraag aan Bouw7: **kan een API-sleutel aan een medewerker worden gekoppeld, of ondersteunt
de API het stemmen namens een medewerker (delegatie)?** Is het antwoord ja — een sleutel per
goedkeurder, of een `employeeId` die de vote accepteert — dan is de rest van deze paragraaf
meteen bruikbaar en is het een halve dag werk. Is het antwoord nee, dan blijft accorderen in
Bouw7 en is EVA het overzicht met een doorklik.

### Stand van zaken in EVA

`/inkoop/facturen` toont de hele keten (wie moet accorderen, wie gaf akkoord, met welke
toelichting) en zet bij "jij bent aan zet" een knop naar
`https://start.bouw7.nl/purchase-invoice#/view/{id}`. Er is bewust géén accordeerknop in EVA:
liever een eerlijke doorverwijzing dan een knop die stilletjes de verkeerde naam onder het
akkoord zet.

---

## 7b. Verkooptermijnen & conceptfacturen — schema vastgesteld (sep 2026, nog niet geschreven)

Het onderzoek dat aan deze sectie voorafging is read-only gedaan met
[`scripts/onderzoek-bouw7-facturatie.mjs`](../../../../../scripts/onderzoek-bouw7-facturatie.mjs).
Er is nog **niets** naar Bouw7 geschreven; hieronder staat wat er nodig is om dat veilig te doen.

### De koppeling termijn ↔ factuurregel loopt vanaf de factuur

Een `InvoiceDocumentLine` draagt **`projectInvoiceTermIds: number[]`**. Bouw7 vult daarna zelf de
`invoiceLine` op de termijn — dat veld is in de spec `readOnly` en is dus géén schrijfweg. Op factuur
3890197 (vier termijnen van één termijnstaat) staat het één-op-één:

| regel-id | `projectInvoiceTermIds` | omschrijving | subTotal |
|---|---|---|---|
| 12970198 | `[1261857]` | 1e termijn: 30% bij opdracht | 5599.88 |
| 12970199 | `[1261858]` | 2e termijn: 30% bij start van de werkzaamheden | 5599.88 |
| 12970200 | `[1261859]` | 3e termijn: 30% bij 50% gereed | 5599.88 |
| 12970201 | `[1261860]` | 4e termijn: 10% bij oplevering | 1866.63 |

Let op wat dit betekent: **meerdere termijnen op één factuur is precies wat Bouw7 zelf doet**, met
één regel per termijn. Het veld is een array, maar gebruik dat niet — één regel per termijn houdt
het bedrag per termijn traceerbaar en maakt de terugleescontrole per termijn mogelijk.

### Concept = status 3, en dat komt gratis uit het skelet

**`GET /project/{projectId}/invoice/new`** (en `GET /invoice/new` zonder project) geeft een compleet,
leeg `InvoiceDocument` terug — hetzelfde skelet dat de Bouw7-UI gebruikt bij "nieuwe factuur".
Geverifieerd op project 3869371:

```
id: null · invoiceNumber: null · status: 3 · date: null · dueDate: null
isMailed: false · isBooked: false · isCredit: false · language: "nl-NL"
project: {id, name, workAddress, fullProjectNumber, reference, customAttributeValues}
contact: {id: 3752713, name: "OPOZ"}  ·  branch: {id: 5249, division: {...}}
chapters: [{ id: null, sortIndex: 0, isRoot: true, name: "Root", lines: [] }]
```

Daarmee is een conceptfactuur maken hetzelfde read-modify-write-patroon als de interne notitie in
§7a: **skelet ophalen → alleen `chapters[0].lines[]` vullen → `POST /invoice`**. Geen enkel veld
hoeft geraden te worden, en de `status: 3` komt van Bouw7 zelf in plaats van uit een aanname.

De factuurstatus is een vaste enum — `0 = Open, 1 = Verlopen, 2 = Betaald, 3 = Concept` — en er is
**geen** `/invoice/statuses` (404, net als `/list/invoice-statuses` en
`/organization/invoice-statuses`). Dit is dus de uitzondering op "enum-id's live ophalen": neem de
status over uit het skelet in plaats van 3 te hardcoden. Gemeten op 544 facturen: alleen `status: 3`
komt voor zonder `invoiceNumber`, en die zijn ook altijd `isMailed: false` en `isBooked: false`.

### Regelvelden

Zoals Bouw7 ze zelf zet (regel uit een termijnfactuur):

```json
{ "id": 12970198, "projectId": null, "sortIndex": 0, "linkedBookingItems": [],
  "projectInvoiceTermIds": [1261857], "description": "1e termijn: 30% bij opdracht ",
  "quantity": "1", "unitName": null, "unitPrice": "5599.88", "subTotal": "5599.88",
  "surchargePercentage": "0", "vatTariffPercentage": "9", "vatTariffId": 82627,
  "vatTariffLegalText": null, "ledger": null, "costCenter": null, "reference": null, "priceCode": null }
```

- `vatTariffPercentage` is **readOnly**: stuur `vatTariffId`, Bouw7 vult het percentage.
  Tarief-id's uit `GET /list/vat-tariffs` — 82626 = Hoog 21% (`isDefault`), 82627 = Laag 9%.
- **Een verkoopfactuurregel heeft géén `projectSecurityLink`.** De bewakingscode hangt in Bouw7 aan
  het geboekte item, niet aan de verkoopregel; daarvoor is `linkedBookingItems` (`{id, type}` met
  type `hours` / `employeeHours` / `contactHours` / `deliveryTickets` / `purchaseInvoiceLines` /
  `material` / `equipment` / `garbage`). Dit is precies waar de oude `maakRegieFactuurInBouw7`
  op stukliep.
- `ledger` en `costCenter` mogen `null` zijn — Bouw7 zet ze zelf zo.

### Termijnstaat

`GET /list/project-invoice-term-statements` (`q: project.id = {id}`) geeft de kop:
`{id, project{…}, contact{id,name}, fixedPrice}`. De termijnen eronder via
`GET /list/project-invoice-terms` (`q: statement.id = {sid}` — filteren op `statement.project.id`
geeft 400). Een termijn:

```json
{ "id": 1261857, "description": "1e termijn: 30% bij opdracht ", "percentage": "30.0000",
  "subtotal": "5599.8800", "invoiceableAt": null, "vatTariffPercentage": "9.0000",
  "vatTariff": { "id": 82627, "label": "Laag 9%", "percentage": "9.0000", "isShifted": false },
  "invoiceLine": { "id": 12970198, "invoiceId": 3890197, "invoiceStatusId": 2 } }
```

`invoiceLine.id` is gelijk aan de factuurregel-id. `invoiceStatusId` volgt de factuurstatus en is
onbruikbaar om concept van verzonden te onderscheiden (zie `termijnStatus` in `lib/dossiers/actions.ts`).

Schrijven gaat via **`POST /project/{project}/invoice-term-statement` met de termijnen inline** in
`invoiceTerms[]` (zie hieronder — het losse termijn-endpoint werkt niet als toevoegroute). Per
termijn: `{ id?, description, percentage, subtotal, vatTariffObject: { id }, invoiceableAt? }`;
`vatTariffPercentage` is ook daar readOnly, dus stuur `vatTariffObject`. Zonder `id` = nieuw.

### Bewezen met een schrijftest (project 4202130, sep 2026 — alles weer opgeruimd)

De vijf openstaande aannames zijn in één test beslecht. Statement 602274 met twee termijnen
(1591891, 1591892), conceptfactuur 4533540, daarna alles verwijderd; het project stond erna weer op
nul termijnstaten en nul facturen.

1. ✅ **`POST /invoice` op basis van het skelet laat het factuurnummer leeg.** Teruggekregen:
   `status: 3`, `invoiceNumber: null`, `isMailed: false`, `isBooked: false`, `date: null`.
   Dit was de aanname waar de hele opzet op stond of viel.
2. ✅ **`projectInvoiceTermIds` op de factuurregel legt de koppeling.** Bouw7 vulde daarna zelf
   `invoiceLine: { id: 15095736, invoiceId: 4533540, invoiceStatusId: 3 }` op de termijn. De tweede
   termijn bleef ongemoeid.
3. ⚠️ **`invoiceTerms[]` MOET inline mee in de statement-POST.** Een statement zonder termijnen wordt
   geweigerd: `InvoiceTermStatement::$invoiceTerms failed. "This collection should contain 1 element
   or more."` Het losse `POST /project/{statement}/invoice-term` is dus géén route om termijnen toe
   te voegen — de eerste implementatie deed dat wel en kwam niet door de validatie heen.

   **Gevolg voor de aanroeper:** de POST zet de héle collectie. Élke termijn moet dus mee, ook de
   termijnen die je niet wijzigt — laat je er een weg, dan verdwijnt hij. Stuur termijnen die je met
   rust wilt laten terug zoals ze uit Bouw7 kwamen.
4. ✅ **`id` meesturen werkt als bijwerken, niet als dupliceren.** Twee termijnen bleven twee
   termijnen; alleen de omschrijving veranderde.
5. ✅ **Een termijn met een `invoiceLine` blijft ongemoeid** doordat EVA hem overslaat en ongewijzigd
   terugstuurt. Bouw7 weigert zo'n wijziging niet uit zichzelf, dus die bescherming moet aan
   EVA-kant blijven staan.

`DELETE /invoice/{id}` verwijdert een conceptfactuur zonder morren (alleen toegestaan zolang er geen
factuurnummer is — die controle staat in `verwijderConceptFactuur`).

`DELETE /project/term-statement` wist de **hele** termijnstaat en is daarmee te grof voor EVA.
Opruimen van een testfactuur kan wel met `DELETE /invoice/{id}`.

---

## 8. EVA-invoer beschermen tegen de lees-sync (sep 2026)

De lees-sync (cron 06:30 full / 12:45 incremental, plus de Ververs-knoppen) schreef tot sep 2026
op een aantal tabellen elke Bouw7-waarde terug, ook over velden die in EVA waren bewerkt. Het
patroon `handmatige_velden text[]` (aug 2026, relaties/contactpersonen) is daarom uitgerold naar
`dossiers`, `medewerkers` en `relatie_bankgegevens`; `contactpersoon_organisaties` kreeg
`functie_handmatig`, `planning_items` kreeg `bouw7_write_pending`. Helpers + veldlijsten:
`lib/bouw7/handmatige-velden.ts`.

**Twee spelregels.**
1. *Eenrichtingsvelden* (EVA schrijft ze niet naar Bouw7 — werkadres, categorie, referentie,
   contactpersoon, opmerkingen, object, servicedesk-kolom, medewerkergegevens, IBAN, functie op
   een contactpersoon): bij bewerken markeren; de sync laat ze staan tot "Weer uit Bouw7".
   De servicedesk-kolom is de uitzondering: die markering vervalt vanzelf zodra Bouw7 de
   projectstatus écht wijzigt.
2. *Tweerichtingsvelden* (rollen, statussen): alleen gemarkeerd zolang de write-back naar
   Bouw7 niet is gelukt; `lib/dossiers/bouw7-retry.ts` probeert die writes opnieuw vóór de
   lees-sync (`runFullSync`, `syncEnkelDossier`) en ontmarkeert bij succes. Zo overleeft een
   EVA-wijziging een Bouw7-storing, en blijft Bouw7 leidend zodra beide gelijk lopen.

**Planning.** Een uit Bouw7 geïmporteerd planitem dat in EVA wordt verplaatst gaat nu wél terug
naar Bouw7: partiële `POST /plan-item {id, startDate, endDate, hours, employees}`. De toewijzing
wordt uit `GET /plan-item/{id}` gelezen en alleen de medewerker van deze rij wordt vervangen —
Bouw7 kan medewerkers op het item hebben die EVA niet kent. Zusterrijen (zelfde plan-item, andere
medewerker) schuiven in EVA mee. Verwijderen haalt de medewerker van het item (`employees` zonder
hem) of verwijdert het item als hij de laatste was; lukt dat niet, dan wordt de EVA-verwijdering
geweigerd. Mislukt een write, dan staat `bouw7_write_pending` en slaat `syncDossierPlanning` de
herbouw van dat dossier over tot de herkansing slaagt. De herbouw zelf is een reconcile geworden:
bestaande Bouw7-activiteiten blijven staan (status/volgorde/EVA-planitems eronder overleven),
alleen de Bouw7-planitems worden opnieuw opgebouwd.

**Overige lekken gedicht:** `opmerkingen` van een EVA-aanvraag werd bij elke sync op leeg gezet
(`information` geschreven, `notes` teruggelezen); rollen zonder Bouw7-waarde wisten de EVA-rol;
`tasks.deadline` negeerde `deadline_handmatig`; goedgekeurd EVA-verlof kwam als tweede rij terug
(nu `bouw7_id` op de afwezigheidsrij, import slaat die over); de werkbegroting-overname bij
"gewonnen" zette een bijgestelde begroting terug (nu alleen bij een lege begroting).

## 9. EVA is leidend: velden die nu wél naar Bouw7 gaan (sep 2026)

Doel: Bouw7 zo min mogelijk hoeven openen. Alles wat EVA kan schrijven, schrijft het ook. Elke write
meldt terug welke velden Bouw7 echt overnam (terugleescontrole); wat niet aankwam blijft in EVA
beschermd (`handmatige_velden`) en krijgt via `lib/dossiers/bouw7-retry.ts` een herkansing.

| Wat | Module | Endpoint | Geverifieerd |
|---|---|---|---|
| Dossiervelden: naam, referentie, werkadres, deadline, voorlopige start/eind, opdrachtgever, contactpersoon, categorie, object, VvE-code | `lib/bouw7/project-velden.ts` | `POST /project` (partiële upsert) + `POST /project/set-internal-note` voor opmerkingen | ja, 4202130: alle velden heen en terug |
| Aanneemsom bij gewonnen offerte (+ knop op Informatie-tab) | idem `schrijfBouw7Aanneemsom` | `POST /project { fixedPrice }` → Athena `revenue.budgeted` volgt | ja |
| Relatie bijwerken (naam, KvK, btw, e-mail, telefoon, mobiel, adres, opmerkingen, actief, IBAN) | `lib/bouw7/contact-write.ts` | `POST /contact { id, … }` — partieel; leeskant heet `emailAddress`/`mobilePhoneNumber`/`iban`, schrijfkant `email`/`mobileNumber`/`accountNumber` | partieel: `phoneNumber`, `city` live; overige via terugleescontrole |
| Contactpersoon bijwerken + functie | idem | `POST /contact/{id}/contact-person { id, … }` | `jobTitle`, `phoneNumber` live |
| Relatie aanmaken | `create-contact.ts` | `POST /contact` **vereist maatwerkveld "Soort opdrachtgever" (id 19272, keuzelijst)** — zonder dat kwam tot sep 2026 géén EVA-relatie in Bouw7 aan | ja |
| Medewerker bijwerken (naam, telefoon, adres, datums, tarieven, extern, actief→uit-dienst-datum **+ afdeling**) | `lib/bouw7/employee-write.ts` | `POST /organization/employee { id, … }` — partieel; e-mail bewust niet (inlognaam) | `phoneNumber`, `city`, `department` live |
| Medewerker aanmaken | idem | `POST /organization/employee` + verplichte maatwerkvelden (ownerType 3, `isRequired`) op een neutrale startwaarde | **niet** live getest |
| Aangenomen meerwerk → termijn in de termijnstaat | `lib/dossiers/meerwerk-termijn.ts` | `POST /project/{id}/invoice-term-statement` (deelschrijving: bestaande termijnen gaan ongewijzigd mee, `fixedPrice` schuift met het verschil) | ja: termijn erbij, bedrag bijgewerkt, opgeruimd |

**Datumvalkuilen op `POST /project`:** `startDate`/`endDate` willen een datetime mét offset
(`2026-10-01T00:00:00+02:00`), `deliveryDate` een kale datum (`2026-11-15`). Fout formaat = 400 op de
hele POST, er wijzigt dan niets. `branch` wordt bewust nooit geschreven (projectnummer hangt eraan).

**Meerwerk-herkansing alleen voor `bouw7_term_pending`:** bij livegang stonden er 118 aangenomen
regels zonder termijn-id die met de hand in Bouw7 zijn afgehandeld. Die alsnog schrijven zou dubbele
termijnen geven.

### Inactief zetten verhuist naar de afdeling "Inactief personeel"

Wie in EVA op inactief gaat, krijgt in Bouw7 niet alleen een uit-dienst-datum maar verhuist ook naar
de afdeling **"Inactief personeel"** — zo valt hij daar ook uit de planning- en personeelslijsten.
Het afdeling-id wordt op naam opgezocht via `GET /list/departments` (bij Everts 57161, `isActive:
false`) en niet gehardcodeerd. `POST /organization/employee { id, department: { id } }` is partieel:
geverifieerd op 195078 dat naam, adres, tarieven, uit-dienst-datum en maatwerkvelden onaangeroerd
bleven.

Terugdraaien kan doordat EVA de vórige afdeling onthoudt in
`medewerkers.bouw7_afdeling_voor_inactief_id` (migratie `20260908d`): EVA's eigen `afdeling` is een
andere indeling dan die van Bouw7 en kan de terugkeerafdeling niet aanwijzen. Die kolom wordt pas
gevuld ná een geslaagde write, alleen de eerste keer (anders zou "Inactief personeel" zichzelf als
terugkeerafdeling vastleggen), en weer geleegd zodra iemand actief wordt.

Wordt iemand in **Bouw7 zelf** uit dienst gemeld, dan blijft zijn afdeling daar met rust: dat is dan
een keuze van de administratie, en de lees-sync schrijft sowieso niets terug.
