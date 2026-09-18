import type { Meetregel, MeetregelAggregaat } from './types'
import {
  getMeetregels, getMeetregelAggregaten,
  slaMeetregelAggregaatOp, verwijderMeetregelAggregaat,
} from './local-store'
import { nieuweId } from './utils'

// ─── HOEVEELHEID ─────────────────────────────────────────────────────────────

/**
 * De hoeveelheid van één meetregel.
 *
 * Bewust géén formule meer uit `schilder_types` (types als 'Omtrek' droegen
 * '2*B+2*H'). De opnemer geeft nu zélf op hoeveel breedtes en hoeveel hoogtes hij
 * meet, en een formule die daar achter zijn rug om nóg eens overheen rekent geeft
 * dubbel werk en een onnavolgbaar getal. `Meetregel.formule` en `Meetregel.lengte`
 * blijven alleen staan voor oude regels; ze tellen niet meer mee.
 *
 *   m¹  = ((breedte × breedte-aantal) + (hoogte × hoogte-aantal)) × factor × aantal
 *   m²  = (breedte × hoogte) × factor × aantal
 *   rest (stuks, post, uur …) = factor × aantal
 */
export function berekenHoeveelheid(r: Meetregel): number {
  if (r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null) {
    return r.hoeveelheid_override
  }
  const B = r.breedte ?? 0
  const H = r.hoogte ?? 0
  // Leeg én 0 tellen als 1 (zoals `aantal` al deed): een lege cel mag een regel
  // nooit stil op nul zetten.
  const N = (r.aantal || 1) * (r.factor || 1)

  // m¹: optellen. Zo geef je een omtrek zelf op — 2 breedtes plus 2 hoogtes.
  if (r.eenheid === 'm¹') {
    return +((B * (r.breedte_aantal || 1) + H * (r.hoogte_aantal || 1)) * N).toFixed(4)
  }

  // m² en al het andere mét maten: oppervlak. De aantallen per maat horen bij m¹
  // en spelen hier geen rol.
  if (B && H) return +(B * H * N).toFixed(4)

  // Zonder maten telt alleen het aantal.
  return N
}

// ─── ACTIEF CHECK ────────────────────────────────────────────────────────────

export function isRegelActief(r: Meetregel): boolean {
  // Behandeling is NIET verplicht — kostprijsopbouw vindt later in de calculatie plaats
  return !!(
    r.groep_id &&
    r.onderdeel?.trim() &&
    berekenHoeveelheid(r) > 0
  )
}

// ─── AGGREGATIE SLEUTEL ───────────────────────────────────────────────────────

export function aggregaatSleutel(r: Meetregel): string | null {
  if (!isRegelActief(r)) return null
  const o = (r.onderdeel ?? '').toLowerCase().trim()
  const t = (r.type ?? '').toLowerCase().trim()
  const b = (r.behandeling ?? '').toLowerCase().trim()
  return `${r.groep_id}::${o}::${t}::${b}`
}

// ─── CALCULATIEREGEL OMSCHRIJVING ─────────────────────────────────────────────

export function calculatieregelOmschrijving(
  onderdeel: string, type: string, behandeling: string
): string {
  const typeStr = type.trim() ? ` - ${type.trim()}` : ''
  return `${onderdeel.trim()}${typeStr} : ${behandeling.trim()}`
}

// ─── HERBEREKENING AGGREGAAT ──────────────────────────────────────────────────

export function herberekeningAggregaat(meetstaatId: string, sleutel: string): void {
  const [groep_id, onderdeel, type, behandeling] = sleutel.split('::')

  // Haal alle actieve regels op met deze sleutel
  const regels = getMeetregels(meetstaatId).filter(r => {
    if (r.is_leeg || !isRegelActief(r)) return false
    const o = (r.onderdeel ?? '').toLowerCase().trim()
    const t = (r.type ?? '').toLowerCase().trim()
    const b = (r.behandeling ?? '').toLowerCase().trim()
    return r.groep_id === groep_id && o === onderdeel && t === type && b === behandeling
  })

  const totaal = regels.reduce((s, r) => s + berekenHoeveelheid(r), 0)

  // Zoek bestaand aggregaat
  const bestaand = getMeetregelAggregaten(meetstaatId).find(a => {
    return (
      a.groep_id === groep_id &&
      a.onderdeel.toLowerCase().trim() === onderdeel &&
      a.type.toLowerCase().trim() === type &&
      a.behandeling.toLowerCase().trim() === behandeling
    )
  })

  if (totaal <= 0) {
    if (bestaand) {
      slaMeetregelAggregaatOp({ ...bestaand, totaal_hoeveelheid: 0, is_gesynchroniseerd: false })
    }
    return
  }

  // Bepaal eenheid en IDs van eerste actieve regel
  const eersteRegel = regels[0]
  const eenheid = eersteRegel?.eenheid ?? 'm²'

  if (bestaand) {
    slaMeetregelAggregaatOp({
      ...bestaand,
      totaal_hoeveelheid: +totaal.toFixed(4),
      eenheid,
      onderdeel_id: eersteRegel?.onderdeel_id,
      type_id: eersteRegel?.type_id,
      behandeling_id: eersteRegel?.behandeling_id,
      is_gesynchroniseerd: false,
    })
  } else {
    slaMeetregelAggregaatOp({
      id: nieuweId(),
      meetstaat_id: meetstaatId,
      groep_id,
      onderdeel: eersteRegel.onderdeel ?? '',
      type: eersteRegel.type ?? '',
      behandeling: eersteRegel.behandeling ?? '',
      onderdeel_id: eersteRegel?.onderdeel_id,
      type_id: eersteRegel?.type_id,
      behandeling_id: eersteRegel?.behandeling_id,
      totaal_hoeveelheid: +totaal.toFixed(4),
      eenheid,
      is_gesynchroniseerd: false,
      aangepast_op: new Date().toISOString(),
    })
  }
}
