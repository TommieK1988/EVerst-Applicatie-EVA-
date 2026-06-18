'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import SlicerBalk, { type SlicerDef, type SlicerWaarde } from '@/components/overzicht/SlicerBalk'
import { TEMPLATE_CATEGORIE_LABELS, TAAK_STATUS_LABELS } from '@/components/formulieren/types'
import type { FormulierTaakRij } from '@/app/(platform)/formulieren/actions'

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  open:      { label: 'Open',      bg: '#eff6ff', color: '#1d4ed8' },
  bezig:     { label: 'Bezig',     bg: '#fef9c3', color: '#854d0e' },
  ingediend: { label: 'Ingediend', bg: '#dcfce7', color: '#16a34a' },
  afgekeurd: { label: 'Afgekeurd', bg: '#fef2f2', color: '#dc2626' },
  afgerond:  { label: 'Afgerond',  bg: '#f3f4f6', color: '#6b7280' },
}

const DEADLINE_OPTIES = [
  { value: 'overschreden', label: 'Overschreden' },
  { value: 'deze_week',    label: 'Deze week' },
  { value: 'later',        label: 'Later' },
  { value: 'geen',         label: 'Geen deadline' },
]

function deadlineBucket(deadline: string | null, status: string): string {
  if (!deadline) return 'geen'
  const d = new Date(deadline)
  const nu = new Date()
  const eindeWeek = new Date(nu.getTime() + 7 * 24 * 60 * 60 * 1000)
  if (d < nu && status !== 'afgerond') return 'overschreden'
  if (d <= eindeWeek) return 'deze_week'
  return 'later'
}

function fmtDatum(d: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'd MMM yyyy', { locale: nl }) } catch { return '—' }
}

function Badge({ meta }: { meta?: { label: string; bg: string; color: string } }) {
  if (!meta) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
    }}>{meta.label}</span>
  )
}

const NIET_TOEGEWEZEN = '__none__'

