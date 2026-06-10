/**
 * CUF-XML Parser
 *
 * Converteert een CUF-XML string (Calculatie Uitwisselings Formaat) naar
 * interne Everts Calc datastructuren: Groep[], Calculatieregel[], Componentregel[].
 *
 * Gebruikt DOMParser — alleen client-side uitvoeren (browser).
 * CUF-formaat: XML-standaard van Ketenstandaard Bouw & Techniek.
 *
 * Ondersteunde root-elementen: <CUFRuil>, <CUF>, of andere root met <Begroting> of <Bundel>
 * Ondersteunde bundel-diepte: tot 3 niveaus (dieper wordt afgevlakt naar niveau 3)
 */

import type { Groep, Calculatieregel, Componentregel, Eenheid } from './types'
import { EENHEDEN } from './types'
import { nieuweId } from './utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Vind een direct kind-element op tagnaam (XML is case-sensitive). */
function vindKind(parent: Element, ...tagNames: string[]): Element | null {
  for (const tag of tagNames) {
    const kind = Array.from(parent.children).find(el => el.tagName === tag)
    if (kind) return kind
  }
  return null
}

/** Vind alle directe kind-elementen met een bepaalde tagnaam. */
function vindKinderen(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter(el => el.tagName === tagName)
}

/** Lees de tekstinhoud van het eerste gevonden kind-element. */
function leestekst(parent: Element, ...tagNames: string[]): string {
  const el = vindKind(parent, ...tagNames)
  return el?.textContent?.trim() ?? ''
}

