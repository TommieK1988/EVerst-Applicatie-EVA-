'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { Badge, Button, Card, CardHeader } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import { NAAR_NIEUW_TABBLAD } from '@/components/dossiers/open-dossier'
import { ONKOSTEN_LABEL, VERVOERMIDDEL_LABEL } from '@/lib/uren/onkosten'
import { keurOnkostenAf, keurOnkostenGoed } from '@/lib/uren/onkosten-goedkeuring-acties'
import type { OnkostenOverzicht, OnkostenRegel } from '@/lib/uren/onkosten-overzicht'

/**
 * De kosten op het Uren-overzicht, in twee blokken:
 *
 * - `KostenTeKeurenKaart` — wat bij jou ligt om goed te keuren: kosten op jouw project, of zonder
 *   project van iemand die jou als goedkeurder heeft. Bovenaan de pagina, los van de gekozen
 *   periode: een kostenpost van vorige maand ligt net zo goed nog op je bureau.
 * - `IngediendeKosten` — alle kosten in de periode met hun goedkeuring, voor wie uitbetaalt
 *   (financieel-recht). Uitbetalen gebeurt op de goedgekeurde.
 *
 * Wie wat mag beslist de server; deze knoppen zijn een voorstel. Zie
 * `lib/uren/onkosten-goedkeuring-acties.ts`.
 */

