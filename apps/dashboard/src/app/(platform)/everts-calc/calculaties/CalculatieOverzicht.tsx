'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import {
  AANVRAAG_STATUSSEN,
  OFFERTE_STATUSSEN,
  OPDRACHT_STATUSSEN,
} from '@/components/dossiers/types'
import type { CalculatieRij } from '@/lib/everts-calc/services/calculaties'

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function formatEur(bedrag: number): string {
  return bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function EurCell({ bedrag }: { bedrag: number | null }) {
  if (bedrag === null || bedrag === 0) return <span style={{ color: 'var(--neutral-400)' }}>—</span>
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-900)' }}>
      € {formatEur(bedrag)}
    </span>
  )
}

function MargeEur({ marge }: { marge: number | null }) {
  if (marge === null) return <span style={{ color: 'var(--neutral-400)' }}>—</span>
  const kleur = marge > 0 ? 'var(--success-600)' : marge < 0 ? 'var(--error-600)' : 'var(--neutral-500)'
  return (
    <span style={{ fontSize: 12, color: kleur, fontWeight: 600 }}>
      € {formatEur(marge)}
    </span>
  )
}

function MargePct({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: 'var(--neutral-400)' }}>—</span>
  const kleur = pct > 0 ? 'var(--success-600)' : pct < 0 ? 'var(--error-600)' : 'var(--neutral-500)'
  return (
    <span style={{ fontSize: 12, color: kleur, fontWeight: 600 }}>
      {pct.toFixed(1)}%
    </span>
  )
}

// Alle statussen gecombineerd voor select-filter opties
const ALLE_STATUSSEN = [...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN]
const STATUS_KLEUREN = [
  'var(--brand-500)', 'var(--info-500)', 'var(--warning-500)',
  'var(--neutral-400)', 'var(--success-500)', 'var(--error-500)',
]

