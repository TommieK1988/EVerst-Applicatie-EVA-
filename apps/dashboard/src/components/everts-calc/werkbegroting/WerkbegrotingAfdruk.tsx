'use client'

import { useEffect, useState } from 'react'
import {
  getProjecten,
  getScenarios,
  getWerkbegrotingVoorScenario,
  getWerkbegrotingRegels,
  getWerkbegrotingComponenten,
  getGroepen,
  getCalculatieregelsVoorScenario,
  getComponentregelsVoorScenario,
} from '@/lib/everts-calc/local-store'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type {
  Project,
  Werkbegroting,
  WerkbegrotingRegel,
  WerkbegrotingComponent,
  Groep,
  Componentregel,
} from '@/lib/everts-calc/types'

interface Props {
  projectId: string
  projectNaamFallback?: string
  projectNummerFallback?: string
  opdrachtgeverFallback?: string
}

interface AfdrukData {
  project: Project
  werkbegroting: Werkbegroting
  regels: WerkbegrotingRegel[]
  componenten: WerkbegrotingComponent[]
  groepen: Groep[]
  componentregels: Componentregel[]
}

function berekenRegelTotaal(
  regel: WerkbegrotingRegel,
  componenten: WerkbegrotingComponent[]
): number {
  return componenten
    .filter((c) => c.werkbegroting_regel_id === regel.id && !c.is_verwijderd)
    .reduce((som, c) => som + regel.hoeveelheid * c.norm_hoeveelheid * c.tarief, 0)
}

function specificatieLabel(comp: WerkbegrotingComponent): string {
  if (comp.type === 'arbeid') return comp.uurtype ?? ''
  if (comp.type === 'materieel') return comp.artikelnummer ?? ''
  if (comp.type === 'onderaanneming') return comp.offertenummer ?? ''
  return ''
}

function leverancierLabel(comp: WerkbegrotingComponent): string {
  return comp.leverancier_naam ?? comp.aannemersnaam ?? ''
}

const STATUS_LABELS: Record<string, string> = {
  concept: 'Concept',
  definitief: 'Ter goedkeuring',
  geaccordeerd: 'Geaccordeerd',
}

const STATUS_KLEUREN: Record<string, string> = {
  concept: '#6b7280',
  definitief: '#d97706',
  geaccordeerd: '#16a34a',
}