export default function FormulierenActieveDossiers({
  data, layouts, user_id,
}: {
  data: FormulierTaakRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const router = useRouter()
  const [slicer, setSlicer] = useState<SlicerWaarde>({})

  const slicers = useMemo<SlicerDef[]>(() => {
    const fases = [...new Set(data.map(d => d.dossier_fase))].sort()
    const statussen = [...new Set(data.map(d => d.status))]
    const personen = [...new Set(data.map(d => d.toegewezen_naam).filter(Boolean) as string[])].sort()

    const ord = (arr: string[], volgorde: string[]) =>
      [...arr].sort((a, b) => volgorde.indexOf(a) - volgorde.indexOf(b))

    return [
      { key: 'fase', label: 'Fase', opties: fases.map(f => ({ value: f, label: f })) },
      { key: 'status', label: 'Status',
        opties: ord(statussen, ['open', 'bezig', 'ingediend', 'afgekeurd', 'afgerond'])
          .map(s => ({ value: s, label: TAAK_STATUS_LABELS[s as keyof typeof TAAK_STATUS_LABELS] ?? s })) },
      { key: 'toegewezen', label: 'Toegewezen aan',
        opties: [
          ...personen.map(p => ({ value: p, label: p })),
          { value: NIET_TOEGEWEZEN, label: 'Niet toegewezen' },
        ] },
      { key: 'deadline', label: 'Deadline', opties: DEADLINE_OPTIES },
    ]
  }, [data])

  const gefilterd = useMemo(() => {
    return data.filter(rij => {
      const f = slicer.fase
      if (f?.length && !f.includes(rij.dossier_fase)) return false
      const s = slicer.status
      if (s?.length && !s.includes(rij.status)) return false
      const t = slicer.toegewezen
      if (t?.length) {
        const matchPersoon = !!rij.toegewezen_naam && t.includes(rij.toegewezen_naam)
        const matchNone = t.includes(NIET_TOEGEWEZEN) && !rij.toegewezen_naam
        if (!matchPersoon && !matchNone) return false
      }
      const dl = slicer.deadline
      if (dl?.length && !dl.includes(deadlineBucket(rij.deadline, rij.status))) return false
      return true
    })
  }, [data, slicer])

  const kolommen = useMemo<KolomDefinitie<FormulierTaakRij>[]>(() => [
    { key: 'formulier_naam', label: 'Formulier', vast: true, breedte: 240,
      sorteerWaarde: r => r.formulier_naam.toLowerCase(),
      render: r => <span style={{ fontWeight: 500 }}>{r.formulier_naam}</span> },
    { key: 'categorie', label: 'Categorie', breedte: 130, standaard_zichtbaar: false,
      sorteerWaarde: r => r.categorie ?? '',
      render: r => r.categorie ? (TEMPLATE_CATEGORIE_LABELS[r.categorie] ?? r.categorie) : '—' },
    { key: 'dossiernummer', label: 'Dossier', breedte: 100,
      sorteerWaarde: r => r.dossiernummer ?? '',
      render: r => r.dossiernummer ?? '—' },
    { key: 'dossier_titel', label: 'Dossiertitel', breedte: 200,
      sorteerWaarde: r => r.dossier_titel.toLowerCase(),
      render: r => r.dossier_titel },
    { key: 'klant_naam', label: 'Klant', breedte: 180, standaard_zichtbaar: false,
      sorteerWaarde: r => r.klant_naam ?? '',
      render: r => r.klant_naam ?? '—' },
    { key: 'fase', label: 'Fase', breedte: 160, filterType: 'select',
      sorteerWaarde: r => r.dossier_fase,
      render: r => (
        <span>
          {r.dossier_fase}
          {r.dossier_substatus && (
            <span style={{ color: 'var(--text-muted)' }}> · {r.dossier_substatus}</span>
          )}
        </span>
      ) },
    { key: 'status', label: 'Status', breedte: 130, filterType: 'select',
      sorteerWaarde: r => r.status,
      render: r => <Badge meta={STATUS_META[r.status]} /> },
    { key: 'deadline', label: 'Deadline', breedte: 120,
      sorteerWaarde: r => r.deadline ?? '9999',
      render: r => fmtDatum(r.deadline) },
    { key: 'toegewezen', label: 'Toegewezen aan', breedte: 170,
      sorteerWaarde: r => r.toegewezen_naam ?? '',
      render: r => r.toegewezen_naam ?? '—' },
    { key: 'projectleider_naam', label: 'Projectleider', breedte: 160, standaard_zichtbaar: false,
      sorteerWaarde: r => r.projectleider_naam ?? '',
      render: r => r.projectleider_naam ?? '—' },
    { key: 'uitvoerder_naam', label: 'Uitvoerder', breedte: 160, standaard_zichtbaar: false,
      sorteerWaarde: r => r.uitvoerder_naam ?? '',
      render: r => r.uitvoerder_naam ?? '—' },
    { key: 'calculator_naam', label: 'Calculator', breedte: 160, standaard_zichtbaar: false,
      sorteerWaarde: r => r.calculator_naam ?? '',
      render: r => r.calculator_naam ?? '—' },
    { key: 'werkvoorbereider_naam', label: 'Werkvoorbereider', breedte: 160, standaard_zichtbaar: false,
      sorteerWaarde: r => r.werkvoorbereider_naam ?? '',
      render: r => r.werkvoorbereider_naam ?? '—' },
    { key: 'werkadres_stad', label: 'Werkadres', breedte: 140, standaard_zichtbaar: false,
      sorteerWaarde: r => r.werkadres_stad ?? '',
      render: r => r.werkadres_stad ?? '—' },
    { key: 'verwacht_startdatum', label: 'Verwacht start', breedte: 130, standaard_zichtbaar: false,
      sorteerWaarde: r => r.verwacht_startdatum ?? '9999',
      render: r => fmtDatum(r.verwacht_startdatum) },
    { key: 'verwacht_einddatum', label: 'Verwacht eind', breedte: 130, standaard_zichtbaar: false,
      sorteerWaarde: r => r.verwacht_einddatum ?? '9999',
      render: r => fmtDatum(r.verwacht_einddatum) },
  ], [])

  const openRij = (r: FormulierTaakRij) => {
    if (r.inzending_id) {
      router.push(`/formulieren/${r.template_id}/inzendingen/${r.inzending_id}`)
    } else {
      // Dossiercontext meegeven zodat bestaande concepten herkend worden en
      // meerdere exemplaren per dossier mogelijk zijn (keuze hervatten/nieuw).
      router.push(`/formulieren/${r.template_id}/invullen?dossier_id=${r.dossier_id}`)
    }
  }

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          Formulieren — actieve dossiers
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          In te vullen en ingediende formulieren van dossiers die nog niet zijn afgerond.
        </p>
      </div>

      <SlicerBalk
        slicers={slicers}
        waarde={slicer}
        onChange={(key, values) => setSlicer(prev => ({ ...prev, [key]: values }))}
        onReset={() => setSlicer({})}
      />

      <OverzichtTabel
        scherm="formulieren-overzicht"
        data={gefilterd}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        onRijKlik={openRij}
      />
    </div>
  )
}
