'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateNotificatieVoorkeuren } from './actions'
import {
  type NotificatieVoorkeuren,
  notificatieCategorieLabels,
  NOTIFICATIE_DEFAULTS,
} from '@everts/database/platform-types'
import { Button, Switch } from '@/components/ui'

type Categorie = keyof NotificatieVoorkeuren

const CATEGORIEEN: Categorie[] = [
  'taken',
  'opdrachten',
  'offertes',
  'storingsmeldingen',
  'wagenpark',
  'systeem',
]

export default function NotificatieVoorkeurenForm({
  initial,
}: {
  initial: NotificatieVoorkeuren
}) {
  const [voorkeuren, setVoorkeuren] = useState<NotificatieVoorkeuren>(() => ({
    ...NOTIFICATIE_DEFAULTS,
    ...initial,
  }))
  const [isPending, startTransition] = useTransition()

  function toggle(cat: Categorie, kanaal: 'in_app' | 'email') {
    setVoorkeuren(prev => {
      const huidige = prev[cat] ?? NOTIFICATIE_DEFAULTS[cat]!
      const updated = { ...huidige, [kanaal]: !huidige[kanaal] }
      return { ...prev, [cat]: updated }
    })
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateNotificatieVoorkeuren(voorkeuren)
      if (result.ok) {
        toast.success('Meldingsinstellingen opgeslagen')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div>
      {/* Kolomkoppen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 80px',
        gap: 8,
        padding: '0 0 8px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 4,
      }}>
        <div />
        {(['In-app', 'E-mail'] as const).map(label => (
          <div key={label} style={{
            fontSize: 10, fontWeight: 700,
            color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
            textAlign: 'center',
          }}>{label}</div>
        ))}
      </div>

      {/* Rijen per categorie */}
      {CATEGORIEEN.map(cat => {
        const kanalen = voorkeuren[cat] ?? NOTIFICATIE_DEFAULTS[cat]!
        return (
          <div key={cat} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px',
            gap: 8,
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>
              {notificatieCategorieLabels[cat]}
            </span>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Switch checked={kanalen.in_app} onCheckedChange={() => toggle(cat, 'in_app')} disabled={isPending} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Switch checked={kanalen.email} onCheckedChange={() => toggle(cat, 'email')} disabled={isPending} />
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 20 }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={isPending}
        >
          {isPending ? 'Opslaan…' : 'Instellingen opslaan'}
        </Button>
      </div>
    </div>
  )
}
