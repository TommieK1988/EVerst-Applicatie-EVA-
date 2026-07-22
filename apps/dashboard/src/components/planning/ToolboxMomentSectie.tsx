'use client'

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  getGepubliceerdeToolboxen,
  getMomentKoppeling,
  koppelMoment,
  ontkoppelMoment,
  type ToolboxKeuze,
  type MomentKoppeling,
} from '@/app/(platform)/kam/toolbox/actions'

/**
 * Sectie in de AgendaItemModal (alleen bij type `vca_toolbox`): koppel een
 * toolbox-onderwerp aan dít voorkomen (datum). Op de dag van het moment zet de
 * cron de toolbox automatisch klaar bij de doelgroep van het agenda-item.
 */
export default function ToolboxMomentSectie({
  agendaItemId,
  datum,
}: {
  agendaItemId: string
  datum: string
}) {
  const [toolboxen, setToolboxen] = useState<ToolboxKeuze[]>([])
  const [koppeling, setKoppeling] = useState<MomentKoppeling | null>(null)
  const [gekozen, setGekozen] = useState('')
  const [laden, setLaden] = useState(true)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let actief = true
    Promise.all([getGepubliceerdeToolboxen(), getMomentKoppeling(agendaItemId, datum)])
      .then(([tb, k]) => {
        if (!actief) return
        setToolboxen(tb)
        setKoppeling(k)
        setGekozen(k?.toolbox_id ?? '')
      })
      .finally(() => actief && setLaden(false))
    return () => { actief = false }
  }, [agendaItemId, datum])

  function koppel() {
    if (!gekozen) { toast.error('Kies een toolbox.'); return }
    startTransition(async () => {
      const res = await koppelMoment({ agendaItemId, datum, toolboxId: gekozen })
      if (!res.ok) { toast.error(res.error); return }
      const k = await getMomentKoppeling(agendaItemId, datum)
      setKoppeling(k)
      toast.success('Toolbox gekoppeld aan dit moment.')
    })
  }

  function ontkoppel() {
    startTransition(async () => {
      const res = await ontkoppelMoment({ agendaItemId, datum })
      if (!res.ok) { toast.error(res.error); return }
      setKoppeling(null)
      setGekozen('')
    })
  }

  return (
    <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: '1px solid #f5c67c', background: '#fffdf7' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a5200', marginBottom: 8 }}>
        Toolbox-onderwerp
      </div>

      {laden ? (
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Laden…</div>
      ) : koppeling && koppeling.status === 'klaargezet' ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{koppeling.toolbox_titel}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 2 }}>
            Klaargezet · {koppeling.aantal_afgerond} van {koppeling.aantal_toegewezen} afgerond
          </div>
          <Link href={`/kam/toolbox/${koppeling.toolbox_id}`} style={{ fontSize: 12, color: '#1f6feb', textDecoration: 'none' }}>
            Rapportage bekijken →
          </Link>
        </div>
      ) : koppeling ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{koppeling.toolbox_titel}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-soft)', marginTop: 2, marginBottom: 8 }}>
            Wordt op {new Date(datum).toLocaleDateString('nl-NL')} klaargezet bij de doelgroep van dit agenda-item.
          </div>
          <button onClick={ontkoppel} disabled={pending} style={ontkoppelBtn}>Loskoppelen</button>
        </div>
      ) : (
        <div>
          {toolboxen.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
              Er zijn nog geen gepubliceerde toolboxen. Maak er eerst één in de Toolbox-module.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={gekozen}
                onChange={(e) => setGekozen(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}
              >
                <option value="">Kies een toolbox…</option>
                {toolboxen.map((t) => <option key={t.id} value={t.id}>{t.titel}</option>)}
              </select>
              <button onClick={koppel} disabled={pending || !gekozen} style={koppelBtn}>Koppelen</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 8 }}>
            De doelgroep (afdelingen/medewerkers hieronder) bepaalt wie de toolbox krijgt.
          </div>
        </div>
      )}
    </div>
  )
}

const koppelBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: 'none', background: '#009439',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const ontkoppelBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elev)',
  color: '#b42318', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
