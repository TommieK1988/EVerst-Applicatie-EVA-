'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'
import { maakToolbox, type ToolboxOverzichtRij } from '@/app/(platform)/toolbox/actions'
import type { ToolboxStatus } from '@/components/toolbox/types'

const STATUS_META: Record<ToolboxStatus, { label: string; c: string; bg: string }> = {
  concept:      { label: 'Concept',      c: '#b85a00', bg: '#fff6ec' },
  gepubliceerd: { label: 'Gepubliceerd', c: '#067647', bg: '#ecfdf3' },
  gearchiveerd: { label: 'Gearchiveerd', c: '#6b757c', bg: '#f1f4f5' },
}

function StatusPil({ status }: { status: ToolboxStatus }) {
  const m = STATUS_META[status]
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: m.c, background: m.bg, padding: '2px 9px', borderRadius: 99 }}>
      {m.label}
    </span>
  )
}

const KOLOMMEN: KolomDefinitie<ToolboxOverzichtRij>[] = [
  {
    key: 'titel',
    label: 'Toolbox',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: (r) => r.titel,
    render: (r) => (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.titel}
        </div>
        {r.omschrijving && (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
            {r.omschrijving}
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: Object.values(STATUS_META).map((s) => s.label),
    sorteerWaarde: (r) => STATUS_META[r.status].label,
    render: (r) => <StatusPil status={r.status} />,
  },
  {
    key: 'huidige_versie',
    label: 'Versie',
    sorteerWaarde: (r) => r.huidige_versie,
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.huidige_versie > 0 ? `v${r.huidige_versie}` : '—'}</span>,
  },
  {
    key: 'aantal_toegewezen',
    label: 'Toegewezen',
    sorteerWaarde: (r) => r.aantal_toegewezen,
    render: (r) => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.aantal_toegewezen}</span>,
  },
  {
    key: 'aantal_afgerond',
    label: 'Afgerond',
    sorteerWaarde: (r) => r.aantal_afgerond,
    render: (r) => (
      <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.aantal_afgerond}{r.aantal_toegewezen > 0 && ` / ${r.aantal_toegewezen}`}
      </span>
    ),
  },
  {
    key: 'bijgewerkt_op',
    label: 'Bijgewerkt',
    sorteerWaarde: (r) => r.bijgewerkt_op,
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{new Date(r.bijgewerkt_op).toLocaleDateString('nl-NL')}</span>,
  },
]

type Props = {
  data: ToolboxOverzichtRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export default function ToolboxOverzicht({ data, layouts, user_id }: Props) {
  const router = useRouter()
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [titel, setTitel] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [pending, startTransition] = useTransition()

  function maak() {
    const t = titel.trim()
    if (!t) { toast.error('Geef de toolbox een titel.'); return }
    startTransition(async () => {
      const res = await maakToolbox({ titel: t, omschrijving: omschrijving.trim() || undefined })
      if (!res.ok) { toast.error(res.error); return }
      router.push(`/toolbox/${res.data.id}/bewerken`)
    })
  }

  return (
    <div className="eva-page-full">
      <PageHeader
        eyebrow="Apps"
        title="Toolbox"
        actions={
          <Button variant="primary" onClick={() => setNieuwOpen(true)}>
            <IconPlus size={14} /> Nieuwe toolbox
          </Button>
        }
      />

      {data.length === 0 ? (
        <div style={{
          marginTop: 24, padding: '48px 24px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--bg-subtle)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🦺</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
            Nog geen toolboxen
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4, marginBottom: 16 }}>
            Bouw je eerste veiligheids-toolbox met slides en een kennischeck.
          </div>
          <Button variant="primary" onClick={() => setNieuwOpen(true)}>
            <IconPlus size={14} /> Nieuwe toolbox
          </Button>
        </div>
      ) : (
        <OverzichtTabel
          scherm="toolbox"
          data={data}
          kolommen={KOLOMMEN}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={(r) => router.push(`/toolbox/${r.id}`)}
          beginSortering={[{ id: 'bijgewerkt_op', desc: true }]}
        />
      )}

      {nieuwOpen && (
        <div
          onClick={() => !pending && setNieuwOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 16 }}>Nieuwe toolbox</div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-soft)', marginBottom: 6 }}>Titel</label>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              autoFocus
              placeholder="Bijv. Werken op hoogte"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-soft)', marginBottom: 6 }}>Omschrijving (optioneel)</label>
            <textarea
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, marginBottom: 20, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="ghost" onClick={() => setNieuwOpen(false)} disabled={pending}>Annuleren</Button>
              <Button variant="primary" onClick={maak} disabled={pending}>{pending ? 'Bezig…' : 'Aanmaken'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
