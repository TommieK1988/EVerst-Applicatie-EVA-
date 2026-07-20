import { addDays, format, isWeekend, parseISO, startOfDay } from 'date-fns'

import type {
  MedewerkerAfwezigheid, MedewerkerRooster, PlanningItemVerrijkt,
} from '@everts/database/platform-types'

// ─── Conflict-detectie (op echte tijdstippen) ─────────────────────────────────
// Pure logica, gedeeld door de timeline-rij (gloed-overlay) en de
// ConflictOplosDialog (live preview + voorstellen). Geen React.

export const DAG_MS = 86_400_000

export type Interval = { s: number; e: number } // ms-bereik [start, eind)

export type EntryMetDossier = PlanningItemVerrijkt & { dossier_id?: string }

export type WerkInterval = Interval & { entry: EntryMetDossier }
export type BlokInterval = Interval & { label: string }

/** Conflictsegment inclusief de bron: welke planitems overlappen, of welk blok geraakt wordt. */
export type ConflictDetail = Interval & (
  | { soort: 'overlap'; a: EntryMetDossier; b: EntryMetDossier }
  | { soort: 'blok';    a: EntryMetDossier; blokLabel: string }
)

/**
 * Conflictsegmenten op basis van werkelijke tijdstippen, los van de gerenderde
 * balkbreedte: (a) waar twee werk-taken in tijd overlappen, en (b) waar werk binnen
 * een blok-periode valt (verlof/afwezigheid/feestdag/ATV). Elk segment houdt bij
 * wát er conflicteert, zodat de conflict-popup dat kan tonen.
 */
export function berekenConflicten(work: WerkInterval[], blokken: BlokInterval[]): ConflictDetail[] {
  const segs: ConflictDetail[] = []
  const sorted = [...work].sort((a, b) => a.s - b.s)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].s >= sorted[i].e) break
      segs.push({
        s: Math.max(sorted[i].s, sorted[j].s),
        e: Math.min(sorted[i].e, sorted[j].e),
        soort: 'overlap', a: sorted[i].entry, b: sorted[j].entry,
      })
    }
  }
  for (const w of work) {
    for (const b of blokken) {
      const s = Math.max(w.s, b.s)
      const e = Math.min(w.e, b.e)
      if (s < e) segs.push({ s, e, soort: 'blok', a: w.entry, blokLabel: b.label })
    }
  }
  return segs
}

export function afwezigheidInterval(a: MedewerkerAfwezigheid): Interval {
  if (a.start_tijd && a.eind_tijd) {
    return {
      s: new Date(`${a.start_datum}T${a.start_tijd}`).getTime(),
      e: new Date(`${a.eind_datum}T${a.eind_tijd}`).getTime(),
    }
  }
  return { s: parseISO(a.start_datum).getTime(), e: parseISO(a.eind_datum).getTime() + DAG_MS }
}

/** Valt `dag` buiten het actieve rooster van de medewerker? Zonder rooster: weekend. */
export function buitenRooster(dag: Date, roosters: MedewerkerRooster[]): boolean {
  // Lokale datum — dag.toISOString() zou vóór 01:00/02:00 NL de vórige dag geven (UTC).
  const iso    = format(dag, 'yyyy-MM-dd')
  const dagNum = dag.getDay() === 0 ? 7 : dag.getDay()
  const actief = roosters.find(r => {
    const tot = r.geldig_tot ?? '9999-12-31'
    return iso >= r.geldig_vanaf && iso <= tot
  })
  if (!actief) return isWeekend(dag)
  return !(actief.werkdagen ?? []).includes(dagNum)
}

/**
 * Alle planitems die samen één conflictknoop vormen: transitieve sluiting over de
 * overlap-conflicten, gezaaid met het aangeklikte segment. `berekenConflicten`
 * paart per twee — bij drie (of meer) overlappende items levert dit tóch de hele
 * groep op. Bij soort 'blok' is de cluster meestal alleen `a`.
 */
export function clusterVoorConflict(
  conflict: ConflictDetail,
  alleConflicten: ConflictDetail[],
): EntryMetDossier[] {
  const perId = new Map<string, EntryMetDossier>()
  const inCluster = new Set<string>()
  const zaai = (e: EntryMetDossier) => { perId.set(e.id, e); inCluster.add(e.id) }
  zaai(conflict.a)
  if (conflict.soort === 'overlap') zaai(conflict.b)

  let gegroeid = true
  while (gegroeid) {
    gegroeid = false
    for (const c of alleConflicten) {
      if (c.soort !== 'overlap') continue
      const aIn = inCluster.has(c.a.id)
      const bIn = inCluster.has(c.b.id)
      if (aIn === bIn) continue // beide al binnen, of beide buiten
      zaai(c.a); zaai(c.b)
      gegroeid = true
    }
  }
  return [...perId.values()].sort(
    (a, b) => parseISO(a.start_dt).getTime() - parseISO(b.start_dt).getTime(),
  )
}

/**
 * Zoek het eerstvolgende écht vrije moment voor een taak van `duurMs`:
 * geen overlap met ander werk of blokken (verlof/feestdag/ATV), en de startdag
 * valt binnen het rooster. Alleen de startdag wordt tegen het rooster getoetst —
 * dezelfde definitie als `berekenConflicten`, waar een meerdaagse taak over een
 * weekend heen géén conflict is. Kandidaat 1 is exact `vanafMs` (bijv. direct ná
 * het eind van een ander blok); daarna per dag doorschuiven met behoud van het
 * tijdstip-van-de-dag uit `tijdVanDagVan`. Meerdaagse taken schuiven als één
 * geheel. Geeft `null` als er binnen `maxDagen` niets vrij is.
 */
export function vindVrijMoment(opts: {
  duurMs:       number
  vanafMs:      number
  tijdVanDagVan: Date
  andereWerk:   Interval[]
  blokken:      Interval[]
  roosters:     MedewerkerRooster[]
  maxDagen?:    number
}): { start: Date; eind: Date } | null {
  const { duurMs, vanafMs, tijdVanDagVan, andereWerk, blokken, roosters, maxDagen = 120 } = opts
  if (duurMs <= 0) return null

  const past = (startMs: number): boolean => {
    const eindMs = startMs + duurMs
    for (const w of andereWerk) if (startMs < w.e && eindMs > w.s) return false
    for (const b of blokken)    if (startMs < b.e && eindMs > b.s) return false
    return !buitenRooster(startOfDay(new Date(startMs)), roosters)
  }

  if (past(vanafMs)) {
    return { start: new Date(vanafMs), eind: new Date(vanafMs + duurMs) }
  }

  const uur = tijdVanDagVan.getHours()
  const min = tijdVanDagVan.getMinutes()
  for (let n = 1; n <= maxDagen; n++) {
    const kandidaat = addDays(startOfDay(new Date(vanafMs)), n)
    kandidaat.setHours(uur, min, 0, 0)
    if (past(kandidaat.getTime())) {
      return { start: kandidaat, eind: new Date(kandidaat.getTime() + duurMs) }
    }
  }
  return null
}
