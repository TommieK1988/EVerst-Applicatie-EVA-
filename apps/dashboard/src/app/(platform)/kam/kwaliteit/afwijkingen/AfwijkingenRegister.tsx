'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'
import type { KwaliteitAfwijkingStatus, KwaliteitErnst } from '@everts/database/kwaliteit-types'
import {
  KWALITEIT_AFWIJKING_TRANSITIES,
  kwaliteitAfwijkingStatusLabels,
  kwaliteitErnstLabels,
} from '@everts/database/kwaliteit-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Badge } from '@/components/ui'
import type { AfwijkingRij } from '@/lib/kwaliteit/afwijkingen'
import { setAfwijkingStatus } from '@/lib/kwaliteit/afwijkingen'

const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const

const ERNST_TONE: Record<KwaliteitErnst, 'error' | 'warning' | 'info' | 'neutral'> = {
  kritiek: 'error',
  technisch: 'warning',
  esthetisch: 'info',
  observatie: 'neutral',
}

const AFGEROND: KwaliteitAfwijkingStatus[] = ['hersteld_akkoord', 'geaccepteerde_afwijking']

/**
 * Het centrale afwijkingenregister over alle projecten (§10).
 *
 * De statusselect toont alleen overgangen die `KWALITEIT_AFWIJKING_TRANSITIES` toestaat — dezelfde
 * tabel die de server-action afdwingt, zodat de gebruiker geen keuze krijgt die vervolgens wordt
 * geweigerd.
 */
