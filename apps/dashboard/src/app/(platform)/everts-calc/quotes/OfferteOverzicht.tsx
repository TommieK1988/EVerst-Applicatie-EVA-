'use client'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import QuoteStatusBadge from '@/components/everts-calc/quotes/QuoteStatusBadge'
import { Button } from '@/components/ui/button'
import type { GebruikerLayout } from '@everts/database/platform-types'
import type { OfferteRij } from '@/lib/everts-calc/services/quotes'

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function formatEur(bedrag: number): string {
  return bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Bij een gekoppeld dossier: open de Informatie-tab van dat dossier.
// Zonder dossier: val terug op de quote-editor.
function offerteRoute(q: OfferteRij): string {
  if (q.dossier_id && q.dossier_hoofdstatus) {
    const sectie = q.dossier_hoofdstatus === 'aanvraag' ? 'aanvragen'
      : q.dossier_hoofdstatus === 'offerte' ? 'offertes'
      : 'opdrachten'
    return `/${sectie}/${q.dossier_id}/informatie`
  }
  return `/everts-calc/quotes/${q.id}`
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
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

function MargeEur({ marge, heeftRegels }: { marge: number; heeftRegels: boolean }) {
  if (!heeftRegels) return <span style={{ color: 'var(--neutral-400)' }}>—</span>
  const kleur = marge > 0 ? 'var(--success-600)' : marge < 0 ? 'var(--error-600)' : 'var(--neutral-500)'
  return (
    <span style={{ fontSize: 12, color: kleur, fontWeight: 600 }}>
      € {formatEur(marge)}
    </span>
  )
}

// ── Status filter opties ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  concept:      'Concept',
  verzonden:    'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen:    'Afgewezen',
  verlopen:     'Verlopen',
}

const TYPE_LABELS: Record<string, string> = {
  verkoopofferte:    'Verkoopofferte',
  interne_calculatie: 'Intern',
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

type Props = {
  offertes: OfferteRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export function OfferteOverzicht({ offertes, layouts, user_id }: Props) {
  const router = useRouter()

  const kolommen: KolomDefinitie<OfferteRij>[] = React.useMemo(() => [
    {
      key: 'offerte',
      label: 'Offerte',
      vast: true,
      filterType: 'tekst',
      sorteerWaarde: q => q.quote_nummer,
      render: q => (
        <div>
          <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>
            {q.quote_nummer}
          </div>
          <div style={{ fontWeight: 600, color: 'var(--neutral-900)', fontSize: 13, lineHeight: 1.3 }}>
            {q.titel}
          </div>
          {q.referentie && (
            <div style={{ fontSize: 11, color: 'var(--neutral-400)', marginTop: 1 }}>
              {q.referentie}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'opdrachtgever',
      label: 'Opdrachtgever',
      filterType: 'tekst',
      sorteerWaarde: q => q.client?.bedrijfsnaam ?? q.client?.naam ?? '',
      render: q => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-700)' }}>
          {q.client?.bedrijfsnaam ?? q.client?.naam ?? <span style={{ color: 'var(--neutral-400)' }}>—</span>}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      filterType: 'select',
      filterOpties: ['Verkoopofferte', 'Intern'],
      render: q => (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '2px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600,
          background: q.type === 'interne_calculatie' ? 'color-mix(in srgb, #7c3aed 10%, white)' : 'color-mix(in srgb, #0284c7 10%, white)',
          color: q.type === 'interne_calculatie' ? '#7c3aed' : '#0284c7',
        }}>
          {TYPE_LABELS[q.type] ?? q.type}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      filterType: 'select',
      filterOpties: Object.values(STATUS_LABELS),
      sorteerWaarde: q => {
        const volgorde = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen']
        const idx = volgorde.indexOf(q.status)
        return idx >= 0 ? idx : 99
      },
      render: q => <QuoteStatusBadge status={q.status} />,
    },
    {
      key: 'verkoopprijs',
      label: 'Verkoopprijs',
      sorteerWaarde: q => q.totaal_inc_btw,
      render: q => (
        <div style={{ textAlign: 'right' }}>
          {q.totaal_inc_btw > 0 ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neutral-900)' }}>
              € {formatEur(q.totaal_inc_btw)}
            </span>
          ) : (
            <span style={{ color: 'var(--neutral-400)' }}>—</span>
          )}
          {q.subtotaal_ex_btw > 0 && q.subtotaal_ex_btw !== q.totaal_inc_btw && (
            <div style={{ fontSize: 10, color: 'var(--neutral-400)' }}>
              € {formatEur(q.subtotaal_ex_btw)} excl.
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'marge',
      label: 'Marge',
      sorteerWaarde: q => q.marge,
      render: q => <MargeEur marge={q.marge} heeftRegels={q.totaal_kostprijs > 0 || q.subtotaal_ex_btw > 0} />,
    },
    {
      key: 'marge_pct',
      label: 'Marge %',
      sorteerWaarde: q => q.marge_pct ?? -Infinity,
      render: q => <MargePct pct={q.marge_pct} />,
    },
    {
      key: 'datum',
      label: 'Datum',
      sorteerWaarde: q => q.datum ?? '',
      render: q => (
        <span style={{ fontSize: 12, color: 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
          {formatDatum(q.datum)}
        </span>
      ),
    },
    {
      key: 'geldig_tot',
      label: 'Geldig tot',
      standaard_zichtbaar: false,
      sorteerWaarde: q => q.geldig_tot ?? '',
      render: q => {
        const verlopen = q.geldig_tot ? new Date(q.geldig_tot) < new Date() : false
        return (
          <span style={{ fontSize: 12, color: verlopen ? 'var(--error-600)' : 'var(--neutral-600)', whiteSpace: 'nowrap' }}>
            {formatDatum(q.geldig_tot)}
          </span>
        )
      },
    },
    {
      key: 'referentie',
      label: 'Referentie',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: q => q.referentie ?? '',
      render: q => (
        <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
          {q.referentie ?? '—'}
        </span>
      ),
    },
    {
      key: 'kostprijs',
      label: 'Kostprijs',
      standaard_zichtbaar: false,
      sorteerWaarde: q => q.totaal_kostprijs,
      render: q => (
        q.totaal_kostprijs > 0 ? (
          <span style={{ fontSize: 12, color: 'var(--neutral-700)' }}>
            € {formatEur(q.totaal_kostprijs)}
          </span>
        ) : (
          <span style={{ color: 'var(--neutral-400)' }}>—</span>
        )
      ),
    },
  ], [])

  const acties = (
    <Button asChild variant="primary" size="sm">
      <Link href="/everts-calc/quotes/new">
        <Plus className="w-3.5 h-3.5" />
        Nieuwe offerte
      </Link>
    </Button>
  )

  return (
    <OverzichtTabel
      scherm="everts-calc-quotes"
      data={offertes}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      onRijKlik={q => router.push(offerteRoute(q))}
      acties={acties}
    />
  )
}
