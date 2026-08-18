'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import TaakDetailPanel from '@/components/taken/TaakDetailPanel'
import { EmptyState } from '@/components/ui'
import { BEOORDEEL_TAAK_TITEL } from '@/lib/goedkeuring/types'
import type { DossierActieRij } from '@/lib/taken/services/taken'
import type { TaakMetDetails, TaskStatus } from '@/lib/taken/supabase/database.types'
import { haalTaakVoorPaneel, updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { useDossierReadOnly } from './DossierReadOnlyContext'

/** Beoordeel-taken lopen via de goedkeuringsflow en zijn niet handmatig af te vinken. */
const BEOORDEEL_TITELS = new Set<string>(Object.values(BEOORDEEL_TAAK_TITEL))

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  open:           { label: 'Open',           bg: '#eff6ff', color: '#1d4ed8' },
  in_behandeling: { label: 'In behandeling', bg: '#fef9c3', color: '#854d0e' },
  wacht_op:       { label: 'Wacht op',       bg: '#f3e8ff', color: '#7e22ce' },
  gereed:         { label: 'Gereed',         bg: '#dcfce7', color: '#16a34a' },
  vervallen:      { label: 'Vervallen',      bg: '#f3f4f6', color: '#6b7280' },
}
const PRIO_META: Record<string, { label: string; bg: string; color: string }> = {
  laag:    { label: 'Laag',    bg: '#f3f4f6', color: '#6b7280' },
  normaal: { label: 'Normaal', bg: '#eff6ff', color: '#2563eb' },
  hoog:    { label: 'Hoog',    bg: '#fff7ed', color: '#c2410c' },
  urgent:  { label: 'Urgent',  bg: '#fef2f2', color: '#dc2626' },
}

const LOSSE_ACTIE = 'Losse actie'

function isVerlopen(deadline: string | null, status: string): boolean {
  if (!deadline) return false
  if (status === 'gereed' || status === 'vervallen') return false
  return new Date(deadline) < new Date()
}

function fmtDatum(d: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'd MMM yyyy', { locale: nl }) } catch { return '—' }
}

function Badge({ meta }: { meta?: { label: string; bg: string; color: string } }) {
  if (!meta) return <span style={{ color: 'var(--fg-muted)' }}>—</span>
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
    }}>{meta.label}</span>
  )
}

