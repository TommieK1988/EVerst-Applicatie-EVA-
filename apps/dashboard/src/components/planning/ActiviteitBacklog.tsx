'use client'

import { useState, useTransition } from 'react'
import { useDraggable } from '@dnd-kit/core'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type { PlanningActiviteit } from '@everts/database/platform-types'
import { maakPlanningActiviteit, verwijderPlanningActiviteit } from '@/app/(platform)/planning/actions'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

const STATUS_LABELS: Record<string, string> = {
  backlog:       'Backlog',
  gepland:       'Gepland',
  in_uitvoering: 'Lopend',
  opgeleverd:    'Gereed',
  on_hold:       'On hold',
}

function DraggableActiviteit({ activiteit }: { activiteit: PlanningActiviteit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `activiteit-${activiteit.id}`,
    data: { type: 'activiteit', activiteit },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        padding: '7px 10px',
        background: isDragging ? 'var(--bg-active)' : 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
      }}
    >
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
        {activiteit.titel}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
        {activiteit.geschatte_uren != null && (
          <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
            {activiteit.geschatte_uren}u
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {STATUS_LABELS[activiteit.status] ?? activiteit.status}
        </span>
      </div>
    </div>
  )
}

type Props = {
  dossier_id: string
  activiteiten: PlanningActiviteit[]
}

export default function ActiviteitBacklog({ dossier_id, activiteiten: initialActiviteiten }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activiteiten, setActiviteiten] = useState(initialActiviteiten)
  const [toonForm, setToonForm] = useState(false)
  const [titel, setTitel]   = useState('')
  const [uren, setUren]     = useState('')
  const [pending, setPending] = useState(false)

  const ongepland = activiteiten.filter(a => a.status === 'backlog' || a.status === 'on_hold')
  const gepland   = activiteiten.filter(a => a.status === 'gepland' || a.status === 'in_uitvoering')
  const gereed    = activiteiten.filter(a => a.status === 'opgeleverd')

  async function maakActiviteit() {
    if (!titel.trim()) return
    setPending(true)
    const result = await maakPlanningActiviteit({
      dossier_id,
      titel:           titel.trim(),
      geschatte_uren:  uren ? parseFloat(uren) : undefined,
      status:          'backlog',
    })
    setPending(false)
    if (!result.ok) { toast.error(result.error); return }
    setActiviteiten(prev => [...prev, result.data])
    setTitel('')
    setUren('')
    setToonForm(false)
    startTransition(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Activiteiten
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setToonForm(v => !v)}
        >
          + Nieuwe activiteit
        </Button>
      </div>

      {toonForm && (
        <Card>
          <CardBody className="flex flex-col gap-1.5 py-2.5 px-3">
            <input
              className="eva-input"
              placeholder="Activiteitnaam"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && maakActiviteit()}
              autoFocus
            />
            <input
              className="eva-input"
              placeholder="Geschatte uren (optioneel)"
              type="number"
              min="0"
              step="0.5"
              value={uren}
              onChange={e => setUren(e.target.value)}
            />
            <div className="flex gap-1.5">
              <Button variant="primary" size="sm" onClick={maakActiviteit} disabled={pending || !titel.trim()} loading={pending}>
                {pending ? '…' : 'Opslaan'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setToonForm(false)}>
                Annuleren
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {ongepland.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Backlog
          </div>
          {ongepland.map(a => <DraggableActiviteit key={a.id} activiteit={a} />)}
        </div>
      )}

      {gepland.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Ingepland
          </div>
          {gepland.map(a => <DraggableActiviteit key={a.id} activiteit={a} />)}
        </div>
      )}

      {gereed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            Gereed
          </div>
          {gereed.map(a => <DraggableActiviteit key={a.id} activiteit={a} />)}
        </div>
      )}

      {activiteiten.length === 0 && !toonForm && (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen activiteiten"
          description='Klik op "+ Nieuwe activiteit" om te beginnen.'
        />
      )}
    </div>
  )
}
