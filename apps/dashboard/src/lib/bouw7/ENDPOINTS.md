# Bouw7 API — Endpoint Reference

Centrale referentie voor alle beschikbare Bouw7-endpoints in EVA.  
Bij twijfel: kijk hier, niet in `client.ts` of `sync.ts`.

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
totalExclVat        — omzet excl. BTW (via Heimdall; minder nauwkeurig dan Athena)
fixedPrice          — vaste aanneemsom als string
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

**Velden op `Bouw7Quotation`:**
```
id, quotationNumber, subject, reference, quotationDate
employee { id, firstName, lastName, prefix }   ← calculator
project  { id, name }
contact  { id, name }
subtotal         — kostprijs (excl. opslagen)
total            — verkoopprijs excl. BTW
commissionPercentage
quotationStatus  { id, name }
createdAt, updatedAt
```

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

## EVA-intern (Supabase)

Financiële data die wél in de EVA-database staat.

| Wat | Server action | Tabel |
|---|---|---|
| Dossier bedrag + kostprijs | `getDossierById(id)` | `dossiers.bedrag_excl_btw`, `.kostprijs_excl_btw` |
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
