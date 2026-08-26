/**
 * kwaliteit-opties.ts
 *
 * De keuzes die bij het opstellen van een kwaliteitsrapport worden gemaakt.
 * Client-veilig (géén server-only imports): de optie-picker in de genereermodal, de demo-context
 * én de server-side contextbouwer gebruiken dezelfde definities. Zelfde opzet als
 * `houtrot-opties.ts`.
 */

export interface KwaliteitRapportOpties {
  /** De inspectie waarover gerapporteerd wordt. Leeg = de meest recente definitieve inspectie. */
  inspectie_id: string | null
  /** Positieve kwaliteitswaarnemingen met foto opnemen. Standaard aan: het rapport mag niet
   *  uitsluitend fouten tonen. */
  toon_waarnemingen: boolean
  /** Hoofdstuk "Opvolging eerdere inspecties" opnemen. */
  toon_opvolging: boolean
  /** Ook de niet-beoordeelde en N.v.t.-punten in de puntenlijst zetten. */
  toon_niet_beoordeeld: boolean
  /** Aantal afwijkingen per pagina; hoort bij de indeling van het Word-sjabloon. */
  per_pagina: number
}

/** Sleutel van het invoerveld (type `kwaliteit_opties`) waar de keuzes in staan. */
export const KWALITEIT_OPTIES_SLEUTEL = 'kwaliteit'

export const STANDAARD_KWALITEIT_OPTIES: KwaliteitRapportOpties = {
  inspectie_id: null,
  toon_waarnemingen: true,
  toon_opvolging: true,
  toon_niet_beoordeeld: true,
  per_pagina: 3,
}

/** Boven dit aantal afwijkingen weigert het rapport; kies dan een andere inspectie. */
export const MAX_AFWIJKINGEN = 120
/** Bovengrens voor het invulveld; meer dan dit past nooit op één pagina. */
export const MAX_PER_PAGINA = 12

/**
 * Max-kader (px @96dpi) waarbinnen een rapportfoto wordt geschaald. `fitSize` vergroot nooit en
 * vervormt nooit, dus dit is tevens de gegarandeerde maximale fotohoogte.
 */
export const KWALITEIT_FOTO_MAX = { w: 180, h: 135 }
/** Kleiner kader voor de strook positieve waarnemingen. */
export const KWALITEIT_FOTO_KLEIN = { w: 120, h: 90 }

/**
 * XML van een handmatige paginabreuk. Alleen bruikbaar zodra er een rawxml-module in
 * `render-docx.ts` is geregistreerd; nu niet het geval. Het Word-sjabloon gebruikt daarom een
 * `{#niet_laatste}`-conditie met een echte breuk erin, net als de houtrot-rapportage.
 */
export const PAGINABREUK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

/**
 * Leest de optie-JSON uit een invoerwaarde. Onleesbaar of afwezig → de standaarden, zodat een
 * sjabloon ook rendert wanneer de beheerder het optieveld niet heeft toegevoegd.
 */
export function parseKwaliteitOpties(ruw: unknown): KwaliteitRapportOpties {
  let obj: Record<string, unknown> = {}
  if (ruw && typeof ruw === 'object') obj = ruw as Record<string, unknown>
  else if (typeof ruw === 'string' && ruw.trim().startsWith('{')) {
    try { obj = JSON.parse(ruw) as Record<string, unknown> } catch { obj = {} }
  }

  const perPagina = Math.round(Number(obj.per_pagina))
  const vlag = (v: unknown, standaard: boolean) =>
    v === undefined || v === null || v === '' ? standaard : v !== false && v !== 'false'

  return {
    inspectie_id: obj.inspectie_id ? String(obj.inspectie_id) : null,
    toon_waarnemingen: vlag(obj.toon_waarnemingen, true),
    toon_opvolging: vlag(obj.toon_opvolging, true),
    toon_niet_beoordeeld: vlag(obj.toon_niet_beoordeeld, true),
    per_pagina: Number.isFinite(perPagina) && perPagina >= 1
      ? Math.min(perPagina, MAX_PER_PAGINA)
      : STANDAARD_KWALITEIT_OPTIES.per_pagina,
  }
}

/** Serialiseert de keuzes naar de veldwaarde (JSON-tekst). */
export function serialiseerKwaliteitOpties(o: KwaliteitRapportOpties): string {
  return JSON.stringify(o)
}
