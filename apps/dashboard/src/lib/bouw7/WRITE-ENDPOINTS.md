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
| **Bestelregels** (import) | `GET /list/contract-order-lines` (Heimdall, `q`-DSL) | items: `quantity`, `quantityFactor`, `unitPrice`, `unit`, `totalPrice`, `projectSecurityLink{code,costType}`. Aantal = `quantity × quantityFactor`. |

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

### Bestelregels = "Verwachte kosten" → `POST /project/{project}/contract-order-line`
EVA's Financieel-tab toont **"Verwachte kosten"** uit `GET /list/contract-order-lines`, gesommeerd per
`projectSecurityLink.code`. De **schrijf-tegenhanger** van precies dat regeltype is:

```
POST /project/{project}/contract-order-line     body: ContractOrderLineOld
```
| Veld | | Opmerking |
|---|---|---|
| `project` `{id}` | **REQ** | path + body |
| `description` | opt | regelomschrijving |
| `quantity`, `unitPrice` | opt | Bouw7 rekent `totalPrice` = quantity × unitPrice zelf |
| `unit`, `articleNumber` | opt | |
| `projectSecurityLink` `{id}` | opt | **bewakingscode** — zo landt de regel op de juiste code |
| `contact` `{id}` | opt | leverancier |

> **Let op:** dit endpoint staat in de spec als *deprecated*, maar is wél de bron die EVA leest.
> **Geen API-delete** (`/list/contract-order-lines` is GET; er is geen DELETE) — testregels in de Bouw7-UI verwijderen.
> Niet te verwarren met `POST /contracts/purchase-order` (formele inkooporder met leverancier/status/termijnen →
> voedt `contractCostAmount`, dat volgens EVA's eigen docs "klopt niet/0 in de praktijk"). Voor EVA-bestelregels
> is `contract-order-line` de juiste route.

EVA-implementatie: `createBouw7Bestelregels(projectId, regels)` + read-only `discoverBouw7Bestelregels(projectId?)`
in `instellingen/integraties/actions.ts`.

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

### Inkoopfacturen: bewust NIET schrijven (EVA-rekenlaag) — besluit juni 2026
Het Inkoop-tab kan een geboekte kost **hercoderen** (andere bewakingscode) of **toewijzen** aan een
inkooporder/OA-contract, zodat het saldo per order/contract en de kosten per bewakingscode in EVA kloppen
ook bij een verkeerde inboeking. Deze correctie wordt **uitsluitend in EVA** opgeslagen
(`public.inkoop_correcties`, gemerged in `getDossierInkoop`) en **NIET** naar Bouw7 teruggeschreven.
Reden: een geboekte inkoopfactuur is **fiscaal-relevant** (bedrag/BTW/factuurnummer); die mag EVA niet muteren.
Daarom géén `POST /purchase-invoice` / `PUT /purchase-invoice/{id}/update-status` vanuit EVA — niet alsnog
inbouwen zonder uitdrukkelijk akkoord. Geboekte kosten leest EVA via Heimdall `GET /list/purchase-invoices`
(rijke financiën) + Apollo `GET /search/purchase-invoices` (bewakingscode), gemerged op `deliveryTicket.id`.

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

**Projecten** `POST/DELETE /project` · `POST /project/set-internal-note` · `POST /restore-project/{id}` · `DELETE /hard-delete-project/{id}` · `POST/DELETE /project/delivery-ticket` · `POST /project/{project}/invoice-term-statement` · `POST /project/{statement}/invoice-term` · `DELETE /project/term-statement` · `POST /project/hour-log` · `POST /project/{project}/contract-order-line` *(deprecated)*

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
- **Loop-preventie.** Lees-sync en schrijf-sync mogen elkaar niet triggeren. Hergebruik `bron` + `sync_vergrendeld` (al aanwezig in het datamodel) zodat door EVA gewijzigde velden niet door de lees-sync overschreven worden en vice versa.
- **Idempotentie.** Upsert op `id` is veilig; create zonder `id` twee keer = dubbele records. Altijd eerst `bouw7_id` checken.
- ~~Achterhaalde "write-API nog niet bekend"-notitie~~ — gecorrigeerd in [`ENDPOINTS.md`](./ENDPOINTS.md) (Apollo-sectie). `client.ts` heeft nu `post()/put()/del()`.
- **Audit/fiscaal.** Verzonden facturen zijn onveranderbaar (creditnota i.p.v. wijzigen) — relevant vanaf fase 7.
