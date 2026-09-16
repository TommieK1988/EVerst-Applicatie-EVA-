'use client'

/**
 * Gedeelde bouwstenen van de bezoekdoorloop.
 *
 * Uit `BezoekDoorloop.tsx` gelicht toen het bezoek per discipline werd opgebouwd: dezelfde
 * kop, hetzelfde tekstveld en dezelfde fotostrook worden nu op drie plekken gebruikt (het
 * bezoek zelf, een punt, de afronding). Eén kopie, geen drie.
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { GRIJS, RAND, veld, label, secundaireKnop } from '@/components/mobiel/kwaliteit/stijl'

export function SectieKop({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
      letterSpacing: 0.4, margin: '0 0 8px',
    }}>{children}</h2>
  )
}

/** Tekstveld dat bij verlaten opslaat — geen opslaanknop per veld op een telefoon. */
export function TekstVeld({
  titel, waarde, opslaan, plaatshouder, regels = 1, lezen = false, laatste = false,
}: {
  titel: string
  waarde: string
  opslaan: (v: string) => void | Promise<unknown>
  plaatshouder?: string
  regels?: number
  lezen?: boolean
  laatste?: boolean
}) {
  const [lokaal, setLokaal] = useState(waarde)
  const gedeeld = {
    style: { ...veld, ...(regels > 1 ? { minHeight: regels * 26 } : {}) },
    value: lokaal,
    placeholder: plaatshouder,
    disabled: lezen,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLokaal(e.target.value),
    onBlur: () => { if (lokaal !== waarde) opslaan(lokaal) },
  }
  return (
    <div style={{ marginBottom: laatste ? 0 : 12 }}>
      <span style={label}>{titel}</span>
      {regels > 1 ? <textarea rows={regels} {...gedeeld} /> : <input type="text" {...gedeeld} />}
    </div>
  )
}

/**
 * Fotostrook.
 *
 * Generiek gemaakt toen een punt zijn eigen foto's kreeg: de strook weet niet meer waar de
 * foto aan hangt, hij krijgt een upload- en een verwijderfunctie mee. Zo bedient hij zowel
 * de foto's bij een punt als die bij het bezoek als geheel.
 */
export function FotoStrip({
  fotos, lezen, uploaden, verwijderen, naWijziging, titel = "Foto's", knop = 'Foto toevoegen',
}: {
  fotos: { id: string; url: string }[]
  lezen: boolean
  uploaden: (file: File) => Promise<{ ok: boolean; error?: string }>
  verwijderen: (id: string) => Promise<{ ok: boolean; error?: string }>
  naWijziging: () => void
  titel?: string
  knop?: string
}) {
  const [bezig, setBezig] = useState(false)

  return (
    <div style={{ marginTop: 10 }}>
      {titel && <span style={label}>{titel}</span>}
      {fotos.length > 0 && (
        // flexShrink 0 op de tegels: zonder dat perst een strook met overflow-x zichzelf plat.
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" style={{
                width: 92, height: 92, objectFit: 'cover', borderRadius: 10,
                border: `1px solid ${RAND}`,
              }} />
              {!lezen && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await verwijderen(f.id)
                    if (!r.ok) { toast.error(r.error ?? 'Verwijderen mislukt'); return }
                    naWijziging()
                  }}
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
                    border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14,
                    lineHeight: '24px', cursor: 'pointer', padding: 0,
                  }}
                  aria-label="Foto verwijderen"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {!lezen && (
        <label style={{ ...secundaireKnop, display: 'block', textAlign: 'center' }}>
          {bezig ? 'Bezig…' : knop}
          <input
            type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              setBezig(true)
              const r = await uploaden(file)
              setBezig(false)
              e.target.value = ''
              if (!r.ok) { toast.error(r.error ?? 'Uploaden mislukt'); return }
              naWijziging()
            }}
          />
        </label>
      )}
    </div>
  )
}
