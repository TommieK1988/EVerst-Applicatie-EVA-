/**
 * CUF-XML Parser
 *
 * Converteert een CUF-XML string (Calculatie Uitwisselings Formaat) naar
 * interne Everts Calc datastructuren: Groep[], Calculatieregel[], Componentregel[].
 *
 * Ondersteunt het officiële CUF-formaat (Ketenstandaard Bouw & Techniek):
 *   - Uppercase tagnamen:  <CUF>, <BEGROTING>, <BUNDELING>, <BEGROTINGSREGEL>
 *   - Data als XML-attributen: OMSCHRIJVING="...", HOEVEELHEID="...", etc.
 *
 * Ondersteunt ook legacy/alternatieve formaten met mixed-case tagnamen en
 * tekstinhoud in kind-elementen.
 *
 * Gebruikt DOMParser — alleen client-side uitvoeren (browser).
 */

import type { Groep, Calculatieregel, Componentregel, Eenheid } from './types'
import { EENHEDEN } from './types'
import { nieuweId } from './utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Vind alle directe kind-elementen met een bepaalde tagnaam. */
function vindKinderen(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter(el => el.tagName === tagName)
}

/** Vind één direct kind-element op tagnaam (geeft null als niet gevonden). */
function vindKind(parent: Element, ...tagNames: string[]): Element | null {
  for (const tag of tagNames) {
    const kind = Array.from(parent.children).find(el => el.tagName === tag)
    if (kind) return kind
  }
  return null
}

/** Lees een attribuut als string; probeert meerdere namen, neemt eerste treffer. */
function attr(el: Element, ...namen: string[]): string {
  for (const naam of namen) {
    const waarde = el.getAttribute(naam)
    if (waarde !== null) return waarde.trim()
  }
  return ''
}

