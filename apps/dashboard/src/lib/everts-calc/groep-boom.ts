/**
 * groep-boom.ts
 *
 * Pure boomoperaties op de calculatiestructuur (`Groep`), gebruikt door het
 * slepen-met-inspringen in `CalculatieGrid`. Bewust zonder React zodat de logica
 * los te lezen en te testen is.
 *
 * Twee dingen moeten altijd kloppen na een verplaatsing:
 *  - `niveau` blijft gelijk aan de diepte in de boom — óók van alle nakomelingen.
 *    `buildNummers` (import-structuur.ts) filtert op `niveau` en zou anders
 *    hele takken uit de offertenummering laten vallen.
 *  - `volgorde` blijft aaneengesloten binnen elke ouder, in oude én nieuwe ouder.
 */

import type { Groep } from './types'

/** Diepste toegestane niveau; `Groep.niveau` is `1 | 2 | 3` en buildNummers gaat drie lagen diep. */
export const MAX_NIVEAU = 3

export interface PlatteGroep {
  groep: Groep
  /** 0-gebaseerde diepte (= `niveau - 1`). */
  diepte: number
}

/** Alle groepen in outline-volgorde (1, 1.1, 1.1.1, 1.2, 2, …), met hun diepte. */
export function platteGroepen(groepen: Groep[]): PlatteGroep[] {
  const uit: PlatteGroep[] = []
  const loop = (parentId: string | null, diepte: number) => {
    groepen
      .filter(g => (g.parent_id ?? null) === parentId)
      .sort((a, b) => a.volgorde - b.volgorde)
      .forEach(g => {
        uit.push({ groep: g, diepte })
        loop(g.id, diepte + 1)
      })
  }
  loop(null, 0)
  return uit
}

/** De groep zelf plus al zijn nakomelingen — je mag een groep nooit in zijn eigen tak droppen. */
export function subtreeIds(groepen: Groep[], id: string): Set<string> {
  const uit = new Set<string>([id])
  let gegroeid = true
  while (gegroeid) {
    gegroeid = false
    for (const g of groepen) {
      if (g.parent_id && uit.has(g.parent_id) && !uit.has(g.id)) {
        uit.add(g.id)
        gegroeid = true
      }
    }
  }
  return uit
}

/** Aantal extra lagen ónder een groep (0 = geen subgroepen). */
export function subtreeHoogte(groepen: Groep[], id: string): number {
  const kinderen = groepen.filter(g => g.parent_id === id)
  if (kinderen.length === 0) return 0
  return 1 + Math.max(...kinderen.map(k => subtreeHoogte(groepen, k.id)))
}

/**
 * Een landingsplek: bij welke ouder, en vóór welke broer/zus (`null` = achteraan).
 * Elke denkbare positie in de boom is hiermee te beschrijven.
 */
export interface Doelpositie {
  /** Nieuwe ouder (null = hoofdgroep). */
  parentId: string | null
  /** 0-gebaseerde diepte waarop de groep landt. */
  diepte: number
  /** Groep waarvóór hij bij die ouder komt (null = achteraan). */
  voorGroepId: string | null
}

/**
 * Mag `sleepId` onder `nieuweParentId` hangen? Twee redenen van niet: je zou hem in zijn
 * eigen tak stoppen (die raakt dan los van de wortel), of de tak zou voorbij `MAX_NIVEAU`
 * duiken. De UI gebruikt dit om onbereikbare doelen meteen als geblokkeerd te tonen, in
 * plaats van een drop te accepteren die daarna niets doet.
 */
export function magVerplaatsenNaar(
  groepen: Groep[],
  sleepId: string,
  nieuweParentId: string | null,
): boolean {
  if (nieuweParentId === sleepId) return false
  if (nieuweParentId && subtreeIds(groepen, sleepId).has(nieuweParentId)) return false
  const ouder = nieuweParentId ? groepen.find(g => g.id === nieuweParentId) : null
  if (nieuweParentId && !ouder) return false
  const nieuweDiepte = ouder ? ouder.niveau : 0
  return nieuweDiepte + 1 + subtreeHoogte(groepen, sleepId) <= MAX_NIVEAU
}

/**
 * De landingsplek "vlak vóór `voorGroep`" — de invoegstrook boven een rij. De nieuwe
 * ouder is simpelweg de ouder van die rij, dus het niveau volgt uit wáár je loslaat en
 * niet uit een zijwaartse beweging.
 */
