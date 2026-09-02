'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { voegOnkostenToe } from '@/lib/uren/weekstaat'

/**
 * Parkeer- en reiskosten van één dag vastleggen.
 *
 * Deze bedragen gaan bewust NIET naar Bouw7: de urenregistratie daar kent geen geldbedragen, en
 * het als projectkosten boeken zou de inkoopstroom raken. Ze worden hier vastgelegd en getoond;
 * hoe de administratie ze verder verwerkt is een aparte afspraak.
 */

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#6b757c',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const SOORTEN = [
  { waarde: 'parkeren', label: 'Parkeren' },
  { waarde: 'reiskosten', label: 'Reiskosten' },
  { waarde: 'overig', label: 'Overig' },
] as const

export default function OnkostenSheet({
  weekId, datum, onSluit, onKlaar,
}: {
  weekId: string
  datum: string
  onSluit: () => void
  onKlaar: () => void
}) {
  const [soort, setSoort] = useState<'parkeren' | 'reiskosten' | 'overig'>('parkeren')
  const [bedrag, setBedrag] = useState('')
  const [km, setKm] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [bezig, setBezig] = useState(false)

  async function bewaar() {
    const bedragNum = parseFloat(bedrag.replace(',', '.'))
    if (!(bedragNum >= 0) || Number.isNaN(bedragNum)) { toast.error('Vul een bedrag in.'); return }
    setBezig(true)
    const r = await voegOnkostenToe(weekId, {
      datum,
      soort,
      bedrag: bedragNum,
      km: km ? parseFloat(km.replace(',', '.')) : null,
      omschrijving: omschrijving || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onKlaar()
    onSluit()
  }

  return (
    <div onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg-elev)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
          Kosten toevoegen
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStijl}>Soort</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {SOORTEN.map(s => (
                <button key={s.waarde} type="button" onClick={() => setSoort(s.waarde)}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                    border: `1.5px solid ${soort === s.waarde ? '#009439' : 'var(--border)'}`,
                    background: soort === s.waarde ? 'rgba(0,148,57,0.08)' : 'transparent',
                    color: soort === s.waarde ? '#009439' : '#6b757c',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStijl}>Bedrag</label>
            <input type="text" inputMode="decimal" value={bedrag}
              onChange={e => setBedrag(e.target.value)} placeholder="0,00" style={veld} />
          </div>

          {soort === 'reiskosten' && (
            <div>
              <label style={labelStijl}>Kilometers (optioneel)</label>
              <input type="text" inputMode="decimal" value={km}
                onChange={e => setKm(e.target.value)} placeholder="0" style={veld} />
            </div>
          )}

          <div>
            <label style={labelStijl}>Omschrijving (optioneel)</label>
            <input type="text" value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
              placeholder="Bijvoorbeeld: parkeergarage centrum" style={veld} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
          <button type="button" onClick={onSluit}
            style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
            Annuleren
          </button>
          <button type="button" onClick={bewaar} disabled={bezig}
            style={{ ...actieKnop, background: '#009439', color: '#fff', border: 'none', opacity: bezig ? 0.6 : 1 }}>
            {bezig ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
