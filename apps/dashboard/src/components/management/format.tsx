'use client'

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Progress } from '@/components/ui/progress'
import type { ManagementProject } from '@/lib/dashboard/aggregaties'
import { bewaarVoortgang } from '@/lib/dossiers/voortgang'

/* ── Formatters ──────────────────────────────────────────────────── */

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function fEur(v: number | null | undefined): string {
  return v == null ? '—' : eurFmt.format(v)
}

export function fPct(v: number | null | undefined): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}

/* ── Werkmaatschappij-kleuren (codeert de filiaal in het projectnummer) ── */

export const FILIAAL_KLEUR: Record<string, string> = {
  'Bouwbedrijf Morgenstond B.V.':     '#e8453b', // rood
  'Everts Onderhoudsschilders B.V.':  '#009439', // groen
  'Dakdekkersbedrijf Dakplan B.V.':   '#2e90fa', // blauw
}

export function filiaalKleur(filiaal: string | null | undefined): string {
  return FILIAAL_KLEUR[filiaal ?? ''] ?? 'var(--text)'
}

/* ── Open dossier in nieuw tabblad ───────────────────────────────── */

export function openDossierTab(p: ManagementProject) {
  if (!p.dossier_id || !p.dossier_sectie) return
  window.open(`/${p.dossier_sectie}/${p.dossier_id}`, '_blank', 'noopener')
}

/* ── Cel-renderers ───────────────────────────────────────────────── */

/** Projectnummer in de werkmaatschappij-kleur (filiaal-kolom vervalt daardoor). */
export function ProjectnummerCel({ p }: { p: ManagementProject }) {
  return (
    <span
      title={p.filiaal ?? undefined}
      style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: filiaalKleur(p.filiaal), whiteSpace: 'nowrap' }}
    >
      {p.projectnummer}
    </span>
  )
}

/** Tekstcel die afkapt en de volledige waarde toont bij hover. */
export function HoverTekst({ value, bold }: { value: string | null | undefined; bold?: boolean }) {
  if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span
      title={value}
      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: bold ? 500 : 400 }}
    >
      {value}
    </span>
  )
}

export function StatusCel({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  const t = status.toLowerCase()
  const kleur =
    t.includes('financ')                                 ? '#16a34a' :
    t.includes('uitvoering') || t.includes('onderhanden') ? '#2563eb' :
    t.includes('voorbereiding')                          ? '#d97706' :
    'var(--text-muted)'
  return (
    <span title={status} style={{
      display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      padding: '2px 7px', borderRadius: 4, background: `${kleur}18`, border: `1px solid ${kleur}40`,
      fontSize: 11, fontWeight: 500, color: kleur,
    }}>{status}</span>
  )
}

/** Rechts uitgelijnd geldbedrag, optioneel gekleurd bij negatief/marge. */
export function EurCel({ value, kleur }: { value: number | null | undefined; kleur?: 'resultaat' | 'marge' }) {
  let c: string | undefined
  if (kleur === 'resultaat') c = value != null && value < 0 ? '#dc2626' : undefined
  return <div style={{ textAlign: 'right', color: c, fontWeight: c ? 600 : 400 }}>{fEur(value)}</div>
}

export function MargeCel({ value }: { value: number | null | undefined }) {
  const c = value == null ? 'var(--text-muted)' : value < 0 ? '#dc2626' : value < 10 ? '#d97706' : '#16a34a'
  return <div style={{ textAlign: 'right', color: c, fontWeight: 600 }}>{fPct(value)}</div>
}

export function VerschilCel({ value }: { value: number | null | undefined }) {
  const c = value == null ? 'var(--text-muted)' : value > 0 ? '#16a34a' : value < 0 ? '#dc2626' : 'var(--text-muted)'
  const tekst = value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  return <div style={{ textAlign: 'right', color: c, fontWeight: 600 }}>{tekst}</div>
}

export function PctGereedCel({ waarde }: { waarde: number | null }) {
  if (waarde == null) return <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</div>
  const tone = waarde >= 100 ? 'success' : waarde >= 50 ? 'brand' : 'warning'
  const kleur = waarde >= 100 ? '#16a34a' : waarde >= 50 ? '#2563eb' : '#d97706'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <Progress value={Math.min(waarde, 100)} tone={tone} size="sm" className="w-12" />
      <span style={{ fontSize: 11, fontWeight: 600, color: kleur, minWidth: 30 }}>{waarde.toFixed(0)}%</span>
    </div>
  )
}

/**
 * Bewerkbare % gereed-cel voor de Management-tabel. Klik = inline number-input;
 * Enter/blur slaat op (EVA + Bouw7 via bewaarVoortgang), Escape annuleert.
 * stopPropagation voorkomt dat de rij-klik (openDossierTab) afgaat tijdens bewerken.
 * Zonder Bouw7-koppeling (geen bouw7_id) valt 'ie terug op de read-only weergave.
 */
export function PctGereedCelEditable({ p }: { p: ManagementProject }) {
  const [waarde, setWaarde] = useState<number | null>(p.pct_gereed)
  const [editing, setEditing] = useState(false)
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!p.bouw7_id) return <PctGereedCel waarde={waarde} />

  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTekst(waarde != null ? String(waarde) : '')
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = async () => {
    if (bezig) return
    const ruw = tekst.trim().replace(',', '.')
    if (ruw === '') { setEditing(false); return }
    const pct = Number(ruw)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Geef een percentage tussen 0 en 100.')
      return
    }
    if (waarde != null && Math.round(pct * 100) === Math.round(waarde * 100)) { setEditing(false); return }

    setBezig(true)
    const res = await bewaarVoortgang({
      bouw7Id: p.bouw7_id!,
      dossierId: p.dossier_id,
      niveau: 'project',
      pctGereed: pct,
    })
    setBezig(false)
    setEditing(false)
    if (res.ok) {
      setWaarde(pct)
      if (res.bouw7 === 'synced') toast.success('% gereed bijgewerkt in Bouw7.')
      else toast(res.melding ?? 'Opgeslagen in EVA.', { icon: '💾' })
    } else {
      toast.error(res.error)
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={100}
          step={1}
          value={tekst}
          disabled={bezig}
          onChange={(e) => setTekst(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void commit() }
            else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
          }}
          style={{
            width: 56, textAlign: 'right', fontSize: 11, fontWeight: 600, padding: '2px 4px',
            border: '1px solid var(--brand, #2563eb)', borderRadius: 4, background: 'var(--surface, #fff)',
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={start}
      title="Klik om % gereed te wijzigen"
      style={{ cursor: 'pointer', borderRadius: 4 }}
    >
      <PctGereedCel waarde={waarde} />
    </div>
  )
}
