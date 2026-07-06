'use client'

import { useState, useEffect } from 'react'
import CalculatieHoofdscherm from './CalculatieHoofdscherm'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

const MAP_KEY = 'aanvraag_project_ids'

function leesMapping(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}

function schrijfMapping(map: Record<string, string>) {
  localStorage.setItem(MAP_KEY, JSON.stringify(map))
}

function migreerCalculatieData(oudId: string, nieuwId: string) {
  for (const key of ['evc_scenarios', 'evc_meetstaten', 'evc_werkbegrotingen']) {
    try {
      const data: { project_id?: string }[] = JSON.parse(localStorage.getItem(key) ?? '[]')
      localStorage.setItem(key, JSON.stringify(
        data.map(item => item.project_id === oudId ? { ...item, project_id: nieuwId } : item)
      ))
    } catch {}
  }
}

export function slaAanvraagProjectIdOp(aanvraagId: string, projectId: string) {
  const mapping = leesMapping()
  mapping[aanvraagId] = projectId
  schrijfMapping(mapping)
}

interface Props {
  aanvraagId: string
  naam: string
  nummer: string
  /** Server-side gekoppeld everts-calc project (dossiers.everts_calc_project_id). Seedt de
   *  localStorage-mapping zodat de calculatie ook in een verse browser zichtbaar is. */
  initieelProjectId?: string | null
}

export function AanvraagCalculatieTab({ aanvraagId, naam, nummer, initieelProjectId }: Props) {
  const readOnly = useDossierReadOnly()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isLaden, setIsLaden]     = useState(false)
  const [fout, setFout]           = useState<string | null>(null)

  useEffect(() => {
    const mapping = leesMapping()
    if (mapping[aanvraagId]) {
      setProjectId(mapping[aanvraagId])
    } else if (initieelProjectId) {
      // Server zegt dat er een project gekoppeld is, maar deze browser kent de mapping nog niet.
      mapping[aanvraagId] = initieelProjectId
      schrijfMapping(mapping)
      setProjectId(initieelProjectId)
    }
  }, [aanvraagId, initieelProjectId])

  async function handleKoppelen() {
    setIsLaden(true)
    setFout(null)
    try {
      const { id } = await maakProjectVanAanvraag(naam, '')
      migreerCalculatieData(aanvraagId, id)
      const mapping = leesMapping()
      mapping[aanvraagId] = id
      schrijfMapping(mapping)
      setProjectId(id)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Fout bij aanmaken')
    } finally {
      setIsLaden(false)
    }
  }

  if (!projectId) {
    return (
      <div style={{
        padding: '56px 40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 32, opacity: 0.25 }}>⚡</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
          Calculatie koppelen aan overzicht
        </p>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', maxWidth: 320, margin: 0, lineHeight: 1.6 }}>
          {readOnly
            ? 'Deze aanvraag heeft geen calculatie in het EvertsCalc-overzicht. Het dossier is afgesloten en alleen-lezen.'
            : 'Deze aanvraag heeft nog geen calculatie in het EvertsCalc-overzicht. Klik hieronder om het eenmalig aan te maken.'}
        </p>
        {!readOnly && (
          <button
            onClick={handleKoppelen}
            disabled={isLaden}
            style={{
              marginTop: 4,
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'white',
              fontSize: 13, fontWeight: 700,
              cursor: isLaden ? 'not-allowed' : 'pointer',
              opacity: isLaden ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isLaden ? 'Bezig…' : 'Calculatie aanmaken in overzicht'}
          </button>
        )}
        {fout && (
          <p style={{ fontSize: 12, color: 'var(--color-red, #dc2626)', margin: 0 }}>{fout}</p>
        )}
      </div>
    )
  }

  return (
    <CalculatieHoofdscherm
      projectId={projectId}
      projectNaam={naam}
      projectNummer={nummer}
      toonProjectDetail
      readOnly={readOnly}
    />
  )
}
