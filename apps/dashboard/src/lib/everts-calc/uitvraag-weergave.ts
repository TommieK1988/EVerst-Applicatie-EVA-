/**
 * uitvraag-weergave.ts — Pure hulpfuncties voor uitvragen vanuit de calculatie (fase 6):
 * welke posten meegaan, het voorstel voor de naam, en hoe een partij er in het paneel uitziet.
 * Geen React en geen server: de schermen en de tests delen dit.
 */

import type { UitvraagPakket, UitvraagPakketPartij, UitvraagPost } from '@/lib/dossiers/uitvraag-pakket-types'
import { isTekstregel, type Calculatieregel, type Groep } from './types'

/**
 * De aangevinkte regels als posten, in de volgorde van het rekenblad. Tekstregels gaan er
 * niet mee: die hebben geen hoeveelheid en zijn voor een onderaannemer geen werk.
 */
export function postenUitSelectie(
  ids: Iterable<string>, regels: Calculatieregel[], groepen: Groep[],
): { posten: UitvraagPost[]; naamVoorstel: string } {
  const gekozen = new Set(ids)
  const volgorde = groepVolgorde(groepen)
  const geselecteerd = regels
    .filter(r => gekozen.has(r.id) && !isTekstregel(r))
    .sort((a, b) =>
      (volgorde.get(a.groep_id) ?? 1e9) - (volgorde.get(b.groep_id) ?? 1e9) || a.volgorde - b.volgorde)

  const posten = geselecteerd.map(r => ({
    calculatieregel_id: r.id,
    omschrijving: r.omschrijving?.trim() || 'Zonder omschrijving',
    hoeveelheid: Number.isFinite(r.hoeveelheid) ? r.hoeveelheid : null,
    eenheid: r.eenheid || null,
  }))

  // Alles uit één groep: de groepsnaam ("Voegwerk"). Anders de eerste omschrijving.
  const groepIds = new Set(geselecteerd.map(r => r.groep_id))
  const enigeGroep = groepIds.size === 1 ? groepen.find(g => g.id === [...groepIds][0]) : undefined
  const naamVoorstel = enigeGroep?.naam?.trim() || posten[0]?.omschrijving || ''
  return { posten, naamVoorstel }
}

/** Groepen diepte-eerst, zoals ze in het rekenblad staan. */
function groepVolgorde(groepen: Groep[]): Map<string, number> {
  const uit = new Map<string, number>()
  const loop = (parent: string | null) => {
    groepen.filter(g => g.parent_id === parent).sort((a, b) => a.volgorde - b.volgorde)
      .forEach(g => { uit.set(g.id, uit.size); loop(g.id) })
  }
  loop(null)
  return uit
}

/** "64 m2", "6 st", "1,5 uur"; leeg als er geen hoeveelheid is. */
export function hoeveelheidTekst(post: Pick<UitvraagPost, 'hoeveelheid' | 'eenheid'>): string {
  if (post.hoeveelheid == null) return ''
  const getal = post.hoeveelheid.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
  return post.eenheid ? `${getal} ${post.eenheid}` : getal
}

/** yyyy-mm-dd, lokale tijd. */
export function isoDatum(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Standaard reactietermijn: over 7 dagen. */
export function standaardReactieUiterlijk(nu = new Date()): string {
  const d = new Date(nu)
  d.setDate(d.getDate() + 7)
  return isoDatum(d)
}

/** "wo 15 okt" */
export function korteDag(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
}

/** Kaartkop rechts: "4 posten · bezoek wo 15 okt", "1 post" of "los". */
export function pakketOmschrijving(p: Pick<UitvraagPakket, 'posten' | 'projectbezoek_op'>): string {
  const delen = [p.posten.length === 0 ? 'los' : `${p.posten.length} post${p.posten.length === 1 ? '' : 'en'}`]
  if (p.projectbezoek_op) delen.push(`bezoek ${korteDag(p.projectbezoek_op)}`)
  return delen.join(' · ')
}

export type PartijToon = 'neutral' | 'info' | 'success' | 'error' | 'warning'
export type PartijActie = 'mailen' | 'open' | null

/** Statuspil en welke knoppen er bij een partij horen. */
export function partijWeergave(p: Pick<UitvraagPakketPartij, 'status' | 'aangevraagd_op' | 'dagen_open' | 'rappels'>): {
  label: string; toon: PartijToon; actie: PartijActie
} {
  switch (p.status) {
    case 'ontvangen':   return { label: 'Offerte binnen', toon: 'success', actie: null }
    case 'gegund':      return { label: 'Gegund', toon: 'success', actie: null }
    case 'afgevallen':  return { label: 'Afgevallen', toon: 'error', actie: null }
    case 'ingetrokken': return { label: 'Ingetrokken', toon: 'neutral', actie: null }
    default:
      if (!p.aangevraagd_op) return { label: 'Nog niet gemaild', toon: 'neutral', actie: 'mailen' }
      return {
        label: `Uitgevraagd${p.dagen_open != null ? ` · ${p.dagen_open} d` : ''}${p.rappels > 0 ? ' · rappel' : ''}`,
        toon: 'info', actie: 'open',
      }
  }
}

/** Teller op de knop Uitvraag: pakketten met minstens één partij die nog open staat. */
export function openPakketten(pakketten: UitvraagPakket[]): number {
  return pakketten.filter(p => p.partijen.some(x => x.status === 'open')).length
}
