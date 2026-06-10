/**
 * R8 — Parkeer-analyses.
 *
 * Bron: public.ulu_parking. Deze regel draait NIET in de reguliere
 * engine (die loopt over trips), maar wordt apart aangeroepen door de
 * compliance-action met een eigen dataset.
 *
 * Signalen:
 *   - Parkeerkosten > drempel (default €5) per record → info
 *   - Parkeerduur > 4 uur onder werktijd → waarschuwing
 *   - Som parkeerkosten per bestuurder per maand > drempel → info
 */

import type { ComplianceBevindingInput } from '../../types'

export type ParkingRow = {
  id: string
  voertuig_id: string | null
  kenteken: string
  parkeer_starttijd: string
  parkeerlocatie: string | null
  parkeerkosten: number | null
  duur_seconden: number | null
  bestuurder_naam_raw?: string | null
}

export type ParkingConfig = {
  kosten_per_record_info?: number         // default 5
  duur_lang_uur?: number                  // default 10 (langer dan werkdag)
  kosten_totaal_per_maand_info?: number   // default 50
}

export function runParkingRule(
  rows: ParkingRow[],
  config: ParkingConfig = {},
  periode: { start: string; eind: string },
): ComplianceBevindingInput[] {
  const kostenDrempel = config.kosten_per_record_info ?? 5
  const duurLangSec = (config.duur_lang_uur ?? 10) * 3600
  const maandTotaalDrempel = config.kosten_totaal_per_maand_info ?? 50

  const out: ComplianceBevindingInput[] = []

  // Per-record signalen
  for (const p of rows) {
    if ((p.parkeerkosten ?? 0) > kostenDrempel) {
      out.push({
        regel_code: 'R8',
        voertuig_id: p.voertuig_id,
        medewerker_id: null,
        trip_id: null,
        periode_start: p.parkeer_starttijd.slice(0, 10),
        periode_eind: p.parkeer_starttijd.slice(0, 10),
        ernst: 'info',
        omschrijving: `Hoge parkeerkosten €${(p.parkeerkosten ?? 0).toFixed(2)} voor ${p.kenteken}${p.bestuurder_naam_raw ? ' (' + p.bestuurder_naam_raw + ')' : ''} — ${p.parkeerlocatie ?? 'onbekende locatie'}.`,
        data: {
          parking_id: p.id,
          kenteken: p.kenteken,
          bestuurder: p.bestuurder_naam_raw,
          locatie: p.parkeerlocatie,
          kosten: p.parkeerkosten,
          starttijd: p.parkeer_starttijd,
        },
      })
    }
    if ((p.duur_seconden ?? 0) > duurLangSec) {
      const uren = ((p.duur_seconden ?? 0) / 3600).toFixed(1)
      const starttijd = new Date(p.parkeer_starttijd)
      const h = starttijd.getHours()
      const binnenWerktijd = h >= 7 && h < 17 && [1, 2, 3, 4, 5].includes(starttijd.getDay())
      if (binnenWerktijd) {
        out.push({
          regel_code: 'R8',
          voertuig_id: p.voertuig_id,
          medewerker_id: null,
          trip_id: null,
          periode_start: p.parkeer_starttijd.slice(0, 10),
          periode_eind: p.parkeer_starttijd.slice(0, 10),
          ernst: 'waarschuwing',
          omschrijving:
            `Zeer langdurig parkeren ${uren}u op één plek (${p.kenteken}) — ` +
            `${p.parkeerlocatie ?? 'onbekende locatie'}. Langer dan een reguliere werkdag.`,
          data: {
            parking_id: p.id,
            kenteken: p.kenteken,
            bestuurder: p.bestuurder_naam_raw,
            locatie: p.parkeerlocatie,
            duur_uur: uren,
            starttijd: p.parkeer_starttijd,
            uitleg_regel:
              'Parkeren van een werkdag (8-9u) bij een klant is normaal en wordt niet gemeld. ' +
              'Deze waarschuwing vuurt pas bij >10u — dat duidt op overnachting, achterlaten ' +
              'van het voertuig, of buiten werktijd op locatie.',
          },
        })
      }
    }
  }

  // Aggregaat per bestuurder per maand
  const byPersoonMaand = new Map<string, { bestuurder: string; maand: string; totaal: number }>()
  for (const p of rows) {
    if (!p.bestuurder_naam_raw) continue
    const maand = p.parkeer_starttijd.slice(0, 7)
    const key = `${p.bestuurder_naam_raw}|${maand}`
    const g = byPersoonMaand.get(key) ?? {
      bestuurder: p.bestuurder_naam_raw,
      maand,
      totaal: 0,
    }
    g.totaal += p.parkeerkosten ?? 0
    byPersoonMaand.set(key, g)
  }
  for (const g of Array.from(byPersoonMaand.values())) {
    if (g.totaal > maandTotaalDrempel) {
      out.push({
        regel_code: 'R8',
        voertuig_id: null,
        medewerker_id: null,
        trip_id: null,
        periode_start: `${g.maand}-01`,
        periode_eind: `${g.maand}-28`,
        ernst: 'info',
        omschrijving: `${g.bestuurder} had €${g.totaal.toFixed(2)} parkeerkosten in ${g.maand} (> €${maandTotaalDrempel}).`,
        data: {
          bestuurder: g.bestuurder,
          maand: g.maand,
          totaal_kosten: g.totaal,
        },
      })
    }
  }

  return out
}