export default function WerkbegrotingAfdrukClient({ projectId, projectNaamFallback, projectNummerFallback, opdrachtgeverFallback }: Props) {
  const [data, setData] = useState<AfdrukData | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [printTijd] = useState(() => {
    const nu = new Date()
    return nu.toLocaleDateString('nl-NL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }) + ' ' + nu.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  })

  useEffect(() => {
    const projecten = getProjecten()
    const gevondenProject = projecten.find((p) => p.id === projectId)

    // Bouw een project-object op: echt of samengesteld uit URL-params
    const project: Project = gevondenProject ?? ({
      id: projectId,
      naam: projectNaamFallback ?? 'Onbekend project',
      code: projectNummerFallback ?? '—',
      opdrachtgever: opdrachtgeverFallback ?? '',
      discipline: 'schilder',
      status: 'uitvoering',
      eigenaar: '',
      aangemaakt_op: '',
      bijgewerkt_op: '',
    } as unknown as Project)

    const scenarios = getScenarios(projectId)
    let gevondenWB: Werkbegroting | undefined
    let actieveScenarionId = ''

    for (const scenario of scenarios) {
      const wb = getWerkbegrotingVoorScenario(scenario.id)
      if (wb) {
        gevondenWB = wb
        actieveScenarionId = scenario.id
        break
      }
    }

    if (!gevondenWB) {
      setFout('Geen werkbegroting gevonden voor dit project.')
      return
    }

    const regels = getWerkbegrotingRegels(gevondenWB.id).filter((r) => !r.is_verwijderd)
    const alleComponenten = getWerkbegrotingComponenten()
    const componenten = alleComponenten.filter(
      (c) => !c.is_verwijderd && regels.some((r) => r.id === c.werkbegroting_regel_id)
    )
    const groepen = getGroepen(actieveScenarionId)
    const componentregels = getComponentregelsVoorScenario(actieveScenarionId)

    setData({ project, werkbegroting: gevondenWB, regels, componenten, groepen, componentregels })

    const timer = setTimeout(() => {
      window.print()
    }, 800)
    return () => clearTimeout(timer)
  }, [projectId, projectNaamFallback, projectNummerFallback, opdrachtgeverFallback])

  if (fout) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-600 text-lg">
        {fout}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-white">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 text-base">Werkbegroting laden en klaarmaken voor afdruk…</p>
      </div>
    )
  }

  const { project, werkbegroting, regels, componenten, groepen, componentregels } = data

  // --- Kostengroep-groepering ---
  const kostengroepen = Array.from(
    new Set(regels.map((r) => r.kostengroep ?? 'Overig'))
  ).sort()

  // --- Totalen berekeningen ---

  // Arbeid per uurtype
  const arbeidPerUurtype = new Map<string, { uren: number; tarief: number; totaal: number }>()
  for (const comp of componenten) {
    if (comp.type !== 'arbeid') continue
    const regel = regels.find((r) => r.id === comp.werkbegroting_regel_id)
    if (!regel) continue
    const uurtype = comp.uurtype ?? 'Onbekend'
    const uren = regel.hoeveelheid * comp.norm_hoeveelheid
    const totaal = uren * comp.tarief
    const bestaand = arbeidPerUurtype.get(uurtype)
    if (bestaand) {
      bestaand.uren += uren
      bestaand.totaal += totaal
    } else {
      arbeidPerUurtype.set(uurtype, { uren, tarief: comp.tarief, totaal })
    }
  }

  // Per component: calc KP vs werkbegroting KP
  interface CompVergelijk {
    omschrijving: string
    calcKP: number
    wbKP: number
    verschilEuro: number
    verschilPct: number
  }
  const compVergelijkMap = new Map<string, CompVergelijk>()
  for (const comp of componenten) {
    const regel = regels.find((r) => r.id === comp.werkbegroting_regel_id)
    if (!regel) continue
    const wbKP = regel.hoeveelheid * comp.norm_hoeveelheid * comp.tarief
    let calcKP = 0
    if (comp.source_component_id) {
      const cr = componentregels.find((cr) => cr.id === comp.source_component_id)
      if (cr) calcKP = regel.hoeveelheid * cr.norm_hoeveelheid * cr.tarief
    }
    const label = comp.omschrijving ?? `Component ${comp.id.slice(0, 6)}`
    const bestaand = compVergelijkMap.get(label)
    if (bestaand) {
      bestaand.calcKP += calcKP
      bestaand.wbKP += wbKP
      bestaand.verschilEuro = bestaand.wbKP - bestaand.calcKP
      bestaand.verschilPct =
        bestaand.calcKP !== 0 ? (bestaand.verschilEuro / bestaand.calcKP) * 100 : 0
    } else {
      const verschilEuro = wbKP - calcKP
      const verschilPct = calcKP !== 0 ? (verschilEuro / calcKP) * 100 : 0
      compVergelijkMap.set(label, { omschrijving: label, calcKP, wbKP, verschilEuro, verschilPct })
    }
  }
  const compVergelijk = Array.from(compVergelijkMap.values())

  // Per leverancier / OA
  const leverancierMap = new Map<string, { naam: string; type: string; totaal: number }>()
  for (const comp of componenten) {
    if (comp.type !== 'materieel' && comp.type !== 'onderaanneming') continue
    const naam = leverancierLabel(comp)
    if (!naam) continue
    const regel = regels.find((r) => r.id === comp.werkbegroting_regel_id)
    if (!regel) continue
    const totaal = regel.hoeveelheid * comp.norm_hoeveelheid * comp.tarief
    const bestaand = leverancierMap.get(naam)
    if (bestaand) {
      bestaand.totaal += totaal
    } else {
      leverancierMap.set(naam, {
        naam,
        type: comp.type === 'materieel' ? 'Leverancier' : 'Onderaannemer',
        totaal,
      })
    }
  }
  const leveranciers = Array.from(leverancierMap.values()).sort((a, b) => b.totaal - a.totaal)

  // Eindtotaal
  const eindtotaal = regels.reduce((som, r) => som + berekenRegelTotaal(r, componenten), 0)

  const vandaag = new Date().toLocaleDateString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  const statusKleur = STATUS_KLEUREN[werkbegroting.status] ?? '#6b7280'
  const statusLabel = STATUS_LABELS[werkbegroting.status] ?? werkbegroting.status

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 12mm 15mm; }
        @media print {
          body { background: white !important; }
          nav, header, aside, [data-no-print], .no-print { display: none !important; }
          .page-footer { position: fixed; bottom: 0; left: 0; right: 0; }
        }
        .page-break { page-break-after: always; }
        .wb-tabel { border-collapse: collapse; font-size: 9pt; width: 100%; }
        .wb-tabel th, .wb-tabel td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: left; }
        .wb-tabel th { background: #1e3a5f; color: white; font-weight: 600; }
        .wb-tabel .groep-row td { background: #e5e7eb; font-weight: 700; font-size: 9pt; }
        .wb-tabel .data-row:nth-child(even) td { background: #f9fafb; }
        .wb-tabel td.getal { text-align: right; }
        .totalen-tabel { border-collapse: collapse; font-size: 9pt; width: 100%; margin-bottom: 16px; }
        .totalen-tabel th, .totalen-tabel td { border: 1px solid #d1d5db; padding: 3px 8px; }
        .totalen-tabel th { background: #374151; color: white; font-weight: 600; }
        .totalen-tabel td.getal { text-align: right; }
        .totalen-tabel tr:nth-child(even) td { background: #f9fafb; }
        .verschil-pos { color: #16a34a; }
        .verschil-neg { color: #dc2626; }
      `}</style>

      {/* Vaste footer voor elke pagina */}
      <div
        className="page-footer"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '7pt',
          color: '#6b7280',
          borderTop: '1px solid #e5e7eb',
          padding: '2mm 0 0',
        }}
      >
        <span>Vertrouwelijk – intern gebruik</span>
        <span>Afgedrukt op: {printTijd}</span>
      </div>

      {/* Hoofdinhoud */}
      <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111827', padding: '0' }}>

        {/* === HEADER === */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10mm', borderBottom: '2px solid #1e3a5f', paddingBottom: '4mm' }}>
          {/* Links */}
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 900, color: '#1e3a5f', letterSpacing: '2px' }}>EVERTS</div>
            <div style={{ fontSize: '13pt', fontWeight: 600, color: '#374151', marginTop: '1mm' }}>Werkbegroting</div>
          </div>

          {/* Midden: status */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              background: statusKleur,
              color: 'white',
              fontWeight: 700,
              fontSize: '10pt',
              letterSpacing: '0.5px',
            }}>
              {statusLabel}
            </span>
          </div>

          {/* Rechts */}
          <div style={{ textAlign: 'right', fontSize: '9pt', color: '#374151', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{project.naam}</div>
            <div>Projectnummer: <strong>{project.code}</strong></div>
            <div>Opdrachtgever: {project.opdrachtgever}</div>
            <div>Datum: {vandaag}</div>
          </div>
        </div>

        {/* === HOOFDTABEL === */}
        <table className="wb-tabel">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Omschrijving</th>
              <th style={{ width: '10%' }}>Component</th>
              <th style={{ width: '10%' }}>Specificatie</th>
              <th style={{ width: '7%', textAlign: 'right' }}>Aantal</th>
              <th style={{ width: '5%' }}>Eh</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Prijs/eh</th>
              <th style={{ width: '12%', textAlign: 'right' }}>Totaalprijs</th>
              <th style={{ width: '16%' }}>Leverancier/OA</th>
            </tr>
          </thead>
          <tbody>
            {kostengroepen.map((kg) => {
              const groepRegels = regels.filter((r) => (r.kostengroep ?? 'Overig') === kg)
              const groepTotaal = groepRegels.reduce(
                (som, r) => som + berekenRegelTotaal(r, componenten),
                0
              )

              const rijen: React.ReactNode[] = []

              // Separator-rij
              rijen.push(
                <tr key={`sep-${kg}`} className="groep-row">
                  <td colSpan={7} style={{ paddingLeft: '8px' }}>{kg}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatEuro(groepTotaal)}</td>
                </tr>
              )

              // Data-rijen
              for (const regel of groepRegels) {
                const regelComponenten = componenten.filter(
                  (c) => c.werkbegroting_regel_id === regel.id
                )

                if (regelComponenten.length === 0) {
                  rijen.push(
                    <tr key={regel.id} className="data-row">
                      <td>{regel.omschrijving}</td>
                      <td colSpan={5} style={{ color: '#9ca3af', fontStyle: 'italic' }}>Geen componenten</td>
                      <td className="getal">—</td>
                      <td>—</td>
                    </tr>
                  )
                } else {
                  regelComponenten.forEach((comp, idx) => {
                    const totaal = regel.hoeveelheid * comp.norm_hoeveelheid * comp.tarief
                    rijen.push(
                      <tr key={`${regel.id}-${comp.id}`} className="data-row">
                        <td style={{ paddingLeft: idx === 0 ? '16px' : '28px' }}>
                          {idx === 0 ? regel.omschrijving : ''}
                        </td>
                        <td style={{ fontSize: '8pt', color: '#374151' }}>
                          {comp.type === 'arbeid' ? 'Arbeid' : comp.type === 'materieel' ? 'Materieel' : 'Onderaann.'}
                        </td>
                        <td style={{ fontSize: '8pt' }}>{specificatieLabel(comp)}</td>
                        <td className="getal">{idx === 0 ? regel.hoeveelheid.toLocaleString('nl-NL') : ''}</td>
                        <td>{idx === 0 ? regel.eenheid : ''}</td>
                        <td className="getal">{formatEuro(comp.tarief)}</td>
                        <td className="getal">{formatEuro(totaal)}</td>
                        <td style={{ fontSize: '8pt' }}>{leverancierLabel(comp)}</td>
                      </tr>
                    )
                  })
                }
              }

              return rijen
            })}
          </tbody>
        </table>

        {/* === TOTALEN SECTIE === */}
        <div className="page-break" />

        <div style={{ marginTop: '8mm' }}>
          <h2 style={{ fontSize: '12pt', fontWeight: 700, color: '#1e3a5f', marginBottom: '6mm', borderBottom: '1px solid #1e3a5f', paddingBottom: '2mm' }}>
            Totaaloverzicht
          </h2>

          <div style={{ display: 'flex', gap: '8mm', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Tabel 1: Arbeid per uurtype */}
            <div style={{ flex: '1 1 200px' }}>
              <h3 style={{ fontSize: '9pt', fontWeight: 700, color: '#374151', marginBottom: '3mm', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Arbeid per uurtype
              </h3>
              <table className="totalen-tabel">
                <thead>
                  <tr>
                    <th>Uurtype</th>
                    <th style={{ textAlign: 'right' }}>Uren</th>
                    <th style={{ textAlign: 'right' }}>Tarief</th>
                    <th style={{ textAlign: 'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(arbeidPerUurtype.entries()).map(([uurtype, v]) => (
                    <tr key={uurtype}>
                      <td>{uurtype}</td>
                      <td className="getal">{v.uren.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</td>
                      <td className="getal">{formatEuro(v.tarief)}</td>
                      <td className="getal">{formatEuro(v.totaal)}</td>
                    </tr>
                  ))}
                  {arbeidPerUurtype.size === 0 && (
                    <tr><td colSpan={4} style={{ color: '#9ca3af', fontStyle: 'italic' }}>Geen arbeidscomponenten</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tabel 3: Per leverancier/OA */}
            <div style={{ flex: '1 1 200px' }}>
              <h3 style={{ fontSize: '9pt', fontWeight: 700, color: '#374151', marginBottom: '3mm', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Leveranciers & Onderaannemers
              </h3>
              <table className="totalen-tabel">
                <thead>
                  <tr>
                    <th>Naam</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {leveranciers.map((lev) => (
                    <tr key={lev.naam}>
                      <td>{lev.naam}</td>
                      <td>{lev.type}</td>
                      <td className="getal">{formatEuro(lev.totaal)}</td>
                    </tr>
                  ))}
                  {leveranciers.length === 0 && (
                    <tr><td colSpan={3} style={{ color: '#9ca3af', fontStyle: 'italic' }}>Geen leveranciers/OA</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabel 2: Per component vergelijking */}
          <div style={{ marginTop: '6mm' }}>
            <h3 style={{ fontSize: '9pt', fontWeight: 700, color: '#374151', marginBottom: '3mm', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Vergelijking calculatie vs. werkbegroting
            </h3>
            <table className="totalen-tabel">
              <thead>
                <tr>
                  <th>Component</th>
                  <th style={{ textAlign: 'right' }}>Calculatie KP</th>
                  <th style={{ textAlign: 'right' }}>Werkbegroting KP</th>
                  <th style={{ textAlign: 'right' }}>Verschil €</th>
                  <th style={{ textAlign: 'right' }}>Verschil %</th>
                </tr>
              </thead>
              <tbody>
                {compVergelijk.map((cv) => {
                  const isPos = cv.verschilEuro >= 0
                  return (
                    <tr key={cv.omschrijving}>
                      <td>{cv.omschrijving}</td>
                      <td className="getal">{formatEuro(cv.calcKP)}</td>
                      <td className="getal">{formatEuro(cv.wbKP)}</td>
                      <td className={`getal ${isPos ? 'verschil-pos' : 'verschil-neg'}`}>
                        {isPos ? '+' : ''}{formatEuro(cv.verschilEuro)}
                      </td>
                      <td className={`getal ${isPos ? 'verschil-pos' : 'verschil-neg'}`}>
                        {isPos ? '+' : ''}{cv.verschilPct.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
                {compVergelijk.length === 0 && (
                  <tr><td colSpan={5} style={{ color: '#9ca3af', fontStyle: 'italic' }}>Geen vergelijkingsdata beschikbaar</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Eindtotaal */}
          <div style={{
            marginTop: '8mm',
            display: 'flex',
            justifyContent: 'flex-end',
          }}>
            <div style={{
              border: '2px solid #1e3a5f',
              borderRadius: '6px',
              padding: '6mm 10mm',
              textAlign: 'right',
              minWidth: '200px',
            }}>
              <div style={{ fontSize: '8pt', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2mm' }}>
                Eindtotaal werkbegroting
              </div>
              <div style={{ fontSize: '20pt', fontWeight: 900, color: '#1e3a5f' }}>
                {formatEuro(eindtotaal)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
