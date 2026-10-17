/**
 * o365/dossiermap-inhoud.ts
 *
 * De volledige inhoud van een dossiermap, submappen inbegrepen.
 *
 * De Bestanden-tab liet eerst alleen zien wat direct in de dossiermap stond. Alles in
 * een submap bleef onzichtbaar — ook de standaardbestanden die EVA zelf in een submap
 * zet (Instellingen → Dossiermap). Wie zijn bestanden in SharePoint netjes in mappen
 * ordent, zag in EVA dus het minst.
 *
 * Graph kent geen recursieve listing voor een map in een SharePoint-bibliotheek (`delta`
 * werkt daar alleen vanaf de root van de drive), dus we lopen de mappen zelf af: niveau
 * voor niveau, een paar tegelijk. Een gewone dossiermap heeft er een handvol; de grenzen
 * hieronder zijn er voor de uitzondering waarin iemand een heel archief in één dossiermap
 * heeft gesleept. Dan tonen we wat er binnen de grenzen valt en melden we dat de lijst
 * niet compleet is, in plaats van de tab minutenlang te laten laden.
 */

import { appGraphGet } from './graph'
import { alsBestand, KINDEREN_QUERY, type DriveItem, type SharePointBestand } from './sharepoint'
import { MAX_MAPDIEPTE } from './mappad'

/** Zoveel mappen (de dossiermap zelf meegeteld) worden er maximaal geopend. */
const MAX_MAPPEN = 150
/** Gelijktijdige Graph-calls; meer levert vooral 429's op. */
const GELIJKTIJDIG = 6
/** Pagina's van 200 per map: een map met meer dan 5000 items is geen dossiermap meer. */
const MAX_PAGINAS = 25

export interface SharePointSubmap {
  id: string
  /** Pad vanaf de dossiermap, met `/` gescheiden: `Tekeningen/Revisie 2`. */
  pad: string
  webUrl: string | null
}

export interface DossiermapInhoud {
  /** Alle bestanden; wat in een submap staat heeft `map` gevuld. */
  bestanden: SharePointBestand[]
  /** Alle submappen, ook lege — die horen bij de structuur. */
  mappen: SharePointSubmap[]
  /** Niet alles is opgehaald: te diep, te veel mappen, of een submap gaf een fout. */
  onvolledig: boolean
}

type TeOpenen = { id: string; pad: string }

/** Alle items in één map, over de pagina's heen. */
async function lijstKinderen(driveId: string, itemId: string): Promise<DriveItem[]> {
  const items: DriveItem[] = []
  let url: string | undefined = `/drives/${driveId}/items/${itemId}/children?${KINDEREN_QUERY}`
  for (let i = 0; i < MAX_PAGINAS && url; i++) {
    const res: { value?: DriveItem[]; '@odata.nextLink'?: string } = await appGraphGet(url)
    items.push(...(res.value ?? []))
    url = res['@odata.nextLink']
  }
  return items
}

/** `fn` over alle items, met hooguit `n` tegelijk onderweg; volgorde blijft behouden. */
async function beperktParallel<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const uit: R[] = new Array(items.length)
  let volgende = 0
  async function werker() {
    while (volgende < items.length) {
      const i = volgende++
      uit[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, werker))
  return uit
}

/**
 * Leest de dossiermap en al zijn submappen. Kan de dossiermap zelf niet gelezen
 * worden, dan gooit dit door — dat is een fout voor de hele lijst. Een submap die
 * faalt slaan we over en maakt de uitkomst `onvolledig`.
 */
export async function lijstDossiermapInhoud(driveId: string, itemId: string): Promise<DossiermapInhoud> {
  const bestanden: SharePointBestand[] = []
  const mappen: SharePointSubmap[] = []
  let onvolledig = false
  let geopend = 0

  let laag: TeOpenen[] = [{ id: itemId, pad: '' }]
  for (let diepte = 0; laag.length > 0; diepte++) {
    const ruimte = MAX_MAPPEN - geopend
    if (laag.length > ruimte) {
      onvolledig = true
      laag = laag.slice(0, ruimte)
    }
    geopend += laag.length

    const resultaten = await beperktParallel(laag, GELIJKTIJDIG, async (map) => {
      try {
        return { map, items: await lijstKinderen(driveId, map.id) }
      } catch (err) {
        if (map.pad === '') throw err
        return { map, items: null }
      }
    })

    const volgende: TeOpenen[] = []
    for (const { map, items } of resultaten) {
      if (!items) { onvolledig = true; continue }
      for (const it of items) {
        if (it.file) {
          bestanden.push(alsBestand(it, driveId, map.pad))
        } else if (it.folder) {
          const pad = map.pad ? `${map.pad}/${it.name ?? 'Map'}` : (it.name ?? 'Map')
          mappen.push({ id: it.id, pad, webUrl: it.webUrl ?? null })
          // Een lege map hoeft niet geopend te worden: dat scheelt een call per map.
          if (it.folder.childCount !== 0) volgende.push({ id: it.id, pad })
        }
      }
    }

    if (diepte + 1 >= MAX_MAPDIEPTE && volgende.length > 0) {
      onvolledig = true
      break
    }
    laag = volgende
  }

  return { bestanden, mappen, onvolledig }
}
