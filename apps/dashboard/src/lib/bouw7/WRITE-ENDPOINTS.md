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
| **Bewakingscode aanmaken** | `POST /security-code` (Heimdall) | `{ name, code, securityCodeChapter: { id } }` → response `{ id }`. Hoofdstuk-id moet **bestaan** (geen betrouwbaar create-hoofdstuk-endpoint gevonden). |
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

### Niet (betrouwbaar) mogelijk gebleken
- **Hoofdstuk aanmaken** via API — daarom kiest de gebruiker een bestaand hoofdstuk. ("+ Hoofdstuk" in de
  Bouw7-UI gaf geen bruikbare afgevangen call; een leeg hoofdstuk meesturen in de structuur-POST werkte niet.)
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

### `POST /quotation` — offerte
Body: `Quotation`. Verplicht: `employee{id}`, `subject`, `quotationStatus{id}`, `contact{id}`, `quotationDate`, `language` (bv. `nl-NL`), `layout`. Regels via `chapters[] → QuotationLineChapter`. AK/W&R via `overheads`/`profitAndRisk` (+ hun `CondensedVatTariff`). **Complex** — laatste fase.

### `POST /project/delivery-ticket` — bon/leverbon
Body: `DeliveryTicket`. REQ: `contact{id}`, `project{id}`, `ticketNumber`, `ticketDate`, `purchaseType` (int), `processed` (bool). Optioneel `cost`, `description`, `file`.

### Facturatie-termijnen
- `POST /project/{project}/invoice-term-statement` — termijnstaat (`InvoiceTermStatement`)
- `POST /project/{statement}/invoice-term` — losse termijn (`ProjectInvoiceTerm`)

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
| `projectSecurityLink` `{id}` | opt | **bewakingscode** — moet qua kostensoort bij `costType` passen |
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

Opruimen (`trekBestellingIn`) in omgekeerde volgorde: **alle** bonnen
(`verwijderBouw7ContractLeverbonnen`, weigert zodra één bon `processed` is) → contract → de
bestelregels blijven staan.

**Implementatie:** `lib/bouw7/contracten.ts` (`getAfroepStatusId`, `zetBouw7ContractStatus`,
`roepBouw7ContractAf` (per termijn), `verwijderBouw7ContractLeverbonnen`, `leesBouw7Contract`) ·
`lib/bouw7/bestelling-pdf.ts` (order-PDF) · `everts-calc/actions/bestellingen.ts`
(`maakBestellingInBouw7` = alleen concept, `verstuurBestelling` = mail + afroep, `voerAfroepUit`,
`getBestellingMailConcept`) · migraties `20260722a_leverbon_winkel.sql` (`bouw7_leverbon_id`,
`bouw7_bonnummer`, `bouw7_afroep_op`, `is_winkel`) en `20260805a_bestelling_versturen.sql`
(`verstuurd_op`, `verstuurd_door`, `verstuurd_naar`).

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
| **6** | **Offertes** | `POST /quotation` (+ chapters/lines) | Meest complexe schema; pas als calculatie-flow in EVA staat |
| **7** | **Facturatie & termijnen** | `/invoice`, `/project/.../invoice-term*` | Raakt fiscale integriteit (factuurnummers) — uiterste zorg |

**Per fase telkens dezelfde stappen:** (a) `Condensed*`-mapper EVA→Bouw7 schrijven, (b) `client.post/del` aanroepen, (c) resultaat (id) terugschrijven naar `bouw7_id`, (d) `logSync()`, (e) `sync_vergrendeld`/`bron`-velden respecteren om schrijf-loops te voorkomen.

---

## 5. Open punten / valkuilen

- **Schrijf-scope van de app-key onbekend.** Eerst fase 0 draaien; bij 403 → in Bouw7 (`start.bouw7.nl/my-account/api-access`) een key met schrijfrechten regelen.
- **Plan-items schrijven lijkt niet te bestaan.** We lezen planning via Apollo (read-only); er is geen `plan-item`-write-endpoint. Uren schrijf je via `/project/hour-log` (≠ plan-items). Verifiëren of planning terugschrijven überhaupt kan.
- **Gegokte URL's bewijzen niets.** Een 404 op `/todo/{id}` betekende níét dat to-do-detail/-write niet bestaan: ze zitten onder `/project/timeline/…` (zie §5a). Ook de Swagger-spec is incompleet (`/list/todos` ontbreekt erin). Bij "bestaat niet"-conclusies: eerst de UI-call capturen.
- **Loop-preventie.** Lees-sync en schrijf-sync mogen elkaar niet triggeren. Hergebruik `bron` + `sync_vergrendeld` (al aanwezig in het datamodel) zodat door EVA gewijzigde velden niet door de lees-sync overschreven worden en vice versa.
- **Idempotentie.** Upsert op `id` is veilig; create zonder `id` twee keer = dubbele records. Altijd eerst `bouw7_id` checken.
- ~~Achterhaalde "write-API nog niet bekend"-notitie~~ — gecorrigeerd in [`ENDPOINTS.md`](./ENDPOINTS.md) (Apollo-sectie). `client.ts` heeft nu `post()/put()/del()`.
- **Audit/fiscaal.** Verzonden facturen zijn onveranderbaar (creditnota i.p.v. wijzigen) — relevant vanaf fase 7.

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
