// ── Veldtypen ────────────────────────────────────────────────────────

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'rating'
  | 'date'
  | 'time'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'boolean'
  | 'photo'
  | 'signature'
  | 'location'
  | 'barcode'
  | 'file'
  | 'medewerker'
  | 'dossier'
  | 'repeatable'
  | 'aandachtspunt'
  | 'heading'
  | 'paragraph'
  | 'callout'
  | 'divider'
  | 'image'
  | 'pagebreak'

export interface FieldOption {
  label: string
  value: string
}

// ── Opmaak (kleur/uitlijning/nadruk) voor weergave-velden ────────────

export type CalloutVariant = 'info' | 'let_op' | 'waarschuwing' | 'succes'

export interface VeldOpmaak {
  niveau?: 'groot' | 'middel' | 'klein'      // heading
  kleur?: string                              // tekstkleur (hex)
  uitlijning?: 'links' | 'midden' | 'rechts'
  vet?: boolean
  cursief?: boolean
  variant?: CalloutVariant                    // callout
}

// ── Aandachtspunten ──────────────────────────────────────────────────────────

/**
 * Eén door de invuller gemeld aandachtspunt. Wordt na indienen gematerialiseerd als opleverpunt
 * (status "nieuw") op het dossier, waar de projectleider het beoordeelt.
 *
 * `fotos` bevat publieke storage-URL's — **nooit** data-URL's: foto's gaan bij het kiezen al naar
 * de opslag, zodat ze niet als base64 in de inzending belanden.
 */
export type AandachtspuntWaarde = {
  omschrijving: string
  ruimte?: string | null
  fotos?: string[]
}

/** Instellingen van een aandachtspunt-veld; de invuller ziet hiervan alleen het effect. */
export interface AandachtspuntConfig {
  /** `oplever` komt op de opleverlijst; `veiligheid` is voorbereid voor VCA maar nog niet in gebruik. */
  soort?: 'oplever' | 'veiligheid'
  toonRuimte?: boolean
  toonFotos?: boolean
  maxFotosPerPunt?: number
  toevoegLabel?: string
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty'

export interface FieldCondition {
  fieldId: string
  operator: ConditionOperator
  value?: string
  action: 'show' | 'hide'
}

export interface FieldValidation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  patternMessage?: string
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  name: string                // snake_case interne naam
  required: boolean
  readOnly: boolean
  rememberLastValue: boolean
  placeholder?: string
  helpText?: string
  defaultValue?: unknown
  options?: FieldOption[]     // dropdown | radio | checkbox
  children?: FormField[]      // repeatable section
  dossierVariabele?: string   // dossier: welke variabele uit het gekoppelde dossier
  conditions?: FieldCondition[]
  validation?: FieldValidation
  ratingStijl?: 'cijfers' | 'sterren'  // rating: weergave als cijfers of sterren
  opmaak?: VeldOpmaak                   // heading | paragraph | callout | image
  afbeeldingUrl?: string                // image: geüploade afbeelding (public URL)
  afbeeldingBreedte?: number            // image: weergavebreedte in px
  aandachtspunt?: AandachtspuntConfig   // aandachtspunt: soort + welke subvelden zichtbaar zijn
}

// ── Weergave-only veldtypen ──────────────────────────────────────────
// Kop, tekstblok en scheidingslijn zijn puur opmaak: ze renderen geen
// invoer en mogen dus nooit als "verplichte vraag" worden behandeld.

export const DISPLAY_ONLY_FIELD_TYPES: FormFieldType[] = ['heading', 'paragraph', 'callout', 'divider', 'image', 'pagebreak']

export function isInvoerVeld(field: { type: FormFieldType }): boolean {
  return !DISPLAY_ONLY_FIELD_TYPES.includes(field.type)
}

// ── Schema (opgeslagen als JSONB) ────────────────────────────────────

/** PDF-instellingen per sjabloon; overschrijven de globale formulier_pdf_config. */
export interface FormPdfConfig {
  briefpapierUrl?: string | null
  toonLogo?: boolean
  toonInvuller?: boolean
  toonProjectRef?: boolean
  koptekst?: string | null
  voettekst?: string | null
}

export interface FormInstellingen {
  accentkleur?: string
  pdf?: FormPdfConfig
}