function DossierStatusBadge({ rij }: { rij: CalculatieRij }) {
  if (!rij.dossier_substatus) return <span style={{ color: 'var(--neutral-400)' }}>—</span>

  const statussen = rij.dossier_hoofdstatus === 'aanvraag' ? AANVRAAG_STATUSSEN
    : rij.dossier_hoofdstatus === 'offerte' ? OFFERTE_STATUSSEN
    : OPDRACHT_STATUSSEN
  const idx = statussen.findIndex(s => s.key === rij.dossier_substatus)
  const label = statussen[idx]?.label ?? rij.dossier_substatus
  const kleur = STATUS_KLEUREN[idx >= 0 ? idx % STATUS_KLEUREN.length : 0]

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px 3px 7px', borderRadius: 9999,
      fontSize: 11, fontWeight: 600,
      background: `color-mix(in srgb, ${kleur} 12%, white)`,
      color: kleur,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: kleur, flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ── Navigatie helper ──────────────────────────────────────────────────────────

function dossierRoute(rij: CalculatieRij): string | null {
  if (!rij.dossier_id || !rij.dossier_hoofdstatus) return null
  const sectie = rij.dossier_hoofdstatus === 'aanvraag' ? 'aanvragen'
    : rij.dossier_hoofdstatus === 'offerte' ? 'offertes'
    : 'opdrachten'
  return `/${sectie}/${rij.dossier_id}`
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

type Props = {
  calculaties: CalculatieRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export function CalculatieOverzicht({ calculaties, layouts, user_id }: Props) {
  const router = useRouter()

  const kolommen: KolomDefinitie<CalculatieRij>[] = React.useMemo(() => [
    {
      key: 'calculatie',
      label: 'Calculatie',
      vast: true,
      breedte: 240,
      filterType: 'tekst',
      sorteerWaarde: r => r.project_number ?? r.name,
      render: r => (
        <div>
          {r.project_number && (
            <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>
              {r.project_number}
            </div>
          )}
          <div style={{ fontWeight: 600, color: 'var(--neutral-900)', fontSize: 13, lineHeight: 1.3 }}>
            {r.name}
          </div>
        </div>
      ),
    },
    {
      key: 'dossiernummer',
      label: 'Dossiernummer',
      breedte: 140,
      filterType: 'tekst',
      sorteerWaarde: r => r.dossiernummer ?? '',
      render: r => r.dossiernummer
        ? <span style={{ fontSize: 12, color: 'var(--neutral-600)' }}>{r.dossiernummer}</span>
        : <span style={{ color: 'var(--neutral-400)' }}>—</span>,
    },
    {
      key: 'opdrachtgever',
      label: 'Opdrachtgever',
      breedte: 180,
      filterType: 'tekst',
      sorteerWaarde: r => r.client_name ?? '',
      render: r => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-700)' }}>
          {r.client_name ?? <span style={{ color: 'var(--neutral-400)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      breedte: 170,
      filterType: 'select',
      filterOpties: ALLE_STATUSSEN.map(s => s.label),
      sorteerWaarde: r => {
        if (!r.dossier_substatus) return 999
        const statussen = r.dossier_hoofdstatus === 'aanvraag' ? AANVRAAG_STATUSSEN
          : r.dossier_hoofdstatus === 'offerte' ? OFFERTE_STATUSSEN
          : OPDRACHT_STATUSSEN
        const idx = statussen.findIndex(s => s.key === r.dossier_substatus)
        return idx >= 0 ? idx : 99
      },
      render: r => <DossierStatusBadge rij={r} />,
    },
    {
      key: 'offerte_nummer',
      label: 'Offertenummer',
      breedte: 140,
      filterType: 'tekst',
      sorteerWaarde: r => r.quote_nummer ?? '',
      render: r => r.quote_nummer
        ? <span style={{ fontSize: 12, color: 'var(--neutral-600)' }}>{r.quote_nummer}</span>
        : <span style={{ color: 'var(--neutral-400)' }}>—</span>,
    },
    {
      key: 'verkoopprijs_excl',
      label: 'VP excl. BTW',
      breedte: 130,
      sorteerWaarde: r => r.subtotaal_ex_btw ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><EurCell bedrag={r.subtotaal_ex_btw} /></div>,
    },
    {
      key: 'btw',
      label: 'BTW',
      breedte: 100,
      sorteerWaarde: r => r.btw_bedrag ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><EurCell bedrag={r.btw_bedrag} /></div>,
    },
    {
      key: 'verkoopprijs_incl',
      label: 'VP incl. BTW',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.totaal_inc_btw ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><EurCell bedrag={r.totaal_inc_btw} /></div>,
    },
    {
      key: 'marge',
      label: 'Marge €',
      breedte: 110,
      sorteerWaarde: r => r.marge ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><MargeEur marge={r.marge} /></div>,
    },
    {
      key: 'marge_pct',
      label: 'Marge %',
      breedte: 95,
      sorteerWaarde: r => r.marge_pct ?? -Infinity,
      render: r => <MargePct pct={r.marge_pct} />,
    },
    {
      key: 'stelposten',
      label: 'Stelposten',
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.stelposten_subtotaal ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><EurCell bedrag={r.stelposten_subtotaal} /></div>,
    },
    {
      key: 'opties',
      label: 'Opties',
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.opties_subtotaal ?? -Infinity,
      render: r => <div style={{ textAlign: 'right' }}><EurCell bedrag={r.opties_subtotaal} /></div>,
    },
    {
      key: 'verrekenbaar',
      label: 'Verrekenbaar',
      standaard_zichtbaar: false,
      render: () => <span style={{ color: 'var(--neutral-400)' }}>—</span>,
    },
    {
      key: 'aangemaakt',
      label: 'Aangemaakt',
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.created_at,
      render: r => (
        <span style={{ fontSize: 12, color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
          {new Date(r.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ], [])

  return (
    <OverzichtTabel
      scherm="everts-calc-calculaties"
      data={calculaties}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      onRijKlik={r => {
        const route = dossierRoute(r)
        if (route) router.push(route)
      }}
    />
  )
}
