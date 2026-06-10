'use client'

import { useState } from 'react'

import { Button } from '@/components/ui'

type Tab = 'activiteiten' | 'medewerkers'

export default function PlanningTabSwitcher({ activiteiten, medewerkers }: {
  activiteiten: React.ReactNode
  medewerkers:  React.ReactNode
}) {
  const [tab, setTab] = useState<Tab>('activiteiten')

  return (
    <>
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, alignSelf: 'flex-start', marginBottom: 4 }}>
        {([['activiteiten', 'Activiteiten'], ['medewerkers', 'Medewerkers']] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={tab === key ? 'primary' : 'ghost'} onClick={() => setTab(key)}>
            {label}
          </Button>
        ))}
      </div>
      <div style={{ display: tab === 'activiteiten' ? 'block' : 'none' }}>{activiteiten}</div>
      <div style={{ display: tab === 'medewerkers' ? 'block' : 'none' }}>{medewerkers}</div>
    </>
  )
}
