import type { Meetregel, MeetregelAggregaat } from './types'
import {
  getMeetregels, getMeetregelAggregaten,
  slaMeetregelAggregaatOp, verwijderMeetregelAggregaat,
} from './local-store'
import { nieuweId } from './utils'
import { normaliseerBestekcode } from './bestekcode'
import { rekenMaat } from './maat-rekenen'

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
 * De rekenregel zelf staat in `rekenMaat` (maat-rekenen.ts), die de mini-meetstaat
 * in de calculatie ook gebruikt. Een m²-regel met maar één maat levert 0 op.
 */
export function berekenHoeveelheid(r: Meetregel): number {
  if (r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null) {
    return r.hoeveelheid_override
  }
  return rekenMaat(r)
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

// ─── BESTEKSCODE ─────────────────────────────────────────────────────────────

export { normaliseerBestekcode } from './bestekcode'

// ─── AGGREGATIE SLEUTEL ───────────────────────────────────────────────────────

/**
 * groep::onderdeel::type::bestekscode::behandeling.
 *
 * De behandeling kies je sinds de bestekscode niet meer in de meetstaat maar in de
 * calculatie, dus bij nieuwe regels is dat deel leeg. Hij blijft in de sleutel
 * voor oude meetstaten: zo houden hun aggregaten dezelfde sleutel en daarmee de
 * koppeling naar hun calculatieregel. Anders levert een her-sync dubbele regels op.
 */
export function aggregaatSleutel(r: Meetregel): string | null {
  if (!isRegelActief(r)) return null
  const o = (r.onderdeel ?? '').toLowerCase().trim()
  const t = (r.type ?? '').toLowerCase().trim()
  const c = normaliseerBestekcode(r.bestekcode)
  const b = (r.behandeling ?? '').toLowerCase().trim()
  return `${r.groep_id}::${o}::${t}::${c}::${b}`
}

// ─── CALCULATIEREGEL OMSCHRIJVING ─────────────────────────────────────────────

/** 'Kozijnen hout - 10-20cm [S-01] : OHD 03'. Code en behandeling vallen weg als ze leeg zijn. */
export function calculatieregelOmschrijving(
  onderdeel: string, type: string, behandeling: string, bestekcode?: string
): string {
  const typeStr = type.trim() ? ` - ${type.trim()}` : ''
  const code = normaliseerBestekcode(bestekcode)
  const codeStr = code ? ` [${code}]` : ''
  const behStr = behandeling.trim() ? ` : ${behandeling.trim()}` : ''
  return `${onderdeel.trim()}${typeStr}${codeStr}${behStr}`
}

// ─── HERBEREKENING AGGREGAAT ──────────────────────────────────────────────────

export function herberekeningAggregaat(meetstaatId: string, sleutel: string): void {
  const [groep_id, onderdeel, type, bestekcode, behandeling] = sleutel.split('::')

  // Haal alle actieve regels op met deze sleutel
  const regels = getMeetregels(meetstaatId).filter(r => {
    if (r.is_leeg || !isRegelActief(r)) return false
    const o = (r.onderdeel ?? '').toLowerCase().trim()
    const t = (r.type ?? '').toLowerCase().trim()
    const b = (r.behandeling ?? '').toLowerCase().trim()
    return r.groep_id === groep_id && o === onderdeel && t === type
      && normaliseerBestekcode(r.bestekcode) === bestekcode && b === behandeling
  })

  const totaal = regels.reduce((s, r) => s + berekenHoeveelheid(r), 0)

  // Zoek bestaand aggregaat
  const bestaand = getMeetregelAggregaten(meetstaatId).find(a => {
    return (
      a.groep_id === groep_id &&
      a.onderdeel.toLowerCase().trim() === onderdeel &&
      a.type.toLowerCase().trim() === type &&
      normaliseerBestekcode(a.bestekcode) === bestekcode &&
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
      bestekcode,
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
