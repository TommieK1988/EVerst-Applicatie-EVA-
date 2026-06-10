'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerAfdeling, RechtenSet } from '@everts/database/platform-types'
import { updateAfdelingRechten } from './actions'
import { Card, Button, EmptyState } from '@/components/ui'

const MODULES = [
  { key: 'medewerkers',    label: 'Medewerkers' },
  { key: 'planning',       label: 'Planning' },
  { key: 'dossiers',       label: 'Dossiers' },
  { key: 'financieel',     label: 'Financieel' },
  { key: 'wagenpark',      label: 'Wagenpark' },
  { key: 'houtrotherstel', label: 'Houtrotherstel' },
  { key: 'everts_calc',    label: 'EvertsCalc' },
  { key: 'instellingen',   label: 'Instellingen' },
] as const

const NIVEAUS: { value: 'lezen' | 'schrijven' | 'beheren' | null; label: string; color: string }[] = [
  { value: null,        label: 'Geen',      color: 'var(--fg-muted)' },
  { value: 'lezen',     label: 'Lezen',     color: '#3b82f6' },
  { value: 'schrijven', label: 'Schrijven', color: '#f59e0b' },
  { value: 'beheren',   label: 'Beheren',   color: 'var(--accent)' },
]

function AfdelingRij({ afdeling }: { afdeling: MedewerkerAfdeling }) {
  const [rechten, setRechten] = useState<RechtenSet>(afdeling.standaard_rechten ?? {})
  const [isPending, startTransition] = useTransition()
  const [dirty, setDirty] = useState(false)

  function set(module: string, niveau: 'lezen' | 'schrijven' | 'beheren' | null) {
    setRechten(prev => ({ ...prev, [module]: niveau }))
    setDirty(true)
  }

  function save() {
    startTransition(async () => {
      const res = await updateAfdelingRechten(afdeling.id, rechten)
      if (!res.ok) { toast.error(res.error); return }
      setDirty(false)
      toast.success(`Rechten opgeslagen voor ${afdeling.naam}`)
    })
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  }

  return (
    <Card style={{ padding: '16px 20px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
          {afdeling.naam}
        </div>
        {dirty && (
          <Button variant="primary" size="sm" onClick={save} loading={isPending}>
            {isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        )}
      </div>

      {/* Grid: modules × niveaus */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ ...labelStyle, textAlign: 'left', padding: '4px 8px 8px 0', width: '30%' }}>Module</th>
              {NIVEAUS.map(n => (
                <th key={n.label} style={{ ...labelStyle, textAlign: 'center', padding: '4px 8px 8px', color: n.color || 'var(--fg-muted)' }}>
                  {n.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map(m => {
              const huidig = (rechten as Record<string, string | null>)[m.key] ?? null
              return (
                <tr key={m.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px 8px 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>
                    {m.label}
                  </td>
                  {NIVEAUS.map(n => (
                    <td key={n.label} style={{ textAlign: 'center', padding: 8 }}>
                      <input
                        type="radio"
                        name={`${afdeling.id}_${m.key}`}
                        checked={huidig === n.value}
                        onChange={() => set(m.key, n.value)}
                        style={{ accentColor: n.color || 'var(--fg-muted)', width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function AfdelingRechtenBeheer({ afdelingen }: { afdelingen: MedewerkerAfdeling[] }) {
  if (afdelingen.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Geen actieve afdelingen gevonden"
          description={
            <>
              Maak eerst afdelingen aan via{' '}
              <a href="/instellingen/functies-afdelingen" style={{ color: 'var(--accent)' }}>
                Instellingen → Functies & Afdelingen
              </a>.
            </>
          }
        />
      </Card>
    )
  }

  return (
    <div>
      {afdelingen.map(a => <AfdelingRij key={a.id} afdeling={a} />)}
    </div>
  )
}
