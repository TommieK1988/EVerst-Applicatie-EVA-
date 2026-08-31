/**
 * CUF-XML Serializer
 *
 * Converteert interne Everts Calc datastructuren naar een CUF-XML string
 * (Calculatie Uitwisselings Formaat, versie 2.0).
 *
 * Het gegenereerde XML-bestand kan worden ingelezen door o.a.:
 * Ibis Calculeren, AFAS, 2Jours, Acto Calculatie, Admicom, InfraCalc.
 */

import type { Groep, Calculatieregel, Componentregel, Scenario } from './types'
import { scenarioDefaultOpslag } from './calculations'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Escape speciale XML-tekens in tekst. */
function xe(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;')
}

/** Map interne eenheden naar CUF-eenheden. */
function mapEenheidNaarCuf(eenheid: string): string {
  const map: Record<string, string> = {
    'm²': 'm2',
    'm¹': 'm1',
    'm³': 'm3',
  }
  return map[eenheid] ?? eenheid
}

/** Bereken kostprijs per eenheid op basis van componentregels. */
function berekenKostprijs(
  calculatieregel_id: string,
  componentregels: Componentregel[],
): number {
  return componentregels
    .filter(c => c.calculatieregel_id === calculatieregel_id)
    .reduce((s, c) => s + c.norm_hoeveelheid * c.tarief, 0)
}

// ─── Render-functies ────────────────────────────────────────────────────────

function renderComponenten(
  calculatieregel_id: string,
  componentregels: Componentregel[],
  indent: string,
): string {
  const comps = componentregels.filter(c => c.calculatieregel_id === calculatieregel_id)
  if (comps.length === 0) return ''

  const typeLabel = (type: string) =>
    type === 'arbeid'          ? 'Arbeid'
    : type === 'materieel'     ? 'Materiaal'
    : 'Onderaannemer'

  const compXml = comps.map(c => {
    const eenheid = c.eenheid ?? (c.type === 'arbeid' ? 'uur' : 'st')
    return [
      `${indent}  <Component type="${typeLabel(c.type)}">`,
      `${indent}    <Omschrijving>${xe(c.omschrijving ?? typeLabel(c.type))}</Omschrijving>`,
      `${indent}    <Norm>${c.norm_hoeveelheid.toFixed(4)}</Norm>`,
      `${indent}    <Eenheid>${mapEenheidNaarCuf(eenheid)}</Eenheid>`,
      `${indent}    <Tarief>${c.tarief.toFixed(2)}</Tarief>`,
      `${indent}  </Component>`,
    ].join('\n')
  }).join('\n')

  return `\n${indent}<Componenten>\n${compXml}\n${indent}</Componenten>`
}

function renderRegels(
  groepId: string,
  calculatieregels: Calculatieregel[],
  componentregels: Componentregel[],
  scenario: Scenario,
  indent: string,
): string {
  const regels = calculatieregels
    .filter(r => r.groep_id === groepId)
    .sort((a, b) => a.volgorde - b.volgorde)

  if (regels.length === 0) return ''

  const opslag_pct = scenarioDefaultOpslag(scenario) / 100

  const regelXml = regels.map(r => {
    const kp_pe = berekenKostprijs(r.id, componentregels)
    const eigen_opslag = r.opslag_pct != null ? r.opslag_pct / 100 : opslag_pct
    const vp_pe = kp_pe * (1 + eigen_opslag)
    const compsXml = renderComponenten(r.id, componentregels, indent + '    ')

    return [
      `${indent}  <Regel>`,
      `${indent}    <Omschrijving>${xe(r.omschrijving)}</Omschrijving>`,
      `${indent}    <Eenheid>${mapEenheidNaarCuf(r.eenheid)}</Eenheid>`,
      `${indent}    <Hoeveelheid>${r.hoeveelheid.toFixed(2)}</Hoeveelheid>`,
      `${indent}    <KostprijsPerEenheid>${kp_pe.toFixed(2)}</KostprijsPerEenheid>`,
      `${indent}    <VerkoopprijsPerEenheid>${vp_pe.toFixed(2)}</VerkoopprijsPerEenheid>`,
      ...(r.opmerking ? [`${indent}    <Opmerking>${xe(r.opmerking)}</Opmerking>`] : []),
      compsXml,
      `${indent}  </Regel>`,
    ].filter(Boolean).join('\n')
  }).join('\n')

  return `\n${indent}<Regels>\n${regelXml}\n${indent}</Regels>`
}

function renderBundel(
  groep: Groep,
  alleGroepen: Groep[],
  calculatieregels: Calculatieregel[],
  componentregels: Componentregel[],
  scenario: Scenario,
  indent: string,
): string {
  const kinderen = alleGroepen
    .filter(g => g.parent_id === groep.id)
    .sort((a, b) => a.volgorde - b.volgorde)

  const regelsXml   = renderRegels(groep.id, calculatieregels, componentregels, scenario, indent + '  ')
  const kinderenXml = kinderen.length > 0
    ? `\n${indent}  <Bundels>\n${kinderen.map(k => renderBundel(k, alleGroepen, calculatieregels, componentregels, scenario, indent + '    ')).join('\n')}\n${indent}  </Bundels>`
    : ''

  return [
    `${indent}<Bundel>`,
    `${indent}  <Omschrijving>${xe(groep.naam)}</Omschrijving>`,
    regelsXml,
    kinderenXml,
    `${indent}</Bundel>`,
  ].filter(Boolean).join('\n')
}

// ─── Hoofd serializer ────────────────────────────────────────────────────────

/**
 * Genereert een CUF-XML string vanuit de interne calculatiedata.
 *
 * @param projectNaam       Naam van het project
 * @param projectNummer     Projectnummer / code
 * @param groepen           Alle groepen van het scenario
 * @param calculatieregels  Alle calculatieregels
 * @param componentregels   Alle componentregels
 * @param scenario          Het scenario (voor opslag-percentages)
 */
export function serialiseerNaarCuf(
  projectNaam:       string,
  projectNummer:     string,
  groepen:           Groep[],
  calculatieregels:  Calculatieregel[],
  componentregels:   Componentregel[],
  scenario:          Scenario,
): string {
  const datum = new Date().toISOString().split('T')[0]

  const rootGroepen = groepen
    .filter(g => g.parent_id === null)
    .sort((a, b) => a.volgorde - b.volgorde)

  const bundelsXml = rootGroepen
    .map(g => renderBundel(g, groepen, calculatieregels, componentregels, scenario, '    '))
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CUFRuil versie="2.0">',
    '  <Kop>',
    `    <AfleveringsDatum>${datum}</AfleveringsDatum>`,
    '    <Afzender>Everts Calc</Afzender>',
    '  </Kop>',
    '  <Project>',
    `    <Nummer>${xe(projectNummer)}</Nummer>`,
    `    <Naam>${xe(projectNaam)}</Naam>`,
    '  </Project>',
    '  <Begroting>',
    bundelsXml,
    '  </Begroting>',
    '</CUFRuil>',
  ].join('\n')
}
