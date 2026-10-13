/**
 * behandeling-koppelen.ts — Eén behandeling uit de Schilderwerkbibliotheek in één keer
 * koppelen aan alle calculatieregels met dezelfde bestekscode.
 *
 * De opnemer legt in de meetstaat alleen vast wát er is, plus de bestekscode. Welke
 * behandeling daarbij hoort, beslist de calculator hier. Pure functies: het ophalen
 * van combinaties en het wegschrijven gebeurt in het venster zelf.
 */

import type { Calculatieregel, MeetregelAggregaat } from './types'
import { isTekstregel } from './types'
import type { SchilderCombinatie } from './services/schilderwerk'
import { calculatieregelOmschrijving, normaliseerBestekcode } from './meetstaat-utils'

/** Sleutel van de groep regels zonder bestekscode. */
export const ZONDER_CODE = ''

export interface CodeGroep {
  /** Genormaliseerde bestekscode; `ZONDER_CODE` voor regels zonder code. */
  code: string
  regels: Calculatieregel[]
  /** Unieke 'Onderdeel type'-labels, in volgorde van voorkomen. */
  onderdelen: string[]
  /** Unieke gekoppelde behandelingen; `null` = een regel zonder behandeling. */
  behandelingIds: (string | null)[]
}

/**
 * Alleen regels die uit de meetstaat komen doen mee. Handmatige regels (bouwplaats,
 * stelposten, tekstregels) hebben geen onderdeel en type, en mogen nooit per ongeluk
 * schildernormen krijgen omdat ze toevallig ook geen code hebben.
 */
export function groepeerPerBestekcode(
  regels: Calculatieregel[],
  aggregaten: MeetregelAggregaat[],
): CodeGroep[] {
  const aggPerId = new Map(aggregaten.map(a => [a.id, a]))
  const groepen = new Map<string, CodeGroep>()

  for (const r of regels) {
    if (isTekstregel(r) || !r.meetstaat_aggregaat_id) continue
    const code = normaliseerBestekcode(r.bestekcode)
    let g = groepen.get(code)
    if (!g) {
      g = { code, regels: [], onderdelen: [], behandelingIds: [] }
      groepen.set(code, g)
    }
    g.regels.push(r)

    const agg = aggPerId.get(r.meetstaat_aggregaat_id)
    const label = agg ? `${agg.onderdeel} ${agg.type}`.trim() : r.omschrijving
    if (label && !g.onderdelen.includes(label)) g.onderdelen.push(label)

    const beh = r.schilderbehandeling_id ?? null
    if (!g.behandelingIds.includes(beh)) g.behandelingIds.push(beh)
  }

  // Codes op volgorde (S-2 vóór S-10); de groep zonder code als laatste.
  return Array.from(groepen.values()).sort((a, b) => {
    if (a.code === ZONDER_CODE) return 1
    if (b.code === ZONDER_CODE) return -1
    return a.code.localeCompare(b.code, 'nl', { numeric: true })
  })
}

export interface KoppelStap {
  regel: Calculatieregel
  /** De regel zoals hij na het koppelen wordt opgeslagen. */
  nieuw: Calculatieregel
  /** Combinatie onderdeel/type/behandeling uit de bibliotheek; `null` = bestaat niet. */
  combinatie: SchilderCombinatie | null
  /** Leesbaar label voor meldingen ('Boeideel hout >20cm'). */
  label: string
}

/**
 * Bepaalt per regel wat het koppelen doet. Bestaat de combinatie, dan komen de normen
 * uit de bibliotheek. Bestaat hij niet, dan krijgt de regel wel de behandeling (de
 * tekst), maar houdt hij zijn normen en wordt hij gemarkeerd zodat hij opvalt.
 */
export function planKoppeling(
  regels: Calculatieregel[],
  aggregaten: MeetregelAggregaat[],
  combinatiesPerType: Map<string, SchilderCombinatie[]>,
  behandeling: { id: string; naam: string },
): KoppelStap[] {
  const aggPerId = new Map(aggregaten.map(a => [a.id, a]))

  return regels.map(regel => {
    const agg = regel.meetstaat_aggregaat_id ? aggPerId.get(regel.meetstaat_aggregaat_id) : undefined
    const combinatie = agg?.type_id
      ? (combinatiesPerType.get(agg.type_id) ?? []).find(c => c.behandeling_id === behandeling.id) ?? null
      : null

    const nieuw: Calculatieregel = {
      ...regel,
      schilderbehandeling_id: behandeling.id,
      schilderbehandeling: undefined,
      omschrijving: agg
        ? calculatieregelOmschrijving(agg.onderdeel, agg.type, behandeling.naam, regel.bestekcode)
        : regel.omschrijving,
      gemarkeerd: combinatie ? regel.gemarkeerd : true,
    }

    const label = agg ? `${agg.onderdeel} ${agg.type}`.trim() : regel.omschrijving
    return { regel, nieuw, combinatie, label }
  })
}

/** De type_id's waarvan de combinaties nodig zijn om deze regels te plannen. */
export function benodigdeTypeIds(regels: Calculatieregel[], aggregaten: MeetregelAggregaat[]): string[] {
  const aggPerId = new Map(aggregaten.map(a => [a.id, a]))
  const ids = new Set<string>()
  for (const r of regels) {
    const typeId = r.meetstaat_aggregaat_id ? aggPerId.get(r.meetstaat_aggregaat_id)?.type_id : undefined
    if (typeId) ids.add(typeId)
  }
  return Array.from(ids)
}
