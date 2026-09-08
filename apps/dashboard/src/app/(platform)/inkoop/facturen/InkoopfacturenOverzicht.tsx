'use client'

import React, { useMemo, useState } from 'react'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'
import { Button } from '@/components/ui'
import InkoopfactuurPaneel from '@/components/inkoopfacturen/InkoopfactuurPaneel'
import { ververAlleInkoopfacturen, zetBetaalronde, type ActieResultaat } from '@/lib/inkoopfacturen/actions'
import { inkoopStatusLabel, INKOOP_STATUS_BETAALBAAR } from '@/lib/bouw7/inkoop-status'
import { vervalKleur, type InkoopfactuurRij, type BetaalrondeRij } from '@/lib/inkoopfacturen/types'

/**
 * Bedrijfsbreed inkoopfacturen-overzicht.
 *
 * De tabbladen zijn geen filters op smaak maar de vier vragen die het scherm moet beantwoorden:
 * wat moet ík doen, wat ligt er nog open, wat mag betaald worden, en wat is de historie.
 * "Te accorderen door mij" staat vooraan met een teller — dat vervangt de melding per factuur.
 */

type Tab = 'mijn' | 'open' | 'betaalbaar' | 'alles'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mijn',       label: 'Te accorderen door mij' },
  { key: 'open',       label: 'Openstaand' },
  { key: 'betaalbaar', label: 'Te betalen' },
  { key: 'alles',      label: 'Alles' },
]

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const VERVAL_KLEUR: Record<string, string> = {
  verlopen: '#dc2626',
  bijna:    '#f59e0b',
  ok:       'var(--fg-soft)',
  geen:     'var(--fg-soft)',
}

const STATUS_OPTIES = ['Concept', 'Ter goedkeuring', 'Goedgekeurd', 'Betaald', 'Afgekeurd']

