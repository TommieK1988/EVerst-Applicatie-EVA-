'use client'

import { useState, useEffect, useRef } from 'react'
import WerkbegrotingHoofdscherm from './WerkbegrotingHoofdscherm'
import { setProjectStatus } from '@/app/(platform)/everts-calc/actions/projecten'
import { maakStandaardScenario } from '@/lib/everts-calc/local-store'

const MAP_KEY = 'aanvraag_project_ids'

function leesMapping(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}

/**
 * Stabiel synthetisch project-id voor een opdracht zónder gekoppelde EVA-calculatie.
 * Deterministisch op de aanvraag/dossier-id, zodat scenario + (lege) werkbegroting
 * idempotent zijn over re-renders en sessies heen.
 */
function syntheticProjectId(aanvraagId: string): string {
  return `wb-direct-${aanvraagId}`
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
    const gekoppeld = leesMapping()[aanvraagId] ?? null

    if (gekoppeld) {
      // Gekoppelde EVA-calculatie → werkbegroting wordt standaard overgehaald.
      setProjectId(gekoppeld)
      if (!statusBijgewerkt.current) {
        statusBijgewerkt.current = true
        setProjectStatus(gekoppeld, 'opdracht').catch(console.error)
      }
    } else {
      // Geen calculatie gekoppeld → synthetisch project + scenario zodat er een
      // lege werkbegroting verschijnt die uit Bouw7 overgehaald kan worden.
      const synthId = syntheticProjectId(aanvraagId)
      maakStandaardScenario(synthId)
      setProjectId(synthId)
    }
  }, [aanvraagId])

  if (!projectId) {
    return (
      <div style={{ padding: '56px 40px', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
        Werkbegroting laden…
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
        dossierId={aanvraagId}
        ingesloten
      />
    </div>
  )
}