export default function AfwijkingenRegister({
  afwijkingen,
  disciplines,
  layouts,
  user_id,
}: {
  afwijkingen: AfwijkingRij[]
  disciplines: { code: string; naam: string }[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const router = useRouter()
  const [bezigId, setBezigId] = React.useState<string | null>(null)

  async function wijzigStatus(id: string, status: KwaliteitAfwijkingStatus) {
    setBezigId(id)
    const res = await setAfwijkingStatus(id, status)
    setBezigId(null)
    if (res.ok) { toast.success('Status bijgewerkt'); router.refresh() }
    else toast.error(res.error)
  }

  const kolommen: KolomDefinitie<AfwijkingRij>[] = React.useMemo(() => [
    {
      key: 'afwijkingsnummer',
      label: 'Nummer',
      vast: true,
      filterType: 'tekst',
      breedte: 130,
      sorteerWaarde: r => r.afwijkingsnummer,
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{r.afwijkingsnummer}</span>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.controlepunt_code ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'project',
      label: 'Project',
      filterType: 'tekst',
      breedte: 240,
      sorteerWaarde: r => r.projectnaam.toLowerCase(),
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{r.projectnaam}</span>
          {r.dossiernummer && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.dossiernummer}</span>
          )}
        </div>
      ),
    },
    {
      key: 'discipline',
      label: 'Discipline',
      filterType: 'select',
      filterOpties: disciplines.map(d => d.naam),
      filterWaarde: r => r.discipline_naam,
      sorteerWaarde: r => r.discipline_naam ?? '',
      render: r => <span style={zacht}>{r.discipline_naam ?? '—'}</span>,
    },
    {
      key: 'omschrijving',
      label: 'Omschrijving',
      filterType: 'tekst',
      breedte: 360,
      sorteerWaarde: r => (r.omschrijving ?? '').toLowerCase(),
      render: r => (
        <span style={{ ...zacht, display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.omschrijving ?? '—'}
        </span>
      ),
    },
    {
      key: 'locatie',
      label: 'Locatie',
      filterType: 'tekst',
      sorteerWaarde: r => (r.locatie ?? '').toLowerCase(),
      render: r => <span style={zacht}>{r.locatie ?? '—'}</span>,
    },
    {
      key: 'ernst',
      label: 'Ernst',
      filterType: 'select',
      filterOpties: Object.values(kwaliteitErnstLabels),
      filterWaarde: r => kwaliteitErnstLabels[r.ernst],
      // Sorteren op zwaarte, niet alfabetisch: kritiek hoort bovenaan.
      sorteerWaarde: r => ['kritiek', 'technisch', 'esthetisch', 'observatie'].indexOf(r.ernst),
      render: r => <Badge tone={ERNST_TONE[r.ernst]}>{kwaliteitErnstLabels[r.ernst]}</Badge>,
    },
    {
      key: 'meting',
      label: 'Meting',
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.gemeten_waarde ?? -Infinity,
      render: r => (
        <span style={zacht}>
          {r.gemeten_waarde !== null ? `${r.gemeten_waarde}${r.eenheid ? ' ' + r.eenheid : ''}` : '—'}
        </span>
      ),
    },
    {
      key: 'eis',
      label: 'Technische eis',
      standaard_zichtbaar: false,
      breedte: 320,
      sorteerWaarde: r => (r.eis_tekst ?? '').toLowerCase(),
      render: r => <span style={zacht}>{r.eis_tekst ?? '—'}</span>,
    },
    {
      key: 'verantwoordelijke',
      label: 'Verantwoordelijke',
      filterType: 'tekst',
      sorteerWaarde: r => (r.verantwoordelijke ?? '').toLowerCase(),
      render: r => <span style={zacht}>{r.verantwoordelijke ?? '—'}</span>,
    },
    {
      key: 'datum_constatering',
      label: 'Geconstateerd',
      sorteerWaarde: r => r.datum_constatering,
      render: r => (
        <span style={zacht}>
          {new Date(r.datum_constatering).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'dagen_open',
      label: 'Dagen open',
      sorteerWaarde: r => r.dagen_open,
      render: r => AFGEROND.includes(r.status)
        ? <span style={zacht}>—</span>
        : (
          <span style={{
            ...zacht,
            fontWeight: r.dagen_open > 30 ? 700 : 400,
            color: r.dagen_open > 30 ? 'var(--error-700)' : 'var(--fg-soft)',
          }}>
            {r.dagen_open}
          </span>
        ),
    },
    {
      key: 'gewenste_hersteldatum',
      label: 'Gewenst hersteld',
      standaard_zichtbaar: false,
      sorteerWaarde: r => r.gewenste_hersteldatum ?? '',
      render: r => (
        <span style={zacht}>
          {r.gewenste_hersteldatum
            ? new Date(r.gewenste_hersteldatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
            : '—'}
        </span>
      ),
    },
    {
      key: 'foto',
      label: 'Foto',
      breedte: 90,
      sorteerWaarde: r => r.fotoUrls.length,
      render: r => r.fotoUrls.length === 0
        ? <span style={zacht}>—</span>
        : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.fotoUrls[0]}
            alt=""
            style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
          />
        ),
    },
    {
      key: 'status',
      label: 'Status',
      breedte: 210,
      filterType: 'select',
      filterOpties: Object.values(kwaliteitAfwijkingStatusLabels),
      filterWaarde: r => kwaliteitAfwijkingStatusLabels[r.status],
      sorteerWaarde: r => kwaliteitAfwijkingStatusLabels[r.status],
      render: r => {
        const opties = [r.status, ...(KWALITEIT_AFWIJKING_TRANSITIES[r.status] ?? [])]
        return (
          <select
            value={r.status}
            disabled={bezigId === r.id}
            onClick={e => e.stopPropagation()}
            onChange={e => { void wijzigStatus(r.id, e.target.value as KwaliteitAfwijkingStatus) }}
            style={{
              width: '100%', padding: '5px 7px', borderRadius: 7, fontSize: 12.5,
              border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--fg)',
            }}
          >
            {opties.map(s => (
              <option key={s} value={s}>{kwaliteitAfwijkingStatusLabels[s]}</option>
            ))}
          </select>
        )
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [disciplines, bezigId])

  const open = afwijkingen.filter(a => !AFGEROND.includes(a.status))
  const kritiek = open.filter(a => a.ernst === 'kritiek').length

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="KAM / VGM" title="Kwaliteitsafwijkingen" />
      <p style={{ margin: '-14px 0 18px', fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 720 }}>
        {open.length} openstaand
        {kritiek > 0 && <strong style={{ color: 'var(--error-700)' }}>, waarvan {kritiek} kritiek</strong>}
        {' '}· {afwijkingen.length - open.length} afgehandeld. Openstaande afwijkingen verschijnen
        automatisch bij de volgende kwaliteitsronde op hetzelfde project.
      </p>
      <OverzichtTabel
        scherm="kwaliteit-afwijkingen"
        data={afwijkingen}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'ernst', desc: false }, { id: 'datum_constatering', desc: true }]}
        onRijKlik={r => router.push(`/kam/kwaliteit/${r.inspectie_id}`)}
      />
    </div>
  )
}
