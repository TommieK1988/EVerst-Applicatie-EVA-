import 'server-only'
import { analyseerWerktijden } from './werktijd-analyse'
import { schrijfWerktijdBevindingen } from './werktijd-bevindingen'
import { beheerOntvangers, maakWagenparkMelding } from './notificaties'

/**
 * Dagelijkse aanwezigheids-samenvatting.
 *
 * Draait de adres-bewuste werktijd-analyse over GISTEREN en stuurt één
 * samenvattende in-app melding naar Directie/beheer met de bestuurders die te
 * laat op de werkplek aankwamen of te vroeg vertrokken. Bij niets te melden
 * wordt géén melding gestuurd (voorkomt ruis). Bedoeld om als Vercel Cron te
 * draaien op werkdagen, ná de dagelijkse ULU-sync.
 */

export type DagoverzichtResultaat = {
  datum: string
  te_laat: number
  te_vroeg: number
  niet_op_kantoor: number
  ontvangers: number
}

function gisteren(nu: Date): string {
  const d = new Date(nu)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function stuurWagenparkDagoverzicht(
  nu: Date = new Date(),
  datumOverride?: string,
): Promise<DagoverzichtResultaat> {
  const datum = datumOverride ?? gisteren(nu)
  const resultaten = await analyseerWerktijden(datum, datum)

  // Persisteer als R11-bevindingen zodat ze bij Bevindingen verschijnen.
  await schrijfWerktijdBevindingen(resultaten, datum, datum)

  const teLaat: string[] = []
  const teVroeg: string[] = []
  const nietOpLocatie: string[] = []

  for (const r of resultaten) {
    const dag = r.dagen[0]
    if (!dag || !dag.is_werkdag) continue
    const naam = r.volledige_naam ?? `Bestuurder #${r.user_id_ulu}`
    if ((dag.te_laat_minuten ?? 0) > 0) {
      teLaat.push(`${naam} (${dag.aankomst_werk} · +${dag.te_laat_minuten} min)`)
    }
    if ((dag.te_vroeg_minuten ?? 0) > 0) {
      teVroeg.push(`${naam} (${dag.vertrek_werk} · −${dag.te_vroeg_minuten} min)`)
    }
    if (dag.niet_op_locatie) nietOpLocatie.push(naam)
  }

  if (teLaat.length === 0 && teVroeg.length === 0) {
    return { datum, te_laat: 0, te_vroeg: 0, niet_op_kantoor: nietOpLocatie.length, ontvangers: 0 }
  }

  const ontvangers = await beheerOntvangers()
  const titel = `Aanwezigheid ${datum}: ${teLaat.length}× te laat, ${teVroeg.length}× te vroeg`
  const regels: string[] = []
  if (teLaat.length) regels.push(`Te laat: ${teLaat.join(' · ')}`)
  if (teVroeg.length) regels.push(`Te vroeg weg: ${teVroeg.join(' · ')}`)
  const body = regels.join('\n')

  const verzonden = await maakWagenparkMelding(
    ontvangers,
    titel,
    body,
    '/wagenpark/werktijden',
  )

  return {
    datum,
    te_laat: teLaat.length,
    te_vroeg: teVroeg.length,
    niet_op_kantoor: nietOpLocatie.length,
    ontvangers: verzonden,
  }
}
