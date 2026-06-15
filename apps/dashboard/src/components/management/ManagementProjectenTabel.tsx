'use client'

import React, { useMemo, useState } from 'react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import SlicerBalk, { type SlicerDef, type SlicerWaarde } from '@/components/overzicht/SlicerBalk'
import type { ManagementProject } from './ManagementDashboard'
import {
  ProjectnummerCel, HoverTekst, StatusCel, EurCel, MargeCel, VerschilCel, PctGereedCel, openDossierTab,
} from './format'

export type ProjectenVariant = 'lopend' | 'gereed' | 'servicedesk'

type Props = {
  rows: ManagementProject[]
  variant: ProjectenVariant
  scherm: string
  layouts: GebruikerLayout[]
  user_id: string | null
}

function uniek(items: (string | null)[]): string[] {
  return [...new Set(items.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
}

/* ── Kolomdefinities per variant ─────────────────────────────────── */

function basisKolommen(): KolomDefinitie<ManagementProject>[] {
  return [
    { key: 'projectnummer', label: 'Nr.', breedte: 96,
      render: p => <ProjectnummerCel p={p} />, sorteerWaarde: p => p.projectnummer },
    { key: 'status', label: 'Status', breedte: 140,
      render: p => <StatusCel status={p.status} />, sorteerWaarde: p => p.status },
    { key: 'opdrachtgever', label: 'Opdrachtgever', breedte: 160,
      render: p => <HoverTekst value={p.opdrachtgever} />, sorteerWaarde: p => p.opdrachtgever },
    { key: 'projectnaam', label: 'Project', breedte: 200,
      render: p => <HoverTekst value={p.projectnaam} bold />, sorteerWaarde: p => p.projectnaam },
    { key: 'projectleider', label: 'PL', breedte: 120,
      render: p => <HoverTekst value={p.projectleider} />, sorteerWaarde: p => p.projectleider },
  ]
}

const lopendKolommen: KolomDefinitie<ManagementProject>[] = [
  ...basisKolommen(),
  { key: 'geboekte_kosten', label: 'Geboekte kosten', breedte: 120,
    render: p => <EurCel value={p.geboekte_kosten} />, sorteerWaarde: p => p.geboekte_kosten },
  { key: 'totale_opdracht', label: 'Totale opdracht', breedte: 120,
    render: p => <EurCel value={p.totale_opdracht} />, sorteerWaarde: p => p.totale_opdracht },
  { key: 'pct_gereed', label: '% gereed', breedte: 110,
    render: p => <PctGereedCel waarde={p.pct_gereed} />, sorteerWaarde: p => p.pct_gereed },
  { key: 'totale_prognose', label: 'Prognose', breedte: 120,
    render: p => <EurCel value={p.totale_prognose} />, sorteerWaarde: p => p.totale_prognose },
  { key: 'verwacht_resultaat', label: 'Verw. resultaat', breedte: 120,
    render: p => <EurCel value={p.verwacht_resultaat} kleur="resultaat" />, sorteerWaarde: p => p.verwacht_resultaat },
  { key: 'pct_marge', label: '% marge', breedte: 90,
    render: p => <MargeCel value={p.pct_marge} />, sorteerWaarde: p => p.pct_marge },
  { key: 'omzet_obv_pct', label: 'Omzet o.b.v. %', breedte: 120,
    render: p => <EurCel value={p.omzet_obv_pct} />, sorteerWaarde: p => p.omzet_obv_pct },
  { key: 'resultaat_obv_pct', label: 'Res. o.b.v. %', breedte: 120,
    render: p => <EurCel value={p.resultaat_obv_pct} kleur="resultaat" />, sorteerWaarde: p => p.resultaat_obv_pct },
]

const gereedKolommen: KolomDefinitie<ManagementProject>[] = [
  ...basisKolommen(),
  { key: 'gefactureerd', label: 'Gefactureerd', breedte: 120,
    render: p => <EurCel value={p.gefactureerd} />, sorteerWaarde: p => p.gefactureerd },
  { key: 'geboekte_kosten', label: 'Geboekte kosten', breedte: 120,
    render: p => <EurCel value={p.geboekte_kosten} />, sorteerWaarde: p => p.geboekte_kosten },
  { key: 'resultaat_gereed', label: 'Resultaat', breedte: 120,
    render: p => <EurCel value={p.resultaat_gereed} kleur="resultaat" />, sorteerWaarde: p => p.resultaat_gereed },
  { key: 'pct_marge_gereed', label: '% marge', breedte: 90,
    render: p => <MargeCel value={p.pct_marge_gereed} />, sorteerWaarde: p => p.pct_marge_gereed },
  { key: 'verschil_pct_marge', label: 'Δ marge', breedte: 90,
    render: p => <VerschilCel value={p.verschil_pct_marge} />, sorteerWaarde: p => p.verschil_pct_marge },
]

function kolommenVoor(variant: ProjectenVariant): KolomDefinitie<ManagementProject>[] {
  return variant === 'gereed' ? gereedKolommen : lopendKolommen
}

/* ── Component ───────────────────────────────────────────────────── */

export default function ManagementProjectenTabel({ rows, variant, scherm, layouts, user_id }: Props) {
  const [slicer, setSlicer] = useState<SlicerWaarde>({})

  const slicers = useMemo<SlicerDef[]>(() => [
    { key: 'filiaal',       label: 'Werkmaatschappij', opties: uniek(rows.map(r => r.filiaal)).map(v => ({ value: v, label: v })) },
    { key: 'categorie',     label: 'Categorie',        opties: uniek(rows.map(r => r.categorie)).map(v => ({ value: v, label: v })) },
    { key: 'projectleider', label: 'Projectleider',    opties: uniek(rows.map(r => r.projectleider)).map(v => ({ value: v, label: v })) },
    { key: 'status',        label: 'Status',           opties: uniek(rows.map(r => r.status)).map(v => ({ value: v, label: v })) },
  ], [rows])

  const gefilterd = useMemo(() => rows.filter(r => {
    for (const [key, values] of Object.entries(slicer)) {
      if (!values.length) continue
      const veld = (r as unknown as Record<string, string | null>)[key]
      if (!veld || !values.includes(veld)) return false
    }
    return true
  }), [rows, slicer])

  const kolommen = useMemo(() => kolommenVoor(variant), [variant])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <SlicerBalk
        slicers={slicers}
        waarde={slicer}
        onChange={(key, values) => setSlicer(prev => ({ ...prev, [key]: values }))}
        onReset={() => setSlicer({})}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <OverzichtTabel
          scherm={scherm}
          data={gefilterd}
          kolommen={kolommen}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={openDossierTab}
        />
      </div>
    </div>
  )
}
