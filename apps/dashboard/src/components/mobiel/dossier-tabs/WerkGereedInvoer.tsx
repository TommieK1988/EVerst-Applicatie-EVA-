'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { bewaarVoortgang } from '@/lib/dossiers/voortgang'
import BottomSheet from '@/components/mobiel/BottomSheet'
import { GROEN, VLAK } from '@/components/mobiel/oplevering/stijl'

/**
 * "Werk gereed" van één bewakingscode op het mobiele Voortgang-tab — het % van alléén het
 * arbeidsdeel. Met `bewerkbaar` (projectrol op het dossier, dossier niet afgesloten) opent een tik
 * een paneel om het te wijzigen. `bewaarVoortgang` (met `alleenArbeid`) zet het in Bouw7 op de
 * Arbeid-kostensoort en rekent het om naar het totale % van de code voor desktop en Management.
 * `bewaarVoortgang` controleert de projectrol zelf ook nog.
 */

const pctTekst = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
const klem = (v: number | null) => (v == null ? 0 : Math.min(Math.max(v, 0), 100))
const SNELKEUZE = [0, 25, 50, 75, 100]

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}

export default function WerkGereedInvoer({
  dossierId, bouw7Id, code, naam, hoofdstukId, initial, bewerkbaar,
}: {
  dossierId: string
  bouw7Id: string | null
  code: string | null
  naam: string | null
  hoofdstukId: number | null
  initial: number | null
  bewerkbaar: boolean
}) {
  const router = useRouter()
  const [waarde, setWaarde] = useState<number | null>(initial)
  const [open, setOpen] = useState(false)
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)

  const kan = bewerkbaar && !!bouw7Id && !!code && code !== '-'
  const invoer = Number(tekst.trim().replace(',', '.'))
  const geldig = tekst.trim() !== '' && !isNaN(invoer) && invoer >= 0 && invoer <= 100

  const openen = () => {
    setTekst(waarde != null ? String(Math.round(waarde)) : '')
    setOpen(true)
  }

  const bewaar = async () => {
    if (!geldig || bezig || !bouw7Id || !code) return
    setBezig(true)
    const res = await bewaarVoortgang({
      dossierId, bouw7Id, niveau: 'bewakingscode', bewakingscode: code, hoofdstukId, pctGereed: invoer,
      alleenArbeid: true,
    }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Opslaan mislukt.' }))
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    const totaalTekst = res.totaal != null ? ` Totaal voor deze code: ${Math.round(res.totaal)}%.` : ''
    if (res.bouw7 === 'synced') toast.success(`Werk gereed bijgewerkt.${totaalTekst}`)
    else toast(`${res.melding ?? 'Opgeslagen in EVA.'}${totaalTekst}`, { icon: '💾' })
    setWaarde(invoer)
    setOpen(false)
    router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#6b757c' }}>Werk gereed</span>
        {kan ? (
          <button type="button" onClick={openen} style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'baseline', gap: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: GROEN }}>Wijzig</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)' }}>{pctTekst(waarde)}</span>
          </button>
        ) : (
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)' }}>{pctTekst(waarde)}</span>
        )}
      </div>
      <div style={{ height: 16, borderRadius: 999, background: '#eef1f2', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${klem(waarde)}%`, borderRadius: 999, background: GROEN }} />
      </div>

      {open && (
        <BottomSheet titel="Werk gereed" onSluit={() => !bezig && setOpen(false)}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
            {naam ?? code}
            {naam && code && <span style={{ fontSize: 13, fontWeight: 500, color: '#9aa4ab' }}> · {code}</span>}
          </div>
          <div style={{ fontSize: 14, color: '#6b757c', marginTop: -6 }}>
            Hoeveel van het arbeidswerk is klaar?
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {SNELKEUZE.map(p => {
              const gekozen = geldig && invoer === p
              return (
                <button key={p} type="button" onClick={() => setTekst(String(p))} style={{
                  flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 700,
                  border: `1px solid ${gekozen ? GROEN : 'var(--border)'}`,
                  background: gekozen ? `${GROEN}14` : 'transparent',
                  color: gekozen ? GROEN : 'var(--fg)',
                }}>
                  {p}%
                </button>
              )
            })}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number" inputMode="decimal" min={0} max={100} step={1}
              value={tekst}
              onChange={e => setTekst(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void bewaar() } }}
              aria-label="Percentage gereed"
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
                background: VLAK, fontFamily: 'inherit', fontSize: 20, fontWeight: 700, color: 'var(--fg)',
                textAlign: 'right',
              }}
            />
            <span style={{ fontSize: 20, fontWeight: 700, color: '#6b757c' }}>%</span>
          </label>
          {tekst.trim() !== '' && !geldig && (
            <p style={{ margin: 0, fontSize: 14, color: '#b42318' }}>Geef een percentage tussen 0 en 100.</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={() => setOpen(false)} disabled={bezig}
              style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
              Annuleren
            </button>
            <button type="button" onClick={bewaar} disabled={bezig || !geldig}
              style={{
                ...actieKnop, border: 'none',
                background: geldig ? GROEN : '#e8ebed',
                color: geldig ? '#fff' : '#9aa4ab',
                cursor: geldig ? 'pointer' : 'default',
                opacity: bezig ? 0.6 : 1,
              }}>
              {bezig ? 'Bezig…' : 'Opslaan'}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
