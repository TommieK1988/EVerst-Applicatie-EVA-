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

/** Code van regels zonder bestekscode. */
export const ZONDER_CODE = ''

/**
 * Eén post om een behandeling aan te koppelen: hetzelfde onderdeel en type, en
 * daarbinnen dezelfde bestekscode. Kozijnen en boeidelen met code S-01 zijn twee
 * posten: een behandeling hoort bij een onderdeel/type (daar hangen de normen aan),
 * de code verfijnt dat alleen. Over groepen (locaties) heen tellen ze wel samen.
 */
export interface CodeGroep {
  /** Unieke sleutel: onderdeel::type::code, in kleine letters. */
  sleutel: string
  onderdeel: string
  type: string
  /** Type in de schilderwerkbibliotheek (daar hangen de normen aan), indien bekend. */
  typeId?: string
  /** Genormaliseerde bestekscode; `ZONDER_CODE` voor regels zonder code. */
  code: string
  regels: Calculatieregel[]
  /** Opgetelde hoeveelheid per eenheid (meestal één), voor een gevoel bij de post en om uitschieters te zien. */
  totalen: { eenheid: string; hoeveelheid: number }[]
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
    const agg = aggPerId.get(r.meetstaat_aggregaat_id)
    // Zonder aggregaat (meetstaat verwijderd) blijft alleen de omschrijving over.
    const onderdeel = (agg ? agg.onderdeel : r.omschrijving).trim()
    const type = (agg?.type ?? '').trim()
    const code = normaliseerBestekcode(r.bestekcode)
    const sleutel = `${onderdeel.toLowerCase()}::${type.toLowerCase()}::${code}`

    let g = groepen.get(sleutel)
    if (!g) {
      g = { sleutel, onderdeel, type, typeId: agg?.type_id, code, regels: [], totalen: [], behandelingIds: [] }
      groepen.set(sleutel, g)
    }
    g.regels.push(r)

    const totaal = g.totalen.find(t => t.eenheid === r.eenheid)
    if (totaal) totaal.hoeveelheid = +(totaal.hoeveelheid + r.hoeveelheid).toFixed(4)
    else g.totalen.push({ eenheid: r.eenheid, hoeveelheid: r.hoeveelheid })

    const beh = r.schilderbehandeling_id ?? null
    if (!g.behandelingIds.includes(beh)) g.behandelingIds.push(beh)
  }

  // Op onderdeel en type; daarbinnen codes op volgorde (S-2 vóór S-10) en zonder code als laatste.
  const vergelijk = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true })
  return Array.from(groepen.values()).sort((a, b) =>
    vergelijk(a.onderdeel, b.onderdeel)
    || vergelijk(a.type, b.type)
    || (a.code === ZONDER_CODE ? 1 : 0) - (b.code === ZONDER_CODE ? 1 : 0)
    || vergelijk(a.code, b.code))
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
 * Bepaalt per regel wat het koppelen doet. Bestaat de combinatie, dan kunnen de normen
 * uit de bibliotheek komen. Bestaat hij niet, dan krijgt de regel wel de behandeling (de
 * tekst) en houdt hij zijn normen; het rekenblad toont dan "geen normen" bij het label.
 * Niet markeren: de markering (⚑) is van de calculator, voor wat híj nog moet uitzoeken.
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
      // Alleen een omschrijving die EVA zelf uit de meetstaat maakte, krijgt de nieuwe
      // naam; eigen tekst van de calculator blijft staan (het label en de offerte tonen
      // de behandeling er dan achter). De code staat in zijn eigen kolom.
      omschrijving: agg && isMeetstaatOmschrijving(regel.omschrijving, agg.onderdeel, agg.type)
        ? calculatieregelOmschrijving(agg.onderdeel, agg.type, behandeling.naam)
        : regel.omschrijving,
    }

    const label = agg ? `${agg.onderdeel} ${agg.type}`.trim() : regel.omschrijving
    return { regel, nieuw, combinatie, label }
  })
}

/**
 * Is dit de omschrijving die de meetstaat-sync maakte ("Kozijn hout - 10-20cm", met of
 * zonder " : behandeling" en een oude " [code]"), of nog leeg? Dan mag koppelen hem bijwerken.
 */
export function isMeetstaatOmschrijving(omschrijving: string, onderdeel: string, type: string): boolean {
  const basis = calculatieregelOmschrijving(onderdeel, type, '').toLowerCase()
  const tekst = omschrijving.replace(/\s\[[^\]]*\]/g, '').trim().toLowerCase()
  return !tekst || tekst === basis || tekst.startsWith(`${basis} : `)
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

/**
 * Heeft de bibliotheek normen voor deze behandeling op het onderdeel/type van de regel?
 * `null` als dat niet te zeggen is: een regel die niet uit de meetstaat komt (geen type),
 * of de combinaties zijn nog niet geladen.
 */
export function heeftBibliotheekNormen(
  typeId: string | undefined,
  behandelingId: string,
  combinaties: { type_id: string; behandeling_id: string }[] | null,
): boolean | null {
  if (!typeId || !combinaties) return null
  return combinaties.some(c => c.type_id === typeId && c.behandeling_id === behandelingId)
}
