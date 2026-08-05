/**
 * bestand-rijen.ts
 *
 * Bouw7- en SharePoint-bestanden samenvoegen tot één rijenset voor de bestandenlijst.
 * Beide bronnen leveren vrijwel dezelfde velden; het verschil zit in hoe je bij de
 * bytes komt en in wat er per bron wél of niet kan (de mobiele-app-vinkjes bestaan
 * alleen voor Bouw7-bestanden).
 *
 * Pure helpers zonder server-afhankelijkheden — de tab draait op de client.
 */

import type { DossierBestand } from './bestanden'
import type { SharePointBestand } from './sharepoint-bestanden'

export type BestandBronNaam = 'Bouw7' | 'SharePoint'

/** Waar een bestand voor gebruikt wordt in de UI — bepaalt lijst vs. galerij vs. mailvenster. */
export type BestandSoort = 'afbeelding' | 'mail' | 'document'

export type BestandRij = {
  /** Uniek over beide bronnen heen: de id's zelf kunnen botsen. */
  sleutel: string
  bron: BestandBronNaam
  naam: string
  omschrijving: string | null
  extensie: string | null
  grootte: number | null
  categorie: string | null
  datum: string | null
  door: string | null
  soort: BestandSoort
  /** Alleen gevuld voor Bouw7 — bepaalt of het app-vinkje getoond kan worden. */
  bouw7Id: number | null
  /** Querystring voor /api/dossier-bestand (zonder leidende `?`). */
  bronQuery: string
  /** Voorkeurslink om te openen: SharePoint opent in SharePoint zelf. */
  openUrl: string | null
  /** Kant-en-klare thumbnail van de bron (SharePoint); null = zelf renderen. */
  thumbUrl: string | null
  /**
   * Kant-en-klare voorvertoning van ~800px, rechtstreeks van het CDN van de bron.
   * Scheelt het ophalen én verkleinen van het origineel — bij een telefoonfoto van
   * 6 MB is dat het verschil tussen wachten en meteen beeld. Bouw7 heeft dit niet.
   */
  previewUrl: string | null
}

const AFBEELDING_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'avif',
])

const MAIL_EXT = new Set(['msg', 'eml'])

/**
 * Extensie uit de naam als de bron er geen meelevert. Bouw7 vult `extension` niet
 * altijd, en zonder extensie belandt een foto in de documentenlijst i.p.v. de galerij.
 */
export function extensieVan(naam: string, meegeleverd: string | null): string | null {
  const uitBron = meegeleverd?.trim().replace(/^\./, '')
  if (uitBron) return uitBron.toLowerCase()
  const punt = naam.lastIndexOf('.')
  if (punt <= 0 || punt === naam.length - 1) return null
  const staart = naam.slice(punt + 1)
  return /^[a-z0-9]{1,5}$/i.test(staart) ? staart.toLowerCase() : null
}

export function soortVan(extensie: string | null): BestandSoort {
  if (!extensie) return 'document'
  if (AFBEELDING_EXT.has(extensie)) return 'afbeelding'
  if (MAIL_EXT.has(extensie)) return 'mail'
  return 'document'
}

/** Naam met extensie, voor de Content-Disposition van de downloadproxy. */
function naamMetExtensie(naam: string, extensie: string | null): string {
  if (!extensie) return naam
  return naam.toLowerCase().endsWith(`.${extensie.toLowerCase()}`) ? naam : `${naam}.${extensie}`
}

export function bouw7Rij(b: DossierBestand): BestandRij {
  const extensie = extensieVan(b.naam, b.extensie)
  const query = new URLSearchParams({ bron: 'bouw7' })
  if (b.fileHash) query.set('hash', b.fileHash)
  query.set('id', String(b.id))
  query.set('naam', naamMetExtensie(b.naam, extensie))

  return {
    sleutel: `bouw7:${b.id}`,
    bron: 'Bouw7',
    naam: b.naam,
    omschrijving: b.omschrijving,
    extensie,
    grootte: b.grootte,
    categorie: b.categorie,
    datum: b.datum,
    door: b.aangemaaktDoor,
    soort: soortVan(extensie),
    bouw7Id: b.id,
    bronQuery: query.toString(),
    openUrl: `/api/dossier-bestand?${query.toString()}`,
    thumbUrl: null,
    previewUrl: null,
  }
}

export function sharePointRij(b: SharePointBestand): BestandRij {
  const extensie = extensieVan(b.naam, b.extensie)
  const query = new URLSearchParams({ bron: 'sharepoint' })
  if (b.driveId) query.set('driveId', b.driveId)
  query.set('itemId', b.id)
  query.set('naam', naamMetExtensie(b.naam, extensie))

  return {
    sleutel: `sharepoint:${b.id}`,
    bron: 'SharePoint',
    naam: b.naam,
    omschrijving: null,
    extensie,
    grootte: b.grootte,
    categorie: null,
    datum: b.datum,
    door: b.door,
    soort: soortVan(extensie),
    bouw7Id: null,
    bronQuery: query.toString(),
    // In SharePoint openen is prettiger dan downloaden: Office-bestanden gaan
    // rechtstreeks open in Word/Excel online.
    openUrl: b.webUrl ?? (b.driveId ? `/api/dossier-bestand?${query.toString()}` : null),
    thumbUrl: b.thumbUrl,
    previewUrl: b.previewUrl,
  }
}

/** URL naar de bytes via de EVA-proxy — voor thumbnails, lightbox en downloaden. */
export function bestandUrl(rij: BestandRij, opts: { breedte?: number; download?: boolean } = {}): string {
  const query = new URLSearchParams(rij.bronQuery)
  if (opts.breedte) query.set('w', String(opts.breedte))
  if (opts.download) query.set('download', '1')
  return `/api/dossier-bestand?${query.toString()}`
}

export function formatteerGrootte(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
