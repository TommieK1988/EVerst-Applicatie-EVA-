'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { opleverPuntStatusLabels, type OpleverPuntStatus } from '@everts/database'
import { portaalUploadFoto, portaalAfmeldenPunt, type OnderaannemerPortaalData, type PortaalPunt } from '../../actions'

// 'nieuw' en 'afgewezen' horen bij de interne triage van gemelde aandachtspunten en komen hier niet
// voor — een onderaannemer ziet alleen punten die aan hem zijn toegewezen. Wel volledig invullen,
// zodat de opzoeking nooit `undefined` oplevert.
const STATUS_KLEUR: Record<OpleverPuntStatus, { bg: string; fg: string }> = {
  nieuw:          { bg: '#fdf6e9', fg: '#7a5a17' },
  open:           { bg: '#eef1f2', fg: '#3a444c' },
  in_behandeling: { bg: '#e6f0fb', fg: '#1d4e89' },
  opgelost:       { bg: '#fdf6e9', fg: '#7a5a17' },
  geaccepteerd:   { bg: '#e7f6ec', fg: '#1c7a3f' },
  geweigerd:      { bg: '#fdecec', fg: '#a12020' },
  afgewezen:      { bg: '#eef1f2', fg: '#6b757c' },
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e4e8e7', borderRadius: 12, padding: 16, marginBottom: 12 }
const knop: React.CSSProperties = {
  background: '#009439', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
}

export function OnderaannemerPortaal({ token, data }: { token: string; data: OnderaannemerPortaalData }) {
  const openPunten = (data.punten ?? []).filter(p => p.status !== 'geaccepteerd')
  const klaar = (data.punten ?? []).filter(p => p.status === 'geaccepteerd')

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a938f' }}>
          Opleverpunten · {data.relatieNaam}
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '2px 0 0' }}>{data.dossier?.titel ?? 'Project'}</h1>
        {data.dossier?.nummer && <div style={{ fontSize: 12.5, color: '#6b757c' }}>{data.dossier.nummer}</div>}
        <p style={{ fontSize: 13, color: '#6b757c', marginTop: 8 }}>
          Hieronder staan de opleverpunten die aan u zijn toegewezen. Meld een punt af zodra het is opgelost —
          voeg gerust een foto en toelichting toe.
        </p>
      </div>

      {(data.punten ?? []).length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: '#6b757c', fontSize: 13.5 }}>
          Er staan momenteel geen opleverpunten voor u open.
        </div>
      )}

      {openPunten.map(p => <PuntKaart key={p.id} token={token} punt={p} />)}

      {klaar.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8a938f', marginBottom: 8 }}>Afgerond &amp; geaccepteerd</div>
          {klaar.map(p => <PuntKaart key={p.id} token={token} punt={p} readOnly />)}
        </div>
      )}
    </div>
  )
}

function PuntKaart({ token, punt, readOnly }: { token: string; punt: PortaalPunt; readOnly?: boolean }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [opmerking, setOpmerking] = useState('')
  const [fotoUrls, setFotoUrls] = useState<string[]>([])
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const kleur = STATUS_KLEUR[punt.status]

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBezig(true); setFout(null)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('foto', file)
      const r = await portaalUploadFoto(token, punt.id, fd)
      if (!r.ok) { setFout(r.error); break }
      setFotoUrls(prev => [...prev, r.url])
    }
    setBezig(false)
  }

  async function afmelden() {
    setBezig(true); setFout(null)
    const r = await portaalAfmeldenPunt(token, punt.id, opmerking.trim(), fotoUrls)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    router.refresh()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#a4adb2' }}>OP{String(punt.volgnummer).padStart(2, '0')}</span>
        <span style={{ background: kleur.bg, color: kleur.fg, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '3px 10px' }}>
          {opleverPuntStatusLabels[punt.status]}
        </span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 600, margin: '6px 0 2px' }}>{punt.omschrijving}</div>
      <div style={{ fontSize: 12.5, color: '#6b757c' }}>
        {punt.ruimte}
        {punt.deadline && <span style={{ color: '#7a5a17', marginLeft: 8 }}>· deadline {punt.deadline}</span>}
      </div>

      {punt.fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {punt.fotos.map(f => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" style={{ width: 60, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid #e4e8e7' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
          ))}
        </div>
      )}

      {punt.reacties.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {punt.reacties.map((r, i) => (
            <div key={i} style={{ background: '#f6f8f7', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
              <div style={{ fontWeight: 600, color: '#3a444c' }}>{r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'U' : 'Everts')}</div>
              {r.opmerking && <div style={{ color: '#4a545b' }}>{r.opmerking}</div>}
            </div>
          ))}
        </div>
      )}

      {!readOnly && punt.status !== 'geaccepteerd' && (
        <div style={{ marginTop: 12, borderTop: '1px solid #eef1f2', paddingTop: 12 }}>
          <textarea
            value={opmerking} onChange={e => setOpmerking(e.target.value)} rows={2}
            placeholder="Toelichting (optioneel) — bijv. wat is er opgelost?"
            style={{ width: '100%', border: '1px solid #d4dad8', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
          {fotoUrls.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
              {fotoUrls.map((u, i) => (
                <div key={i} style={{ width: 54, height: 54, borderRadius: 8, overflow: 'hidden', border: '1px solid #e4e8e7' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="nieuwe foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
          {fout && <div style={{ color: '#a12020', fontSize: 12.5, margin: '6px 0' }}>{fout}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
              onChange={e => upload(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={bezig}
              style={{ background: '#fff', color: '#3a444c', border: '1px solid #d4dad8', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📷 Foto toevoegen
            </button>
            <button onClick={afmelden} disabled={bezig} style={{ ...knop, opacity: bezig ? 0.6 : 1 }}>
              {punt.status === 'opgelost' ? 'Bijwerken' : 'Afmelden als opgelost'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
