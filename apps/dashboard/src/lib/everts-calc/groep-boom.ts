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

export interface Projectie {
  /** Nieuwe ouder (null = hoofdgroep). */
  parentId: string | null
  /** 0-gebaseerde diepte waarop de groep landt. */
  diepte: number
  /** Groep waarvóór hij bij die ouder komt (null = achteraan). */
  voorGroepId: string | null
}

/**
 * Bepaalt waar een gesleepte groep landt. Het model is een **invoegpositie tussen twee
 * rijen** (`invoegIndex`) plus een gewenste diepte; de buren bepalen wat er mogelijk is:
 *
 *  - dieper dan `vorige.diepte + 1` kan niet — daar hangt geen ouder tussen;
 *  - ondieper dan `volgende.diepte` kan niet — die rij zou zijn ouder kwijtraken;
 *  - staat er niets meer ná de invoegpositie, dan mag álles tot niveau 1 (= onderaan).
 *
 * Daardoor zijn "achteraan in een ouder" en "helemaal onderaan" gewone uitkomsten in
 * plaats van onbereikbare gevallen.
 *
 * @param platteLijst     outline-volgorde zónder de gesleepte tak
 * @param invoegIndex     positie tussen de rijen: 0 = bovenaan, lijst.length = onderaan
 * @param gewensteDiepte  diepte die de horizontale muispositie suggereert
 * @param maxEigenDiepte  MAX_NIVEAU - 1 - hoogte van de gesleepte tak
 */
export function projecteer(
  platteLijst: PlatteGroep[],
  invoegIndex: number,
  gewensteDiepte: number,
  maxEigenDiepte: number,
): Projectie {
  const index    = Math.max(0, Math.min(invoegIndex, platteLijst.length))
  const vorige   = platteLijst[index - 1]
  const volgende = platteLijst[index]

  const maxDiepte = Math.min(vorige ? vorige.diepte + 1 : 0, Math.max(0, maxEigenDiepte))
  const minDiepte = Math.min(volgende ? volgende.diepte : 0, maxDiepte)
  const diepte    = Math.max(minDiepte, Math.min(gewensteDiepte, maxDiepte))

  // Nieuwe ouder = de dichtstbijzijnde rij hierbóven die precies één niveau hoger zit.
  let parentId: string | null = null
  if (diepte > 0) {
    for (let i = index - 1; i >= 0; i--) {
      if (platteLijst[i].diepte === diepte - 1) { parentId = platteLijst[i].groep.id; break }
    }
    if (!parentId) return { parentId: null, diepte: 0, voorGroepId: eersteBroerVanaf(platteLijst, index, null, 0) }
  }

  return { parentId, diepte, voorGroepId: eersteBroerVanaf(platteLijst, index, parentId, diepte) }
}

/**
 * Eerste directe kind van `parentId` op of ná `vanaf` — dáár komt de groep vóór.
 * `null` betekent achteraan bij die ouder: er volgt geen broer/zus meer.
 */
function eersteBroerVanaf(
  platteLijst: PlatteGroep[],
  vanaf: number,
  parentId: string | null,
  diepte: number,
): string | null {
  for (let i = vanaf; i < platteLijst.length; i++) {
    const rij = platteLijst[i]
    if ((rij.groep.parent_id ?? null) === parentId) return rij.groep.id
    // Ondieper dan het gekozen niveau = de tak van de ouder is voorbij.
    if (rij.diepte < diepte) break
  }
  return null
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