const euro = (n: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
const datumMetDag = (d: string) => {
  const dt = new Date(`${d}T12:00:00`)
  return `${dt.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '')} ${dt.toLocaleDateString('nl-NL')}`
}

/** "Parkeren", "Reiskosten · Auto · 42 km". */
function soortTekst(r: OnkostenRegel): string {
  return [
    ONKOSTEN_LABEL[r.soort],
    r.vervoermiddel ? VERVOERMIDDEL_LABEL[r.vervoermiddel] : null,
    r.km ? `${r.km.toLocaleString('nl-NL')} km` : null,
  ].filter(Boolean).join(' · ')
}

/* ─── Te keuren door mij ────────────────────────────────────────────────────── */

export function KostenTeKeurenKaart({ regels }: { regels: OnkostenRegel[] }) {
  const router = useRouter()
  const { vraagTekst } = useDialogen()
  const [, start] = useTransition()
  const [klaar, setKlaar] = useState<Set<string>>(new Set())
  const [bezig, setBezig] = useState<string | null>(null)

  const open = regels.filter(r => !klaar.has(r.id))
  if (open.length === 0) return null
  const totaal = open.reduce((s, r) => s + r.bedrag, 0)

  const ververs = () => start(() => router.refresh())

  async function goed(ids: string[], sleutel: string) {
    setBezig(sleutel)
    const r = await keurOnkostenGoed(ids).catch(() => null)
    setBezig(null)
    if (!r) { toast.error('Goedkeuren is niet gelukt. Probeer het zo nog eens.'); return }
    if (!r.ok) { toast.error(r.error); ververs(); return }
    setKlaar(prev => new Set([...prev, ...ids]))
    toast.success(r.verwerkt === 1 ? 'Kostenpost goedgekeurd.' : `${r.verwerkt} kostenposten goedgekeurd.`)
    ververs()
  }

  async function af(regel: OnkostenRegel) {
    const reden = await vraagTekst({
      titel: 'Kosten afkeuren',
      omschrijving: `${regel.medewerkerNaam} krijgt een melding met je reden. Deze kosten worden niet vergoed.`,
      label: 'Reden',
      placeholder: 'Bijvoorbeeld: bonnetje is onleesbaar',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Afkeuren',
    })
    if (!reden?.trim()) return
    setBezig(regel.id)
    const r = await keurOnkostenAf(regel.id, reden).catch(() => null)
    setBezig(null)
    if (!r) { toast.error('Afkeuren is niet gelukt. Probeer het zo nog eens.'); return }
    if (!r.ok) { toast.error(r.error); ververs(); return }
    setKlaar(prev => new Set([...prev, regel.id]))
    toast.success('Kosten afgekeurd.')
    ververs()
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader>
        <span>
          Kosten ter goedkeuring · {open.length} · {euro(totaal)}
        </span>
        {open.length > 1 && (
          <Button size="sm" loading={bezig === 'alles'} disabled={bezig !== null}
            onClick={() => goed(open.map(r => r.id), 'alles')}>
            Alle {open.length} goedkeuren
          </Button>
        )}
      </CardHeader>
      <div>
        {open.map(r => (
          <div key={r.id} style={{
            display: 'grid', alignItems: 'center', gap: 12, padding: '8px 18px',
            gridTemplateColumns: 'minmax(140px, 1.1fr) minmax(130px, 1fr) minmax(160px, 1.6fr) 96px 40px auto',
            borderTop: '1px solid var(--border)', fontSize: 13,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--fg)' }}>{r.medewerkerNaam}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{datumMetDag(r.datum)}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--fg)' }}>{soortTekst(r)}</div>
              {r.omschrijving && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.omschrijving}</div>}
            </div>
            <div style={{ minWidth: 0, color: r.project ? 'var(--fg)' : 'var(--fg-muted)' }}>
              {r.project ?? 'Geen project'}
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                {r.rol === 'projectleider' ? 'jij bent de projectleider' : 'jij bent de goedkeurder'}
              </div>
            </div>
            <div style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag)}</div>
            <div>
              {r.bonUrl
                ? <a href={r.bonUrl} {...NAAR_NIEUW_TABBLAD} style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>Bon</a>
                : <span style={{ color: 'var(--fg-muted)' }}>—</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="outline" disabled={bezig !== null} onClick={() => af(r)}>Afkeuren</Button>
              <Button size="sm" loading={bezig === r.id} disabled={bezig !== null} onClick={() => goed([r.id], r.id)}>
                Goedkeuren
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── Alle ingediende kosten ────────────────────────────────────────────────── */

type StatusLabel = 'Nog niet ingediend' | 'Wacht op goedkeuring' | 'Goedgekeurd' | 'Afgekeurd'
const STATUS_LABELS: StatusLabel[] = ['Wacht op goedkeuring', 'Goedgekeurd', 'Afgekeurd', 'Nog niet ingediend']

function statusLabel(r: OnkostenRegel): StatusLabel {
  if (r.status === 'goedgekeurd') return 'Goedgekeurd'
  if (r.status === 'afgekeurd') return 'Afgekeurd'
  return r.teBeoordelen ? 'Wacht op goedkeuring' : 'Nog niet ingediend'
}

const STATUS_TOON = {
  'Nog niet ingediend': 'neutral',
  'Wacht op goedkeuring': 'warning',
  Goedgekeurd: 'success',
  Afgekeurd: 'error',
} as const

/** Wie er aan zet is, of wie er besliste. */
function beoordelingTekst(r: OnkostenRegel): string {
  if (r.status === 'goedgekeurd') return r.beoordeeldDoorNaam ?? 'Vóór de kostengoedkeuring'
  if (r.status === 'afgekeurd') return `${r.beoordeeldDoorNaam ?? '—'}: ${r.afkeurReden ?? ''}`
  if (!r.teBeoordelen) return 'Medewerker heeft de week nog niet ingediend'
  if (!r.goedkeurderId) return 'Niemand — geen projectleider of goedkeurder ingesteld'
  return `${r.goedkeurderNaam ?? '—'} (${r.rol === 'projectleider' ? 'projectleider' : 'goedkeurder'})`
}

const tekst = (v: string | null, zacht = false) => (
  <span style={{ fontSize: 13, color: zacht ? 'var(--fg-soft)' : 'var(--fg)' }}>{v ?? '—'}</span>
)
const getal = (v: string) => (
  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
)

function isoWeek(d: string): string {
  const dt = new Date(`${d}T12:00:00`)
  const utc = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return `W${Math.ceil((((utc.getTime() - start.getTime()) / 86400000) + 1) / 7)}`
}

/**
 * De kolommen van de kostentabel. Een vaste lijst en geen functie: anders dan bij de uursoorten
 * hangt hier geen filteroptie van de data af.
 */
const KOLOMMEN: KolomDefinitie<OnkostenRegel>[] = [
  {
    key: 'medewerker', label: 'Medewerker', vast: true, breedte: 170, filterType: 'tekst',
    sorteerWaarde: (r) => r.medewerkerNaam,
    render: (r) => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.medewerkerNaam}</span>,
  },
  {
    key: 'datum', label: 'Datum', breedte: 125,
    sorteerWaarde: (r) => r.datum,
    render: (r) => <span style={{ fontSize: 12.5, color: 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{datumMetDag(r.datum)}</span>,
  },
  {
    key: 'week', label: 'Week', breedte: 70, filterType: 'tekst',
    sorteerWaarde: (r) => r.datum,
    render: (r) => tekst(isoWeek(r.datum), true),
  },
  {
    key: 'soort', label: 'Soort', breedte: 130, filterType: 'select',
    filterOpties: Object.values(ONKOSTEN_LABEL),
    sorteerWaarde: (r) => ONKOSTEN_LABEL[r.soort],
    render: (r) => tekst(ONKOSTEN_LABEL[r.soort], true),
  },
  {
    key: 'vervoermiddel', label: 'Vervoermiddel', breedte: 120, filterType: 'select',
    filterOpties: Object.values(VERVOERMIDDEL_LABEL),
    sorteerWaarde: (r) => (r.vervoermiddel ? VERVOERMIDDEL_LABEL[r.vervoermiddel] : ''),
    filterWaarde: (r) => (r.vervoermiddel ? VERVOERMIDDEL_LABEL[r.vervoermiddel] : null),
    render: (r) => tekst(r.vervoermiddel ? VERVOERMIDDEL_LABEL[r.vervoermiddel] : null, true),
  },
  {
    key: 'km', label: 'Kilometers', breedte: 95,
    sorteerWaarde: (r) => r.km ?? 0,
    render: (r) => getal(r.km == null ? '—' : r.km.toLocaleString('nl-NL')),
  },
  {
    key: 'bedrag', label: 'Bedrag', breedte: 100,
    sorteerWaarde: (r) => r.bedrag,
    render: (r) => getal(euro(r.bedrag)),
  },
  {
    key: 'status', label: 'Status', breedte: 160, filterType: 'select',
    filterOpties: STATUS_LABELS,
    sorteerWaarde: (r) => statusLabel(r),
    render: (r) => {
      const s = statusLabel(r)
      return <Badge tone={STATUS_TOON[s]} size="sm">{s}</Badge>
    },
  },
  {
    key: 'project', label: 'Project', breedte: 220, filterType: 'tekst',
    sorteerWaarde: (r) => r.project ?? '',
    render: (r) => tekst(r.project ?? 'Geen project', !r.project),
  },
  {
    key: 'beoordeling', label: 'Ligt bij / beoordeeld door', breedte: 240, filterType: 'tekst',
    sorteerWaarde: (r) => beoordelingTekst(r),
    render: (r) => tekst(beoordelingTekst(r), r.status !== 'afgekeurd'),
  },
  {
    key: 'omschrijving', label: 'Omschrijving', breedte: 240, filterType: 'tekst',
    sorteerWaarde: (r) => r.omschrijving ?? '',
    render: (r) => tekst(r.omschrijving, true),
  },
  {
    key: 'bon', label: 'Bon', breedte: 70,
    sorteerWaarde: (r) => (r.bonUrl ? 1 : 0),
    render: (r) => (r.bonUrl
      ? <a href={r.bonUrl} {...NAAR_NIEUW_TABBLAD} style={{ fontSize: 12.5, color: 'var(--accent)', textDecoration: 'none' }}>Bekijk</a>
      : tekst(null, true)),
  },
]

export function IngediendeKosten({ onkosten, layouts, user_id, periodeTekst }: {
  onkosten: OnkostenOverzicht
  layouts: GebruikerLayout[]
  user_id: string | null
  /** "1-10-2026 t/m 31-10-2026". */
  periodeTekst: string
}) {
  const goedgekeurd = useMemo(
    () => onkosten.regels.filter(r => r.status === 'goedgekeurd').reduce((s, r) => s + r.bedrag, 0),
    [onkosten.regels],
  )
  if (onkosten.regels.length === 0) return null

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: 0 }}>Ingediende kosten</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {euro(onkosten.totaal)}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
          waarvan goedgekeurd {euro(goedgekeurd)}
        </span>
      </div>
      <OverzichtTabel
        scherm="uren-onkosten"
        data={onkosten.regels}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'datum', desc: true }]}
        toonRijActie={false}
        dicht
        eenregelig
      />
      <div style={{ padding: '10px 2px 0', fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        Parkeer-, reis- en overige kosten uit de mobiele weekstaat van {periodeTekst}. Elke post wordt
        goedgekeurd door de projectleider van het project waarvoor hij gemaakt is; zonder project door
        de eigen goedkeurder van de medewerker. Bij auto en bromfiets is het bedrag berekend uit de
        kilometers; bij de rest hoort een foto van het bonnetje. Deze bedragen staan los van Bouw7.
      </div>
    </div>
  )
}
