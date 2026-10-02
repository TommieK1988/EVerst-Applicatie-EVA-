/**
 * bestand-soort.ts
 *
 * De kolom "Soort" in de bestandenlijst: welk soort stuk is dit (offerte, tekening,
 * factuur, …)? Een collega kan dat per bestand kiezen; doet niemand dat, dan herkent
 * EVA het zelf aan de trefwoorden en extensies die in Instellingen per soort staan.
 *
 * Daarnaast de EVA-weergavenaam: Bouw7 heeft geen endpoint om een projectbestand te
 * hernoemen, dus daar bewaart EVA de nieuwe naam zelf. SharePoint-bestanden worden
 * echt hernoemd en hebben die laag niet nodig.
 *
 * Pure helpers zonder server-afhankelijkheden — de tab én de mobiele lijst draaien
 * ze op de client.
 */

import type { BestandRij } from './bestand-rijen'

export type BestandSoortDef = {
  id: string
  naam: string
  trefwoorden: string[]
  extensies: string[]
  volgorde: number
  actief: boolean
}

/** Wat EVA per bestand bewaart, op de bronoverstijgende sleutel. */
export type BestandMeta = {
  sleutel: string
  weergavenaam: string | null
  soortId: string | null
}

const schoon = (s: string) => s.trim().toLowerCase().replace(/^\./, '')

/**
 * De eerste actieve soort (op volgorde) waarvan een trefwoord in de naam, de
 * omschrijving of de Bouw7-categorie voorkomt, of waarvan de extensie klopt.
 * De volgorde is dus ook de voorrang: "Opdrachtbevestiging offerte 12.pdf" wordt
 * wat bovenaan staat.
 */
export function bepaalAutoSoort(rij: BestandRij, soorten: BestandSoortDef[]): BestandSoortDef | null {
  const tekst = [rij.naam, rij.omschrijving, rij.categorie].filter(Boolean).join(' ').toLowerCase()
  const extensie = rij.extensie ? schoon(rij.extensie) : null

  const kandidaten = soorten
    .filter(s => s.actief)
    .sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))

  for (const s of kandidaten) {
    if (extensie && s.extensies.some(e => schoon(e) === extensie)) return s
    if (s.trefwoorden.some(t => schoon(t) && tekst.includes(schoon(t)))) return s
  }
  return null
}

/**
 * Legt de EVA-gegevens over de rijen heen: de weergavenaam (alleen Bouw7) en de soort,
 * handmatig als die gekozen is, anders automatisch. Een handmatige soort die
 * intussen inactief is gezet blijft staan — die keuze is ooit bewust gemaakt.
 */
export function pasMetaToe(
  rijen: BestandRij[],
  meta: BestandMeta[],
  soorten: BestandSoortDef[],
): BestandRij[] {
  const perSleutel = new Map(meta.map(m => [m.sleutel, m]))
  const perId = new Map(soorten.map(s => [s.id, s]))

  return rijen.map(rij => {
    const m = perSleutel.get(rij.sleutel)
    const eigenNaam = rij.bron === 'Bouw7' ? m?.weergavenaam?.trim() || null : null
    const metNaam: BestandRij = eigenNaam
      ? { ...rij, naam: eigenNaam, oorspronkelijkeNaam: rij.naam }
      : rij

    const handmatig = m?.soortId ? perId.get(m.soortId) ?? null : null
    // Herkennen op de oorspronkelijke naam én de eigen naam: wie een bestand
    // "Offerte" noemt, bedoelt dat ook als soort.
    const soort = handmatig ?? bepaalAutoSoort(metNaam, soorten)
    return {
      ...metNaam,
      soortId: soort?.id ?? null,
      soortNaam: soort?.naam ?? null,
      soortHandmatig: !!handmatig,
    }
  })
}

/** Komma- of puntkommagescheiden invoer uit het beheerscherm naar een schone lijst. */
export function splitsLijst(invoer: string): string[] {
  const gezien = new Set<string>()
  for (const deel of invoer.split(/[,;\n]/)) {
    const s = schoon(deel)
    if (s) gezien.add(s)
  }
  return [...gezien]
}
