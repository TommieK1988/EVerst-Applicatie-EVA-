'use client'

import { useState, useEffect, useRef } from 'react'
import WerkbegrotingHoofdscherm from './WerkbegrotingHoofdscherm'
import { setProjectStatus } from '@/app/(platform)/everts-calc/actions/projecten'

const MAP_KEY = 'aanvraag_project_ids'

function leesMapping(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}

interface Props {
  aanvraagId: string
  naam: string
  nummer: string
}

export function OpdrachtWerkbegrotingTab({ aanvraagId, naam, nummer }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null)
  const statusBijgewerkt = useRef(false)

  useEffect(() => {
    const id = leesMapping()[aanvraagId] ?? null
    setProjectId(id)

    if (id && !statusBijgewerkt.current) {
      statusBijgewerkt.current = true
      setProjectStatus(id, 'opdracht').catch(console.error)
    }
  }, [aanvraagId])

  if (!projectId) {
    return (
      <div style={{
        padding: '56px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 32, opacity: 0.25 }}>◻</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Geen calculatie gekoppeld
        </p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
          Er is geen calculatie gevonden voor deze opdracht.
          Controleer of de aanvraag een gekoppelde calculatie heeft.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 56px)', overflow: 'hidden' }}>
      <WerkbegrotingHoofdscherm
        projectId={projectId}
        projectNaam={naam}
        projectNummer={nummer}
        projectStatus="opdracht"
        ingesloten
      />
    </div>
  )
}