/** Lees een attribuut als getal. Ondersteunt komma als decimaalteken. */
function attrGetal(el: Element, ...namen: string[]): number {
  const txt = attr(el, ...namen)
  if (!txt) return 0
  const n = parseFloat(txt.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** Lees de tekstinhoud van het eerste gevonden kind-element (legacy-formaat). */
function leestekst(parent: Element, ...tagNames: string[]): string {
  const el = vindKind(parent, ...tagNames)
  return el?.textContent?.trim() ?? ''
}

/** Lees een numerieke waarde uit een kind-element (legacy-formaat). */
function leesGetal(parent: Element, ...tagNames: string[]): number {
  const txt = leestekst(parent, ...tagNames)
  if (!txt) return 0
  const n = parseFloat(txt.replace(',', '.'))
  return isNaN(n) ? 0 : n
}

/** Map CUF-eenheden naar Everts Calc eenheden. */
function mapEenheid(cuf: string): Eenheid {
  const mapping: Record<string, Eenheid> = {
    'm2':   'm²',
    'm²':   'm²',
    'm1':   'm¹',
    'm¹':   'm¹',
    'm3':   'm³',
    'm³':   'm³',
    'st':   'st',
    'stk':  'st',
    'stuks':'st',
    'uur':  'uur',
    'uren': 'uur',
    'hr':   'uur',
    'h':    'uur',
    'dag':  'dag',
    'dagen':'dag',
    'ltr':  'ltr',
    'l':    'ltr',
    'kg':   'kg',
    'set':  'set',
    'pcs':  'st',
    'nvt':  'st',   // niet van toepassing → st als fallback
    '':     'st',
  }
  const gen = cuf.toLowerCase().trim()
  if (mapping[gen] !== undefined) return mapping[gen]
  if ((EENHEDEN as readonly string[]).includes(cuf)) return cuf as Eenheid
  return 'st'
}

// ─── Exporttype ───────────────────────────────────────────────────────────────

export interface CufParseResultaat {
  projectNaam:      string
  projectNummer:    string
  groepen:          Groep[]
  calculatieregels: Calculatieregel[]
  componentregels:  Componentregel[]
}

// ─── Hoofd parser ─────────────────────────────────────────────────────────────

/**
 * Parst een CUF-XML string en converteert naar interne datastructuren.
 * @param xmlString  Inhoud van het .xml bestand
 * @param scenarioId ID van het scenario waar de data aan gekoppeld wordt
 */
export function parseerCufXml(
  xmlString:  string,
  scenarioId: string,
  bron:       'calc4you' | 'gilde' = 'calc4you',
  opslagPct:  number = 0,
): CufParseResultaat {
  // Verwijder BOM (Byte Order Mark) als die aanwezig is
  const schoon = xmlString.replace(/^\uFEFF/, '').trim()

  const parser = new DOMParser()
  const doc = parser.parseFromString(schoon, 'application/xml')

  // Controleer op XML-parse fouten
  const foutEl = doc.querySelector('parsererror')
  if (foutEl) {
    throw new Error('Ongeldig XML-bestand: ' + (foutEl.textContent?.slice(0, 200) ?? 'parsefout'))
  }

  const root = doc.documentElement

  // ─── Detecteer formaat ────────────────────────────────────────────────────
  // Officieel CUF heeft <BEGROTING> als uppercase kind van root
  const heeftUppercaseBegroting = vindKinderen(root, 'BEGROTING').length > 0

  if (heeftUppercaseBegroting) {
    // Gilde: prijzen zijn al kostprijzen → opslagFactor nooit toepassen
    const effectiefOpslagPct = bron === 'gilde' ? 0 : opslagPct
    return parseerOfficieelCuf(root, scenarioId, effectiefOpslagPct)
  }

  // Legacy: mixed-case tags (<Begroting>, <Bundel>, etc.)
  const heeftLegacyBegroting = vindKind(root, 'Begroting') !== null
  const heeftLegacyBundel    = vindKinderen(root, 'Bundel').length > 0

  if (heeftLegacyBegroting || heeftLegacyBundel) {
    return parseerLegacyCuf(root, scenarioId)
  }

  throw new Error(
    'Dit lijkt geen CUF-bestand te zijn (geen <BEGROTING> of <Begroting> gevonden). ' +
    `Root-element: <${root.tagName}>`
  )
}

// ─── Officieel CUF-formaat (uppercase tags, attribute-based) ──────────────────

function parseerOfficieelCuf(root: Element, scenarioId: string, opslagPct: number): CufParseResultaat {
  // In Calc4You CUF zijn ALLE prijzen verkoopprijzen (incl. opslag).
  // Om de netto kostprijs te krijgen moeten we terugrekenen: kostprijs = verkoopprijs / (1 + opslag/100)
  // UUR_NORM is bruto uren (netto × opslag_factor); UUR_TARIEF is het netto tarief.
  // Zo is: UUR_NORM × UUR_TARIEF = bruto_uren × netto_tarief = verkoopprijs_arbeid
  const opslagFactor = opslagPct > 0 ? 1 + opslagPct / 100 : 1
  const groepen:          Groep[]           = []
  const calculatieregels: Calculatieregel[] = []
  const componentregels:  Componentregel[]  = []

  // ─── Project metadata ────────────────────────────────────────────────────
  const pgEl        = vindKinderen(root, 'PROJECTGEGEVENS')[0] ?? null
  const projectNaam   = pgEl ? attr(pgEl, 'PROJECTNAAM', 'NAAM') : ''
  const projectNummer = pgEl ? attr(pgEl, 'PROJECTNUMMER', 'NUMMER', 'CODE') : ''

  // ─── Begroting vinden ────────────────────────────────────────────────────
  const begrotingEl = vindKinderen(root, 'BEGROTING')[0]
  if (!begrotingEl) {
    throw new Error('Geen <BEGROTING> element gevonden in CUF-bestand.')
  }

  // ─── Recursieve bundeling-parser ─────────────────────────────────────────
  function parseerBundeling(
    el:        Element,
    niveau:    1 | 2 | 3,
    parentId:  string | null,
    volgorde:  number,
  ): void {
    const naam = attr(el, 'OMSCHRIJVING', 'NAAM', 'CODE') || `Groep ${volgorde}`

    const groep: Groep = {
      id:          nieuweId(),
      scenario_id: scenarioId,
      parent_id:   parentId,
      naam,
      niveau,
      volgorde,
    }
    groepen.push(groep)

    // Kind-bundelingen
    // Max. 2 groepniveaus bij CUF-import: niveau 1 → maakt niveau 2 kinderen aan;
    // niveau 2 → flatslaan, regels direct aan huidige groep hangen (geen niveau 3 groepen).
    const kindBundelingen = vindKinderen(el, 'BUNDELING')
    if (kindBundelingen.length > 0) {
      if (niveau < 2) {
        kindBundelingen.forEach((kind, i) =>
          parseerBundeling(kind, 2, groep.id, i + 1)
        )
      } else {
        // Niveau 2 of dieper: afvlakken — regels van diepere bundelingen samenvoegen in huidige groep
        kindBundelingen.forEach(kind => {
          parseerBegrotingsregels(kind, groep.id)
          // Nog een niveau dieper (bijv. Gilde 4-laags: Kavel>Titel>code>regel)
          vindKinderen(kind, 'BUNDELING').forEach(dieper => {
            parseerBegrotingsregels(dieper, groep.id)
          })
        })
      }
    }

    // Directe begrotingsregels van deze bundeling
    parseerBegrotingsregels(el, groep.id)
  }

  // ─── Begrotingsregels verwerken ───────────────────────────────────────────
  function parseerBegrotingsregels(bundelingEl: Element, groepId: string): void {
    vindKinderen(bundelingEl, 'BEGROTINGSREGEL').forEach((rEl, i) => {
      // Gilde CUF: tekst-/commentaarregels hebben <SORTEERCODE> kind-elementen
      // én hebben geen pricing-attributen — sla deze over
      const heeftSorteercode = vindKinderen(rEl, 'SORTEERCODE').length > 0
      const heeftPrijs = (
        attrGetal(rEl, 'UUR_NORM', 'UURSNORM', 'NORMENUUR') > 0 ||
        attrGetal(rEl, 'UUR_TARIEF', 'UURTARIEF') > 0 ||
        attrGetal(rEl, 'MATERIAALPRIJS', 'MATERIAAL_PRIJS') > 0 ||
        attrGetal(rEl, 'MATERIEELPRIJS', 'MATERIEEL_PRIJS') > 0 ||
        attrGetal(rEl, 'ONDERAANNEMINGSPRIJS', 'ONDERAANNEMER_PRIJS', 'ONDERAANNEMING') > 0
      )
      if (heeftSorteercode && !heeftPrijs) return

      const omschrijving     = attr(rEl, 'OMSCHRIJVING', 'NAAM', 'CODE')
      const eenheidRaw       = attr(rEl, 'HOEVEELHEID_EENHEID', 'EENHEID', 'UNIT')
      const hoeveelheid      = attrGetal(rEl, 'HOEVEELHEID', 'AANTAL', 'QUANTITY') || 1
      const btwPct           = attrGetal(rEl, 'BTW', 'BTW_PCT', 'BTW_PERCENTAGE')
      // HOEVEELHEID_FACTOR=0 → stelpost (Calc4You); STELPOST="1" → stelpost (Gilde)
      const hoeveelheidFactor = attr(rEl, 'HOEVEELHEID_FACTOR')
      const stelpostAttr      = attr(rEl, 'STELPOST')
      const isStelpost        = (hoeveelheidFactor !== '' && parseFloat(hoeveelheidFactor) === 0)
                             || stelpostAttr === '1'

      const regelVolgorde = calculatieregels.filter(r => r.groep_id === groepId).length + 1

      const regel: Calculatieregel = {
        id:           nieuweId(),
        groep_id:     groepId,
        omschrijving: omschrijving || `Regel ${i + 1}`,
        hoeveelheid,
        eenheid:      mapEenheid(eenheidRaw),
        volgorde:     regelVolgorde,
        ...(btwPct > 0 ? { btw_pct: btwPct } : {}),
        ...(isStelpost ? { is_stelpost: true } : {}),
        ...(opslagPct > 0 ? { opslag_pct: opslagPct } : {}),
      }
      calculatieregels.push(regel)

      // ─── Arbeid ──────────────────────────────────────────────────────────
      // In Calc4You CUF: UUR_NORM = bruto uren/eenheid (netto × opslag_factor)
      // UUR_TARIEF = netto tarief (kostprijs per uur)
      // Kostprijs arbeid/eenheid = (UUR_NORM / opslag_factor) × UUR_TARIEF
      const uurNormBruto = attrGetal(rEl, 'UUR_NORM', 'UURSNORM', 'NORMENUUR')
      const uurTarief    = attrGetal(rEl, 'UUR_TARIEF', 'UURTARIEF', 'LOONKOSTEN_TARIEF')
      const uurNormNetto = uurNormBruto > 0 ? uurNormBruto / opslagFactor : uurNormBruto
      if (uurNormBruto > 0 || uurTarief > 0) {
        componentregels.push({
          id:                 nieuweId(),
          calculatieregel_id: regel.id,
          type:               'arbeid',
          norm_hoeveelheid:   uurNormNetto,
          tarief:             uurTarief,
          eenheid:            'uur',
        })
      }

      // ─── Materiaal ───────────────────────────────────────────────────────
      // MATERIAALPRIJS = verkoopprijs per eenheid (inkoop × opslag_factor)
      // Kostprijs = MATERIAALPRIJS / opslag_factor
      const materiaalVP = attrGetal(rEl, 'MATERIAALPRIJS', 'MATERIAAL_PRIJS')
      if (materiaalVP > 0) {
        componentregels.push({
          id:                 nieuweId(),
          calculatieregel_id: regel.id,
          type:               'materieel',
          norm_hoeveelheid:   1,
          tarief:             materiaalVP / opslagFactor,
          omschrijving:       'Materiaal',
        })
      }

      // ─── Materieel/gereedschap ───────────────────────────────────────────
      const materieelVP = attrGetal(rEl, 'MATERIEELPRIJS', 'MATERIEEL_PRIJS')
      if (materieelVP > 0) {
        componentregels.push({
          id:                 nieuweId(),
          calculatieregel_id: regel.id,
          type:               'materieel',
          norm_hoeveelheid:   1,
          tarief:             materieelVP / opslagFactor,
          omschrijving:       'Materieel',
        })
      }

      // ─── Onderaanneming ──────────────────────────────────────────────────
      // ONDERAANNEMINGSPRIJS = verkoopprijs (OA-kostprijs × opslag_factor)
      const onderVP = attrGetal(rEl, 'ONDERAANNEMINGSPRIJS', 'ONDERAANNEMER_PRIJS', 'ONDERAANNEMING')
      if (onderVP > 0) {
        componentregels.push({
          id:                 nieuweId(),
          calculatieregel_id: regel.id,
          type:               'onderaanneming',
          norm_hoeveelheid:   1,
          tarief:             onderVP / opslagFactor,
        })
      }
    })
  }

  // ─── Start parsing ───────────────────────────────────────────────────────
  const rootBundelingen = vindKinderen(begrotingEl, 'BUNDELING')
  rootBundelingen.forEach((bundeling, i) =>
    parseerBundeling(bundeling, 1, null, i + 1)
  )

  // Fallback: begrotingsregels direct onder BEGROTING (geen BUNDELING)
  if (groepen.length === 0) {
    const standaardGroep: Groep = {
      id:          nieuweId(),
      scenario_id: scenarioId,
      parent_id:   null,
      naam:        'Algemeen',
      niveau:      1,
      volgorde:    1,
    }
    groepen.push(standaardGroep)
    parseerBegrotingsregels(begrotingEl, standaardGroep.id)
  }

  return { projectNaam, projectNummer, groepen, calculatieregels, componentregels }
}

// ─── Legacy CUF-formaat (mixed-case tags, child-element-based) ────────────────

function parseerLegacyCuf(root: Element, scenarioId: string): CufParseResultaat {
  const groepen:          Groep[]           = []
  const calculatieregels: Calculatieregel[] = []
  const componentregels:  Componentregel[]  = []

  // Project metadata
  const projectEl    = vindKind(root, 'Project')
  const projectNaam   = projectEl ? leestekst(projectEl, 'Naam', 'ProjectNaam', 'Name') : ''
  const projectNummer = projectEl ? leestekst(projectEl, 'Nummer', 'ProjectNummer', 'Number', 'Code') : ''

  // Root bundels: direct onder root of onder <Begroting>
  const begrotingEl  = vindKind(root, 'Begroting') ?? root
  const rootBundels  = vindKinderen(begrotingEl, 'Bundel')

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

    // Kind-bundels
    const bundelContainer = vindKind(bundelEl, 'Bundels')
    const kindBundels     = bundelContainer ? vindKinderen(bundelContainer, 'Bundel') : vindKinderen(bundelEl, 'Bundel')

    if (kindBundels.length > 0) {
      if (niveau < 3) {
        kindBundels.forEach((kind, i) =>
          parseerBundel(kind, (niveau + 1) as 2 | 3, groep.id, i + 1)
        )
      } else {
        // Niveau 3: afvlakken
        kindBundels.forEach(kind => {
          const regelsEl = vindKind(kind, 'Regels')
          if (regelsEl) parseerRegels(vindKinderen(regelsEl, 'Regel'), groep.id)
          else          parseerRegels(vindKinderen(kind, 'Regel'), groep.id)
        })
      }
    }

    // Directe regels
    const regelsContainer = vindKind(bundelEl, 'Regels')
    if (regelsContainer) {
      parseerRegels(vindKinderen(regelsContainer, 'Regel'), groep.id)
    } else {
      parseerRegels(vindKinderen(bundelEl, 'Regel'), groep.id)
    }
  }

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

      // Componenten
      const componentenEl = vindKind(regelEl, 'Componenten')
      if (componentenEl) {
        vindKinderen(componentenEl, 'Component').forEach(comp => {
          const typeAttr = comp.getAttribute('type') ?? comp.getAttribute('Type') ?? ''
          const t = typeAttr.toLowerCase()
          let type: 'arbeid' | 'materieel' | 'onderaanneming' | null = null
          if (t.includes('arbeid') || t.includes('labor') || t === 'a') type = 'arbeid'
          else if (t.includes('materiaal') || t.includes('materieel') || t.includes('material') || t === 'm') type = 'materieel'
          else if (t.includes('onderaannemer') || t.includes('onderaanneming') || t.includes('subcontract') || t === 'o') type = 'onderaanneming'
          if (!type) return

          componentregels.push({
            id:                 nieuweId(),
            calculatieregel_id: regel.id,
            type,
            norm_hoeveelheid:   leesGetal(comp, 'Norm', 'Normuren', 'Hoeveelheid', 'Quantity'),
            tarief:             leesGetal(comp, 'Tarief', 'Prijs', 'Price', 'Rate', 'Uurtarief'),
            omschrijving:       leestekst(comp, 'Omschrijving', 'Naam', 'Name') || undefined,
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
            id:                 nieuweId(),
            calculatieregel_id: regel.id,
            type:               'arbeid',
            norm_hoeveelheid:   norm,
            tarief,
            eenheid:            'uur',
          })
        }
      }

      const materiaalEl = vindKind(regelEl, 'Materiaal', 'Material', 'Materieel')
      if (materiaalEl) {
        const norm   = leesGetal(materiaalEl, 'Hoeveelheid', 'Norm', 'Quantity')
        const tarief = leesGetal(materiaalEl, 'Prijs', 'Tarief', 'Price', 'Rate')
        if (norm > 0 || tarief > 0) {
          componentregels.push({
            id:                 nieuweId(),
            calculatieregel_id: regel.id,
            type:               'materieel',
            norm_hoeveelheid:   norm,
            tarief,
            omschrijving:       leestekst(materiaalEl, 'Omschrijving', 'Naam', 'Name') || undefined,
          })
        }
      }

      const onderEl = vindKind(regelEl, 'Onderaannemer', 'Onderaanneming', 'Subcontractor')
      if (onderEl) {
        const norm   = leesGetal(onderEl, 'Hoeveelheid', 'Norm', 'Quantity')
        const tarief = leesGetal(onderEl, 'Prijs', 'Tarief', 'Price')
        if (norm > 0 || tarief > 0) {
          componentregels.push({
            id:                 nieuweId(),
            calculatieregel_id: regel.id,
            type:               'onderaanneming',
            norm_hoeveelheid:   norm,
            tarief,
            aannemersnaam:      leestekst(onderEl, 'Naam', 'Name', 'Omschrijving') || undefined,
          })
        }
      }
    })
  }

  rootBundels.forEach((bundel, i) => parseerBundel(bundel, 1, null, i + 1))

  return { projectNaam, projectNummer, groepen, calculatieregels, componentregels }
}