const KOLOMMEN: KolomDefinitie<InkoopfactuurRij>[] = [
  {
    key: 'status',
    label: 'Status',
    breedte: 150,
    filterType: 'select',
    filterOpties: STATUS_OPTIES,
    sorteerWaarde: r => r.bouw7_status ?? 99,
    filterWaarde: r => inkoopStatusLabel(r.bouw7_status),
    render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{inkoopStatusLabel(r.bouw7_status)}</span>
        {r.mijn_beurt && (
          <span title="Jij bent aan zet" style={{
            fontSize: 9, fontWeight: 800, color: 'white', background: '#2563eb',
            padding: '1px 5px', borderRadius: 6, letterSpacing: '0.03em',
          }}>MIJN BEURT</span>
        )}
      </div>
    ),
  },
  {
    key: 'factuurnummer',
    label: 'Factuurnr.',
    vast: true,
    breedte: 120,
    filterType: 'tekst',
    sorteerWaarde: r => r.factuurnummer ?? '',
    render: r => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.factuurnummer ?? '—'}</span>,
  },
  {
    key: 'leverancier_naam',
    label: 'Leverancier',
    breedte: 220,
    filterType: 'tekst',
    sorteerWaarde: r => (r.leverancier_naam ?? '').toLowerCase(),
    render: r => <span style={{ fontSize: 13 }}>{r.leverancier_naam ?? '—'}</span>,
  },
  {
    key: 'project',
    label: 'Project',
    breedte: 240,
    filterType: 'select',
    filterOpties: ['Opdracht', 'Servicedesk', 'Project zonder dossier', 'Overhead'],
    sorteerWaarde: r => (r.project_naam ?? '').toLowerCase(),
    filterWaarde: r =>
      r.bouw7_project_id == null ? 'Overhead'
        : r.dossier_sectie === 'servicedesk' ? 'Servicedesk'
        : r.dossier_sectie === 'opdracht' ? 'Opdracht'
        : 'Project zonder dossier',
    render: r => {
      if (r.bouw7_project_id == null) {
        return <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontStyle: 'italic' }}>— overhead</span>
      }
      const label = [r.project_nummer, r.project_naam].filter(Boolean).join(' · ') || '—'
      return r.dossier_id
        ? <a href={`/dossiers/${r.dossier_id}`} onClick={e => e.stopPropagation()}
             style={{ fontSize: 13, color: 'var(--primary-fg, #2563eb)', textDecoration: 'none' }}>{label}</a>
        : <span style={{ fontSize: 13 }}>{label}</span>
    },
  },
  {
    key: 'bedrag_incl',
    label: 'Bedrag incl.',
    breedte: 120,
    sorteerWaarde: r => r.bedrag_incl ?? 0,
    render: r => <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag_incl)}</span>,
  },
  {
    key: 'bedrag_excl',
    label: 'Bedrag excl.',
    standaard_zichtbaar: false,
    breedte: 120,
    sorteerWaarde: r => r.bedrag_excl ?? 0,
    render: r => <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag_excl)}</span>,
  },
  {
    key: 'btw_bedrag',
    label: 'BTW',
    standaard_zichtbaar: false,
    breedte: 100,
    sorteerWaarde: r => r.btw_bedrag ?? 0,
    render: r => <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{euro(r.btw_bedrag)}</span>,
  },
  {
    key: 'factuurdatum',
    label: 'Factuurdatum',
    standaard_zichtbaar: false,
    breedte: 120,
    sorteerWaarde: r => r.factuurdatum ?? '',
    render: r => <span style={{ fontSize: 13 }}>{datum(r.factuurdatum)}</span>,
  },
  {
    key: 'vervaldatum',
    label: 'Vervaldatum',
    breedte: 150,
    // Sorteren op dagen (dus het meest urgente bovenaan), niet op de datumtekst.
    sorteerWaarde: r => r.dagen_tot_vervaldatum ?? 9999,
    render: r => {
      const kleur = VERVAL_KLEUR[vervalKleur(r.dagen_tot_vervaldatum)]
      const d = r.dagen_tot_vervaldatum
      const bij = d == null ? '' : d < 0 ? ` (${-d} dgn te laat)` : d === 0 ? ' (vandaag)' : ` (${d} dgn)`
      return <span style={{ fontSize: 13, color: kleur }}>{datum(r.vervaldatum)}{bij}</span>
    },
  },
  {
    key: 'huidige_goedkeurder_naam',
    label: 'Goedkeurder',
    breedte: 160,
    filterType: 'tekst',
    sorteerWaarde: r => (r.huidige_goedkeurder_naam ?? '').toLowerCase(),
    render: r => <span style={{ fontSize: 13 }}>{r.huidige_goedkeurder_naam ?? '—'}</span>,
  },
  {
    key: 'divisie_naam',
    label: 'Administratie',
    standaard_zichtbaar: false,
    breedte: 200,
    filterType: 'select',
    sorteerWaarde: r => r.divisie_naam ?? '',
    filterWaarde: r => r.divisie_naam,
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.divisie_naam ?? '—'}</span>,
  },
  {
    key: 'betaalronde_naam',
    label: 'Betaalronde',
    breedte: 140,
    filterType: 'tekst',
    sorteerWaarde: r => r.betaalronde_naam ?? '',
    render: r => <span style={{ fontSize: 13 }}>{r.betaalronde_naam ?? '—'}</span>,
  },
  {
    key: 'bon_nummer',
    label: 'Bon/order',
    standaard_zichtbaar: false,
    breedte: 180,
    filterType: 'tekst',
    sorteerWaarde: r => r.bon_nummer ?? r.ordernummer ?? '',
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.bon_nummer ?? r.ordernummer ?? '—'}</span>,
  },
  {
    key: 'is_geboekt_in_exact',
    label: 'In Exact',
    standaard_zichtbaar: false,
    breedte: 90,
    sorteerWaarde: r => (r.is_geboekt_in_exact ? 1 : 0),
    filterType: 'select',
    filterOpties: ['Ja', 'Nee'],
    filterWaarde: r => (r.is_geboekt_in_exact ? 'Ja' : 'Nee'),
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.is_geboekt_in_exact ? 'Ja' : 'Nee'}</span>,
  },
]

type Props = {
  rijen: InkoopfactuurRij[]
  mijnBeurt: number
  allesZien: boolean
  betaalrondes: BetaalrondeRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  laatsteSync: string | null
  magAccorderen: boolean
  magBetaalronde: boolean
}

