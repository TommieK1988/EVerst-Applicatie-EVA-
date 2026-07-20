'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import SlicerBalk, { type SlicerDef, type SlicerWaarde } from '@/components/overzicht/SlicerBalk'
import type { TaakRij } from '@/lib/taken/services/taken'
import type { TaakMetDetails, TaskStatus } from '@/lib/taken/supabase/database.types'
import { BEOORDEEL_TAAK_TITEL } from '@/lib/goedkeuring/types'
import { haalTaakVoorPaneel, updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import TaakDetailPanel from './TaakDetailPanel'

/** Beoordeel-taken lopen via de goedkeuringsflow en zijn niet handmatig af te vinken. */
const BEOORDEEL_TITELS = new Set<string>(Object.values(BEOORDEEL_TAAK_TITEL))

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

/** Scope-slicer waarden op "Mijn taken" (alleen relevant met alle_taken-recht). */
const SCOPE_MIJN = 'mijn'
const SCOPE_ALLE = 'alle'

function isVerlopen(deadline: string | null, status: string): boolean {
  if (!deadline) return false
  if (status === 'gereed' || status === 'vervallen') return false
  return new Date(deadline) < new Date()
}

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
  variant = 'overzicht',
  magAlleTaken = false,
  beginSortering,
}: {
  data: TaakRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  titel?: string
  subtitel?: string
  scherm?: string
  /** 'mijn-taken' toont de eigen-taken-scope; 'overzicht' toont het brede overzicht. */
  variant?: 'overzicht' | 'mijn-taken'
  /** Alleen zinvol bij variant 'mijn-taken': schakelt de scope-slicer (mijn/alle) vrij. */
  magAlleTaken?: boolean
  beginSortering?: { id: string; desc: boolean }[]
}) {
  const router = useRouter()
  const isMijnTaken = variant === 'mijn-taken'
  const [slicer, setSlicer] = useState<SlicerWaarde>({})

  // Detailpaneel (klik op een taaknaam) — lazy geladen volledige taak.
  const [paneelTaak, setPaneelTaak] = useState<TaakMetDetails | null>(null)
  const [paneelBezig, setPaneelBezig] = useState<string | null>(null)

  async function openTaak(id: string) {
    setPaneelBezig(id)
    try {
      const taak = await haalTaakVoorPaneel(id)
      if (taak) setPaneelTaak(taak)
    } finally {
      setPaneelBezig(null)
    }
  }

  // Afvinken direct in de tabel (gereed ↔ open).
  const [, startAfvink] = useTransition()
  const [afvinkBezigId, setAfvinkBezigId] = useState<string | null>(null)

  function toggleAfvink(r: TaakRij) {
    const nieuw: TaskStatus = r.status === 'gereed' ? 'open' : 'gereed'
    setAfvinkBezigId(r.id)
    startAfvink(async () => {
      try {
        await updateTaakStatus(r.id, nieuw)
        toast.success(nieuw === 'gereed' ? 'Taak afgerond' : 'Taak heropend')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Afvinken mislukt')
      } finally {
        setAfvinkBezigId(null)
      }
    })
  }

  // ── Slicer-definities (opties afgeleid uit de data) ──────────────
  const slicers = useMemo<SlicerDef[]>(() => {
    const statussen = [...new Set(data.map(d => d.status))]
    const personen = [...new Set(data.flatMap(d => d.toegewezen_namen))].sort()

    const ord = (arr: string[], volgorde: string[]) =>
      [...arr].sort((a, b) => volgorde.indexOf(a) - volgorde.indexOf(b))

    const deadline: SlicerDef = { key: 'deadline', label: 'Deadline', opties: DEADLINE_OPTIES }

    if (isMijnTaken) {
      return [
        ...(magAlleTaken ? [{
          key: 'scope', label: 'Taken van',
          opties: [
            { value: SCOPE_MIJN, label: 'Mijn taken' },
            { value: SCOPE_ALLE, label: 'Alle taken' },
          ],
        }] : []),
        deadline,
      ]
    }

    // Breed overzicht: Status + Toegewezen + Deadline (dataset bevat óók gereed/vervallen).
    return [
      { key: 'status', label: 'Status',
        opties: ord(statussen, ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen'])
          .map(s => ({ value: s, label: STATUS_META[s]?.label ?? s })) },
      { key: 'toegewezen', label: 'Toegewezen aan',
        opties: [
          ...personen.map(p => ({ value: p, label: p })),
          { value: NIET_TOEGEWEZEN, label: 'Niet toegewezen' },
        ] },
      deadline,
    ]
  }, [data, isMijnTaken, magAlleTaken])

  // ── Filtering op slicer-waarden ──────────────────────────────────
  const gefilterd = useMemo(() => {
    return data.filter(rij => {
      // Scope (alleen mijn-taken met alle_taken-recht): 'mijn' = eigen taken.
      const sc = slicer.scope
      if (sc?.length && sc.includes(SCOPE_MIJN) && !sc.includes(SCOPE_ALLE)) {
        if (!user_id || !rij.toegewezen_ids.includes(user_id)) return false
      }
      const s = slicer.status
      if (s?.length && !s.includes(rij.status)) return false
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
  }, [data, slicer, user_id])

  // ── "Ook toegewezen aan": namen behalve de ingelogde gebruiker ──
  const medeToegewezen = (r: TaakRij): string[] => {
    if (!isMijnTaken || !user_id) return r.toegewezen_namen
    return r.toegewezen_namen.filter((_, i) => r.toegewezen_ids[i] !== user_id)
  }

  // ── Kolommen ─────────────────────────────────────────────────────
  // Celknoppen breken lange tekst af met een ellipsis zodat de rij één regel blijft.
  const celKnop: React.CSSProperties = {
    background: 'none', border: 0, padding: 0, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left',
    display: 'block', maxWidth: '100%',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  }

  const kolommen = useMemo<KolomDefinitie<TaakRij>[]>(() => [
    { key: 'dossiernummer', label: 'Dossier', vast: true, breedte: 110,
      sorteerWaarde: r => r.dossiernummer ?? '',
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); router.push(`/${r.dossier_sectie}/${r.dossier_id}/taken`) }}
          title={r.dossiernummer ?? undefined}
          style={{ ...celKnop, color: 'var(--accent)', fontWeight: 600 }}
        >
          {r.dossiernummer ?? '—'}
        </button>
      ) },
    { key: 'dossier_titel', label: 'Omschrijving', breedte: 220,
      sorteerWaarde: r => r.dossier_titel.toLowerCase(),
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); router.push(`/${r.dossier_sectie}/${r.dossier_id}/taken`) }}
          title={r.dossier_titel}
          style={{ ...celKnop, color: 'var(--fg)' }}
        >
          {r.dossier_titel}
        </button>
      ) },
    { key: 'titel', label: 'Taak', breedte: 260,
      sorteerWaarde: r => r.titel.toLowerCase(),
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); onTaakKlik(r) }}
          disabled={paneelBezig === r.id}
          title={r.titel}
          style={{ ...celKnop, color: 'var(--fg)', fontWeight: 500, opacity: paneelBezig === r.id ? 0.5 : 1 }}
        >
          {r.titel}
        </button>
      ) },
    { key: 'fase', label: 'Fase', breedte: 160,
      sorteerWaarde: r => r.dossier_fase,
      render: r => (
        <span>
          {r.dossier_fase}
          {r.dossier_substatus && (
            <span style={{ color: 'var(--text-muted)' }}> · {r.dossier_substatus}</span>
          )}
        </span>
      ) },
    { key: 'status', label: 'Status', breedte: 130,
      sorteerWaarde: r => r.status,
      render: r => <Badge meta={STATUS_META[r.status]} /> },
    { key: 'prioriteit', label: 'Prioriteit', breedte: 110,
      sorteerWaarde: r => ['laag', 'normaal', 'hoog', 'urgent'].indexOf(r.prioriteit),
      render: r => <Badge meta={PRIO_META[r.prioriteit]} /> },
    { key: 'deadline', label: 'Deadline', breedte: 120,
      sorteerWaarde: r => r.deadline ?? '9999',
      render: r => (
        <span style={{ color: isVerlopen(r.deadline, r.status) ? '#dc2626' : undefined, fontWeight: isVerlopen(r.deadline, r.status) ? 600 : undefined }}>
          {fmtDatum(r.deadline)}
        </span>
      ) },
    { key: 'toegewezen', label: isMijnTaken ? 'Ook toegewezen aan' : 'Toegewezen aan', breedte: 180,
      sorteerWaarde: r => medeToegewezen(r).join(', '),
      render: r => { const namen = medeToegewezen(r); return namen.length ? namen.join(', ') : '—' } },
    { key: 'klant_naam', label: 'Klant', breedte: 180, standaard_zichtbaar: false,
      sorteerWaarde: r => r.klant_naam ?? '',
      render: r => r.klant_naam ?? '—' },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isMijnTaken, user_id, paneelBezig])

  // Taaknaam-klik: WB-controletaak → werkbegroting-tab, rest → detailpaneel.
  function onTaakKlik(r: TaakRij) {
    if (r.titel === BEOORDEEL_TAAK_TITEL.werkbegroting) {
      router.push(`/${r.dossier_sectie}/${r.dossier_id}/werkbegroting`)
      return
    }
    void openTaak(r.id)
  }

  // ── Groepsregel per dossier ──────────────────────────────────────
  const groepKop = (rijen: TaakRij[]) => {
    const eerste = rijen[0]
    const totaal = rijen.length
    const open = rijen.filter(r => r.status === 'open').length
    const heeftVerlopen = rijen.some(r => isVerlopen(r.deadline, r.status))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--fg)', fontSize: 13 }}>
          {eerste?.dossiernummer ?? '—'}
        </span>
        <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{eerste?.dossier_titel ?? ''}</span>
        {heeftVerlopen && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: '#fef2f2', color: '#dc2626', whiteSpace: 'nowrap',
          }}>
            <AlertTriangle size={11} /> Verlopen
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
          {totaal} {totaal === 1 ? 'taak' : 'taken'} · {open} open
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        beginSortering={beginSortering}
        selecteerbaar={false}
        toonRijActie={false}
        dicht
        eenregelig
        afvinkKolom={{
          status: r =>
            BEOORDEEL_TITELS.has(r.titel) ? 'verborgen'
            : r.status === 'gereed' ? 'af'
            : r.status === 'vervallen' ? 'verborgen'
            : 'open',
          onKlik: toggleAfvink,
          bezigId: afvinkBezigId,
        }}
        groepering={{
          sleutel: r => r.dossier_id,
          kop: groepKop,
        }}
      />

      {paneelTaak && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            padding: '64px 24px 24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setPaneelTaak(null) }}
        >
          <TaakDetailPanel
            taak={paneelTaak}
            onSluit={() => { setPaneelTaak(null); router.refresh() }}
          />
        </div>
      )}
    </div>
  )
}
