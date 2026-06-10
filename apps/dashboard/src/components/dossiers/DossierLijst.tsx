'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { NieuweAanvraagModal } from './NieuweAanvraagModal'
import { getDossierSubstatus } from './types'
import type { DossierSectie, DossierSubstatus, DossierRij, StatusDef } from './types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { IconPlusDS } from '@/components/eva/Icons'

// Zelfde kleuren als DossierKanban (index-gebaseerd)
const STATUS_COLORS = [
  'var(--brand-500)',
  'var(--info-500)',
  'var(--warning-500)',
  'var(--neutral-400)',
  'var(--success-500)',
  'var(--error-500)',
]

const SECTIE_ROUTE: Record<DossierSectie, string> = {
  aanvraag:    'aanvragen',
  offerte:     'offertes',
  opdracht:    'opdrachten',
  servicedesk: 'servicedesk',
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function formatBedrag(bedrag: number | null): string {
  if (bedrag == null) return '—'
  if (bedrag >= 1_000_000) return `€ ${(bedrag / 1_000_000).toFixed(1)}M`
  if (bedrag >= 1_000)     return `€ ${Math.round(bedrag / 1_000)}K`
  return `€ ${bedrag}`
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function isVerlopen(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

function getMonteurNamen(d: DossierRij): string[] {
  return [
    d.uitvoerder_naam, d.projectleider_naam, d.teamleider_naam,
    d.werkvoorbereider_naam, d.calculator_naam, d.controller_naam,
  ].filter((n): n is string => !!n)
}

// ── Sub-componenten ───────────────────────────────────────────────────────────

const CREW_PALETTE = [
  '#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b',
  '#f59e0b', '#3b82f6', '#e11d48', '#0891b2',
  '#65a30d', '#9333ea',
]
function crewKleur(initialen: string): string {
  let hash = 0
  for (let i = 0; i < initialen.length; i++) hash = initialen.charCodeAt(i) + ((hash << 5) - hash)
  return CREW_PALETTE[Math.abs(hash) % CREW_PALETTE.length]
}

function MonteurStack({ namen }: { namen: string[] }) {
  if (namen.length === 0) return <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>—</span>
  const zichtbaar = namen.slice(0, 3)
  const overig    = namen.length - 3
  return (
    <div style={{ display: 'inline-flex' }}>
      {zichtbaar.map((naam, i) => {
        const initialen = naam.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
        const kleur = crewKleur(initialen)
        return (
          <div key={naam} title={naam} style={{
            width: 24, height: 24, borderRadius: '50%',
            background: `linear-gradient(135deg,${kleur},${kleur}cc)`,
            color: 'white', fontSize: 9, fontWeight: 700,
            display: 'grid', placeItems: 'center',
            boxShadow: '0 0 0 2px white', marginLeft: i > 0 ? -6 : 0,
          }}>
            {initialen}
          </div>
        )
      })}
      {overig > 0 && (
        <div style={{
          width: 24, height: 24, borderRadius: '50%',
          background: 'var(--neutral-200)', color: 'var(--neutral-600)',
          fontSize: 9, fontWeight: 600,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 0 0 2px white', marginLeft: -6,
        }}>+{overig}</div>
      )}
    </div>
  )
}

function ProgressBar({ pct, kleur }: { pct: number; kleur: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 90 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--neutral-200)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--neutral-500)', minWidth: 24 }}>
        {pct}%
      </span>
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'white', border: '1px solid var(--neutral-200)',
      borderRadius: 'var(--radius-xl)', padding: '16px 18px', flex: 1,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--neutral-400)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: accent || 'var(--neutral-900)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--neutral-400)', marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  dossiers: DossierRij[]
  sectie?: DossierSectie
  statussen: StatusDef<DossierSubstatus>[]
  layouts: GebruikerLayout[]
  user_id: string | null
  kanNieuwAanmaken?: boolean
  categorieen?: string[]
  viewToggle?: React.ReactNode
  extraActies?: React.ReactNode
  onDossierKlik?: (d: DossierRij) => void
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export function DossierLijst({
  dossiers,
  sectie,
  statussen,
  layouts,
  user_id,
  kanNieuwAanmaken = false,
  categorieen,
  viewToggle,
  extraActies,
  onDossierKlik,
}: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [data, setData] = React.useState<DossierRij[]>(dossiers)

  const scherm = sectie ? `dossiers-${sectie}` : 'dossiers'

  // ── Stat-kaart waarden ──────────────────────────────────────────────────────
  const totaalActief   = data.filter(d => {
    const idx = statussen.findIndex(s => s.key === getDossierSubstatus(d))
    return idx >= 0 && idx < statussen.length - 1
  }).length
  const inUitvoering  = data.filter(d => {
    const idx = statussen.findIndex(s => s.key === getDossierSubstatus(d))
    return idx > 0 && idx < Math.ceil(statussen.length / 2)
  }).length
  const verlopen      = data.filter(d => isVerlopen(d.verwacht_einddatum)).length
  const totaleBedrag  = data.reduce((acc, d) => acc + (d.bedrag_excl_btw ?? 0), 0)

  // ── Kolomdefinities ─────────────────────────────────────────────────────────
  const kolommen: KolomDefinitie<DossierRij>[] = React.useMemo(() => [
    {
      key: 'dossier',
      label: 'Dossier',
      vast: true,
      filterType: 'tekst',
      sorteerWaarde: d => d.titel ?? '',
      render: d => (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--neutral-400)' }}>
            {d.dossiernummer ?? d.id.slice(0, 12)}
          </div>
          <div style={{ fontWeight: 600, color: 'var(--neutral-900)', fontSize: 13, lineHeight: 1.3 }}>
            {d.titel}
          </div>
        </div>
      ),
    },
    {
      key: 'opdrachtgever',
      label: 'Opdrachtgever',
      filterType: 'tekst',
      sorteerWaarde: d => d.klant_naam ?? '',
      render: d => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-600)' }}>
          {d.klant_naam ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      filterType: 'select',
      filterOpties: statussen.map(s => s.label),
      sorteerWaarde: d => {
        const idx = statussen.findIndex(s => s.key === getDossierSubstatus(d))
        return idx >= 0 ? idx : statussen.length
      },
      render: d => {
        const sub = getDossierSubstatus(d)
        const idx = statussen.findIndex(s => s.key === sub)
        const label = statussen[idx]?.label ?? sub
        const kleur = STATUS_COLORS[idx >= 0 ? idx % STATUS_COLORS.length : 0]
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px 3px 7px', borderRadius: 9999,
            fontSize: 11, fontWeight: 600,
            background: `color-mix(in srgb, ${kleur} 12%, white)`,
            color: kleur,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            {label}
          </span>
        )
      },
    },
    {
      key: 'voortgang',
      label: 'Voortgang',
      breedte: 130,
      sorteerWaarde: d => {
        const idx = statussen.findIndex(s => s.key === getDossierSubstatus(d))
        return statussen.length > 1 ? Math.round((idx / (statussen.length - 1)) * 100) : 0
      },
      render: d => {
        const idx = statussen.findIndex(s => s.key === getDossierSubstatus(d))
        const pct = statussen.length > 1 ? Math.round((Math.max(0, idx) / (statussen.length - 1)) * 100) : 0
        const kleur = STATUS_COLORS[idx >= 0 ? idx % STATUS_COLORS.length : 0]
        return <ProgressBar pct={pct} kleur={kleur} />
      },
    },
    {
      key: 'team',
      label: 'Team',
      breedte: 90,
      render: d => <MonteurStack namen={getMonteurNamen(d)} />,
    },
    {
      key: 'deadline',
      label: 'Deadline',
      breedte: 100,
      sorteerWaarde: d => d.verwacht_einddatum ?? '',
      render: d => {
        const verlopen = isVerlopen(d.verwacht_einddatum)
        return (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: verlopen ? 'var(--warning-700)' : 'var(--neutral-500)',
            fontWeight: verlopen ? 600 : 400,
          }}>
            {verlopen ? '⚠ Verlopen' : formatDatum(d.verwacht_einddatum)}
          </span>
        )
      },
    },
    {
      key: 'bedrag',
      label: 'Bedrag',
      breedte: 90,
      sorteerWaarde: d => d.bedrag_excl_btw ?? 0,
      render: d => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--neutral-700)' }}>
          {formatBedrag(d.bedrag_excl_btw)}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statussen])

  // ── Klik-handler ────────────────────────────────────────────────────────────
  function handleKlik(d: DossierRij) {
    if (onDossierKlik) {
      onDossierKlik(d)
    } else if (sectie) {
      router.push(`/${SECTIE_ROUTE[sectie]}/${d.id}/informatie`)
    }
  }

  // ── Acties slot voor OverzichtTabel toolbar ──────────────────────────────────
  const acties = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {extraActies}
      {viewToggle}
      {kanNieuwAanmaken && (
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', borderRadius: 6,
            background: 'var(--brand-500)', color: 'white',
            fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          <IconPlusDS size={12} />
          Nieuwe aanvraag
        </button>
      )}
    </div>
  )

  return (
    <>
      {kanNieuwAanmaken && (
        <NieuweAanvraagModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAanmaken={nieuw => setData(prev => [nieuw, ...prev])}
          categorieen={categorieen}
        />
      )}

      <div style={{ padding: '24px 28px', minHeight: '100%' }}>

        {/* ── StatCards ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <StatCard
            label="Actieve dossiers"
            value={String(totaalActief)}
            sub={`${inUitvoering} in uitvoering`}
            accent="var(--brand-500)"
          />
          <StatCard
            label="Verlopen deadline"
            value={String(verlopen)}
            sub={verlopen === 1 ? '1 actie vereist' : verlopen > 0 ? `${verlopen} acties vereist` : 'alles op tijd'}
          />
          <StatCard
            label="Totale waarde (actief)"
            value={formatBedrag(totaleBedrag)}
            sub="begroot"
          />
          <StatCard
            label="Dossiers totaal"
            value={String(data.length)}
            sub={`${statussen.length} statussen`}
          />
        </div>

        {/* ── Tabel ──────────────────────────────────────────────────────────── */}
        <OverzichtTabel
          scherm={scherm}
          data={data}
          kolommen={kolommen}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={handleKlik}
          acties={acties}
        />
      </div>
    </>
  )
}