export interface FormSchema {
  version: 1
  fields: FormField[]
  instellingen?: FormInstellingen
}

/**
 * Normaliseer een schema vóór opslaan: weergave-only velden (kop/tekstblok/
 * scheidingslijn) mogen nooit `required` zijn, anders blokkeren ze het indienen.
 * Werkt ook recursief op herhalende secties (`children`).
 */
export function normalizeSchemaRequired(schema: FormSchema): FormSchema {
  const fix = (fields: FormField[]): FormField[] =>
    fields.map(f => ({
      ...f,
      required: isInvoerVeld(f) ? f.required : false,
      ...(f.children ? { children: fix(f.children) } : {}),
    }))
  return { ...schema, fields: fix(schema.fields ?? []) }
}

// ── DB-entiteiten ─────────────────────────────────────────────────────

export type FormTemplateStatus = 'concept' | 'gepubliceerd' | 'gearchiveerd'

export interface FormTemplate {
  id: string
  naam: string
  omschrijving: string | null
  categorie: string | null
  status: FormTemplateStatus
  huidige_versie: number
  aangemaakt_door: string | null
  aangemaakt_op: string
  bijgewerkt_op: string
}

export interface FormVersie {
  id: string
  template_id: string
  versienummer: number
  schema: FormSchema
  wijzigingsnota: string | null
  aangemaakt_door: string | null
  aangemaakt_op: string
}

export type FormInzendingStatus = 'concept' | 'ingediend' | 'goedgekeurd' | 'afgekeurd'

export interface FormInzending {
  id: string
  template_id: string
  versie_id: string
  status: FormInzendingStatus
  waarden: Record<string, unknown>
  submission_uuid: string | null
  dossier_id: string | null
  task_id: string | null
  project_ref: string | null
  ingediend_op: string | null
  ingediend_door: string | null
  aangemaakt_door: string | null
  aangemaakt_op: string
  bijgewerkt_op: string
  // Joined
  template?: FormTemplate
  versie?: FormVersie
  ingediend_door_naam?: string
}

export type FormTaakStatus = 'open' | 'bezig' | 'ingediend' | 'afgekeurd' | 'afgerond'

export interface FormTaak {
  id: string
  template_id: string
  inzending_id: string | null
  toegewezen_aan: string | null
  deadline: string | null
  status: FormTaakStatus
  opmerkingen: string | null
  vooringevuld: Record<string, unknown>
  dossier_id: string | null
  aangemaakt_door: string | null
  aangemaakt_op: string
  bijgewerkt_op: string
  // Joined
  template?: FormTemplate
  inzending?: FormInzending
  toegewezen_aan_naam?: string
}

// ── Helpers ──────────────────────────────────────────────────────────

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text:        'Tekst',
  textarea:    'Lange tekst',
  number:      'Getal',
  rating:      'Cijfer / rating',
  date:        'Datum',
  time:        'Tijd',
  dropdown:    'Dropdown',
  radio:       'Meerkeuze (radio)',
  checkbox:    'Checkboxen',
  boolean:     'Ja / Nee',
  photo:       'Foto upload',
  signature:   'Handtekening',
  location:    'Locatie / GPS',
  barcode:     'Barcode / QR',
  file:        'Bestand upload',
  medewerker:  'Medewerker(s)',
  dossier:     'Dossier-gegeven',
  repeatable:  'Herhalende sectie',
  aandachtspunt: 'Aandachtspunt(en)',
  heading:     'Kop (vaste titel)',
  paragraph:   'Tekst­blok',
  callout:     'Aandacht-blok',
  divider:     'Scheidingslijn',
  image:       'Afbeelding / Logo',
  pagebreak:   'Pagina-einde',
}

export const FIELD_TYPE_GROUPS: { label: string; types: FormFieldType[] }[] = [
  {
    label: 'Invoer',
    types: ['text', 'textarea', 'number', 'date', 'time'],
  },
  {
    label: 'Keuze',
    types: ['dropdown', 'radio', 'checkbox', 'boolean', 'rating'],
  },
  {
    label: 'Media & Locatie',
    types: ['photo', 'signature', 'location', 'barcode', 'file'],
  },
  {
    label: 'Koppeling',
    types: ['dossier', 'medewerker'],
  },
  {
    label: 'Opmaak & Structuur',
    types: ['heading', 'paragraph', 'callout', 'divider', 'image', 'pagebreak'],
  },
  {
    label: 'Aandachtspunten',
    types: ['aandachtspunt'],
  },
  {
    label: 'Sectie',
    types: ['repeatable'],
  },
]