export default function InkoopfacturenOverzicht({
  rijen, mijnBeurt, allesZien, betaalrondes, layouts, user_id, laatsteSync, magAccorderen, magBetaalronde,
}: Props) {
  const [tab, setTab] = useState<Tab>(mijnBeurt > 0 ? 'mijn' : 'open')
  const [geopend, setGeopend] = useState<InkoopfactuurRij | null>(null)
  const [selectie, setSelectie] = useState<InkoopfactuurRij[]>([])
  const [melding, setMelding] = useState<string | null>(null)

  const zichtbaar = useMemo(() => {
    switch (tab) {
      case 'mijn':       return rijen.filter(r => r.mijn_beurt)
      case 'open':       return rijen.filter(r => r.status === 'open' && !r.datum_betaald)
      case 'betaalbaar': return rijen.filter(r => r.bouw7_status === INKOOP_STATUS_BETAALBAAR && !r.datum_betaald)
      default:           return rijen
    }
  }, [rijen, tab])

  const totaal = useMemo(() => zichtbaar.reduce((s, r) => s + (r.bedrag_incl ?? 0), 0), [zichtbaar])

  async function inBetaalronde(rondeId: string | null) {
    const res: ActieResultaat = await zetBetaalronde(selectie.map(r => r.id), rondeId)
    setMelding(res.ok
      ? `${selectie.length} factuur${selectie.length === 1 ? '' : 'en'} bijgewerkt.`
      : res.error)
  }

  const openRondes = betaalrondes.filter(b => b.status !== 'afgerond')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelectie([]) }}
            style={{
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500, padding: '6px 12px',
              borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${tab === t.key ? 'var(--fg)' : 'var(--border)'}`,
              background: tab === t.key ? 'var(--fg)' : 'transparent',
              color: tab === t.key ? 'var(--bg)' : 'var(--fg-soft)',
            }}
          >
            {t.label}
            {t.key === 'mijn' && mijnBeurt > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 999,
                background: tab === t.key ? 'var(--bg)' : '#2563eb',
                color: tab === t.key ? 'var(--fg)' : 'white',
              }}>{mijnBeurt}</span>
            )}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
            {zichtbaar.length} facturen · {euro(totaal)}
          </span>
          <SyncKnop
            laatsteSync={laatsteSync}
            onSync={async (): Promise<SyncUitkomst> => {
              const res = await ververAlleInkoopfacturen()
              return { ok: res.ok, melding: res.ok ? undefined : res.error }
            }}
          />
        </div>
      </div>

      {!allesZien && (
        <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: 0 }}>
          Je ziet de facturen die aan een project hangen, plus de facturen waarvan jij de
          goedkeurder bent. Overheadfacturen (abonnementen, leasing) zijn niet zichtbaar.
        </p>
      )}

      {melding && (
        <p style={{ fontSize: 13, margin: 0, color: 'var(--fg)' }}>{melding}</p>
      )}

      {magBetaalronde && selectie.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectie.length} geselecteerd</span>
          {openRondes.length === 0
            ? <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>
                Maak eerst een betaalronde aan onder Betaalrondes.
              </span>
            : openRondes.map(b => (
                <Button key={b.id} variant="secondary" size="sm" onClick={() => inBetaalronde(b.id)}>
                  Naar “{b.naam}”
                </Button>
              ))}
          <Button variant="ghost" size="sm" onClick={() => inBetaalronde(null)}>Uit betaalronde halen</Button>
        </div>
      )}

      <OverzichtTabel
        scherm="inkoopfacturen"
        data={zichtbaar}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        dicht
        beginSortering={[{ id: 'vervaldatum', desc: false }]}
        onRijKlik={r => setGeopend(r)}
        onSelectie={magBetaalronde ? setSelectie : undefined}
        selecteerbaar={magBetaalronde}
        exportExtraRijen={rows => [
          ['Aantal facturen', rows.length],
          ['Totaal incl. BTW', rows.reduce((s, r) => s + (r.bedrag_incl ?? 0), 0)],
        ]}
      />

      <InkoopfactuurPaneel
        rij={geopend}
        magAccorderen={magAccorderen}
        onClose={() => setGeopend(null)}
      />
    </div>
  )
}
