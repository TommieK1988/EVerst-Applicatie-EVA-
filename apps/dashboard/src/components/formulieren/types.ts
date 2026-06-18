// ── Veldtypen ────────────────────────────────────────────────────────

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
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
  | 'repeatable'
  | 'heading'
  | 'paragraph'
  | 'divider'

export interface FieldOption {
  label: string
  value: string
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
  conditions?: FieldCondition[]
  validation?: FieldValidation
}

// ── Weergave-only veldtypen ──────────────────────────────────────────
// Kop, tekstblok en scheidingslijn zijn puur opmaak: ze renderen geen
// invoer en mogen dus nooit als "verplichte vraag" worden behandeld.

export const DISPLAY_ONLY_FIELD_TYPES: FormFieldType[] = ['heading', 'paragraph', 'divider']

export function isInvoerVeld(field: { type: FormFieldType }): boolean {
  return !DISPLAY_ONLY_FIELD_TYPES.includes(field.type)
}

// ── Schema (opgeslagen als JSONB) ────────────────────────────────────

export interface FormSchema {
  version: 1
  fields: FormField[]
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
  repeatable:  'Herhalende sectie',
  heading:     'Kop (vaste titel)',
  paragraph:   'Tekst­blok',
  divider:     'Scheidingslijn',
}

export const FIELD_TYPE_GROUPS: { label: string; types: FormFieldType[] }[] = [
  {
    label: 'Invoer',
    types: ['text', 'textarea', 'number', 'date', 'time'],
  },
  {
    label: 'Keuze',
    types: ['dropdown', 'radio', 'checkbox', 'boolean'],
  },
  {
    label: 'Media & Locatie',
    types: ['photo', 'signature', 'location', 'barcode', 'file'],
  },
  {
    label: 'Opmaak & Structuur',
    types: ['heading', 'paragraph', 'divider'],
  },
  {
    label: 'Sectie',
    types: ['repeatable'],
  },
]

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

  if (type === 'repeatable') {
    base.children = []
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
