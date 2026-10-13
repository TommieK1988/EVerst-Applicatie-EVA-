import type { Groep, Meetregel } from './types'
import {
  berekenHoeveelheid, isRegelActief, calculatieregelOmschrijving, normaliseerBestekcode,
} from './meetstaat-utils'
import { platteGroepen, subtreeIds } from './groep-boom'

/**
 * Wat er op een afgedrukte meetstaat staat, los van hoe het getekend wordt: alle
 * groepen in outline-volgorde, per groep de meetregels als tekstcellen en de
 * totalen per onderdeel/type/bestekscode (dezelfde splitsing als de aggregaten).
 */

export const fmt = (n: number | undefined | null, dec = 2) =>
  n === undefined || n === null || n === 0
    ? ''
    : n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: dec })

/**
 * Hoeveel breedtes of hoogtes er gemeten zijn. Telt alleen mee bij m¹ (zie
 * berekenHoeveelheid); bij andere eenheden blijft de cel leeg, net als bij 1.
 */
export function maatAantal(aantal: number | undefined, eenheid: string): string {
  return eenheid === 'm¹' && aantal && aantal !== 1 ? fmt(aantal, 3) : ''
}

export interface AfdrukRegel {
  nr: number
  element: string
  onderdeel: string
  type: string
  /** Bestekscode; oude meetstaten dragen nog een behandeling, die staat er dan achter. */
  code: string
  opmerking: string
  breedte: string
  hoogte: string
  breedteAantal: string
  hoogteAantal: string
  factor: string
  aantal: string
  hoeveelheid: string
  /** Hoeveelheid met de hand overschreven, niet uit de maten berekend. */
  handmatig: boolean
}

export interface AfdrukTotaal { omschrijving: string; hoeveelheid: string }

export interface AfdrukBlok {
  sleutel: string
  naam: string
  diepte: number
  regels: AfdrukRegel[]
  totalen: AfdrukTotaal[]
}

export interface MeetstaatAfdruk {
  blokken: AfdrukBlok[]
  heeftHandmatig: boolean
}

function totalenPerPost(regels: Meetregel[]): AfdrukTotaal[] {
  const map = new Map<string, { omschrijving: string; eenheid: string; hoeveelheid: number }>()
  for (const r of regels) {
    const omschrijving = calculatieregelOmschrijving(r.onderdeel ?? '', r.type ?? '', r.behandeling ?? '', r.bestekcode)
    const sleutel = `${omschrijving.toLowerCase()}::${r.eenheid}`
    const t = map.get(sleutel) ?? { omschrijving, eenheid: r.eenheid, hoeveelheid: 0 }
    t.hoeveelheid += berekenHoeveelheid(r)
    map.set(sleutel, t)
  }
  return Array.from(map.values()).map(t => ({
    omschrijving: t.omschrijving,
    hoeveelheid: `${fmt(t.hoeveelheid)} ${t.eenheid}`,
  }))
}

function naarAfdrukRegel(r: Meetregel, nr: number): AfdrukRegel {
  const handmatig = r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null
  return {
    nr,
    element: r.element ?? '',
    onderdeel: r.onderdeel ?? '',
    type: r.type ?? '',
    code: [normaliseerBestekcode(r.bestekcode), r.behandeling].filter(Boolean).join(' · '),
    opmerking: [r.opmerking ?? r.omschrijving, r.bestek_kenmerk].filter(Boolean).join(' — '),
    breedte: fmt(r.breedte, 3),
    hoogte: fmt(r.hoogte, 3),
    breedteAantal: maatAantal(r.breedte_aantal, r.eenheid),
    hoogteAantal: maatAantal(r.hoogte_aantal, r.eenheid),
    factor: r.factor && r.factor !== 1 ? fmt(r.factor, 3) : '',
    aantal: fmt(r.aantal || 1),
    hoeveelheid: `${fmt(berekenHoeveelheid(r))} ${r.eenheid}`,
    handmatig,
  }
}

export function bouwMeetstaatAfdruk(alleRegels: Meetregel[], groepen: Groep[]): MeetstaatAfdruk {
  const regels = alleRegels
    .filter(r => !r.is_leeg && isRegelActief(r))
    .sort((a, b) => a.volgorde - b.volgorde)
  const metRegels = new Set(regels.map(r => r.groep_id))
  const bekend = new Set(groepen.map(g => g.id))

  const blok = (sleutel: string, naam: string, diepte: number, eigen: Meetregel[]): AfdrukBlok => ({
    sleutel, naam, diepte,
    regels: eigen.map((r, i) => naarAfdrukRegel(r, i + 1)),
    totalen: totalenPerPost(eigen),
  })

  // Een groep komt op papier als hij zelf, of een subgroep, regels heeft.
  const blokken = platteGroepen(groepen)
    .filter(({ groep }) => Array.from(subtreeIds(groepen, groep.id)).some(id => metRegels.has(id)))
    .map(({ groep, diepte }) => blok(groep.id, groep.naam, diepte, regels.filter(r => r.groep_id === groep.id)))

  const wees = regels.filter(r => !bekend.has(r.groep_id))
  if (wees.length > 0) blokken.push(blok('zonder-groep', 'Zonder groep', 0, wees))

  return { blokken, heeftHandmatig: blokken.some(b => b.regels.some(r => r.handmatig)) }
}