export function positieVoor(groepen: Groep[], voorGroepId: string): Doelpositie | null {
  const doel = groepen.find(g => g.id === voorGroepId)
  if (!doel) return null
  return { parentId: doel.parent_id ?? null, diepte: doel.niveau - 1, voorGroepId: doel.id }
}

/** De landingsplek "achteraan in `parentId`" — een rij zelf, of onderaan de boom (null). */
export function positieIn(groepen: Groep[], parentId: string | null): Doelpositie | null {
  if (!parentId) return { parentId: null, diepte: 0, voorGroepId: null }
  const ouder = groepen.find(g => g.id === parentId)
  if (!ouder) return null
  return { parentId: ouder.id, diepte: ouder.niveau, voorGroepId: null }
}

/**
 * Verplaatst een groep naar `nieuweParentId`, vóór `voorGroepId` (null = achteraan).
 *
 * @returns alleen de groepen waarvan `parent_id`, `niveau` of `volgorde` écht wijzigt — de
 *          aanroeper schrijft die stuk voor stuk weg. Lege array = niets te doen, en
 *          dus ook geen "gelukt"-melding: een verplaatsing naar de eigen plek is geen
 *          verplaatsing.
 */
export function verplaatsGroep(
  groepen: Groep[],
  sleepId: string,
  nieuweParentId: string | null,
  voorGroepId: string | null,
): Groep[] {
  const sleep = groepen.find(g => g.id === sleepId)
  if (!sleep) return []
  // Nooit in de eigen tak — dat zou de boom loskoppelen van de wortel.
  if (nieuweParentId && subtreeIds(groepen, sleepId).has(nieuweParentId)) return []

  const oudeParentId = sleep.parent_id ?? null
  const nieuweDiepte = nieuweParentId
    ? (groepen.find(g => g.id === nieuweParentId)!.niveau)   // niveau ouder = diepte kind (1-gebaseerd)
    : 0
  if (nieuweDiepte + 1 + subtreeHoogte(groepen, sleepId) > MAX_NIVEAU) return []

  const gewijzigd = new Map<string, Groep>()
  const zet = (g: Groep, patch: Partial<Groep>) => {
    const bestaand = gewijzigd.get(g.id) ?? g
    gewijzigd.set(g.id, { ...bestaand, ...patch })
  }

  // 1. De groep zelf naar zijn nieuwe plek.
  zet(sleep, { parent_id: nieuweParentId, niveau: (nieuweDiepte + 1) as Groep['niveau'] })

  // 2. Nakomelingen: niveau meeschuiven met het verschil.
  const verschil = (nieuweDiepte + 1) - sleep.niveau
  if (verschil !== 0) {
    for (const id of subtreeIds(groepen, sleepId)) {
      if (id === sleepId) continue
      const g = groepen.find(x => x.id === id)!
      zet(g, { niveau: (g.niveau + verschil) as Groep['niveau'] })
    }
  }

  // 3. Volgorde in de nieuwe ouder: de groep op de juiste plek tussen zijn nieuwe broers/zussen.
  const nieuweBroers = groepen
    .filter(g => (g.parent_id ?? null) === nieuweParentId && g.id !== sleepId)
    .sort((a, b) => a.volgorde - b.volgorde)
  const idx = voorGroepId ? nieuweBroers.findIndex(g => g.id === voorGroepId) : -1
  const doelLijst = [...nieuweBroers]
  doelLijst.splice(idx >= 0 ? idx : doelLijst.length, 0, sleep)
  doelLijst.forEach((g, i) => { if (g.volgorde !== i + 1 || g.id === sleepId) zet(g, { volgorde: i + 1 }) })

  // 4. Oude ouder hernummeren (alleen bij een echte ouderwissel).
  if (oudeParentId !== nieuweParentId) {
    groepen
      .filter(g => (g.parent_id ?? null) === oudeParentId && g.id !== sleepId)
      .sort((a, b) => a.volgorde - b.volgorde)
      .forEach((g, i) => { if (g.volgorde !== i + 1) zet(g, { volgorde: i + 1 }) })
  }

  // Loslaten op de eigen plek levert hierboven wél een patch voor de gesleepte groep op,
  // maar met exact dezelfde waarden. Die eruit filteren, zodat de aanroeper aan een lege
  // lijst ziet dat er niets te doen is — en niet ten onrechte "gelukt" meldt.
  return Array.from(gewijzigd.values()).filter(g => {
    const oud = groepen.find(x => x.id === g.id)
    if (!oud) return true
    return (oud.parent_id ?? null) !== (g.parent_id ?? null)
      || oud.niveau   !== g.niveau
      || oud.volgorde !== g.volgorde
  })
}
