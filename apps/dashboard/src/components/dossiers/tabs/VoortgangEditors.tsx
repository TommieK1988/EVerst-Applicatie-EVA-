'use client'

/**
 * Bewerkbare "% gereed" (voortgang) voor het Financieel-tab:
 *  - ProjectVoortgangEditor — projectbrede % gereed (Opdrachten + Servicedesk);
 *  - BewakingProgressCel    — standopname per bewakingscode (alleen Opdrachten).
 *
 * Beide schrijven via de server action `bewaarVoortgang` (EVA-opslag + Bouw7-doorzet).
 */

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { bewaarVoortgang, type VoortgangNiveau } from '@/lib/dossiers/voortgang'

const fmtPct = (v: number | null): string =>
  v == null ? '—' : `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v)} %`

/** Gedeelde commit-logica: valideren, opslaan, toasten. Geeft de nieuwe waarde terug bij succes. */
function useVoortgangOpslaan(args: {
  dossierId: string
  bouw7Id: string | null
  niveau: VoortgangNiveau
  bewakingscode?: string | null
}) {
  const [bezig, setBezig] = useState(false)

  async function opslaan(pct: number): Promise<number | null> {
    if (!args.bouw7Id) { toast.error('Geen Bouw7-koppeling voor dit project.'); return null }
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Geef een percentage tussen 0 en 100.'); return null }

    setBezig(true)
    const res = await bewaarVoortgang({
      bouw7Id: args.bouw7Id,
      dossierId: args.dossierId,
      niveau: args.niveau,
      bewakingscode: args.bewakingscode ?? null,
      pctGereed: pct,
    })
    setBezig(false)

    if (!res.ok) { toast.error(res.error); return null }
    if (res.bouw7 === 'synced') toast.success('% gereed bijgewerkt in Bouw7.')
    else toast(res.melding ?? 'Opgeslagen in EVA.', { icon: '💾' })
    return pct
  }

  return { bezig, opslaan }
}

function parsePct(tekst: string): number {
  return Number(tekst.trim().replace(',', '.'))
}

/* ── Per bewakingscode — inline cel ──────────────────────────────────── */

export function BewakingProgressCel({
  dossierId, bouw7Id, code, initial,
}: { dossierId: string; bouw7Id: string | null; code: string; initial: number | null }) {
  const [waarde, setWaarde] = useState<number | null>(initial)
  const [editing, setEditing] = useState(false)
  const [tekst, setTekst] = useState('')
  const { bezig, opslaan } = useVoortgangOpslaan({ dossierId, bouw7Id, niveau: 'bewakingscode', bewakingscode: code })
  const inputRef = useRef<HTMLInputElement>(null)

  const start = () => {
    setTekst(waarde != null ? String(waarde) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = async () => {
    if (bezig) return
    const ruw = tekst.trim()
    if (ruw === '') { setEditing(false); return }
    const pct = parsePct(ruw)
    if (waarde != null && Math.round(pct * 100) === Math.round(waarde * 100)) { setEditing(false); return }
    const nieuw = await opslaan(pct)
    setEditing(false)
    if (nieuw != null) setWaarde(nieuw)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number" min={0} max={100} step={1}
        value={tekst}
        disabled={bezig}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }}
        style={{
          width: 48, textAlign: 'right', fontSize: 12, fontWeight: 600, padding: '1px 3px',
          border: '1px solid var(--brand, #2563eb)', borderRadius: 4, background: 'var(--surface, #fff)',
        }}
      />
    )
  }

  return (
    <span
      onClick={start}
      title="Klik om % gereed te wijzigen"
      style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3, color: 'var(--neutral-800)' }}
    >
      {fmtPct(waarde)}
    </span>
  )
}

/* ── Project-niveau — compacte kaartregel ────────────────────────────── */

export function ProjectVoortgangEditor({
  dossierId, bouw7Id, initial, readOnly = false,
}: { dossierId: string; bouw7Id: string | null; initial: number | null; readOnly?: boolean }) {
  const [waarde, setWaarde] = useState<number | null>(initial)
  const [tekst, setTekst] = useState(initial != null ? String(initial) : '')
  const { bezig, opslaan } = useVoortgangOpslaan({ dossierId, bouw7Id, niveau: 'project' })

  const commit = async () => {
    const pct = parsePct(tekst)
    if (waarde != null && Math.round(pct * 100) === Math.round(waarde * 100)) return
    const nieuw = await opslaan(pct)
    if (nieuw != null) { setWaarde(nieuw); setTekst(String(nieuw)) }
  }

  // Read-only weergave: % gereed wordt uitsluitend in Management gewijzigd.
  if (readOnly) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 16px', marginBottom: 16,
        border: '1px solid var(--neutral-200, #e3e8ea)', borderRadius: 10, background: 'var(--neutral-50, #f8fafa)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            % gereed (project)
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--neutral-500)' }}>Wijzigen kan via Management.</span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: 'var(--neutral-700)' }}>
          {waarde != null ? `${waarde}%` : '—'}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '12px 16px', marginBottom: 16,
      border: '1px solid var(--neutral-200, #e3e8ea)', borderRadius: 10, background: 'var(--neutral-50, #f8fafa)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          % gereed (project)
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--neutral-500)' }}>Wordt teruggeschreven naar Bouw7.</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <input
          type="number" min={0} max={100} step={1}
          value={tekst}
          disabled={bezig || !bouw7Id}
          placeholder="—"
          onChange={(e) => setTekst(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commit() } }}
          style={{
            width: 72, textAlign: 'right', fontSize: 14, fontWeight: 700, padding: '4px 8px',
            border: '1px solid var(--neutral-300, #cdd5d8)', borderRadius: 6, background: 'var(--surface, #fff)',
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--neutral-600)' }}>%</span>
      </div>
    </div>
  )
}
