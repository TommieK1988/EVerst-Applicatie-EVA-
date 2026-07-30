/**
 * houtrot-opties.ts
 *
 * De keuzes die bij het opstellen van een houtrot-rapportage worden gemaakt, plus
 * de grenzen die er uit volgen. Bewust client-veilig (géén server-only imports):
 * de optie-picker in de genereermodal, de demo-context én de server-side
 * contextbouwer gebruiken dezelfde definities.
 */

import { MAX_DIEPTE } from '@/lib/houtrotherstel/locatie-boom'

export interface HoutrotRapportOpties {
  /** Aantal registraties per pagina. Hoort bij de indeling van het Word-sjabloon. */
  per_pagina: number
  /** Diepte waarop het totaalblad groepeert; -1 = geen groepering. */
  niveau: number
  /** Statussen die mee mogen; leeg = alle. */
  statussen: string[]
  /** Alleen registraties onder deze boomknoop; null = alles. */
  tak_node_id: string | null
  toon_prijzen: boolean
  /** Elke groep op een nieuwe pagina laten beginnen. */
  pagina_per_groep: boolean
}

/** Sleutel van het invoerveld (type `houtrot_opties`) waar de keuzes in staan. */
export const HOUTROT_OPTIES_SLEUTEL = 'houtrot'

export const STANDAARD_OPTIES: HoutrotRapportOpties = {
  per_pagina: 3,
  niveau: 0,
  statussen: [],
  tak_node_id: null,
  toon_prijzen: true,
  pagina_per_groep: false,
}

/** Boven dit aantal weigert de rapportage; de gebruiker moet zijn filter aanscherpen. */
export const MAX_REGISTRATIES = 150
/** Waarschuwingsgrens voor de UI (blokkeert niet). */
export const WAARSCHUW_REGISTRATIES = 75
/** Bovengrens voor het invulveld; meer dan dit past nooit op één pagina. */
export const MAX_PER_PAGINA = 20

/**
 * Max-kader (px @96dpi) waarbinnen een rapportagefoto wordt geschaald. `fitSize`
 * vergroot nooit en vervormt nooit, dus dit is tevens de gegarandeerde maximale
 * fotohoogte — de basis onder "een vast aantal registraties per pagina".
 */
export const RAPPORT_FOTO_MAX = { w: 180, h: 135 }

/** XML van een handmatige paginabreuk — de waarde van {@paginabreuk}. */
export const PAGINABREUK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

/**
 * Leest de optie-JSON uit een invoerwaarde. Onleesbaar of afwezig → de standaarden,
 * zodat een sjabloon ook rendert wanneer de beheerder het veld niet heeft toegevoegd.
 */
export function parseRapportOpties(ruw: unknown): HoutrotRapportOpties {
  let obj: Record<string, unknown> = {}
  if (ruw && typeof ruw === 'object') obj = ruw as Record<string, unknown>
  else if (typeof ruw === 'string' && ruw.trim().startsWith('{')) {
    try { obj = JSON.parse(ruw) as Record<string, unknown> } catch { obj = {} }
  }

  const perPagina = Math.round(Number(obj.per_pagina))
  const niveau = Math.round(Number(obj.niveau))
  const vlag = (v: unknown, standaard: boolean) =>
    v === undefined || v === null || v === '' ? standaard : v !== false && v !== 'false'

  return {
    per_pagina: Number.isFinite(perPagina) && perPagina >= 1
      ? Math.min(perPagina, MAX_PER_PAGINA)
      : STANDAARD_OPTIES.per_pagina,
    niveau: Number.isFinite(niveau) && niveau >= -1 && niveau < MAX_DIEPTE ? niveau : STANDAARD_OPTIES.niveau,
    statussen: Array.isArray(obj.statussen) ? obj.statussen.map(String).filter(Boolean) : [],
    tak_node_id: obj.tak_node_id ? String(obj.tak_node_id) : null,
    toon_prijzen: vlag(obj.toon_prijzen, true),
    pagina_per_groep: vlag(obj.pagina_per_groep, false),
  }
}

/** Serialiseert de keuzes naar de veldwaarde (JSON-tekst). */
export function serialiseerRapportOpties(o: HoutrotRapportOpties): string {
  return JSON.stringify(o)
}