/** Standaard-accentkleur wanneer een sjabloon er geen kiest (huidig thema). */
export const STANDAARD_ACCENT = 'hsl(var(--primary))'

/** De door het sjabloon gekozen accentkleur, of de thema-standaard. */
export function resolveAccent(schema: FormSchema | undefined | null): string {
  return schema?.instellingen?.accentkleur || STANDAARD_ACCENT
}

/** Kleur/achtergrond/rand + label per aandacht-blok-variant. Gedeeld door builder, filler en PDF. */
export const CALLOUT_VARIANTEN: Record<CalloutVariant, {
  label: string
  tekst: string       // tekstkleur (hex)
  rand: string        // randkleur (hex)
  achtergrond: string // achtergrondkleur (hex)
  pdfTekst: [number, number, number]
  pdfAchtergrond: [number, number, number]
}> = {
  info:         { label: 'Info',         tekst: '#1e40af', rand: '#93c5fd', achtergrond: '#eff6ff', pdfTekst: [30, 64, 175],  pdfAchtergrond: [239, 246, 255] },
  let_op:       { label: 'Let op',       tekst: '#854d0e', rand: '#fde047', achtergrond: '#fefce8', pdfTekst: [133, 77, 14],  pdfAchtergrond: [254, 252, 232] },
  waarschuwing: { label: 'Waarschuwing', tekst: '#991b1b', rand: '#fca5a5', achtergrond: '#fef2f2', pdfTekst: [153, 27, 27],  pdfAchtergrond: [254, 242, 242] },
  succes:       { label: 'Succes',       tekst: '#166534', rand: '#86efac', achtergrond: '#f0fdf4', pdfTekst: [22, 101, 52],  pdfAchtergrond: [240, 253, 244] },
}

export const TEMPLATE_CATEGORIE_LABELS: Record<string, string> = {
  werkbon:    'Werkbon',
  inspectie:  'Inspectie',
  oplevering: 'Oplevering',
  checklist:  'Checklist',
  overig:     'Overig',
}

export const INZENDING_STATUS_LABELS: Record<FormInzendingStatus, string> = {
  concept:     'Concept',
  ingediend:   'Ingediend',
  goedgekeurd: 'Goedgekeurd',
  afgekeurd:   'Afgekeurd',
}

export const TAAK_STATUS_LABELS: Record<FormTaakStatus, string> = {
  open:       'Open',
  bezig:      'Bezig',
  ingediend:  'Ingediend',
  afgekeurd:  'Afgekeurd',
  afgerond:   'Afgerond',
}

export function defaultSchema(): FormSchema {
  return { version: 1, fields: [] }
}

export function generateFieldId(): string {
  return 'f_' + Math.random().toString(36).slice(2, 9)
}

export function labelToName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'veld'
}

export function defaultField(type: FormFieldType, existingNames: string[]): FormField {
  const label = FIELD_TYPE_LABELS[type]
  let baseName = labelToName(label)
  let name = baseName
  let counter = 2
  while (existingNames.includes(name)) {
    name = `${baseName}_${counter++}`
  }

  const base: FormField = {
    id: generateFieldId(),
    type,
    label,
    name,
    required: false,
    readOnly: false,
    rememberLastValue: false,
  }

  if (type === 'dropdown' || type === 'radio' || type === 'checkbox') {
    base.options = [
      { label: 'Optie 1', value: 'optie_1' },
      { label: 'Optie 2', value: 'optie_2' },
    ]
  }

  if (type === 'boolean') {
    base.defaultValue = null
  }

  if (type === 'rating') {
    // Cijfer 1–10; de bouwer kan het bereik via validatie (min/max) aanpassen.
    base.validation = { min: 1, max: 10 }
    base.ratingStijl = 'cijfers'
  }

  if (type === 'callout') {
    base.label = 'Let op: vul dit zorgvuldig in.'
    base.opmaak = { variant: 'info' }
  }

  if (type === 'image') {
    base.label = 'Afbeelding'
    base.afbeeldingBreedte = 200
    base.opmaak = { uitlijning: 'links' }
  }

  if (type === 'repeatable') {
    base.children = []
  }

  if (type === 'aandachtspunt') {
    base.label = 'Aandachtspunten'
    base.helpText = 'Meld hier wat er nog niet in orde is. Elk punt komt bij de projectleider terecht.'
    base.defaultValue = []
    base.aandachtspunt = { soort: 'oplever', toonRuimte: true, toonFotos: true, maxFotosPerPunt: 3 }
  }

  if (type === 'dossier') {
    // Dossier-gegevens worden automatisch uit het gekoppelde dossier gevuld en
    // zijn altijd alleen-lezen. De concrete variabele kiest de bouwer in de instellingen.
    base.readOnly = true
    base.dossierVariabele = 'dossiernummer'
  }

  return base
}

