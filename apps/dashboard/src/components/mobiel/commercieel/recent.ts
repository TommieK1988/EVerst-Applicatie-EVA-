/**
 * Recent geopende klanten, per apparaat.
 *
 * In `localStorage` en niet in de database: dit is een gemak, geen gegeven. Een tabel
 * `relatie_bezoeken` zou een migratie kosten plus een schrijf-action bij élke paginaweergave,
 * en levert alleen iets op als je de lijst over apparaten heen wilt delen — wat niemand heeft
 * gevraagd. Precedent: `LocatieAutoToggle` bewaart zijn voorkeur op dezelfde manier.
 *
 * Alle toegang staat in try/catch: in een privévenster, met geblokkeerde site-data of tijdens
 * een thumbnail-render gooit `localStorage` of komt hij leeg terug. Het scherm hoort dan
 * gewoon te werken, alleen zonder lijstje.
 */

const SLEUTEL = 'eva.commercieel.recent'
const MAX = 8

export type RecenteKlant = { id: string; naam: string; plaats: string | null }

export function leesRecent(): RecenteKlant[] {
  try {
    const ruw = localStorage.getItem(SLEUTEL)
    if (!ruw) return []
    const gelezen: unknown = JSON.parse(ruw)
    if (!Array.isArray(gelezen)) return []
    // Defensief filteren: een oudere of half geschreven vorm mag het scherm niet breken.
    return gelezen
      .filter((r): r is RecenteKlant =>
        !!r && typeof r === 'object'
        && typeof (r as RecenteKlant).id === 'string'
        && typeof (r as RecenteKlant).naam === 'string')
      .slice(0, MAX)
  } catch {
    return []
  }
}

/** Zet een klant vooraan; een eerder bezoek aan dezelfde klant schuift weg (geen dubbele). */
export function onthoudKlant(klant: RecenteKlant): void {
  try {
    const zonderDeze = leesRecent().filter(r => r.id !== klant.id)
    localStorage.setItem(SLEUTEL, JSON.stringify([klant, ...zonderDeze].slice(0, MAX)))
  } catch {
    // Opslag niet beschikbaar — dan onthouden we niets. Geen foutmelding: de gebruiker
    // heeft hier niets om op te lossen.
  }
}
