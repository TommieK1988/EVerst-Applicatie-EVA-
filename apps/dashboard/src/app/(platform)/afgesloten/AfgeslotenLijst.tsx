'use client'
import React from 'react'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import SlicerBalk, { type SlicerDef, type SlicerWaarde } from '@/components/overzicht/SlicerBalk'
import { getDossierSubstatus } from '@/components/dossiers/types'
import { openDossierInNieuwTabblad } from '@/components/dossiers/open-dossier'
import type { DossierRij } from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'

/** Route-segment per hoofdstatus zodat een gemengde lijst naar het juiste sectie-detail linkt. */
const HOOFDSTATUS_ROUTE: Record<string, string> = {
  aanvraag: 'aanvragen',
  offerte:  'offertes',
  opdracht: 'opdrachten',
}

/** Label + kleur per eindstatus (afgesloten/verloren/vervallen/afgewezen). */
const STATUS_META: Record<string, { label: string; kleur: string }> = {
  financieel_afgesloten: { label: 'Financieel afgesloten', kleur: 'var(--neutral-500)' },
  verloren:              { label: 'Verloren',              kleur: 'var(--error-500)'   },
  vervallen:             { label: 'Vervallen',             kleur: 'var(--warning-500)' },
  afgewezen:             { label: 'Afgewezen',             kleur: 'var(--error-500)'   },
}

/** Slicer: bundelt de fasen in twee functionele groepen. */
const SLICERS: SlicerDef[] = [
  {
    key: 'groep',
    label: 'Soort',
    opties: [
      { value: 'uitvoering', label: 'Opdrachten/Servicedesk' },
      { value: 'verkoop',    label: 'Aanvragen/Offertes'      },
    ],
  },
]

function groepVoor(d: DossierRij): 'uitvoering' | 'verkoop' {
  return d.hoofdstatus === 'opdracht' ? 'uitvoering' : 'verkoop'
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Props = {
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export function AfgeslotenLijst({ dossiers, layouts, user_id }: Props) {
  const [slicer, setSlicer] = React.useState<SlicerWaarde>({})

  const data = React.useMemo(() => {
    const groepSel = slicer.groep ?? []
    if (groepSel.length === 0) return dossiers
    return dossiers.filter(d => groepSel.includes(groepVoor(d)))
  }, [dossiers, slicer])

  const kolommen: KolomDefinitie<DossierRij>[] = React.useMemo(() => [
    {
      key: 'dossiernummer',
      label: 'Dossiernr.',
      vast: true,
      breedte: 120,
      filterType: 'tekst',
      sorteerWaarde: d => d.dossiernummer ?? '',
      render: d => (
        <span style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: 12.5 }}>
          {d.dossiernummer ?? '—'}
        </span>
      ),
    },
    {
      key: 'omschrijving',
      label: 'Omschrijving',
      breedte: 280,
      filterType: 'tekst',
      sorteerWaarde: d => d.titel ?? '',
      render: d => (
        <span style={{ color: 'var(--neutral-800)', fontSize: 12.5 }}>{d.titel}</span>
      ),
    },
    {
      key: 'opdrachtgever',
      label: 'Opdrachtgever',
      breedte: 190,
      filterType: 'tekst',
      sorteerWaarde: d => d.klant_naam ?? '',
      render: d => (
        <span style={{ color: 'var(--neutral-600)', fontSize: 12.5 }}>{d.klant_naam ?? '—'}</span>
      ),
    },
    {
      key: 'contactpersoon',
      label: 'Contactpersoon',
      breedte: 170,
      filterType: 'tekst',
      sorteerWaarde: d => d.contactpersoon_naam ?? '',
      render: d => (
        <span style={{ color: 'var(--neutral-600)', fontSize: 12.5 }}>{d.contactpersoon_naam ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      breedte: 165,
      filterType: 'select',
      filterOpties: Array.from(new Set(Object.values(STATUS_META).map(s => s.label))),
      sorteerWaarde: d => STATUS_META[getDossierSubstatus(d)]?.label ?? getDossierSubstatus(d),
      render: d => {
        const sub = getDossierSubstatus(d)
        const meta = STATUS_META[sub] ?? { label: sub, kleur: 'var(--neutral-400)' }
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px 2px 6px', borderRadius: 9999,
            fontSize: 11, fontWeight: 600,
            background: `color-mix(in srgb, ${meta.kleur} 12%, white)`,
            color: meta.kleur,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
            {meta.label}
          </span>
        )
      },
    },
    {
      key: 'laatst_bewerkt',
      label: 'Laatst bewerkt',
      breedte: 120,
      sorteerWaarde: d => d.updated_at ?? '',
      render: d => (
        <span style={{ color: 'var(--neutral-500)', fontSize: 12 }}>{formatDatum(d.updated_at)}</span>
      ),
    },
  ], [])

  return (
    <div style={{ padding: '20px 28px', minHeight: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <SlicerBalk
          slicers={SLICERS}
          waarde={slicer}
          onChange={(key, values) => setSlicer(prev => ({ ...prev, [key]: values }))}
          onReset={() => setSlicer({})}
        />
      </div>

      <OverzichtTabel
        scherm="dossiers-afgesloten"
        data={data}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        dicht
        selecteerbaar={false}
        toonRijActie={false}
        beginSortering={[{ id: 'laatst_bewerkt', desc: true }]}
        onRijKlik={d => {
          const segment = HOOFDSTATUS_ROUTE[d.hoofdstatus] ?? 'opdrachten'
          openDossierInNieuwTabblad(`/${segment}/${d.id}/informatie`)
        }}
      />
    </div>
  )
}
