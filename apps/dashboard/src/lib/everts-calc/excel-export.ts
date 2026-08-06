import * as XLSX from 'xlsx'
import type { Groep, Calculatieregel, Componentregel, Scenario } from './types'
import { berekenCalculatieregel, berekenGroepKostprijs, berekenGroepVP } from './calculations'

function euro(n: number) {
  return Math.round(n * 100) / 100
}

function groepNummer(groep: Groep, alleGroepen: Groep[]): string {
  const parts: string[] = []
  let current: Groep | undefined = groep
  while (current) {
    const siblings = alleGroepen
      .filter(g => g.parent_id === current!.parent_id)
      .sort((a, b) => a.volgorde - b.volgorde)
    parts.unshift(String(siblings.findIndex(g => g.id === current!.id) + 1))
    current = current.parent_id ? alleGroepen.find(g => g.id === current!.parent_id) : undefined
  }
  return parts.join('.')
}

type Row = (string | number | null)[]

function appendGroep(
  rows: Row[],
  groep: Groep,
  alleGroepen: Groep[],
  alleRegels: Calculatieregel[],
  alleComponenten: Componentregel[],
  defaultOpslag: number,
  diepte: number,
) {
  const nr = groepNummer(groep, alleGroepen)
  const kp = berekenGroepKostprijs(groep.id, alleGroepen, alleRegels, alleComponenten)
  const vp = berekenGroepVP(groep.id, alleGroepen, alleRegels, alleComponenten, defaultOpslag)
  const indent = '  '.repeat(diepte)

  rows.push([
    `${indent}${nr}`, `${indent}${groep.naam}`, null, null, null, null, null,
    null, null, null, null, euro(kp), null, euro(vp),
  ])

  const directeRegels = alleRegels
    .filter(r => r.groep_id === groep.id)
    .sort((a, b) => a.volgorde - b.volgorde)

  for (const regel of directeRegels) {
    const opslag = regel.opslag_pct ?? defaultOpslag
    const b = berekenCalculatieregel(regel, alleComponenten, opslag)
    rows.push([
      null,
      `${'  '.repeat(diepte + 1)}${regel.omschrijving}`,
      regel.hoeveelheid,
      regel.eenheid,
      regel.is_stelpost ? 'Stelpost' : regel.is_verrekenbaar ? 'Verrekenbaar' : null,
      b.uren_totaal !== 0 ? b.uren_totaal : null,
      b.arbeid_totaal !== 0 ? euro(b.arbeid_totaal) : null,
      b.materieel_totaal !== 0 ? euro(b.materieel_totaal) : null,
      b.oa_totaal !== 0 ? euro(b.oa_totaal) : null,
      euro(b.kp_pe),
      euro(b.kp_totaal),
      null,
      euro(b.vp_pe),
      euro(b.vp_totaal),
    ])
  }

  const subGroepen = alleGroepen
    .filter(g => g.parent_id === groep.id)
    .sort((a, b) => a.volgorde - b.volgorde)

  for (const sub of subGroepen) {
    appendGroep(rows, sub, alleGroepen, alleRegels, alleComponenten, defaultOpslag, diepte + 1)
  }
}

export function exportCalculatieNaarExcel(
  projectNaam: string,
  projectNummer: string,
  scenario: Scenario,
  groepen: Groep[],
  regels: Calculatieregel[],
  componenten: Componentregel[],
) {
  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico
  const wb = XLSX.utils.book_new()

  const headerMeta: Row[] = [
    ['Project:', projectNaam],
    ['Nummer:', projectNummer],
    ['Scenario:', scenario.naam],
    ['AK%:', scenario.opslag_algemene_kosten],
    ['W&R%:', scenario.opslag_winst_risico],
    [],
  ]

  const columnHeaders: Row = [
    'Nr.', 'Omschrijving', 'Aant.', 'Eenh.', 'Type',
    'Tot. Uren', 'Bedrag AB', 'Bedrag MA', 'Bedrag OA',
    'KP/e.', 'Tot. KP', 'Groep KP', 'VP/e.', 'Tot. VP',
  ]

  const dataRows: Row[] = []
  const roots = groepen.filter(g => g.parent_id === null).sort((a, b) => a.volgorde - b.volgorde)
  for (const root of roots) {
    appendGroep(dataRows, root, groepen, regels, componenten, defaultOpslag, 0)
  }

  // Totaalregel
  const totaalKP = roots.reduce(
    (s, g) => s + berekenGroepKostprijs(g.id, groepen, regels, componenten), 0
  )
  const totaalVP = roots.reduce(
    (s, g) => s + berekenGroepVP(g.id, groepen, regels, componenten, defaultOpslag), 0
  )
  dataRows.push([])
  dataRows.push([
    null, 'TOTAAL CALCULATIE', null, null, null, null, null, null, null,
    null, euro(totaalKP), null, null, euro(totaalVP),
  ])

  const allRows: Row[] = [...headerMeta, columnHeaders, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  // Kolombreedte hints
  ws['!cols'] = [
    { wch: 6 }, { wch: 45 }, { wch: 8 }, { wch: 8 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Calculatie')

  const datum = new Date().toISOString().slice(0, 10)
  const bestandsnaam = `${projectNummer || 'calculatie'}_${datum}.xlsx`
  XLSX.writeFile(wb, bestandsnaam)
}
