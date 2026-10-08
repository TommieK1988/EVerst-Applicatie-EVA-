/**
 * Werken die flink verschoven zijn tussen twee standen: live t.o.v. de laatst vastgestelde
 * maand (dashboard), of een vastgestelde maand t.o.v. de maand ervóór (historie).
 *
 * Hoofdcriterium is de **% marge**. Een werk waar alleen meerwerk bij kwam (opdracht omhoog,
 * marge gelijk) hoort níet tussen de margebewegers — dat zou de lijst vullen met werken waar
 * niets mis is. Die komen in een aparte groep.
 *
 * Puur rekenwerk, geen React: draait zowel in de server-pagina als in de client.
 */

import { isDashboardStatus } from './aggregaties'

/** Het deel van een werk dat de vergelijking nodig heeft — gedeeld door live en snapshot. */
export type WerkCijfers = {
  projectnummer: string
  bouw7_id: string | null
  filiaal: string | null
  status: string | null
  opdrachtgever: string | null
  projectnaam: string | null
  projectleider: string | null
  totale_opdracht: number | null
  verwacht_resultaat: number | null
  pct_marge: number | null
  pct_gereed: number | null
  dossier_id: string | null
  dossier_sectie: string | null
}

export type WerkWijziging = {
  /** De nieuwe stand (voor naam, PL, kleur en dossierlink). */
  werk: WerkCijfers
  margeOud: number
  margeNieuw: number
  /** Procentpunten. */
  deltaMarge: number
  deltaOpdracht: number
  deltaResultaat: number
  deltaGereed: number | null
}

export type Wijzigingen = {
  gedaald: WerkWijziging[]
  gestegen: WerkWijziging[]
  /** Opdracht flink veranderd (meestal meerwerk), marge nagenoeg gelijk. */
  opdrachtGewijzigd: WerkWijziging[]
}

/** Kleine werken slingeren hard (€1.195 van 100% naar 20% marge); die laten we weg. */
export const MIN_OPDRACHT = 5_000
/** Vanaf dit verschil in procentpunten telt een werk als margebeweger. */
export const DREMPEL_MARGE_PP = 2
/** …of vanaf dit verschil in verwacht resultaat, ook als de marge procentueel weinig beweegt. */
export const DREMPEL_RESULTAAT = 5_000
/** Opdrachtwijziging (meerwerk/minderwerk) die het melden waard is. */
export const DREMPEL_OPDRACHT = 10_000

function sleutel(w: WerkCijfers): string {
  return w.bouw7_id ? `b:${w.bouw7_id}` : `p:${w.projectnummer}`
}

const n = (v: number | null | undefined) => v ?? 0

export function berekenWijzigingen(huidig: WerkCijfers[], vorig: WerkCijfers[]): Wijzigingen {
  const vorigeMap = new Map<string, WerkCijfers>()
  for (const v of vorig) vorigeMap.set(sleutel(v), v)

  const gedaald: WerkWijziging[] = []
  const gestegen: WerkWijziging[] = []
  const opdrachtGewijzigd: WerkWijziging[] = []

  for (const w of huidig) {
    if (!isDashboardStatus(w.status)) continue
    if (n(w.totale_opdracht) < MIN_OPDRACHT) continue
    const v = vorigeMap.get(sleutel(w))
    // Nieuwe werken (nog niet vastgesteld) of zonder marge in een van beide standen: geen
    // verschuiving te meten. Een vorige marge van null betekent "nog geen begroting".
    if (!v || w.pct_marge == null || v.pct_marge == null) continue

    const wijziging: WerkWijziging = {
      werk: w,
      margeOud: v.pct_marge,
      margeNieuw: w.pct_marge,
      deltaMarge: w.pct_marge - v.pct_marge,
      deltaOpdracht: n(w.totale_opdracht) - n(v.totale_opdracht),
      deltaResultaat: n(w.verwacht_resultaat) - n(v.verwacht_resultaat),
      deltaGereed: w.pct_gereed != null && v.pct_gereed != null ? w.pct_gereed - v.pct_gereed : null,
    }

    const margeBeweegt = Math.abs(wijziging.deltaMarge) >= DREMPEL_MARGE_PP
    const resultaatBeweegt = Math.abs(wijziging.deltaResultaat) >= DREMPEL_RESULTAAT

    if (margeBeweegt || (resultaatBeweegt && !opdrachtVerklaartResultaat(wijziging))) {
      // Richting volgt de marge; bij een (bijna) gelijke marge het resultaat.
      const richting = wijziging.deltaMarge !== 0 ? wijziging.deltaMarge : wijziging.deltaResultaat
      ;(richting < 0 ? gedaald : gestegen).push(wijziging)
    } else if (Math.abs(wijziging.deltaOpdracht) >= DREMPEL_OPDRACHT) {
      opdrachtGewijzigd.push(wijziging)
    }
  }

  gedaald.sort((a, b) => a.deltaMarge - b.deltaMarge || a.deltaResultaat - b.deltaResultaat)
  gestegen.sort((a, b) => b.deltaMarge - a.deltaMarge || b.deltaResultaat - a.deltaResultaat)
  opdrachtGewijzigd.sort((a, b) => Math.abs(b.deltaOpdracht) - Math.abs(a.deltaOpdracht))

  return { gedaald, gestegen, opdrachtGewijzigd }
}

/**
 * Meerwerk tegen dezelfde marge levert vanzelf meer resultaat op (€48k meerwerk op 50% marge =
 * €24k extra resultaat). Dat is geen margebeweging: als de marge stabiel is en het
 * resultaatverschil grofweg uit de opdrachtwijziging komt, hoort het werk bij "opdracht gewijzigd".
 */
function opdrachtVerklaartResultaat(w: WerkWijziging): boolean {
  if (w.deltaOpdracht === 0) return false
  const verwacht = w.deltaOpdracht * (w.margeNieuw / 100)
  return Math.abs(w.deltaResultaat - verwacht) < DREMPEL_RESULTAAT
}

/** Procentpunten met teken: "+3.2 pp" (zelfde notatie als fPct). */
export function fPp(v: number | null): string {
  if (v == null) return '—'
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} pp`
}

export function deltaKleur(v: number | null): string {
  if (v == null || Math.abs(v) < 0.05) return 'text-neutral-400'
  return v < 0 ? 'text-error-500 font-semibold' : 'text-success-700 font-semibold'
}
