// Van prikkloksessies naar urenregels. Puur rekenwerk, geen database: zo is het los te testen en
// straks één-op-één naar de weekstaat te schrijven (de uitvoer heeft de vorm van `RegelInvoer`).
//
// De regel in gewone taal:
//   1. Tel per dag de minuten per blok (dossier + bewakingscode + uursoort).
//   2. Pauze: ben je die dag `pauze_vanaf_min` of langer ingeklokt, dan gaat er één keer
//      `pauze_min` af — van het grootste blok, want daar viel de pauze vrijwel zeker. Net onder de
//      drempel loopt de aftrek geleidelijk op (zie `pauzeVoor`), anders zou 5u29 geklokt 5,5 uur
//      opleveren en 5u30 maar 5 uur: langer blijven mag nooit minder uren geven.
//   3. Rond elk blok af op `afronding_min` (dichtstbijzijnde kwartier).
//
// Er wordt niets verzonnen: een sessie zonder uitkloktijd telt 0 minuten en krijgt de markering
// `nog_open`. De medewerker vult zelf zijn vertrektijd in (zie §5 van het plan).

import type { PrikklokInstellingen, PrikklokSessie } from './types'
import { minutenTussen } from './tijd'

export type Markering = 'handmatig_uitgeklokt' | 'nog_open' | 'geen_bewakingscode' | 'gesimuleerd'

export type PrikklokRegel = {
  datum: string
  dossier_id: string
  dossier_label: string
  bewakingscode: string | null
  bouw7_psl_id: number | null
  uursoort_id: string | null
  /** Geklokte minuten, vóór pauze en afronding. */
  brutoMinuten: number
  /** Afgetrokken pauze (0 als de pauze bij een ander blok hoort). */
  pauzeMinuten: number
  /** Uren na pauze en afronding: dit is wat in de weekstaat zou komen. */
  uren: number
  markeringen: Markering[]
  sessieIds: string[]
}

export type PrikklokDag = {
  datum: string
  brutoMinuten: number
  pauzeMinuten: number
  uren: number
  regels: PrikklokRegel[]
}

type Regels = Pick<PrikklokInstellingen, 'afronding_min' | 'pauze_min' | 'pauze_vanaf_min'>

export function rondAf(minuten: number, stap: number): number {
  if (stap <= 1) return minuten
  return Math.round(minuten / stap) * stap
}

/**
 * Af te trekken pauze bij `bruto` minuten aanwezigheid. Vanaf de drempel de volle pauze; in de
 * `pauze_min` ervóór loopt hij minuut voor minuut op. Het netto-resultaat stijgt daardoor nooit
 * terug: tussen 5u00 en 5u30 aanwezig blijft het 5 uur, daarna groeit het weer mee.
 */
export function pauzeVoor(bruto: number, regels: Regels): number {
  if (regels.pauze_min <= 0) return 0
  const aanloop = regels.pauze_vanaf_min - regels.pauze_min
  return Math.max(0, Math.min(regels.pauze_min, bruto - aanloop))
}

export function berekenDagen(sessies: PrikklokSessie[], regels: Regels): PrikklokDag[] {
  const perDag = new Map<string, Map<string, PrikklokRegel>>()

  const gesorteerd = [...sessies].sort((a, b) => a.in_op.localeCompare(b.in_op))
  for (const s of gesorteerd) {
    const sleutel = [s.dossier_id, s.bewakingscode ?? '', s.uursoort_id ?? ''].join('|')
    let dag = perDag.get(s.datum)
    if (!dag) perDag.set(s.datum, (dag = new Map()))
    let regel = dag.get(sleutel)
    if (!regel) {
      regel = {
        datum: s.datum,
        dossier_id: s.dossier_id,
        dossier_label: s.dossier_label,
        bewakingscode: s.bewakingscode,
        bouw7_psl_id: s.bouw7_psl_id,
        uursoort_id: s.uursoort_id,
        brutoMinuten: 0,
        pauzeMinuten: 0,
        uren: 0,
        markeringen: [],
        sessieIds: [],
      }
      dag.set(sleutel, regel)
    }
    regel.sessieIds.push(s.id)
    const markeer = (m: Markering) => { if (!regel!.markeringen.includes(m)) regel!.markeringen.push(m) }
    if (s.uit_op) regel.brutoMinuten += minutenTussen(s.in_op, s.uit_op)
    else markeer('nog_open')
    if (s.uit_wijze === 'handmatig') markeer('handmatig_uitgeklokt')
    if (!s.bewakingscode) markeer('geen_bewakingscode')
    if (s.gesimuleerd) markeer('gesimuleerd')
  }

  const dagen: PrikklokDag[] = []
  for (const [datum, blokken] of perDag) {
    const lijst = [...blokken.values()]
    const bruto = lijst.reduce((t, r) => t + r.brutoMinuten, 0)

    const pauze = pauzeVoor(bruto, regels)
    if (pauze > 0 && lijst.length) {
      const grootste = lijst.reduce((a, b) => (b.brutoMinuten > a.brutoMinuten ? b : a))
      grootste.pauzeMinuten = Math.min(pauze, grootste.brutoMinuten)
    }
    for (const r of lijst) {
      r.uren = rondAf(r.brutoMinuten - r.pauzeMinuten, regels.afronding_min) / 60
    }

    dagen.push({
      datum,
      brutoMinuten: bruto,
      pauzeMinuten: lijst.reduce((t, r) => t + r.pauzeMinuten, 0),
      uren: lijst.reduce((t, r) => t + r.uren, 0),
      regels: lijst,
    })
  }
  return dagen.sort((a, b) => a.datum.localeCompare(b.datum))
}
