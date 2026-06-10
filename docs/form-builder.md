# Form Builder — Technische documentatie

## Overzicht

De Form Builder is een module binnen EVA waarmee gebruikers digitale formulieren kunnen bouwen, invullen, opslaan en exporteren. Vergelijkbaar met MoreApp. Primaire use cases: werkbonnen, inspecties, opleveringen en kwaliteitscontroles.

---

## Architectuur

### Stack
- **Framework**: Next.js 14 (App Router), `'use server'` actions
- **Database**: Supabase (PostgreSQL + JSONB)
- **Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable`
- **PDF export**: `jspdf` + `jspdf-autotable`
- **Offline draft**: `localStorage`

### Datamodel

```
form_templates         — metadata, status, versienummer
form_versies           — schema (JSONB) per versie
form_inzendingen       — ingevulde formulieren (waarden als JSONB)
form_taken             — taakopdrachten aan medewerkers
form_bestanden         — bestand/foto-uploads (Supabase Storage)
form_rechten           — permissies per template
```

Het formulier-schema (`FormSchema`) wordt als JSONB opgeslagen in `form_versies.schema`. Hierdoor is het flexibel uitbreidbaar zonder migraties voor nieuwe veldtypen.

### Schema-formaat

```typescript
interface FormSchema {
  version: 1
  fields: FormField[]
}

interface FormField {
  id: string            // 'f_' + random
  type: FormFieldType   // zie types.ts
  label: string
  name: string          // snake_case interne naam
  required: boolean
  readOnly: boolean
  rememberLastValue: boolean
  placeholder?: string
  helpText?: string
  defaultValue?: unknown
  options?: FieldOption[]       // dropdown | radio | checkbox
  children?: FormField[]        // repeatable section
  conditions?: FieldCondition[] // conditionele zichtbaarheid
  validation?: FieldValidation  // min/max/pattern
}
```

### Inzendingen

Ingevulde waarden worden opgeslagen als `{ [fieldId]: value }` in `form_inzendingen.waarden`. Dit maakt het eenvoudig om waarden op te slaan zonder schema-kennis in de database.

---

## Bestandsstructuur

```
apps/dashboard/src/
  app/(platform)/formulieren/
    actions.ts                         Server actions (CRUD)
    page.tsx                           Overzicht formulieren
    nieuw/page.tsx                     Nieuw formulier aanmaken
    [id]/
      bewerken/page.tsx                Form Builder editor
      invullen/page.tsx                Formulier invullen
      inzendingen/page.tsx             Inzendingenoverzicht
      inzendingen/[subId]/page.tsx     Inzending detail
      inzendingen/[subId]/pdf/route.ts PDF export
  components/formulieren/
    types.ts                           Alle TypeScript types + helpers
    builder/
      FormBuilder.tsx                  3-panel editor (main client component)
      FieldPalette.tsx                 Linkerkolom: veldtype-knoppen
      FormCanvas.tsx                   Middelste kolom: sortable canvas
      SortableField.tsx                Individueel veld in canvas
      FieldSettings.tsx                Rechterkolom: veldinstellingen
    filler/
      FormFiller.tsx                   Invulscherm
      FieldRenderer.tsx                Rendert één veld op basis van type
    submissions/
      SubmissionsTable.tsx             Tabel met inzendingen + filters
```

---

## Veldtypen

| Type         | Beschrijving                          |
|-------------|---------------------------------------|
| `text`       | Korte tekst                           |
| `textarea`   | Lange tekst (meerdere regels)         |
| `number`     | Getalswaarde                          |
| `date`       | Datum                                 |
| `time`       | Tijd                                  |
| `dropdown`   | Selectie uit lijst                    |
| `radio`      | Meerkeuze (één optie)                 |
| `checkbox`   | Meerdere opties kiezen                |
| `boolean`    | Ja / Nee                              |
| `photo`      | Foto's uploaden (base64 in MVP)       |
| `signature`  | Tekenveld voor handtekening           |
| `location`   | GPS-coördinaten via browser           |
| `barcode`    | Barcode/QR (invoer of scan)           |
| `file`       | Bestandsupload (naam + type in MVP)   |
| `repeatable` | Herhaalbare sectie met sub-velden     |
| `heading`    | Titeltekst (structuur)                |
| `paragraph`  | Toelichtingstekst (structuur)         |
| `divider`    | Scheidingslijn (structuur)            |

---

## Condities

Velden kunnen conditioneel worden getoond of verborgen op basis van de waarde van een ander veld:

```typescript
interface FieldCondition {
  fieldId: string           // Het veld dat bepaalt of dit veld zichtbaar is
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty'
  value?: string
  action: 'show' | 'hide'
}
```

De evaluatie vindt plaats in `evaluateConditions()` (types.ts) — zowel in de builder preview als in de filler.

---

## Versioning

Bij elke opslag wordt een nieuwe versie aangemaakt (`form_versies`). Bestaande inzendingen blijven gekoppeld aan de versie waarop ze zijn ingevuld (`form_inzendingen.versie_id`). Dit garandeert dat historische inzendingen altijd met het correcte schema kunnen worden weergegeven.

---

## Offline ondersteuning (MVP)

Concepten worden automatisch opgeslagen in `localStorage` onder de sleutel `form_draft_<templateId>`. Bij het openen van een formulier wordt de localStorage-draft geladen (tenzij er een bestaande inzending is). Bij succesvol indienen wordt de draft verwijderd.

**Volgende stap**: Vervangen door IndexedDB (`idb-keyval`) voor grotere datasets en betere offline betrouwbaarheid, gecombineerd met een sync-queue voor het indienen van formulieren zonder internetverbinding.

---

## PDF export

`GET /formulieren/[id]/inzendingen/[subId]/pdf`

Genereert een PDF via `jspdf` + `jspdf-autotable` met:
- Formuliernaam, ingediend datum, status, versie
- Alle veldwaarden als tabel
- Paginanummering

Foto's en handtekeningen worden in de MVP als tekst vermeld (`[Afbeelding — zie origineel]`). Volgende stap: base64-afbeeldingen insluiten in het PDF.

---

## Rechten (toekomstig)

De `form_rechten`-tabel is aanwezig maar nog niet afgedwongen. Geplande rollen:

| Rol         | Rechten                                    |
|------------|---------------------------------------------|
| `admin`     | Alles beheren                              |
| `bewerker`  | Formulieren aanmaken/bewerken, inzendingen |
| `invuller`  | Toegewezen formulieren invullen            |
| `lezer`     | Inzendingen lezen                          |

---

## Geplande uitbreidingen

- **Bestanden uploaden naar Supabase Storage** (nu: base64/metadata)
- **IndexedDB + sync-queue** voor robuuste offline ondersteuning
- **Excel/CSV export** van inzendingen
- **Taken-workflow**: formulieren toewijzen aan medewerkers met deadline
- **Berekeningen**: `nummer_a * nummer_b = totaal`
- **Webhook/Zapier** integratie bij indiening
- **Automatische e-mail** na indiening
- **Koppeling met dossiers/opdrachten** via `dossier_id`
- **Exact Bouw7 koppeling** voor projectreferentie
- **Mobiele PWA-modus** voor buitendienst
