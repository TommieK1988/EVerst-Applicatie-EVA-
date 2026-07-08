'use client'

import { useState } from 'react'
import { opleverPuntStatusLabels, type OpleverPuntStatus } from '@everts/database'
import { portaalAkkoord, type AkkoordPortaalData } from '../../actions'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4e8e7', borderRadius: 12, padding: 20, marginBottom: 14 }

export function AkkoordPortaal({ token, data }: { token: string; data: AkkoordPortaalData }) {
  const [naam, setNaam] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState(data.alGetekend ?? false)

  async function akkoord() {
    if (!naam.trim()) { setFout('Vul uw naam in.'); return }
    setBezig(true); setFout(null)
    const r = await portaalAkkoord(token, naam)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    setKlaar(true)
  }

  const openPunten = (data.punten ?? []).filter(p => p.status !== 'geaccepteerd').length

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a938f' }}>Oplevering — akkoord</div>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '2px 0 0' }}>{data.dossier?.titel ?? 'Project'}</h1>
        {data.dossier?.nummer && <div style={{ fontSize: 12.5, color: '#6b757c' }}>{data.dossier.nummer}</div>}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{data.moment?.titel}</div>
        <div style={{ fontSize: 12.5, color: '#6b757c', marginBottom: 12 }}>
          {(data.punten ?? []).length} opleverpunt(en){openPunten > 0 ? ` · ${openPunten} nog niet geaccepteerd` : ' · alle punten geaccepteerd'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data.punten ?? []).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, borderBottom: '1px solid #f1f4f3', paddingBottom: 6 }}>
              <span>
                <span style={{ color: '#a4adb2', fontWeight: 700, marginRight: 6 }}>OP{String(p.volgnummer).padStart(2, '0')}</span>
                {p.omschrijving}{p.ruimte ? ` — ${p.ruimte}` : ''}
              </span>
              <span style={{ fontSize: 11, color: '#6b757c', whiteSpace: 'nowrap' }}>{opleverPuntStatusLabels[p.status as OpleverPuntStatus]}</span>
            </div>
          ))}
        </div>
      </div>

      {klaar ? (
        <div style={{ ...card, background: '#e7f6ec', borderColor: '#bfe6cd', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1c7a3f' }}>Bedankt — uw akkoord is vastgelegd.</div>
          <div style={{ fontSize: 12.5, color: '#3a6b4a', marginTop: 4 }}>U ontvangt de opleverrapportage per e-mail.</div>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontSize: 13.5, marginBottom: 10 }}>
            Door hieronder akkoord te geven, bevestigt u dat de oplevering naar tevredenheid is en gaat u akkoord met de opleverrapportage.
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#3a444c' }}>
            Uw naam
            <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Voor- en achternaam"
              style={{ display: 'block', width: '100%', marginTop: 4, border: '1px solid #d4dad8', borderRadius: 8, padding: '9px 10px', fontSize: 14, boxSizing: 'border-box' }} />
          </label>
          {fout && <div style={{ color: '#a12020', fontSize: 12.5, marginTop: 8 }}>{fout}</div>}
          <button onClick={akkoord} disabled={bezig}
            style={{ marginTop: 12, width: '100%', background: '#009439', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 16px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', opacity: bezig ? 0.6 : 1 }}>
            Akkoord geven op de oplevering
          </button>
        </div>
      )}
    </div>
  )
}