/**
 * Normaliseer een waarde naar string-representatie voor vergelijking.
 * Booleans → 'true'/'false', arrays → blijven array, rest → String().
 */
function normaliseerWaarde(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.map(x => String(x)).join('||')
  return String(v)
}

/** Is een veldwaarde leeg? */
function isLeeg(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

/**
 * Telt dit veld als onbeantwoord? Gedeeld door elke plek die `required` afdwingt, zodat de
 * invulweergave en het bewonersportaal het niet elk anders doen.
 *
 * Voor de meeste typen is dat "geen waarde", maar een aandachtspunt-veld met alleen lege rijen is
 * óók leeg — anders voldoet een invuller aan een verplichte vraag door op "toevoegen" te klikken.
 */
export function isVeldLeeg(field: { type: FormFieldType }, value: unknown): boolean {
  if (field.type === 'aandachtspunt') {
    if (!Array.isArray(value)) return true
    return (value as AandachtspuntWaarde[])
      .filter(p => typeof p?.omschrijving === 'string' && p.omschrijving.trim() !== '').length === 0
  }
  return isLeeg(value)
}

/** Bepaal of één conditie matcht. */
export function conditionMatches(
  cond: FieldCondition,
  values: Record<string, unknown>
): boolean {
  const raw  = values[cond.fieldId]
  const verg = (cond.value ?? '').toString().toLowerCase()

  switch (cond.operator) {
    case 'is_empty':     return isLeeg(raw)
    case 'is_not_empty': return !isLeeg(raw)
    case 'equals': {
      if (Array.isArray(raw)) {
        // Checkbox: matcht als de waarde in de selectie zit
        return raw.map(x => String(x).toLowerCase()).includes(verg)
      }
      return normaliseerWaarde(raw).toLowerCase() === verg
    }
    case 'not_equals': {
      if (Array.isArray(raw)) {
        return !raw.map(x => String(x).toLowerCase()).includes(verg)
      }
      return normaliseerWaarde(raw).toLowerCase() !== verg
    }
    case 'contains': {
      if (Array.isArray(raw)) {
        return raw.map(x => String(x).toLowerCase()).includes(verg)
      }
      return normaliseerWaarde(raw).toLowerCase().includes(verg)
    }
  }
  return false
}

/**
 * Bepaal of een veld zichtbaar is op basis van zijn condities.
 *
 * Regels:
 * - Geen condities → altijd zichtbaar.
 * - Show-condities: ALLE moeten matchen (AND) om het veld te tonen.
 * - Hide-condities: ALS er één matcht, wordt het veld verborgen.
 * - Combinatie: hide gaat boven show.
 */
export function evaluateConditions(
  field: FormField,
  _allFields: FormField[],
  values: Record<string, unknown>
): boolean {
  if (!field.conditions || field.conditions.length === 0) return true

  const showConds = field.conditions.filter(c => c.action === 'show')
  const hideConds = field.conditions.filter(c => c.action === 'hide')

  // Hide: één match is genoeg om te verbergen
  if (hideConds.some(c => conditionMatches(c, values))) return false

  // Show: alle show-condities moeten matchen (AND).
  // Als er geen show-condities zijn, is het veld zichtbaar (zolang geen hide-conditie matcht).
  if (showConds.length === 0) return true
  return showConds.every(c => conditionMatches(c, values))
}
