'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input } from '@/components/ui'
import { voegSaldoCorrectieToe, verwijderSaldoCorrectie } from '@/app/(platform)/medewerkers/[id]/uren-actions'

/**
 * Het tijd-voor-tijdsaldo van een medewerker, met de mogelijkheid het te corrigeren.
 *
 * Het saldo rekent zichzelf uit over de goedgekeurde weken. Een correctie is bedoeld voor wat daar
 * per definitie buiten valt: de beginstand bij ingebruikname, en losse afspraken (uitbetaald,
 * kwijtgescholden). Daarom altijd met een reden — een saldo dat verspringt zonder uitleg leidt
 * gegarandeerd tot een discussie die niemand kan naslaan.
 */

export type SaldoCorrectie = {
  id: string
  datum: string
  uren: number
  reden: string
  doorNaam: string | null
}

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

export default function SaldoBeheer({
  medewerkerId, saldo, correcties, magCorrigeren,
}: {
  medewerkerId: string
  saldo: number
  correcties: SaldoCorrectie[]
  magCorrigeren: boolean
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [open, setOpen] = useState(false)
  const [urenVeld, setUrenVeld] = useState('')
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)

  async function bewaar() {
    const n = parseFloat(urenVeld.replace(',', '.'))
    if (Number.isNaN(n) || n === 0) { toast.error('Vul een aantal uren in (mag negatief zijn).'); return }
    if (!reden.trim()) { toast.error('Geef een reden op.'); return }
    setBezig(true)
    const r = await voegSaldoCorrectieToe(medewerkerId, n, reden)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Correctie vastgelegd.')
    setOpen(false); setUrenVeld(''); setReden('')
    ververs()
  }

  async function verwijder(id: string) {
    const r = await verwijderSaldoCorrectie(id)
    if (!r.ok) { toast.error(r.error); return }
    ververs()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
          Tijd-voor-tijdsaldo
        </h3>
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 18, fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: saldo < 0 ? 'var(--danger-fg, #c0392b)' : 'var(--fg)',
          marginLeft: 'auto',
        }}>
          {saldo > 0 ? '+' : ''}{uur(saldo)} uur
        </span>
      </div>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
        Opgebouwd uit de goedgekeurde weken: alles boven de contracturen telt op, opgenomen tijd
        voor tijd telt af. Correcties hieronder tellen daarbovenop.
      </p>

      {correcties.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          {correcties.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-ui)', fontSize: 12,
              padding: '6px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
                {new Date(`${c.datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--fg)' }}>{c.reden}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {c.uren > 0 ? '+' : ''}{uur(c.uren)}
              </span>
              {magCorrigeren && (
                <button type="button" onClick={() => verwijder(c.id)} title="Correctie verwijderen"
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--fg-muted)', fontSize: 15, lineHeight: 1, padding: 0, width: 20,
                  }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {magCorrigeren && (open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 130 }}>
              <Input type="text" inputMode="decimal" value={urenVeld} placeholder="bv. 12,5 of -4"
                onChange={e => setUrenVeld(e.target.value)}
                suffix={<span style={{ fontSize: 10 }}>uur</span>} />
            </div>
            <Input placeholder="Reden — bv. beginstand bij invoering, of uitbetaald"
              value={reden} onChange={e => setReden(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button variant="primary" size="sm" onClick={bewaar} loading={bezig} disabled={bezig}
              style={{ marginLeft: 'auto' }}>
              Correctie vastleggen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          + Saldo corrigeren
        </Button>
      ))}
    </div>
  )
}
