'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { UrenRegel, BewakingscodeOptie } from '@/lib/dossiers/actions'
import { updateUurlogBewakingscode } from '@/lib/dossiers/actions'
import { fmt, fmtUren, fmtTarief, fmtDatum, TH, TD } from './tab-ui'
import { useDossierReadOnly } from '../DossierReadOnlyContext'

/* ─── Week helpers ─────────────────────────────────────────────────────────── */

function isoWeekNummer(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function fmtWeek(dateStr: string | null): string {
  const w = isoWeekNummer(dateStr)
  return w != null ? `W${w}` : '—'
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type SortKey = 'medewerker' | 'datum' | 'weeknummer' | 'uursoort' | 'code' | 'uren' | 'uurtarief' | 'bedrag'

/** Sorteren op deze kolommen geeft ook subtotalen. */
const GROEPEER_KEYS = new Set<SortKey>(['medewerker', 'weeknummer', 'uursoort', 'code'])

type DataRij = { type: 'data'; regel: UrenRegel }
type SubtotaalRij = { type: 'subtotaal'; label: string; uren: number; bedrag: number }
type TabelRij = DataRij | SubtotaalRij

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function sorteerWaarde(r: UrenRegel, key: SortKey): string | number {
  switch (key) {
    case 'medewerker': return (r.medewerker ?? '').toLowerCase()
    case 'datum':      return r.datum ?? ''
    case 'weeknummer': return isoWeekNummer(r.datum) ?? 0
    case 'uursoort':   return (r.uursoort ?? '').toLowerCase()
    case 'code':       return (r.code ?? '').toLowerCase()
    case 'uren':       return r.uren
    case 'uurtarief':  return r.uurtarief ?? 0
    case 'bedrag':     return r.bedrag
  }
}

function groepLabel(r: UrenRegel, key: SortKey): string {
  switch (key) {
    case 'medewerker': return r.medewerker ?? '—'
    case 'weeknummer': return fmtWeek(r.datum)
    case 'uursoort':   return r.uursoort ?? '—'
    case 'code':       return r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'
    default:           return ''
  }
}

function zoekMatch(r: UrenRegel, term: string): boolean {
  const s = term.toLowerCase()
  return [r.medewerker, r.datum, r.uursoort, r.code, r.codeNaam, fmtWeek(r.datum)]
    .some((v) => v?.toLowerCase().includes(s))
}

/* ─── Sorteer-header cel ────────────────────────────────────────────────────── */

function THSort({
  children, sortKey, huidig, asc, onClick,
}: {
  children: React.ReactNode
  sortKey: SortKey
  huidig: SortKey
  asc: boolean
  onClick: (k: SortKey) => void
}) {
  const actief = huidig === sortKey
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: '7px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700,
        color: actief ? 'var(--accent)' : 'var(--neutral-500)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        borderBottom: '2px solid var(--neutral-200, #e3e8ea)', whiteSpace: 'nowrap',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      {children}{actief ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function THSortLeft({
  children, sortKey, huidig, asc, onClick,
}: {
  children: React.ReactNode
  sortKey: SortKey
  huidig: SortKey
  asc: boolean
  onClick: (k: SortKey) => void
}) {
  const actief = huidig === sortKey
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: '7px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
        color: actief ? 'var(--accent)' : 'var(--neutral-500)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        borderBottom: '2px solid var(--neutral-200, #e3e8ea)', whiteSpace: 'nowrap',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      {children}{actief ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

/* ─── Hoofd component ───────────────────────────────────────────────────────── */

interface Props {
  dossierId: string
  regels: UrenRegel[]
  totalen: { uren: number; bedrag: number }
  bewakingscodes: BewakingscodeOptie[]
  perMedewerker: boolean
}

export default function UrenDetailTable({ dossierId, regels, totalen, bewakingscodes, perMedewerker }: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [pending, start] = useTransition()
  const [sortKey, setSortKey] = useState<SortKey>('datum')
  const [sortAsc, setSortAsc] = useState(false)
  const [zoek, setZoek] = useState('')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  function wijzigCode(regel: UrenRegel, nieuwCode: string) {
    if (!regel.bouw7Id || !regel.bouw7ProjectId || !regel.hourTypeId) return
    const optie = bewakingscodes.find((o) => o.code === nieuwCode)
    if (!optie) return
    start(async () => {
      const res = await updateUurlogBewakingscode(
        dossierId,
        { id: regel.bouw7Id!, bouw7ProjectId: regel.bouw7ProjectId!, logHours: String(regel.uren), logDate: regel.datum ?? '', hourTypeId: regel.hourTypeId! },
        optie.pslId,
      )
      if (res.ok) { toast.success('Bewakingscode bijgewerkt in Bouw7'); router.refresh() }
      else toast.error(res.error ?? 'Bouw7-update mislukt')
    })
  }

  /* Gefilterd + gesorteerd */
  const verwerkt = useMemo<TabelRij[]>(() => {
    const gefilterd = zoek.trim()
      ? regels.filter((r) => zoekMatch(r, zoek.trim()))
      : regels

    const gesorteerd = [...gefilterd].sort((a, b) => {
      const va = sorteerWaarde(a, sortKey)
      const vb = sorteerWaarde(b, sortKey)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'nl')
      return sortAsc ? cmp : -cmp
    })

    if (!perMedewerker || !GROEPEER_KEYS.has(sortKey)) {
      return gesorteerd.map((r) => ({ type: 'data', regel: r }))
    }

    /* Subtotalen per groep */
    const rijen: TabelRij[] = []
    let groep: UrenRegel[] = []
    let huidigLabel = ''

    for (const r of gesorteerd) {
      const label = groepLabel(r, sortKey)
      if (label !== huidigLabel && groep.length > 0) {
        rijen.push(...groep.map((g) => ({ type: 'data' as const, regel: g })))
        rijen.push({
          type: 'subtotaal',
          label: huidigLabel,
          uren: groep.reduce((s, g) => s + g.uren, 0),
          bedrag: groep.reduce((s, g) => s + g.bedrag, 0),
        })
        groep = []
      }
      huidigLabel = label
      groep.push(r)
    }
    if (groep.length > 0) {
      rijen.push(...groep.map((g) => ({ type: 'data' as const, regel: g })))
      rijen.push({
        type: 'subtotaal',
        label: huidigLabel,
        uren: groep.reduce((s, g) => s + g.uren, 0),
        bedrag: groep.reduce((s, g) => s + g.bedrag, 0),
      })
    }
    return rijen
  }, [regels, zoek, sortKey, sortAsc, perMedewerker])

  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const subtotaalBg = 'var(--neutral-50, #f8fafb)'

  /* ── Simpele bewakingscode-fallback (geen interactiviteit nodig) ── */
  if (!perMedewerker) {
    return (
      <table style={tabel}>
        <thead>
          <tr>
            <TH>Bewakingscode</TH><TH>Omschrijving</TH>
            <TH right>Geboekte uren</TH><TH right>Gem. tarief</TH><TH right>Arbeidskosten</TH>
          </tr>
        </thead>
        <tbody>
          {regels.map((r, i) => (
            <tr key={i}>
              <TD>{r.code ?? '—'}</TD><TD>{r.codeNaam ?? '—'}</TD>
              <TD right>{fmtUren(r.uren)}</TD><TD right>{fmtTarief(r.uurtarief)}</TD>
              <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
            </tr>
          ))}
          <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
            <TD vet>Totaal</TD><TD>{''}</TD>
            <TD right vet>{fmtUren(totalen.uren, true)}</TD><TD>{''}</TD>
            <TD right vet>{fmt(totalen.bedrag, true)}</TD>
          </tr>
        </tbody>
      </table>
    )
  }

  return (
    <div>
      {/* Zoekbalk */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--neutral-100)' }}>
        <input
          type="search"
          placeholder="Zoeken op medewerker, week, uursoort, bewakingscode…"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', fontSize: 13,
            border: '1px solid var(--neutral-200)', borderRadius: 6,
            background: 'var(--neutral-50)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tabel */}
      <div style={{ overflowX: 'auto', opacity: pending ? 0.6 : 1 }}>
        <table style={tabel}>
          <thead>
            <tr>
              <THSortLeft sortKey="medewerker" huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Medewerker</THSortLeft>
              <THSortLeft sortKey="datum"      huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Datum</THSortLeft>
              <THSortLeft sortKey="weeknummer" huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Week</THSortLeft>
              <THSortLeft sortKey="uursoort"   huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Uursoort</THSortLeft>
              <THSortLeft sortKey="code"       huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Bewakingscode</THSortLeft>
              <THSort     sortKey="uren"       huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Uren</THSort>
              <THSort     sortKey="uurtarief"  huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Uurtarief</THSort>
              <THSort     sortKey="bedrag"     huidig={sortKey} asc={sortAsc} onClick={toggleSort}>Bedrag</THSort>
            </tr>
          </thead>
          <tbody>
            {verwerkt.map((rij, i) => {
              if (rij.type === 'subtotaal') {
                return (
                  <tr key={`sub-${i}`} style={{ background: subtotaalBg, borderTop: '1px solid var(--neutral-200)' }}>
                    <td colSpan={5} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--neutral-600)' }}>
                      Subtotaal — {rij.label}
                    </td>
                    <td style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--neutral-900)' }}>
                      {fmtUren(rij.uren, true)}
                    </td>
                    <td style={{ padding: '5px 12px' }}>{''}</td>
                    <td style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--accent)' }}>
                      {fmt(rij.bedrag, true)}
                    </td>
                  </tr>
                )
              }

              const r = rij.regel
              return (
                <tr key={i}>
                  <TD>{r.medewerker ?? '—'}</TD>
                  <TD>{fmtDatum(r.datum)}</TD>
                  <TD>{fmtWeek(r.datum)}</TD>
                  <TD>{r.uursoort ?? '—'}</TD>
                  <TD>
                    {!readOnly && r.bouw7Id != null && bewakingscodes.length > 0 ? (
                      <select
                        disabled={pending}
                        value={r.code ?? ''}
                        onChange={(e) => wijzigCode(r, e.target.value)}
                        style={{
                          fontSize: 12, border: '1px solid var(--neutral-200)', borderRadius: 4,
                          padding: '2px 4px', background: 'var(--neutral-50)', cursor: 'pointer', minWidth: 120,
                        }}
                      >
                        {!r.code && <option value="">— geen code —</option>}
                        {bewakingscodes.map((o) => (
                          <option key={o.pslId} value={o.code}>
                            {o.code}{o.naam ? ` · ${o.naam}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'
                    )}
                  </TD>
                  <TD right>{fmtUren(r.uren)}</TD>
                  <TD right>{fmtTarief(r.uurtarief)}</TD>
                  <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
                </tr>
              )
            })}

            {/* Eindtotaal */}
            <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
              <TD vet>Totaal</TD>
              <TD>{''}</TD><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD>
              <TD right vet>{fmtUren(totalen.uren, true)}</TD>
              <TD>{''}</TD>
              <TD right vet>{fmt(totalen.bedrag, true)}</TD>
            </tr>
          </tbody>
        </table>
      </div>

      {zoek && (
        <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)' }}>
          {verwerkt.filter((r) => r.type === 'data').length} regels gevonden voor &quot;{zoek}&quot;
        </div>
      )}
    </div>
  )
}
