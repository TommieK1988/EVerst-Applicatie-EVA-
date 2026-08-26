'use client'

import React from 'react'
import type { InspectieContext } from '@/lib/kwaliteit/inspecties'
import { updateInspectieHeader, zetDisciplines } from '@/lib/kwaliteit/inspecties'
import type { KwaliteitDiscipline } from '@everts/database/kwaliteit-types'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { GRIJS, GROEN, label, primaireKnop, RAND, ROOD, TEKST, veld, ZACHT } from './stijl'

/**
 * Stap 1: waarop wordt deze ronde gecontroleerd.
 *
 * Dit is het eerste dat de opzichter ziet. De projectgegevens staan er al ingevuld onder, ingeklapt
 * — hij hoeft er alleen bij als er iets bijzonders is (weer, lopende werkzaamheden, steekproef).
 *
 * Algemeen staat vast aan: die controlepunten gelden elke ronde, ongeacht wat er wordt uitgevoerd.
 */
export default function DisciplineStap({
  context,
  disciplines,
  bewerkbaar,
  onVerder,
}: {
  context: InspectieContext
  disciplines: (KwaliteitDiscipline & { aantal: number })[]
  bewerkbaar: boolean
  onVerder: () => void
}) {
  const [gekozen, setGekozen] = React.useState<Set<string>>(
    new Set(context.inspectie.discipline_codes ?? ['ALG']),
  )
  const [toonGegevens, setToonGegevens] = React.useState(false)
  const [weer, setWeer] = React.useState(context.inspectie.weer ?? '')
  const [werk, setWerk] = React.useState(context.inspectie.werkzaamheden_omschrijving ?? '')
  const [gebied, setGebied] = React.useState(context.inspectie.gebied_omschrijving ?? '')
  const [bekeken, setBekeken] = React.useState(
    context.inspectie.steekproef_bekeken !== null ? String(context.inspectie.steekproef_bekeken) : '',
  )
  const [afwijkend, setAfwijkend] = React.useState(
    context.inspectie.steekproef_afwijkend !== null ? String(context.inspectie.steekproef_afwijkend) : '',
  )
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  function wissel(code: string, altijdAan: boolean) {
    if (!bewerkbaar || altijdAan) return
    setGekozen(prev => {
      const s = new Set(prev)
      if (s.has(code)) s.delete(code); else s.add(code)
      return s
    })
  }

  const aantalPunten = disciplines
    .filter(d => gekozen.has(d.code))
    .reduce((som, d) => som + d.aantal, 0)

  async function verder() {
    if (!bewerkbaar) { onVerder(); return }
    setBezig(true); setFout(null)
    const [dRes] = await Promise.all([
      zetDisciplines(context.inspectie.id, [...gekozen]),
      updateInspectieHeader(context.inspectie.id, {
        weer: weer || null,
        werkzaamheden_omschrijving: werk || null,
        gebied_omschrijving: gebied || null,
        steekproef_bekeken: bekeken ? Number(bekeken) : null,
        steekproef_afwijkend: afwijkend ? Number(afwijkend) : null,
      }),
    ])
    setBezig(false)
    if (!dRes.ok) { setFout(dRes.error); return }
    onVerder()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '16px 14px 0', flex: 1 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: TEKST }}>
          Wat controleer je deze ronde?
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: GRIJS, lineHeight: 1.4 }}>
          Kies de onderdelen die nu zichtbaar en beoordeelbaar zijn. Je krijgt daarna alleen die
          controlepunten te zien.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          {disciplines.map(d => {
            const actief = gekozen.has(d.code)
            const vast = d.altijd_aan
            return (
              <button
                key={d.code}
                type="button"
                onClick={() => wissel(d.code, vast)}
                disabled={!bewerkbaar || vast}
                style={{
                  minHeight: 74, padding: '11px 12px', borderRadius: 14, textAlign: 'left',
                  border: `2px solid ${actief ? GROEN : RAND}`,
                  background: actief ? 'rgba(0,148,57,0.07)' : 'var(--bg-elev)',
                  cursor: bewerkbaar && !vast ? 'pointer' : 'default',
                  WebkitTapHighlightColor: 'transparent',
                  opacity: !bewerkbaar && !actief ? 0.5 : 1,
                }}
              >
                <div style={{
                  fontSize: 13.5, fontWeight: 700, lineHeight: 1.25,
                  color: actief ? GROEN : TEKST, marginBottom: 4,
                }}>
                  {d.naam}
                </div>
                <div style={{ fontSize: 11, color: ZACHT }}>
                  {d.aantal} punten{vast ? ' · altijd' : ''}
                </div>
              </button>
            )
          })}
        </div>

        <p style={{ fontSize: 13, color: GRIJS, textAlign: 'center', marginBottom: 16 }}>
          <strong style={{ color: TEKST }}>{aantalPunten}</strong> controlepunten in deze ronde
        </p>

        {/* Gegevens van de ronde: ingeklapt, want alles staat al ingevuld. */}
        <button
          type="button"
          onClick={() => setToonGegevens(v => !v)}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12, border: `1px solid ${RAND}`,
            background: 'var(--bg-elev)', color: GRIJS, fontSize: 13, fontWeight: 600,
            textAlign: 'left', cursor: 'pointer',
          }}
        >
          {toonGegevens ? '▴' : '▾'} Gegevens van deze ronde
        </button>

        {toonGegevens && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: `1px solid ${RAND}`, background: 'var(--bg-elev)' }}>
            <dl style={{ margin: '0 0 14px', fontSize: 13, color: GRIJS, lineHeight: 1.6 }}>
              <div><strong style={{ color: TEKST }}>{context.inspectie.inspectienummer}</strong></div>
              <div>{context.dossier.dossiernummer ? `${context.dossier.dossiernummer} · ` : ''}{context.dossier.titel}</div>
              {context.dossier.opdrachtgever && <div>{context.dossier.opdrachtgever}</div>}
              {context.dossier.werkadres && <div>{context.dossier.werkadres}</div>}
              <div>
                {new Date(context.inspectie.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                {context.inspectie.tijd ? ` · ${context.inspectie.tijd.slice(0, 5)}` : ''}
              </div>
              {context.inspecteurNaam && <div>Inspecteur: {context.inspecteurNaam}</div>}
            </dl>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Weersomstandigheden (optioneel)</label>
              <input value={weer} onChange={e => setWeer(e.target.value)} disabled={!bewerkbaar}
                placeholder="Bijv. droog, 12 °C, matige wind" style={veld} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Aanwezige werkzaamheden (optioneel)</label>
              <input value={werk} onChange={e => setWerk(e.target.value)} disabled={!bewerkbaar}
                placeholder="Bijv. schilderwerk voorgevel, kitwerk blok A" style={veld} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={label}>Gelopen gebied (optioneel)</label>
              <input value={gebied} onChange={e => setGebied(e.target.value)} disabled={!bewerkbaar}
                placeholder="Bijv. voor- en achtergevel blok A" style={veld} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={label}>Elementen bekeken</label>
                <input value={bekeken} onChange={e => setBekeken(e.target.value)} inputMode="numeric"
                  disabled={!bewerkbaar} placeholder="0" style={veld} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={label}>Daarvan afwijkend</label>
                <input value={afwijkend} onChange={e => setAfwijkend(e.target.value)} inputMode="numeric"
                  disabled={!bewerkbaar} placeholder="0" style={veld} />
              </div>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: ZACHT, lineHeight: 1.4 }}>
              Optioneel: legt de omvang van je steekproef vast. Je bepaalt zelf hoeveel je bekijkt.
            </p>
          </div>
        )}

        {fout && <p style={{ marginTop: 10, fontSize: 12.5, color: ROOD }}>{fout}</p>}
      </div>

      <MobielStickyFooter>
        <button type="button" onClick={() => void verder()} disabled={bezig} style={{ ...primaireKnop, flex: 1 }}>
          {bezig ? 'Bezig…' : `Verder met ${aantalPunten} controlepunten`}
        </button>
      </MobielStickyFooter>
    </div>
  )
}
