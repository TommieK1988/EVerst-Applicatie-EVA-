/**
 * bezoek-opties.ts
 *
 * De keuzes die bij het opstellen van een bezoekrapport worden gemaakt. Client-veilig (géén
 * server-only imports): de picker in de genereermodal, de demo-context én de server-side
 * contextbouwer gebruiken dezelfde definities. Zelfde opzet als `kwaliteit-opties.ts`.
 *
 * Er is bewust één optieveld voor alle vier de soorten in plaats van vier aparte. De
 * opsteller kiest namelijk geen documentsoort maar een *bezoek*; welke module dat bezoek
 * heeft vastgelegd, is voor hem een implementatiedetail.
 */

import type { BezoekSoort } from './bezoek/contract'

export interface BezoekOpties {
  /**
   * Welk bezoek. Beide leeg = het meest recente bezoek van dit dossier, ongeacht de soort.
   * `bron_soort` staat erbij omdat de id's uit vier verschillende tabellen komen en een
   * losse UUID dus niet zegt waar hij vandaan komt.
   */
  bron_soort: BezoekSoort | null
  bron_id: string | null
  /** Aantal bevindingen per pagina; hoort bij de indeling van het Word-sjabloon. */
  per_pagina: number
  toon_fotos: boolean
  /** Na-foto naast de voor-foto tonen bij herstelde bevindingen. */
  toon_voor_na: boolean
  /** Positieve waarnemingen opnemen. Standaard aan: een rapport mag niet uitsluitend
   *  fouten tonen. */
  toon_waarnemingen: boolean
  toon_handtekeningen: boolean
  /** Ook de niet-beoordeelde en N.v.t.-punten in de puntenlijst zetten. */
  toon_niet_beoordeeld: boolean
  /**
   * Reactiethreads bij een bevinding opnemen. Standaard **uit**: daar staat interne
   * afstemming in ("bel jij de onderaannemer even") die niet voor de klant bedoeld is.
   */
  toon_reacties: boolean
  /** Vrije inleidingstekst op het voorblad; leeg = de standaardtekst per soort. */
  inleiding: string
}

/** Sleutel van het invoerveld (type `bezoek_opties`) waar de keuzes in staan. */
export const BEZOEK_OPTIES_SLEUTEL = 'bezoek'

export const STANDAARD_BEZOEK_OPTIES: BezoekOpties = {
  bron_soort: null,
  bron_id: null,
  per_pagina: 3,
  toon_fotos: true,
  toon_voor_na: true,
  toon_waarnemingen: true,
  toon_handtekeningen: true,
  toon_niet_beoordeeld: true,
  toon_reacties: false,
  inleiding: '',
}

/** Boven dit aantal bevindingen weigert het rapport; kies dan een ander bezoek. */
export const MAX_BEVINDINGEN = 120
/** Bovengrens voor het invulveld; meer dan dit past nooit op één pagina. */
export const MAX_PER_PAGINA = 12

/**
 * Max-kader (px @96dpi) waarbinnen een bevindingsfoto wordt geschaald. `fitSize` vergroot
 * nooit en vervormt nooit, dus dit is tevens de gegarandeerde maximale fotohoogte — de
 * andere helft van "een bevinding valt nooit over twee pagina's".
 */
export const BEZOEK_FOTO_MAX = { w: 180, h: 135 }
/** Kleiner kader voor de strook positieve waarnemingen en voor handtekeningen. */
export const BEZOEK_FOTO_KLEIN = { w: 120, h: 90 }

const SOORTEN: BezoekSoort[] = ['kwaliteit', 'oplevering', 'veiligheid', 'formulier']

/**
 * Leest de optie-JSON uit een invoerwaarde. Onleesbaar of afwezig → de standaarden, zodat
 * een sjabloon ook rendert wanneer de beheerder het optieveld niet heeft toegevoegd.
 */
export function parseBezoekOpties(ruw: unknown): BezoekOpties {
  let obj: Record<string, unknown> = {}
  if (ruw && typeof ruw === 'object') obj = ruw as Record<string, unknown>
  else if (typeof ruw === 'string' && ruw.trim().startsWith('{')) {
    try { obj = JSON.parse(ruw) as Record<string, unknown> } catch { obj = {} }
  }

  const perPagina = Math.round(Number(obj.per_pagina))
  const vlag = (v: unknown, standaard: boolean) =>
    v === undefined || v === null || v === '' ? standaard : v !== false && v !== 'false'

  const soort = SOORTEN.includes(obj.bron_soort as BezoekSoort)
    ? (obj.bron_soort as BezoekSoort)
    : null

  return {
    bron_soort: soort,
    bron_id: obj.bron_id ? String(obj.bron_id) : null,
    per_pagina: Number.isFinite(perPagina) && perPagina >= 1
      ? Math.min(perPagina, MAX_PER_PAGINA)
      : STANDAARD_BEZOEK_OPTIES.per_pagina,
    toon_fotos: vlag(obj.toon_fotos, true),
    toon_voor_na: vlag(obj.toon_voor_na, true),
    toon_waarnemingen: vlag(obj.toon_waarnemingen, true),
    toon_handtekeningen: vlag(obj.toon_handtekeningen, true),
    toon_niet_beoordeeld: vlag(obj.toon_niet_beoordeeld, true),
    toon_reacties: vlag(obj.toon_reacties, false),
    inleiding: typeof obj.inleiding === 'string' ? obj.inleiding : '',
  }
}

/** Serialiseert de keuzes naar de veldwaarde (JSON-tekst). */
export function serialiseerBezoekOpties(o: BezoekOpties): string {
  return JSON.stringify(o)
}
