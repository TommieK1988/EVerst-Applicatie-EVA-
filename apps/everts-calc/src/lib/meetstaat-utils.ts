import type { Meetregel, MeetregelAggregaat } from './types'
import {
  getMeetregels, getMeetregelAggregaten,
  slaMeetregelAggregaatOp, verwijderMeetregelAggregaat,
} from './local-store'
import { nieuweId } from './utils'
import { evalueerFormule } from './schilder-formule'

// ─── HOEVEELHEID ─────────────────────────────────────────────────────────────

export function berekenHoeveelheid(r: Meetregel): number {
  if (r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null) {
    return r.hoeveelheid_override
  }
  const B = r.breedte ?? 0
  const H = r.hoogte ?? 0
  const L = r.lengte ?? 0
  const N = r.aantal || 1

  // Aangepaste formule (uit schilder_types, bijv. '2*B+2*H')
  if (r.formule?.trim()) return +(evalueerFormule(r.formule, B, H, L) * N).toFixed(4)

  // m³: breedte × hoogte × lengte
  if (r.eenheid === 'm³') return +(B * H * L * N).toFixed(4)

  // m²: breedte × hoogte (standaard gedrag)
  if (B && H) return +(B * H * N).toFixed(4)

  // m¹: lengte
  if (L) return +(L * N).toFixed(4)

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
