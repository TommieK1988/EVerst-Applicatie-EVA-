'use client'
import React, { useState, useTransition } from 'react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { nl } from 'date-fns/locale'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'

export type MobielTaak = {
  id: string
  titel: string
  deadline: string | null
  prioriteit: string
  dossier_naam: string | null
}

const PRIO: Record<string, { label: string; c: string; bg: string }> = {
  urgent:  { label: 'Urgent',  c: '#b42318', bg: '#fef3f2' },
  hoog:    { label: 'Urgent',  c: '#b42318', bg: '#fef3f2' },
  normaal: { label: 'Normaal', c: '#b85a00', bg: '#fff6ec' },
  laag:    { label: 'Laag',    c: '#6b757c', bg: '#f1f4f5' },
}

function deadlineLabel(iso: string | null): { tekst: string; kleur: string } | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    const kleur = isPast(d) && !isToday(d) ? '#b42318' : isToday(d) ? '#b85a00' : '#6b757c'
    return { tekst: format(d, 'd MMM', { locale: nl }), kleur }
  } catch { return null }
}

export default function MobielTakenLijst({ taken }: { taken: MobielTaak[] }) {
  const [afgevinkt, setAfgevinkt] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function vinkAf(id: string) {
    setAfgevinkt(prev => new Set(prev).add(id))
    startTransition(async () => {
      try {
        await updateTaakStatus(id, 'gereed')
      } catch {
        setAfgevinkt(prev => { const n = new Set(prev); n.delete(id); return n })
      }
    })
  }

  const zichtbaar = taken.filter(t => !afgevinkt.has(t.id))

  if (zichtbaar.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
        Geen openstaande taken
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {zichtbaar.map(taak => {
        const prio = PRIO[taak.prioriteit] ?? PRIO.normaal
        const dl = deadlineLabel(taak.deadline)
        return (
          <div
            key={taak.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: 14, background: '#fff',
              border: '1px solid #e3e8ea', borderRadius: 12,
            }}
          >
            <button
              onClick={() => vinkAf(taak.id)}
              aria-label="Taak afvinken"
              style={{
                width: 22, height: 22, flexShrink: 0, marginTop: 1,
                borderRadius: 6, border: '2px solid #e3e8ea', background: 'transparent',
                cursor: 'pointer', display: 'grid', placeItems: 'center',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#161b20', lineHeight: 1.45, marginBottom: 6 }}>
                {taak.titel}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {taak.dossier_naam && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#4d575e', background: '#f1f4f5', padding: '2px 7px', borderRadius: 6, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {taak.dossier_naam}
                  </span>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, color: prio.c, background: prio.bg, padding: '2px 8px', borderRadius: 99 }}>
                  {prio.label}
                </span>
                {dl && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: dl.kleur }}>{dl.tekst}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