export default function ActiesTabel({
  data, layouts, user_id, acties,
}: {
  data: DossierActieRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  /** Knoppen in de tabelbalk (sjabloon activeren, nieuwe actie). */
  acties?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const readOnly = useDossierReadOnly()

  // Detailpaneel (klik op een actienaam) — lazy geladen volledige taak.
  const [paneelTaak, setPaneelTaak] = useState<TaakMetDetails | null>(null)
  const [paneelBezig, setPaneelBezig] = useState<string | null>(null)

  // Afvinken direct in de tabel (gereed ↔ open).
  const [, startAfvink] = useTransition()
  const [afvinkBezigId, setAfvinkBezigId] = useState<string | null>(null)

  function toggleAfvink(r: DossierActieRij) {
    const nieuw: TaskStatus = r.status === 'gereed' ? 'open' : 'gereed'
    setAfvinkBezigId(r.id)
    startAfvink(async () => {
      try {
        await updateTaakStatus(r.id, nieuw)
        toast.success(nieuw === 'gereed' ? 'Actie afgerond' : 'Actie heropend')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Afvinken mislukt')
      } finally {
        setAfvinkBezigId(null)
      }
    })
  }

  // Actienaam-klik: de WB-controletaak hoort op de werkbegroting-tab van ditzelfde
  // dossier thuis, de rest opent het detailpaneel.
  async function onTaakKlik(r: DossierActieRij) {
    if (r.titel === BEOORDEEL_TAAK_TITEL.werkbegroting) {
      router.push(pathname.replace(/\/taken$/, '/werkbegroting'))
      return
    }
    setPaneelBezig(r.id)
    try {
      const taak = await haalTaakVoorPaneel(r.id)
      if (taak) setPaneelTaak(taak)
    } finally {
      setPaneelBezig(null)
    }
  }

  const lijstOpties = useMemo(() => {
    const namen = [...new Set(data.map(r => r.lijst_naam).filter(Boolean) as string[])].sort()
    return data.some(r => !r.lijst_naam) ? [...namen, LOSSE_ACTIE] : namen
  }, [data])

  const kolommen = useMemo<KolomDefinitie<DossierActieRij>[]>(() => {
    // Celknoppen breken lange tekst af met een ellipsis zodat de rij één regel blijft.
    const celKnop: React.CSSProperties = {
      background: 'none', border: 0, padding: 0, cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left',
      display: 'block', maxWidth: '100%',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }

    return [
      { key: 'titel', label: 'Actie', vast: true, breedte: 300,
        sorteerWaarde: r => r.titel.toLowerCase(),
        render: r => (
          <button
            onClick={e => { e.stopPropagation(); void onTaakKlik(r) }}
            disabled={paneelBezig === r.id}
            title={r.titel}
            style={{ ...celKnop, color: 'var(--fg)', fontWeight: 500, opacity: paneelBezig === r.id ? 0.5 : 1 }}
          >
            {r.titel}
          </button>
        ) },
      { key: 'lijst_naam', label: 'Actielijst', breedte: 200,
        filterType: 'select', filterOpties: lijstOpties,
        sorteerWaarde: r => r.lijst_naam ?? '',
        filterWaarde: r => r.lijst_naam ?? LOSSE_ACTIE,
        render: r => r.lijst_naam ?? <span style={{ color: 'var(--fg-muted)' }}>{LOSSE_ACTIE}</span> },
      { key: 'deadline', label: 'Deadline', breedte: 120,
        // Acties zonder deadline zakken naar onderen bij oplopend sorteren.
        sorteerWaarde: r => r.deadline ?? '9999',
        render: r => (
          <span style={{
            color: isVerlopen(r.deadline, r.status) ? '#dc2626' : undefined,
            fontWeight: isVerlopen(r.deadline, r.status) ? 600 : undefined,
          }}>
            {fmtDatum(r.deadline)}
          </span>
        ) },
      { key: 'status', label: 'Status', breedte: 130,
        filterType: 'select',
        filterOpties: ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen'].map(s => STATUS_META[s].label),
        sorteerWaarde: r => ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen'].indexOf(r.status),
        filterWaarde: r => STATUS_META[r.status]?.label ?? r.status,
        render: r => <Badge meta={STATUS_META[r.status]} /> },
      { key: 'prioriteit', label: 'Prioriteit', breedte: 110,
        filterType: 'select',
        filterOpties: ['laag', 'normaal', 'hoog', 'urgent'].map(p => PRIO_META[p].label),
        sorteerWaarde: r => ['laag', 'normaal', 'hoog', 'urgent'].indexOf(r.prioriteit),
        filterWaarde: r => PRIO_META[r.prioriteit]?.label ?? r.prioriteit,
        render: r => <Badge meta={PRIO_META[r.prioriteit]} /> },
      { key: 'toegewezen', label: 'Toegewezen aan', breedte: 190,
        sorteerWaarde: r => r.toegewezen_namen.join(', '),
        render: r => r.toegewezen_namen.length ? r.toegewezen_namen.join(', ') : '—' },
      { key: 'subtaken', label: 'Subacties', breedte: 100, standaard_zichtbaar: false,
        sorteerWaarde: r => r.subtaken_totaal,
        render: r => r.subtaken_totaal === 0 ? '—' : `${r.subtaken_gereed}/${r.subtaken_totaal} gereed` },
      { key: 'geschatte_uren', label: 'Geschatte uren', breedte: 120, standaard_zichtbaar: false,
        sorteerWaarde: r => r.geschatte_uren ?? -1,
        render: r => r.geschatte_uren == null ? '—' : String(r.geschatte_uren) },
      { key: 'formulier', label: 'Formulier', breedte: 100, standaard_zichtbaar: false,
        sorteerWaarde: r => (r.heeft_formulier ? 1 : 0),
        render: r => r.heeft_formulier ? 'Ja' : '—' },
      { key: 'created_at', label: 'Aangemaakt', breedte: 120, standaard_zichtbaar: false,
        sorteerWaarde: r => r.created_at,
        render: r => fmtDatum(r.created_at) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lijstOpties, paneelBezig, pathname])

  if (data.length === 0) {
    return (
      <>
        {acties && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>{acties}</div>
        )}
        <EmptyState
          icon={<span style={{ fontSize: 24 }}>☑</span>}
          title="Geen acties"
          description="Maak een losse actie aan met 'Nieuwe actie', of activeer een sjabloon om een actielijst aan dit dossier te koppelen."
        />
      </>
    )
  }

  return (
    <>
      <OverzichtTabel
        scherm="dossier-acties"
        data={data}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        acties={acties}
        beginSortering={[{ id: 'deadline', desc: false }]}
        selecteerbaar={false}
        toonRijActie={false}
        dicht
        eenregelig
        afvinkKolom={{
          status: r =>
            readOnly || BEOORDEEL_TITELS.has(r.titel) ? 'verborgen'
            : r.status === 'gereed' ? 'af'
            : r.status === 'vervallen' ? 'verborgen'
            : 'open',
          onKlik: toggleAfvink,
          bezigId: afvinkBezigId,
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
    </>
  )
}
