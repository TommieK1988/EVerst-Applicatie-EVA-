'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { syncManagementAction } from '@/app/(platform)/management/actions'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'

/* ── Types ────────────────────────────────────────────────────────── */

export type ManagementProject = {
  id: string
  projectnummer: string
  bouw7_id: string | null
  filiaal: string | null
  status: string | null
  opdrachtgever: string | null
  projectnaam: string
  categorie: string | null
  projectleider: string | null
  geboekte_kosten: number | null
  totale_opdracht: number | null
  pct_gereed: number | null
  totale_prognose: number | null
  verwacht_resultaat: number | null
  pct_marge: number | null
  omzet_obv_pct: number | null
  resultaat_obv_pct: number | null
  gefactureerd: number | null
  resultaat_gereed: number | null
  pct_marge_gereed: number | null
  verschil_pct_marge: number | null
  is_gereed: boolean
  bouw7_laatst_sync: string | null
}

type Props = {
  projecten: ManagementProject[]
  laatstGesynchroniseerd: string | null
}

/* ── Formatters ───────────────────────────────────────────────────── */

const eur = new Intl.NumberFormat('nl-NL', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})

function formatEur(v: number | null | undefined): string {
  if (v == null) return '—'
  return eur.format(v)
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function margeKleur(v: number | null | undefined): string {
  if (v == null) return 'var(--fg-muted)'
  if (v < 0) return '#dc2626'
  if (v < 10) return '#d97706'
  return '#16a34a'
}

function resultaatKleur(v: number | null | undefined): string {
  if (v == null) return 'var(--fg-muted)'
  return v < 0 ? '#dc2626' : 'inherit'
}

function formatDatum(iso: string | null): string {
  if (!iso) return 'Nooit'
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ── Helper: unieke gesorteerde lijst ────────────────────────────── */

function uniek(items: (string | null)[]): string[] {
  return [...new Set(items.filter(Boolean) as string[])].sort()
}

/* ── Hoofd-component ─────────────────────────────────────────────── */

export default function ManagementTabel({ projecten, laatstGesynchroniseerd }: Props) {
  const [tab, setTab]       = useState<'lopend' | 'gereed'>('lopend')
  const [zoek, setZoek]     = useState('')
  const [filiaal, setFiliaal]   = useState('')
  const [categorie, setCategorie] = useState('')
  const [pl, setPl]         = useState('')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const lopend = useMemo(() => projecten.filter(p => !p.is_gereed), [projecten])
  const gereed = useMemo(() => projecten.filter(p => p.is_gereed),  [projecten])

  const filialen    = useMemo(() => uniek(projecten.map(p => p.filiaal)),    [projecten])
  const categorieen = useMemo(() => uniek(projecten.map(p => p.categorie)),  [projecten])
  const pls         = useMemo(() => uniek(projecten.map(p => p.projectleider)), [projecten])

  const basis = tab === 'lopend' ? lopend : gereed

  const gefilterd = useMemo(() => basis.filter(p => {
    if (filiaal   && p.filiaal      !== filiaal)   return false
    if (categorie && p.categorie    !== categorie)  return false
    if (pl        && p.projectleider !== pl)        return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return (
        p.projectnummer.toLowerCase().includes(q) ||
        p.projectnaam.toLowerCase().includes(q) ||
        (p.opdrachtgever ?? '').toLowerCase().includes(q)
      )
    }
    return true
  }), [basis, filiaal, categorie, pl, zoek])

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      const r = await syncManagementAction()
      setSyncResult(
        r.fouten > 0
          ? `⚠ ${r.fouten} fouten — ${r.foutMelding ?? ''}`
          : `✓ ${r.nieuw} nieuw · ${r.bijgewerkt} bijgewerkt`
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0 16px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>
            Management
          </h1>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '2px 0 0' }}>
            Bijgewerkt: {formatDatum(laatstGesynchroniseerd)}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {syncResult && (
            <span style={{ fontSize: 12, color: syncResult.startsWith('⚠') ? '#dc2626' : '#16a34a' }}>
              {syncResult}
            </span>
          )}
          <Button
            onClick={handleSync}
            disabled={isPending}
            loading={isPending}
            variant="primary"
            size="md"
          >
            {!isPending && <SyncIcon spinning={false}/>}
            {isPending ? 'Synchroniseren…' : 'Vernieuwen'}
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
        {(['lopend', 'gereed'] as const).map(t => (
          <Button
            key={t}
            onClick={() => setTab(t)}
            variant={tab === t ? 'primary' : 'secondary'}
            size="md"
          >
            {t === 'lopend'
              ? `Lopende Werken (${lopend.length})`
              : `Gereed Werken (${gereed.length})`}
          </Button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          placeholder="Zoek project, naam, opdrachtgever…"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          style={inputStyle}
        />
        <Select value={filiaal} onChange={setFiliaal} placeholder="Alle filialen" options={filialen}/>
        <Select value={categorie} onChange={setCategorie} placeholder="Alle categorieën" options={categorieen}/>
        <Select value={pl} onChange={setPl} placeholder="Alle projectleiders" options={pls}/>
        {(filiaal || categorie || pl || zoek) && (
          <Button
            onClick={() => { setFiliaal(''); setCategorie(''); setPl(''); setZoek('') }}
            variant="outline"
            size="md"
          >
            Wis filters
          </Button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)', alignSelf: 'center' }}>
          {gefilterd.length} van {basis.length} projecten
        </span>
      </div>

      {/* ── Tabel ── */}
      <div style={{ flex: 1, overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
        {tab === 'lopend'
          ? <LopendeTabel rijen={gefilterd}/>
          : <GereedTabel  rijen={gefilterd}/>}
      </div>
    </div>
  )
}

/* ── Lopende Werken tabel ────────────────────────────────────────── */

function LopendeTabel({ rijen }: { rijen: ManagementProject[] }) {
  const kolommen: { label: string; right?: boolean }[] = [
    { label: 'Nr.' },
    { label: 'Filiaal' },
    { label: 'Status' },
    { label: 'Opdrachtgever' },
    { label: 'Project' },
    { label: 'PL' },
    { label: 'Geboekte kosten',  right: true },
    { label: 'Totale opdracht',  right: true },
    { label: '% gereed',         right: true },
    { label: 'Prognose',         right: true },
    { label: 'Verw. resultaat',  right: true },
    { label: '% marge',          right: true },
    { label: 'Omzet o.b.v. %',   right: true },
    { label: 'Res. o.b.v. %',    right: true },
  ]

  return (
    <table style={tabelStyle}>
      <thead>
        <tr>
          {kolommen.map(k => (
            <th key={k.label} style={{ ...thStyle, textAlign: k.right ? 'right' : 'left' }}>
              {k.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rijen.length === 0 && (
          <tr>
            <td colSpan={14}>
              <EmptyState title="Geen projecten gevonden" tone="neutral" size="sm" />
            </td>
          </tr>
        )}
        {rijen.map((p, i) => (
          <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
            <td style={tdStyle}><span style={nrStyle}>{p.projectnummer}</span></td>
            <td style={tdStyle}><Chip tekst={p.filiaal}/></td>
            <td style={tdStyle}><StatusChip tekst={p.status}/></td>
            <td style={{ ...tdStyle, maxWidth: 160 }}><Klem>{p.opdrachtgever}</Klem></td>
            <td style={{ ...tdStyle, maxWidth: 200 }}><Klem fontWeight={500}>{p.projectnaam}</Klem></td>
            <td style={tdStyle}><Klem>{p.projectleider}</Klem></td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.geboekte_kosten)}</td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.totale_opdracht)}</td>
            <td style={{ ...tdStyle, ...rechts }}><PctBar waarde={p.pct_gereed}/></td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.totale_prognose)}</td>
            <td style={{ ...tdStyle, ...rechts, color: resultaatKleur(p.verwacht_resultaat), fontWeight: p.verwacht_resultaat != null && p.verwacht_resultaat < 0 ? 600 : 400 }}>
              {formatEur(p.verwacht_resultaat)}
            </td>
            <td style={{ ...tdStyle, ...rechts }}>
              <span style={{ color: margeKleur(p.pct_marge), fontWeight: 600 }}>
                {formatPct(p.pct_marge)}
              </span>
            </td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.omzet_obv_pct)}</td>
            <td style={{ ...tdStyle, ...rechts, color: resultaatKleur(p.resultaat_obv_pct) }}>
              {formatEur(p.resultaat_obv_pct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Gereed Werken tabel ─────────────────────────────────────────── */

function GereedTabel({ rijen }: { rijen: ManagementProject[] }) {
  const kolommen: { label: string; right?: boolean }[] = [
    { label: 'Nr.' },
    { label: 'Filiaal' },
    { label: 'Status' },
    { label: 'Opdrachtgever' },
    { label: 'Project' },
    { label: 'PL' },
    { label: 'Gefactureerd',   right: true },
    { label: 'Geboekte kosten', right: true },
    { label: 'Resultaat',      right: true },
    { label: '% marge',        right: true },
    { label: 'Δ marge',        right: true },
  ]

  return (
    <table style={tabelStyle}>
      <thead>
        <tr>
          {kolommen.map(k => (
            <th key={k.label} style={{ ...thStyle, textAlign: k.right ? 'right' : 'left' }}>
              {k.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rijen.length === 0 && (
          <tr>
            <td colSpan={11}>
              <EmptyState title="Geen projecten gevonden" tone="neutral" size="sm" />
            </td>
          </tr>
        )}
        {rijen.map((p, i) => (
          <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
            <td style={tdStyle}><span style={nrStyle}>{p.projectnummer}</span></td>
            <td style={tdStyle}><Chip tekst={p.filiaal}/></td>
            <td style={tdStyle}><StatusChip tekst={p.status}/></td>
            <td style={{ ...tdStyle, maxWidth: 160 }}><Klem>{p.opdrachtgever}</Klem></td>
            <td style={{ ...tdStyle, maxWidth: 200 }}><Klem fontWeight={500}>{p.projectnaam}</Klem></td>
            <td style={tdStyle}><Klem>{p.projectleider}</Klem></td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.gefactureerd)}</td>
            <td style={{ ...tdStyle, ...rechts }}>{formatEur(p.geboekte_kosten)}</td>
            <td style={{ ...tdStyle, ...rechts, color: resultaatKleur(p.resultaat_gereed), fontWeight: p.resultaat_gereed != null && p.resultaat_gereed < 0 ? 600 : 400 }}>
              {formatEur(p.resultaat_gereed)}
            </td>
            <td style={{ ...tdStyle, ...rechts }}>
              <span style={{ color: margeKleur(p.pct_marge_gereed), fontWeight: 600 }}>
                {formatPct(p.pct_marge_gereed)}
              </span>
            </td>
            <td style={{ ...tdStyle, ...rechts }}>
              <span style={{ color: p.verschil_pct_marge != null && p.verschil_pct_marge > 0 ? '#16a34a' : p.verschil_pct_marge != null && p.verschil_pct_marge < 0 ? '#dc2626' : 'var(--fg-muted)' }}>
                {p.verschil_pct_marge != null ? (p.verschil_pct_marge > 0 ? '+' : '') + formatPct(p.verschil_pct_marge) : '—'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Sub-componenten ─────────────────────────────────────────────── */

function Select({ value, onChange, placeholder, options }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function Chip({ tekst }: { tekst: string | null }) {
  if (!tekst) return <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>—</span>
  const kort = tekst.replace('Bouwbedrijf Morgenstond B.V.', 'Morgenstond')
                    .replace('Everts Onderhoudsschilders B.V.', 'Everts Ond.')
                    .replace('Dakdekkersbedrijf Dakplan B.V.', 'Dakplan')
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      background: 'var(--bg-elev)', border: '1px solid var(--border)',
      fontSize: 11, fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap',
    }}>{kort}</span>
  )
}

function StatusChip({ tekst }: { tekst: string | null }) {
  if (!tekst) return <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>—</span>
  const kleur = tekst.toLowerCase().includes('gereed') ? '#16a34a'
    : tekst.toLowerCase().includes('lopend') || tekst.toLowerCase().includes('onderhanden') ? '#2563eb'
    : tekst.toLowerCase().includes('voorbereiding') ? '#d97706'
    : 'var(--fg-muted)'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      background: `${kleur}18`, border: `1px solid ${kleur}40`,
      fontSize: 11, fontWeight: 500, color: kleur, whiteSpace: 'nowrap',
    }}>{tekst}</span>
  )
}

function Klem({ children, fontWeight = 400 }: { children: React.ReactNode; fontWeight?: number }) {
  return (
    <span style={{
      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
      whiteSpace: 'nowrap', fontSize: 12, fontWeight, color: 'var(--fg)',
    }}>{children ?? <span style={{ color: 'var(--fg-muted)' }}>—</span>}</span>
  )
}

function PctBar({ waarde }: { waarde: number | null }) {
  if (waarde == null) return <span style={{ color: 'var(--fg-muted)' }}>—</span>
  const tone = waarde >= 100 ? 'success' : waarde >= 50 ? 'brand' : 'warning'
  const kleur = waarde >= 100 ? '#16a34a' : waarde >= 50 ? '#2563eb' : '#d97706'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <Progress value={Math.min(waarde, 100)} tone={tone} size="sm" className="w-12" />
      <span style={{ fontSize: 11, fontWeight: 600, color: kleur, minWidth: 32 }}>
        {waarde.toFixed(0)}%
      </span>
    </div>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <path d="M23 4v6h-6M1 20v-6h6"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  )
}

/* ── Stijlen ─────────────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  padding: '7px 11px', borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg-elev)',
  fontSize: 13, color: 'var(--fg)',
  outline: 'none', minWidth: 180,
}

const tabelStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  fontSize: 12, tableLayout: 'auto',
}

const thStyle: React.CSSProperties = {
  padding: '9px 12px',
  background: 'var(--bg-elev)',
  borderBottom: '2px solid var(--border)',
  fontWeight: 600, fontSize: 11,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const rechts: React.CSSProperties = { textAlign: 'right' }

const nrStyle: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 11,
  color: 'var(--accent)', fontWeight: 600,
}

