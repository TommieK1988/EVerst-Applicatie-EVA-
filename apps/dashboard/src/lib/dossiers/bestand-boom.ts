/**
 * bestand-boom.ts
 *
 * De mappenstructuur van de SharePoint-dossiermap terug in de bestandenlijst: mappen
 * als uitklapbare regels, bestanden eronder. Bouw7 kent geen mappen; die bestanden
 * staan bovenaan, naast wat direct in de dossiermap staat.
 *
 * Foto's staan niet in de lijst maar in de fotogalerij. Een map vol foto's zou in de
 * lijst dan leeg lijken, dus een map telt ze wel mee en verwijst ernaar.
 *
 * Pure helpers zonder server-afhankelijkheden — de tab draait op de client.
 */

import type { BestandRij } from './bestand-rijen'

export type MapKnoop = {
  /** Pad vanaf de dossiermap (`Tekeningen/Revisie 2`); '' = de dossiermap zelf. */
  pad: string
  naam: string
  webUrl: string | null
  mappen: MapKnoop[]
  /** Documenten direct in deze map, in de volgorde waarin ze binnenkwamen. */
  bestanden: BestandRij[]
  /** Foto's direct in deze map. */
  fotosHier: number
  /** Inclusief alle submappen. */
  aantalBestanden: number
  aantalFotos: number
}

export type BoomRegel =
  | { soort: 'map'; map: MapKnoop; diepte: number; open: boolean }
  | { soort: 'bestand'; rij: BestandRij; diepte: number }
  /** Verwijzing naar de fotogalerij voor de foto's in een opengeklapte map. */
  | { soort: 'fotos'; map: MapKnoop; diepte: number }
  /** Een opengeklapte map zonder inhoud. */
  | { soort: 'leeg'; map: MapKnoop; diepte: number }

/** Mapnamen als `2 Offerte` en `10 Oplevering` op hun nummer sorteren, niet als tekst. */
const vergelijkNaam = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' })

/** `Tekeningen/Revisie 2` → `Tekeningen › Revisie 2`. */
export function mapLabel(pad: string): string {
  return pad.split('/').join(' › ')
}

/**
 * Bouwt de boom. `documenten` komen in de volgorde waarin ze binnen een map getoond
 * worden; sorteer ze dus vooraf. Een map die alleen uit het pad van een bestand blijkt
 * (niet in `mappen`) wordt alsnog aangemaakt, zodat er nooit een bestand wegvalt.
 */
export function bouwBoom(
  documenten: BestandRij[],
  fotos: BestandRij[],
  mappen: { pad: string; webUrl: string | null }[],
): MapKnoop {
  const wortel = nieuweKnoop('', null)
  const perPad = new Map<string, MapKnoop>([['', wortel]])

  function zorgVoor(pad: string): MapKnoop {
    const bestaand = perPad.get(pad)
    if (bestaand) return bestaand
    const knip = pad.lastIndexOf('/')
    const ouder = zorgVoor(knip < 0 ? '' : pad.slice(0, knip))
    const knoop = nieuweKnoop(pad, null)
    ouder.mappen.push(knoop)
    perPad.set(pad, knoop)
    return knoop
  }

  for (const m of mappen) if (m.pad) zorgVoor(m.pad).webUrl = m.webUrl
  for (const rij of documenten) zorgVoor(rij.map ?? '').bestanden.push(rij)
  for (const rij of fotos) zorgVoor(rij.map ?? '').fotosHier++

  telOp(wortel)
  return wortel
}

function nieuweKnoop(pad: string, webUrl: string | null): MapKnoop {
  return {
    pad,
    naam: pad.slice(pad.lastIndexOf('/') + 1),
    webUrl,
    mappen: [],
    bestanden: [],
    fotosHier: 0,
    aantalBestanden: 0,
    aantalFotos: 0,
  }
}

function telOp(knoop: MapKnoop): void {
  knoop.mappen.sort((a, b) => vergelijkNaam(a.naam, b.naam))
  knoop.aantalBestanden = knoop.bestanden.length
  knoop.aantalFotos = knoop.fotosHier
  for (const sub of knoop.mappen) {
    telOp(sub)
    knoop.aantalBestanden += sub.aantalBestanden
    knoop.aantalFotos += sub.aantalFotos
  }
}

/**
 * De regels zoals de tabel ze toont: per map eerst de submappen, dan de bestanden,
 * dan de verwijzing naar de foto's. Alleen opengeklapte mappen tonen hun inhoud.
 */
export function vlakAf(wortel: MapKnoop, open: ReadonlySet<string>): BoomRegel[] {
  const regels: BoomRegel[] = []

  function inhoud(knoop: MapKnoop, diepte: number) {
    for (const sub of knoop.mappen) {
      const isOpen = open.has(sub.pad)
      regels.push({ soort: 'map', map: sub, diepte, open: isOpen })
      if (!isOpen) continue
      inhoud(sub, diepte + 1)
      if (sub.fotosHier > 0) regels.push({ soort: 'fotos', map: sub, diepte: diepte + 1 })
      if (sub.mappen.length === 0 && sub.bestanden.length === 0 && sub.fotosHier === 0) {
        regels.push({ soort: 'leeg', map: sub, diepte: diepte + 1 })
      }
    }
    for (const rij of knoop.bestanden) regels.push({ soort: 'bestand', rij, diepte })
  }

  inhoud(wortel, 0)
  return regels
}

/** Alle mappaden in de boom, voor "alles uitklappen". */
export function allePaden(wortel: MapKnoop): string[] {
  const uit: string[] = []
  const loop = (k: MapKnoop) => { for (const sub of k.mappen) { uit.push(sub.pad); loop(sub) } }
  loop(wortel)
  return uit
}

/**
 * Foto's in de volgorde van de galerij: eerst wat niet in een submap staat, dan per
 * map (zelfde volgorde als in de lijst); binnen een map de nieuwste bovenaan — bij een
 * lopend project is de laatste opname het interessantst.
 */
export function sorteerFotos(fotos: BestandRij[]): BestandRij[] {
  return [...fotos].sort((a, b) =>
    vergelijkPad(a.map ?? '', b.map ?? '')
    || (b.datum ?? '').localeCompare(a.datum ?? '')
    || a.naam.localeCompare(b.naam))
}

/** Per niveau vergelijken, zodat `A/B` direct na `A` komt en niet na `A 2`. */
function vergelijkPad(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return -1
  if (!b) return 1
  const da = a.split('/')
  const db = b.split('/')
  for (let i = 0; i < Math.min(da.length, db.length); i++) {
    const v = vergelijkNaam(da[i], db[i])
    if (v !== 0) return v
  }
  return da.length - db.length
}