/** Lees een numerieke waarde. Ondersteunt komma als decimaalteken. */
function leesGetal(parent: Element, ...tagNames: string[]): number {
  const txt = leestekst(parent, ...tagNames)
  if (!txt) return 0
  const n = parseFloat(txt.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** Map CUF-eenheden naar Everts Calc eenheden. */
function mapEenheid(cuf: string): Eenheid {
  const mapping: Record<string, Eenheid> = {
    'm2':  'm²',
    'm²':  'm²',
    'm1':  'm¹',
    'm¹':  'm¹',
    'm3':  'm³',
    'm³':  'm³',
    'st':  'st',
    'uur': 'uur',
    'dag': 'dag',
    'ltr': 'ltr',
    'kg':  'kg',
    'set': 'set',
    // Engelse varianten
    'pcs': 'st',
    'hr':  'uur',
    'h':   'uur',
  }
  const genormaliseerd = cuf.toLowerCase().trim()
  if (mapping[genormaliseerd]) return mapping[genormaliseerd]
  // Check of het al een geldige eenheid is
  if ((EENHEDEN as readonly string[]).includes(cuf)) return cuf as Eenheid
  return 'st'
}

/** Map CUF component-type naar interne ComponentType. */
function mapComponentType(type: string): 'arbeid' | 'materieel' | 'onderaanneming' | null {
  const t = type.toLowerCase()
  if (t.includes('arbeid') || t.includes('labor') || t.includes('labour') || t === 'a') return 'arbeid'
  if (t.includes('materiaal') || t.includes('materieel') || t.includes('material') || t === 'm') return 'materieel'
  if (t.includes('onderaannemer') || t.includes('onderaanneming') || t.includes('subcontract') || t === 'o') return 'onderaanneming'
  return null
}

// ─── Exporttype ───────────────────────────────────────────────────────────────

export interface CufParseResultaat {
  projectNaam: string
  projectNummer: string
  groepen: Groep[]
  calculatieregels: Calculatieregel[]
  componentregels: Componentregel[]
}

// ─── Hoofd parser ─────────────────────────────────────────────────────────────

/**
 * Parst een CUF-XML string en converteert naar interne datastructuren.
 * @param xmlString  Inhoud van het .xml bestand
 * @param scenarioId ID van het scenario waar de data aan gekoppeld wordt
 */
export function parseerCufXml(xmlString: string, scenarioId: string): CufParseResultaat {
  // Verwijder BOM (Byte Order Mark) als die aanwezig is
  const schoon = xmlString.replace(/^\uFEFF/, '').trim()

  const parser = new DOMParser()
  const doc = parser.parseFromString(schoon, 'application/xml')

  // Controleer op XML-parse fouten
  const foutEl = doc.querySelector('parsererror')
  if (foutEl) {
    throw new Error('Ongeldig XML-bestand: ' + (foutEl.textContent?.slice(0, 200) ?? 'parsefout'))
  }

  // Valideer of het een CUF-bestand is door te zoeken naar herkende structuren
  const root = doc.documentElement
  const heeftBegroting = !!vindKind(root, 'Begroting')
  const heeftBundel = heeftBegroting || vindKinderen(root, 'Bundel').length > 0
  if (!heeftBundel) {
    throw new Error('Dit lijkt geen CUF-bestand te zijn (geen <Begroting> of <Bundel> gevonden).')
  }

  // ─── Project metadata ────────────────────────────────────────────────────
  const projectEl = vindKind(root, 'Project')
  const projectNaam    = projectEl ? leestekst(projectEl, 'Naam', 'ProjectNaam', 'Name') : ''
  const projectNummer  = projectEl ? leestekst(projectEl, 'Nummer', 'ProjectNummer', 'Number', 'Code') : ''

  // ─── Resultaat-arrays ────────────────────────────────────────────────────
  const groepen:          Groep[]           = []
  const calculatieregels: Calculatieregel[] = []
  const componentregels:  Componentregel[]  = []

  // ─── Root bundels vinden ─────────────────────────────────────────────────
  // CUF kan bundels direct onder root, of onder <Begroting> hebben
  const begrotingEl = vindKind(root, 'Begroting') ?? root
  const rootBundels  = vindKinderen(begrotingEl, 'Bundel')

  // ─── Recursieve bundel-parser ─────────────────────────────────────────────
  function parseerBundel(
    bundelEl:  Element,
    niveau:    1 | 2 | 3,
    parentId:  string | null,
    volgorde:  number,
  ): void {
    const naam = leestekst(bundelEl, 'Omschrijving', 'Naam', 'Name', 'Description') || `Groep ${volgorde}`

    const groep: Groep = {
      id:          nieuweId(),
      scenario_id: scenarioId,
      parent_id:   parentId,
      naam,
      niveau,
      volgorde,
    }
    groepen.push(groep)

    // ─── Kind-bundels ─────────────────────────────────────────────────────
    const bundelContainer = vindKind(bundelEl, 'Bundels')
    const kindBundels     = bundelContainer ? vindKinderen(bundelContainer, 'Bundel') : []

    if (kindBundels.length > 0) {
      if (niveau < 3) {
        // Normaal: ga dieper in de hiërarchie
        kindBundels.forEach((kind, i) =>
          parseerBundel(kind, (niveau + 1) as 2 | 3, groep.id, i + 1)
        )
      } else {
        // Niveau 3 bereikt: voeg regels van diepere bundels samen in deze groep
        kindBundels.forEach(kind => {
          const diepereRegels = vindKind(kind, 'Regels')
          if (diepereRegels) {
            parseerRegels(vindKinderen(diepereRegels, 'Regel'), groep.id)
          }
        })
      }
    }

    // ─── Directe regels ───────────────────────────────────────────────────
    const regelsContainer = vindKind(bundelEl, 'Regels')
    if (regelsContainer) {
      parseerRegels(vindKinderen(regelsContainer, 'Regel'), groep.id)
    }
  }

  // ─── Regel-parser ────────────────────────────────────────────────────────
  function parseerRegels(regelEls: Element[], groepId: string): void {
    regelEls.forEach((regelEl, i) => {
      const omschrijving = leestekst(regelEl, 'Omschrijving', 'Naam', 'Name', 'Description')
      const eenheidRaw   = leestekst(regelEl, 'Eenheid', 'Unit', 'Eenh')
      const hoeveelheid  = leesGetal(regelEl, 'Hoeveelheid', 'Quantity', 'Aantal') || 1

      const regel: Calculatieregel = {
        id:           nieuweId(),
        groep_id:     groepId,
        omschrijving: omschrijving || `Regel ${i + 1}`,
        hoeveelheid,
        eenheid:      mapEenheid(eenheidRaw),
        volgorde:     calculatieregels.filter(r => r.groep_id === groepId).length + 1,
      }
      calculatieregels.push(regel)

      parseerComponenten(regelEl, regel.id)
    })
  }

  // ─── Component-parser ────────────────────────────────────────────────────
  function parseerComponenten(regelEl: Element, calculatieregel_id: string): void {
    // Variant A: <Componenten><Component type="Arbeid">...</Component></Componenten>
    const componentenEl = vindKind(regelEl, 'Componenten')
    if (componentenEl) {
      vindKinderen(componentenEl, 'Component').forEach(comp => {
        const typeAttr = comp.getAttribute('type') ?? comp.getAttribute('Type') ?? ''
        const componentType = mapComponentType(typeAttr)
        if (!componentType) return

        const norm      = leesGetal(comp, 'Norm', 'Normuren', 'NormUren', 'Hoeveelheid', 'Quantity')
        const tarief    = leesGetal(comp, 'Tarief', 'Prijs', 'Price', 'Rate', 'Uurtarief')
        const omschr    = leestekst(comp, 'Omschrijving', 'Naam', 'Name')
        const eenheidRaw = leestekst(comp, 'Eenheid', 'Unit')

        componentregels.push({
          id:                   nieuweId(),
          calculatieregel_id,
          type:                 componentType,
          norm_hoeveelheid:     norm,
          tarief,
          eenheid:              eenheidRaw ? mapEenheid(eenheidRaw) : undefined,
          omschrijving:         omschr || undefined,
        })
      })
      return
    }

    // Variant B: <Arbeid>, <Materiaal>, <Onderaannemer> als directe kinderen
    const arbeidEl = vindKind(regelEl, 'Arbeid', 'Labor', 'Labour')
    if (arbeidEl) {
      const norm   = leesGetal(arbeidEl, 'NormUren', 'Normuren', 'Norm', 'Uren', 'Hours')
      const tarief = leesGetal(arbeidEl, 'Tarief', 'Uurtarief', 'Rate', 'HourRate')
      if (norm > 0 || tarief > 0) {
        componentregels.push({
          id:               nieuweId(),
          calculatieregel_id,
          type:             'arbeid',
          norm_hoeveelheid: norm,
          tarief,
          eenheid:          'uur',
        })
      }
    }

    const materiaalEl = vindKind(regelEl, 'Materiaal', 'Material', 'Materieel')
    if (materiaalEl) {
      const norm   = leesGetal(materiaalEl, 'Hoeveelheid', 'Norm', 'Quantity')
      const tarief = leesGetal(materiaalEl, 'Prijs', 'Tarief', 'Price', 'Rate')
      const omschr = leestekst(materiaalEl, 'Omschrijving', 'Naam', 'Name')
      if (norm > 0 || tarief > 0) {
        componentregels.push({
          id:               nieuweId(),
          calculatieregel_id,
          type:             'materieel',
          norm_hoeveelheid: norm,
          tarief,
          omschrijving:     omschr || undefined,
        })
      }
    }

    const onderEl = vindKind(regelEl, 'Onderaannemer', 'Onderaanneming', 'Subcontractor')
    if (onderEl) {
      const norm   = leesGetal(onderEl, 'Hoeveelheid', 'Norm', 'Quantity')
      const tarief = leesGetal(onderEl, 'Prijs', 'Tarief', 'Price')
      const naam   = leestekst(onderEl, 'Naam', 'Name', 'Omschrijving')
      if (norm > 0 || tarief > 0) {
        componentregels.push({
          id:               nieuweId(),
          calculatieregel_id,
          type:             'onderaanneming',
          norm_hoeveelheid: norm,
          tarief,
          aannemersnaam:    naam || undefined,
        })
      }
    }
  }

  // ─── Start parsing ───────────────────────────────────────────────────────
  rootBundels.forEach((bundel, i) => parseerBundel(bundel, 1, null, i + 1))

  return { projectNaam, projectNummer, groepen, calculatieregels, componentregels }
}
