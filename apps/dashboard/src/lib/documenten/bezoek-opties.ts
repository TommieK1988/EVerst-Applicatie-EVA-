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

import { BEZOEK_SOORT_LABELS, type BezoekSoort } from './bezoek/contract'

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
  // Twee per pagina: elke bevinding krijgt een halve pagina met de foto groot ernaast.
  per_pagina: 2,
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
export const BEZOEK_FOTO_MAX = { w: 380, h: 380 }
/**
 * Hetzelfde kader voor overzichtsfoto's en de foto's bij de punten per discipline.
 *
 * Was 120×90 px (ruim 3×2,5 cm): op papier onleesbaar klein. Een foto krijgt nu een halve
 * pagina, rechts van de omschrijving: hooguit ±10 × 10 cm, zodat ook een staande
 * telefoonfoto op een halve pagina past. De fotokolom in het sjabloon is 6000 twips
 * (10,6 cm, min 2× 100 twips celmarge = 386 px) — het kader moet daarbinnen blijven, anders
 * snijdt Word de foto af.
 */
export const BEZOEK_FOTO_KLEIN = BEZOEK_FOTO_MAX
/** Handtekeningen blijven klein; een krabbel op een halve pagina is lachwekkend. */
export const BEZOEK_HANDTEKENING_MAX = { w: 120, h: 90 }
/**
 * Bronresolutie van een bezoekfoto in px. `fitSize` vergroot nooit, dus de bron moet groter
 * zijn dan het kader; 1000 px op ±10 cm is ±250 dpi — scherp op papier.
 */
export const BEZOEK_FOTO_PX = 1000

/**
 * Afgeleid uit de labels en niet met de hand overgetypt.
 *
 * Deze lijst stond hier als losse array en miste `'projectbezoek'`. Gevolg: koos de opsteller
 * een projectbezoek, dan viel `bron_soort` terug op `null` en rapporteerde het sjabloon
 * stilzwijgend over "het meest recente bezoek" — een andere bron dan hij aanklikte, zonder
 * foutmelding. Door hem af te leiden kan een nieuwe soort dit niet meer breken.
 */
const SOORTEN = Object.keys(BEZOEK_SOORT_LABELS) as BezoekSoort[]

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
