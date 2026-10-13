'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Groep, Meetregel, Meetstaat } from '@/lib/everts-calc/types'
import { getMeetregels } from '@/lib/everts-calc/local-store'
import { berekenHoeveelheid, isRegelActief, calculatieregelOmschrijving, normaliseerBestekcode } from '@/lib/everts-calc/meetstaat-utils'
import { platteGroepen, subtreeIds } from '@/lib/everts-calc/groep-boom'

/**
 * Afdrukversie van de héle meetstaat: alle groepen onder elkaar, met per groep de
 * meetregels en de totalen per onderdeel/type/bestekscode.
 *
 * Het invoerscherm zelf is niet af te drukken: dat toont één groep tegelijk, in
 * invoervelden, binnen een shell die op schermhoogte afkapt. Deze weergave staat
 * daarom via een portal los in <body>; bij afdrukken verbergt de stijl hieronder al
 * het andere. Op het scherm is hij onzichtbaar.
 */

const fmt = (n: number | undefined | null, dec = 2) =>
  n === undefined || n === null || n === 0
    ? ''
    : n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: dec })

function maat(waarde: number | undefined, aantal: number | undefined, eenheid: string): string {
  if (!waarde) return ''
  // Breedte- en hoogte-aantallen tellen alleen mee bij m¹ (zie berekenHoeveelheid).
  const n = eenheid === 'm¹' ? (aantal || 1) : 1
  return n > 1 ? `${n} × ${fmt(waarde, 3)}` : fmt(waarde, 3)
}

interface Totaal { omschrijving: string; eenheid: string; hoeveelheid: number }

function totalenPerPost(regels: Meetregel[]): Totaal[] {
  const map = new Map<string, Totaal>()
  for (const r of regels) {
    // Zelfde splitsing als de aggregaten: per onderdeel/type/bestekscode.
    const omschrijving = calculatieregelOmschrijving(r.onderdeel ?? '', r.type ?? '', r.behandeling ?? '', r.bestekcode)
    const sleutel = `${omschrijving.toLowerCase()}::${r.eenheid}`
    const t = map.get(sleutel) ?? { omschrijving, eenheid: r.eenheid, hoeveelheid: 0 }
    t.hoeveelheid += berekenHoeveelheid(r)
    map.set(sleutel, t)
  }
  return Array.from(map.values())
}

const th: CSSProperties = {
  textAlign: 'left', fontWeight: 600, fontSize: '8pt', textTransform: 'uppercase',
  letterSpacing: '0.04em', color: '#4d575e', padding: '4px 6px', borderBottom: '1px solid #9aa4ab',
}
const td: CSSProperties = { padding: '3px 6px', borderBottom: '1px solid #e3e8ea', verticalAlign: 'top' }
const getal: CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

