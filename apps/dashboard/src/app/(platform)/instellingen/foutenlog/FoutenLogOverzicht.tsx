'use client'

import React, { useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import {
  PageHeader, Badge, Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui'
import { markeerOpgelost, heropen } from './actions'

/* ─── types ───────────────────────────────────────────────────────── */

export type FoutRij = {
  id: string
  fingerprint: string
  omgeving: 'server' | 'browser' | 'cron'
  bron: string
  soort: string | null
  module: string | null
  fout_type: string | null
  melding: string
  stack: string | null
  digest: string | null
  url: string | null
  medewerker_id: string | null
  medewerker_naam: string | null
  extra: Record<string, unknown> | null
  aantal: number
  eerst_op: string
  laatst_op: string
  opgelost: boolean
  opgelost_op: string | null
  opgelost_door: string | null
  opgelost_door_naam: string | null
  notitie: string | null
}

type Weergave = 'open' | 'opgelost' | 'alles'

/* ─── helpers ─────────────────────────────────────────────────────── */

function dt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const OMGEVING_TONE: Record<FoutRij['omgeving'], 'error' | 'warning' | 'info'> = {
  server: 'error',
  browser: 'warning',
  cron: 'info',
}

/* ─── kolom-definities ────────────────────────────────────────────── */
// Elke kolom krijgt een sorteerWaarde: zonder die functie is de kolom niet sorteerbaar
// én exporteert hij leeg naar Excel.

const KOLOMMEN: KolomDefinitie<FoutRij>[] = [
  {
    key: 'laatst_op',
    label: 'Laatst',
    vast: true,
    breedte: 130,
    sorteerWaarde: r => r.laatst_op,
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
        {dt(r.laatst_op)}
      </span>
    ),
  },
  {
    key: 'aantal',
    label: 'Aantal',
    breedte: 80,
    sorteerWaarde: r => r.aantal,
    render: r => (
      <span style={{
        fontFamily: 'var(--font-ui)', fontSize: 12.5,
        fontWeight: r.aantal > 10 ? 700 : 500,
        color: r.aantal > 10 ? 'var(--fg)' : 'var(--fg-muted)',
      }}>
        {r.aantal}×
      </span>
    ),
  },
  {
    key: 'omgeving',
    label: 'Waar',
    breedte: 100,
    filterType: 'select',
    filterOpties: ['server', 'browser', 'cron'],
    sorteerWaarde: r => r.omgeving,
    render: r => <Badge tone={OMGEVING_TONE[r.omgeving]}>{r.omgeving}</Badge>,
  },
  {
    key: 'bron',
    label: 'Bron',
    filterType: 'tekst',
    breedte: 230,
    sorteerWaarde: r => r.bron,
    render: r => (
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--fg)' }}>
        {r.bron}
      </span>
    ),
  },
  {
    key: 'melding',
    label: 'Melding',
    filterType: 'tekst',
    breedte: 380,
    sorteerWaarde: r => r.melding,
    render: r => (
      <span
        title={r.melding}
        style={{
          fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg)',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {r.melding}
      </span>
    ),
  },
  {
    key: 'module',
    label: 'Module',
    // Keuzelijst wordt in het scherm gevuld met de modules die echt voorkomen.
    filterType: 'select',
    breedte: 120,
    sorteerWaarde: r => r.module ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
        {r.module ?? '—'}
      </span>
    ),
  },
  {
    key: 'medewerker',
    label: 'Gebruiker',
    breedte: 150,
    sorteerWaarde: r => r.medewerker_naam ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
        {r.medewerker_naam ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    breedte: 110,
    filterType: 'select',
    filterOpties: ['Open', 'Opgelost'],
    sorteerWaarde: r => (r.opgelost ? 'Opgelost' : 'Open'),
    render: r =>
      r.opgelost
        ? <Badge tone="success" variant="outline">Opgelost</Badge>
        : <Badge tone="neutral" variant="outline">Open</Badge>,
  },
  {
    key: 'fout_type',
    label: 'Type',
    standaard_zichtbaar: false,
    breedte: 140,
    sorteerWaarde: r => r.fout_type ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--fg-muted)' }}>
        {r.fout_type ?? '—'}
      </span>
    ),
  },
  {
    key: 'eerst_op',
    label: 'Eerst gezien',
    standaard_zichtbaar: false,
    breedte: 130,
    sorteerWaarde: r => r.eerst_op,
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
        {dt(r.eerst_op)}
      </span>
    ),
  },
  {
    key: 'soort',
    label: 'Soort',
    standaard_zichtbaar: false,
    breedte: 100,
    sorteerWaarde: r => r.soort ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)' }}>
        {r.soort ?? '—'}
      </span>
    ),
  },
]

/* ─── detail-dialoog ──────────────────────────────────────────────── */

function Regel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border-subtle, #eef1f4)' }}>
      <div style={{ width: 110, flexShrink: 0, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg)', minWidth: 0, wordBreak: 'break-word' }}>
        {children}
      </div>
    </div>
  )
}

