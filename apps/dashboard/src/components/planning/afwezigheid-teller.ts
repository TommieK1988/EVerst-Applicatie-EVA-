import { addDays, format, isWeekend } from 'date-fns'
import type { Medewerker, MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { medewerkerAfwezigheidLabels } from '@everts/database/platform-types'

type Afwezige = { naam: string; afdeling: string | null; label: string }

function naamVan(m: Medewerker): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

function tijdLabel(a: MedewerkerAfwezigheid): string {
  const type = medewerkerAfwezigheidLabels[a.type].toLowerCase()
  return a.start_tijd && a.eind_tijd ? `${type} ${a.start_tijd.slice(0, 5)}–${a.eind_tijd.slice(0, 5)}` : type
}

/** Per werkdag (yyyy-MM-dd) de afwezigen onder `medewerkers`; zie AfwezigheidTellerRij. */
export function afwezigenPerDag(
  medewerkers: Medewerker[],
  afwezigheidPerMedewerker: Record<string, MedewerkerAfwezigheid[]>,
  vrijeDagen: Set<string>,
): Map<string, Afwezige[]> {
  const perDag = new Map<string, Afwezige[]>()
  for (const m of medewerkers) {
    for (const a of afwezigheidPerMedewerker[m.id] ?? []) {
      // Datums als lokale dag doorlopen; 'T00:00' voorkomt dat new Date() ze als UTC leest.
      const eind = new Date(`${a.eind_datum}T00:00`)
      for (let d = new Date(`${a.start_datum}T00:00`); d <= eind; d = addDays(d, 1)) {
        const iso = format(d, 'yyyy-MM-dd')
        if (isWeekend(d) || vrijeDagen.has(iso)) continue
        const lijst = perDag.get(iso) ?? []
        // Twee records voor dezelfde persoon op één dag (bv. ochtend + middag) is één afwezige.
        if (!lijst.some(x => x.naam === naamVan(m))) {
          lijst.push({ naam: naamVan(m), afdeling: m.afdeling, label: tijdLabel(a) })
        }
        perDag.set(iso, lijst)
      }
    }
  }
  return perDag
}
