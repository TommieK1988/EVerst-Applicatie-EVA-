import { berekenFeestdagen } from './feestdagen'

function datumStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Datum (yyyy-MM-dd, lokale tijd) van de n-de werkdag na `vanaf`.
 * Werkdagen zijn ma t/m vr, exclusief NL-feestdagen (zelfde berekening
 * als de bedrijfsagenda). Jaargrens wordt opgevangen door ook de
 * feestdagen van het volgende jaar mee te nemen.
 */
export function berekenWerkdagenDrempel(vanaf: Date, aantalWerkdagen: number): string {
  const jaar = vanaf.getFullYear()
  const feestdagen = new Set(
    [...berekenFeestdagen(jaar), ...berekenFeestdagen(jaar + 1)].map(f => f.start_datum)
  )

  const d = new Date(vanaf)
  let geteld = 0
  while (geteld < aantalWerkdagen) {
    d.setDate(d.getDate() + 1)
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    if (!isWeekend && !feestdagen.has(datumStr(d))) geteld++
  }
  return datumStr(d)
}
