'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import SlicerBalk, { type SlicerDef, type SlicerWaarde } from '@/components/overzicht/SlicerBalk'
import type { TaakRij } from '@/lib/taken/services/taken'

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  open:            { label: 'Open',           bg: '#eff6ff', color: '#1d4ed8' },
  in_behandeling:  { label: 'In behandeling', bg: '#fef9c3', color: '#854d0e' },
  wacht_op:        { label: 'Wacht op',       bg: '#f3e8ff', color: '#7e22ce' },
  gereed:          { label: 'Gereed',         bg: '#dcfce7', color: '#16a34a' },
  vervallen:       { label: 'Vervallen',      bg: '#f3f4f6', color: '#6b7280' },
}
const PRIO_META: Record<string, { label: string; bg: string; color: string }> = {
  laag:    { label: 'Laag',    bg: '#f3f4f6', color: '#6b7280' },
  normaal: { label: 'Normaal', bg: '#eff6ff', color: '#2563eb' },
  hoog:    { label: 'Hoog',    bg: '#fff7ed', color: '#c2410c' },
  urgent:  { label: 'Urgent',  bg: '#fef2f2', color: '#dc2626' },
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
  if (d < nu && status !== 'gereed' && status !== 'vervallen') return 'overschreden'
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

export default function TakenActieveDossiers({
  data, layouts, user_id,
  titel = 'Taken — actieve dossiers',
  subtitel = 'Alle taken (los én uit actielijsten) van dossiers die nog niet zijn afgerond.',
  scherm = 'taken-overzicht',
  verbergToegewezenSlicer = false,
}: {
  data: TaakRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  titel?: string
  subtitel?: string
  scherm?: string
  verbergToegewezenSlicer?: boolean
}) {
  const router = useRouter()
  const [slicer, setSlicer] = useState<SlicerWaarde>({})

  // ── Slicer-definities (opties afgeleid uit de data) ──────────────
  const slicers = useMemo<SlicerDef[]>(() => {
    const fases = [...new Set(data.map(d => d.dossier_fase))].sort()
    const statussen = [...new Set(data.map(d => d.status))]
    const prios = [...new Set(data.map(d => d.prioriteit))]
    const personen = [...new Set(data.flatMap(d => d.toegewezen_namen))].sort()

    const ord = (arr: string[], volgorde: string[]) =>
      [...arr].sort((a, b) => volgorde.indexOf(a) - volgorde.indexOf(b))

    return [
      { key: 'fase', label: 'Fase', opties: fases.map(f => ({ value: f, label: f })) },
      { key: 'status', label: 'Status',
        opties: ord(statussen, ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen'])
          .map(s => ({ value: s, label: STATUS_META[s]?.label ?? s })) },
      { key: 'prioriteit', label: 'Prioriteit',
        opties: ord(prios, ['urgent', 'hoog', 'normaal', 'laag'])
          .map(p => ({ value: p, label: PRIO_META[p]?.label ?? p })) },
      ...(verbergToegewezenSlicer ? [] : [{
        key: 'toegewezen', label: 'Toegewezen aan',
        opties: [
          ...personen.map(p => ({ value: p, label: p })),
          { value: NIET_TOEGEWEZEN, label: 'Niet toegewezen' },
        ],
      }]),
      { key: 'deadline', label: 'Deadline', opties: DEADLINE_OPTIES },
    ]
  }, [data, verbergToegewezenSlicer])

  // ── Filtering op slicer-waarden ──────────────────────────────────
  const gefilterd = useMemo(() => {
    return data.filter(rij => {
      const f = slicer.fase
      if (f?.length && !f.includes(rij.dossier_fase)) return false
      const s = slicer.status
      if (s?.length && !s.includes(rij.status)) return false
      const p = slicer.prioriteit
      if (p?.length && !p.includes(rij.prioriteit)) return false
      const t = slicer.toegewezen
      if (t?.length) {
        const matchPersoon = rij.toegewezen_namen.some(n => t.includes(n))
        const matchNone = t.includes(NIET_TOEGEWEZEN) && rij.toegewezen_namen.length === 0
        if (!matchPersoon && !matchNone) return false
      }
      const dl = slicer.deadline
      if (dl?.length && !dl.includes(deadlineBucket(rij.deadline, rij.status))) return false
      return true
    })
  }, [data, slicer])

  // ── Kolommen ─────────────────────────────────────────────────────
  const kolommen = useMemo<KolomDefinitie<TaakRij>[]>(() => [
    { key: 'titel', label: 'Taak', vast: true, breedte: 260,
      sorteerWaarde: r => r.titel.toLowerCase(),
      render: r => <span style={{ fontWeight: 500 }}>{r.titel}</span> },
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
    { key: 'prioriteit', label: 'Prioriteit', breedte: 110, filterType: 'select',
      sorteerWaarde: r => ['laag', 'normaal', 'hoog', 'urgent'].indexOf(r.prioriteit),
      render: r => <Badge meta={PRIO_META[r.prioriteit]} /> },
    { key: 'deadline', label: 'Deadline', breedte: 120,
      sorteerWaarde: r => r.deadline ?? '9999',
      render: r => fmtDatum(r.deadline) },
    { key: 'toegewezen', label: 'Toegewezen aan', breedte: 170,
      sorteerWaarde: r => r.toegewezen_namen.join(', '),
      render: r => r.toegewezen_namen.length ? r.toegewezen_namen.join(', ') : '—' },
    { key: 'lijst_naam', label: 'Actielijst', breedte: 170, standaard_zichtbaar: false,
      sorteerWaarde: r => r.lijst_naam ?? '',
      render: r => r.lijst_naam ?? <span style={{ color: 'var(--text-muted)' }}>Losse taak</span> },
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

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          {titel}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          {subtitel}
        </p>
      </div>

      <SlicerBalk
        slicers={slicers}
        waarde={slicer}
        onChange={(key, values) => setSlicer(prev => ({ ...prev, [key]: values }))}
        onReset={() => setSlicer({})}
      />

      <OverzichtTabel
        scherm={scherm}
        data={gefilterd}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        onRijKlik={r => router.push(`/${r.dossier_sectie}/${r.dossier_id}/taken`)}
      />
    </div>
  )
}