export default function MeetstaatPrint({ meetstaat, groepen, projectNaam, projectNummer }: {
  meetstaat: Meetstaat
  groepen: Groep[]
  projectNaam?: string
  projectNummer?: string
}) {
  const [gemount, setGemount] = useState(false)
  useEffect(() => { setGemount(true) }, [])
  if (!gemount) return null

  const regels = getMeetregels(meetstaat.id)
    .filter(r => !r.is_leeg && isRegelActief(r))
    .sort((a, b) => a.volgorde - b.volgorde)
  const metRegels = new Set(regels.map(r => r.groep_id))
  const bekend = new Set(groepen.map(g => g.id))

  // Een groep komt op papier als hij zelf, of een subgroep, regels heeft.
  const blokken = platteGroepen(groepen)
    .filter(({ groep }) => Array.from(subtreeIds(groepen, groep.id)).some(id => metRegels.has(id)))
    .map(({ groep, diepte }) => ({
      sleutel: groep.id, naam: groep.naam, diepte,
      regels: regels.filter(r => r.groep_id === groep.id),
    }))
  const wees = regels.filter(r => !bekend.has(r.groep_id))
  if (wees.length > 0) blokken.push({ sleutel: 'zonder-groep', naam: 'Zonder groep', diepte: 0, regels: wees })

  const heeftOverride = regels.some(r => r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null)

  return createPortal(
    <div className="meetstaat-print">
      <style>{`
        .meetstaat-print { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body > *:not(.meetstaat-print) { display: none !important; }
          .meetstaat-print { display: block; color: #161b20; background: #fff; font-size: 9pt; }
          .meetstaat-print tr { break-inside: avoid; }
          .meetstaat-print thead { display: table-header-group; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #009439', paddingBottom: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b757c' }}>Meetstaat</div>
          <div style={{ fontSize: '14pt', fontWeight: 700 }}>{meetstaat.naam}</div>
          {(projectNaam || projectNummer) && (
            <div style={{ fontSize: '10pt', color: '#364048' }}>
              {[projectNummer, projectNaam].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: '8pt', color: '#4d575e' }}>
          <div>{meetstaat.code} · {meetstaat.status}</div>
          <div>Afgedrukt {new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>

      {blokken.length === 0 && <p style={{ color: '#6b757c' }}>Deze meetstaat heeft nog geen ingevulde regels.</p>}

      {blokken.map(blok => (
        <section key={blok.sleutel} style={{ marginBottom: 12, marginLeft: blok.diepte * 12 }}>
          <div style={{ fontSize: blok.diepte === 0 ? '11pt' : '10pt', fontWeight: 700, padding: '4px 0', breakAfter: 'avoid' }}>
            {blok.naam}
          </div>
          {blok.regels.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 24 }}>#</th>
                  <th style={th}>Element</th>
                  <th style={th}>Onderdeel</th>
                  <th style={th}>Type</th>
                  <th style={th}>Code</th>
                  <th style={th}>Opmerking</th>
                  <th style={{ ...th, textAlign: 'right' }}>Breedte</th>
                  <th style={{ ...th, textAlign: 'right' }}>Hoogte</th>
                  <th style={{ ...th, textAlign: 'right' }}>Factor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Aantal</th>
                  <th style={{ ...th, textAlign: 'right' }}>Hoeveelheid</th>
                </tr>
              </thead>
              <tbody>
                {blok.regels.map((r, i) => {
                  const override = r.hoeveelheid_override !== undefined && r.hoeveelheid_override !== null
                  const opmerking = [r.opmerking ?? r.omschrijving, r.bestek_kenmerk].filter(Boolean).join(' — ')
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, color: '#6b757c' }}>{i + 1}</td>
                      <td style={td}>{r.element}</td>
                      <td style={td}>{r.onderdeel}</td>
                      <td style={td}>{r.type}</td>
                      {/* Oude meetstaten dragen nog een behandeling; die blijft dan zichtbaar. */}
                      <td style={td}>{[normaliseerBestekcode(r.bestekcode), r.behandeling].filter(Boolean).join(' · ')}</td>
                      <td style={td}>{opmerking}</td>
                      <td style={getal}>{maat(r.breedte, r.breedte_aantal, r.eenheid)}</td>
                      <td style={getal}>{maat(r.hoogte, r.hoogte_aantal, r.eenheid)}</td>
                      <td style={getal}>{r.factor && r.factor !== 1 ? fmt(r.factor, 3) : ''}</td>
                      <td style={getal}>{fmt(r.aantal || 1)}</td>
                      <td style={{ ...getal, fontWeight: 600 }}>
                        {fmt(berekenHoeveelheid(r))} {r.eenheid}{override ? ' *' : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tbody style={{ breakInside: 'avoid' }}>
                {totalenPerPost(blok.regels).map(t => (
                  <tr key={`${t.omschrijving}::${t.eenheid}`} style={{ background: '#f1f4f5' }}>
                    <td style={td} />
                    <td style={{ ...td, fontWeight: 600 }} colSpan={9}>Totaal {t.omschrijving}</td>
                    <td style={{ ...getal, fontWeight: 700 }}>{fmt(t.hoeveelheid)} {t.eenheid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      {heeftOverride && (
        <p style={{ fontSize: '8pt', color: '#6b757c', marginTop: 8 }}>* Hoeveelheid handmatig ingevuld, niet berekend uit de maten.</p>
      )}
    </div>,
    document.body,
  )
}
