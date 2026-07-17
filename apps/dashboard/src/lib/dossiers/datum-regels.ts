/* ─── Procesdatums: types + rekenwerk ────────────────────────────────
   Bewust vrij van server-imports: dit bestand wordt óók door de client
   (InformatieTab) geladen, zodat de dagenteller meteen meebeweegt als je
   in de bewerkmodus een datum aanpast. Het ophalen zit in ./datums.ts. */

export type DossierDatumSleutel =
  | 'aanvraagdatum'
  | 'deadline'
  | 'offertedatum'
  | 'opdrachtdatum'
  | 'startdatum'
  | 'einddatum'
  | 'opleverdatum'
  | 'financieel_gereed'

/** De acht datums als losse ISO-waarden (date of timestamptz), null = onbekend. */
export type DossierDatums = Record<DossierDatumSleutel, string | null>

export type DossierDatumRegel = {
  sleutel: DossierDatumSleutel
  label: string
  /** ISO-waarde, of null als de datum (nog) niet bekend is. */
  waarde: string | null
  /**
   * Kalenderdagen sinds de vorige *gevulde* datum in de procesvolgorde.
   * null bij de eerste gevulde regel en bij lege regels. Kan negatief zijn:
   * een offerte die ná de deadline is verzonden, is betekenisvolle informatie.
   */
  delta: number | null
}

/** Procesvolgorde — bepaalt zowel de weergave als waartegen de delta telt. */
export const DOSSIER_DATUM_VOLGORDE: { sleutel: DossierDatumSleutel; label: string }[] = [
  { sleutel: 'aanvraagdatum',     label: 'Aanvraagdatum' },
  { sleutel: 'deadline',          label: 'Deadline' },
  { sleutel: 'offertedatum',      label: 'Offertedatum' },
  { sleutel: 'opdrachtdatum',     label: 'Opdrachtdatum' },
  { sleutel: 'startdatum',        label: 'Startdatum' },
  { sleutel: 'einddatum',         label: 'Einddatum' },
  { sleutel: 'opleverdatum',      label: 'Opleverdatum' },
  { sleutel: 'financieel_gereed', label: 'Datum financieel gereed' },
]

export const LEGE_DOSSIER_DATUMS: DossierDatums = {
  aanvraagdatum: null, deadline: null, offertedatum: null, opdrachtdatum: null,
  startdatum: null, einddatum: null, opleverdatum: null, financieel_gereed: null,
}

/**
 * ISO-waarde → kalenderdatum in Nederland als 'YYYY-MM-DD'.
 *
 * Nodig omdat de bronnen door elkaar lopen: `aanvraagdatum`/`deadline` en
 * `opgeleverd_op` zijn `date`, maar `verzonden_op`/`opdrachtdatum`/
 * `financieel_gereed_op`/`planning_items.start_dt` zijn `timestamptz`. Een
 * opdracht die 's avonds om 23:00 NL binnenkomt, is in UTC de dag ervoor —
 * zonder deze normalisatie zou de dagenteller er één naast zitten.
 */
export function nlKalenderdatum(iso: string): string | null {
  // Kale 'YYYY-MM-DD' (date-kolom) is al een kalenderdatum; door de Date-parser
  // halen zou hem als UTC-middernacht interpreteren en in NL soms een dag verschuiven.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // en-CA levert exact YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/**
 * Hele kalenderdagen tussen twee ISO-waarden, gerekend in de Nederlandse
 * tijdzone. Bewust géén hergebruik van `dagenTussen` uit lib/dashboard/aggregaties:
 * die rekent in gebroken etmalen voor mediaan-doorlooptijden, terwijl hier
 * "12 dagen" op de kalender moet kloppen, ook over een zomertijdgrens heen.
 */
export function dagenTussenKalender(vanISO: string, totISO: string): number | null {
  const van = nlKalenderdatum(vanISO)
  const tot = nlKalenderdatum(totISO)
  if (!van || !tot) return null
  const [vj, vm, vd] = van.split('-').map(Number)
  const [tj, tm, td] = tot.split('-').map(Number)
  return Math.round((Date.UTC(tj, tm - 1, td) - Date.UTC(vj, vm - 1, vd)) / 86_400_000)
}

/**
 * Zet de datums om in de acht regels in procesvolgorde. Lege datums blijven
 * staan (als streepje in de UI) maar tellen niet mee als ankerpunt: de delta
 * verwijst altijd naar de laatste datum die wél bekend is.
 */
export function bouwDatumRegels(datums: DossierDatums): DossierDatumRegel[] {
  let vorige: string | null = null
  return DOSSIER_DATUM_VOLGORDE.map(({ sleutel, label }) => {
    const waarde = datums[sleutel] ?? null
    const delta  = waarde && vorige ? dagenTussenKalender(vorige, waarde) : null
    if (waarde) vorige = waarde
    return { sleutel, label, waarde, delta }
  })
}

/** '+12 dagen' / '−3 dagen' / 'zelfde dag'. Echte min-tekens (−), geen hyphen. */
export function formatDelta(delta: number | null): string | null {
  if (delta == null) return null
  if (delta === 0) return 'zelfde dag'
  const aantal = Math.abs(delta)
  const eenheid = aantal === 1 ? 'dag' : 'dagen'
  return `${delta > 0 ? '+' : '−'}${aantal} ${eenheid}`
}