function FoutDetail({ fout, onSluit }: { fout: FoutRij; onSluit: () => void }) {
  const [notitie, setNotitie] = useState(fout.notitie ?? '')
  const [bezig, startTransition] = useTransition()

  function afvinken() {
    startTransition(async () => {
      const res = await markeerOpgelost(fout.id, notitie)
      if (res.ok) { toast.success('Afgevinkt als opgelost'); onSluit() }
      else toast.error(res.error)
    })
  }

  function terugzetten() {
    startTransition(async () => {
      const res = await heropen(fout.id)
      if (res.ok) { toast.success('Weer op open gezet'); onSluit() }
      else toast.error(res.error)
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{fout.melding}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Regel label="Waar">
            <Badge tone={OMGEVING_TONE[fout.omgeving]}>{fout.omgeving}</Badge>
            {fout.soort && <span style={{ marginLeft: 8, color: 'var(--fg-muted)' }}>{fout.soort}</span>}
          </Regel>
          <Regel label="Bron">
            <code>{fout.bron}</code>
          </Regel>
          {fout.url && fout.url !== fout.bron && <Regel label="URL"><code>{fout.url}</code></Regel>}
          <Regel label="Type">{fout.fout_type ?? '—'}</Regel>
          <Regel label="Hoe vaak">
            {fout.aantal}× · eerst {dt(fout.eerst_op)} · laatst {dt(fout.laatst_op)}
          </Regel>
          {fout.medewerker_naam && <Regel label="Gebruiker">{fout.medewerker_naam}</Regel>}
          {fout.digest && (
            <Regel label="Foutcode">
              <code>{fout.digest}</code>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                Dit is de code die de gebruiker op zijn scherm zag.
              </div>
            </Regel>
          )}
          {fout.extra && Object.keys(fout.extra).length > 0 && (
            <Regel label="Extra">
              <code style={{ fontSize: 11 }}>{JSON.stringify(fout.extra)}</code>
            </Regel>
          )}
          {fout.opgelost && (
            <Regel label="Afgevinkt">
              {dt(fout.opgelost_op)}{fout.opgelost_door_naam ? ` door ${fout.opgelost_door_naam}` : ''}
            </Regel>
          )}

          {fout.stack && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
                Stacktrace
              </div>
              <pre style={{
                margin: 0, padding: 12, borderRadius: 8, maxHeight: 260, overflow: 'auto',
                background: 'var(--bg-subtle, #f6f8fa)', border: '1px solid var(--border-subtle, #eef1f4)',
                fontFamily: 'var(--font-mono, monospace)', fontSize: 11, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--fg-muted)',
              }}>
                {fout.stack}
              </pre>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
              Notitie (optioneel)
            </label>
            <textarea
              value={notitie}
              onChange={e => setNotitie(e.target.value)}
              rows={2}
              placeholder="Wat was de oorzaak, wat is eraan gedaan?"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6, resize: 'vertical',
                border: '1px solid var(--border, #d8dee4)', fontFamily: 'var(--font-ui)', fontSize: 12.5,
              }}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit}>Sluiten</Button>
          {fout.opgelost
            ? <Button variant="secondary" onClick={terugzetten} disabled={bezig}>Weer op open zetten</Button>
            : <Button onClick={afvinken} disabled={bezig}>Markeren als opgelost</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── scherm ──────────────────────────────────────────────────────── */

export default function FoutenLogOverzicht({
  fouten, layouts, user_id,
}: {
  fouten: FoutRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const [weergave, setWeergave] = useState<Weergave>('open')
  const [geopend, setGeopend] = useState<FoutRij | null>(null)

  const aantalOpen = useMemo(() => fouten.filter(f => !f.opgelost).length, [fouten])

  const zichtbaar = useMemo(() => {
    if (weergave === 'open') return fouten.filter(f => !f.opgelost)
    if (weergave === 'opgelost') return fouten.filter(f => f.opgelost)
    return fouten
  }, [fouten, weergave])

  // De modulelijst is vrije tekst uit de logging; de opties komen dus uit de data.
  const kolommen = useMemo<KolomDefinitie<FoutRij>[]>(
    () => KOLOMMEN.map(k => k.key === 'module'
      ? { ...k, filterOpties: [...new Set(fouten.map(f => f.module).filter((m): m is string => !!m))].sort() }
      : k),
    [fouten],
  )

  const tabs: Array<[Weergave, string]> = [
    ['open', `Open (${aantalOpen})`],
    ['opgelost', 'Opgelost'],
    ['alles', 'Alles'],
  ]

  return (
    <div className="eva-page">
      <PageHeader
        eyebrow="Systeem"
        title="Foutenlog"
        status={
          aantalOpen > 0
            ? { label: `${aantalOpen} open`, tone: 'error', dot: true }
            : { label: 'Niets open', tone: 'success', dot: true }
        }
      />

      <OverzichtTabel
        scherm="fouten-log"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        dicht
        selecteerbaar={false}
        toonRijActie={false}
        beginSortering={[{ id: 'laatst_op', desc: true }]}
        onRijKlik={setGeopend}
        acties={
          <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'var(--bg-subtle, #f1f3f5)' }}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setWeergave(key)}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 0, cursor: 'pointer',
                  fontFamily: 'var(--font-ui)', fontSize: 12.5,
                  fontWeight: weergave === key ? 600 : 500,
                  background: weergave === key ? 'white' : 'transparent',
                  color: weergave === key ? 'var(--fg)' : 'var(--fg-muted)',
                  boxShadow: weergave === key ? '0 1px 2px rgba(16,24,40,0.08)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {geopend && <FoutDetail fout={geopend} onSluit={() => setGeopend(null)} />}
    </div>
  )
}
