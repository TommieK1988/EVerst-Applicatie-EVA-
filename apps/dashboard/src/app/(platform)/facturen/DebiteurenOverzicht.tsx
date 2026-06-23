'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button } from '@/components/ui'
import DebiteurPaneel from '@/components/debiteuren/DebiteurPaneel'
import {
  ververDebiteuren,
  type DebiteurRij, type Redencode, type MedewerkerOptie, type Stoplicht, type DebiteurOpvolgstatus,
} from '@/lib/debiteuren/actions'

const STOPLICHT_KLEUR: Record<Stoplicht, string> = { groen: '#16a34a', oranje: '#f59e0b', rood: '#dc2626' }
const STOPLICHT_LABEL: Record<Stoplicht, string> = { groen: 'Op tijd', oranje: '< 30 dgn te laat', rood: '30+ dgn te laat' }
const OPVOLGSTATUS_LABEL: Record<DebiteurOpvolgstatus, string> = {
  nieuw: 'Nieuw', loopt: 'In behandeling', wacht_op_klant: 'Wacht op klant', opgelost: 'Opgelost', geescaleerd: 'Geëscaleerd',
}

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const KOLOMMEN: KolomDefinitie<DebiteurRij>[] = [
  {
    key: 'stoplicht',
    label: 'Status',
    breedte: 130,
    filterType: 'select',
    filterOpties: ['Op tijd', '< 30 dgn te laat', '30+ dgn te laat'],
    sorteerWaarde: r => r.dagen_na_vervaldatum ?? -9999,
    render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: STOPLICHT_KLEUR[r.stoplicht] }} />
        <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{STOPLICHT_LABEL[r.stoplicht]}</span>
        {r.verplicht_incompleet && (
          <span title="Verplichte opvolging ontbreekt" style={{
            fontSize: 9, fontWeight: 800, color: 'white', background: '#dc2626',
            padding: '1px 5px', borderRadius: 6, letterSpacing: '0.03em',
          }}>ACTIE</span>
        )}
      </div>
    ),
  },
  {
    key: 'factuurnummer',
    label: 'Factuurnr.',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: r => r.factuurnummer ?? '',
    render: r => <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.factuurnummer ?? '—'}</span>,
  },
  {
    key: 'klant_naam',
    label: 'Klant',
    filterType: 'tekst',
    sorteerWaarde: r => r.klant_naam ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg)' }}>{r.klant_naam ?? '—'}</span>,
  },
  {
    key: 'project_titel',
    label: 'Project',
    filterType: 'tekst',
    sorteerWaarde: r => r.project_titel ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.project_titel ?? '—'}</span>,
  },
  {
    key: 'projectleider_naam',
    label: 'Projectleider',
    filterType: 'tekst',
    sorteerWaarde: r => r.projectleider_naam ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.projectleider_naam ?? '—'}</span>,
  },
  {
    key: 'bedrag',
    label: 'Bedrag',
    breedte: 110,
    sorteerWaarde: r => r.bedrag ?? 0,
    render: r => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag)}</span>,
  },
  {
    key: 'dagen_na_factuurdatum',
    label: 'Dagen (factuur)',
    breedte: 110,
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.dagen_na_factuurdatum ?? -9999,
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{r.dagen_na_factuurdatum != null ? r.dagen_na_factuurdatum : '—'}</span>,
  },
  {
    key: 'dagen_na_vervaldatum',
    label: 'Dagen te laat',
    breedte: 110,
    sorteerWaarde: r => r.dagen_na_vervaldatum ?? -9999,
    render: r => {
      const d = r.dagen_na_vervaldatum
      const teLaat = d != null && d > 0
      return <span style={{ fontSize: 13, fontWeight: teLaat ? 700 : 400, color: teLaat ? STOPLICHT_KLEUR[r.stoplicht] : 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{teLaat ? d : '—'}</span>
    },
  },
  {
    key: 'opvolgstatus',
    label: 'Opvolging',
    filterType: 'select',
    filterOpties: Object.values(OPVOLGSTATUS_LABEL),
    sorteerWaarde: r => OPVOLGSTATUS_LABEL[r.opvolgstatus],
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{OPVOLGSTATUS_LABEL[r.opvolgstatus]}</span>,
  },
  {
    key: 'reden_label',
    label: 'Reden',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.reden_label ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.reden_label ?? '—'}</span>,
  },
  {
    key: 'actiehouder_naam',
    label: 'Actiehouder',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.actiehouder_naam ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.actiehouder_naam ?? '—'}</span>,
  },
  {
    key: 'verwachte_betaaldatum',
    label: 'Verwacht betaald',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.verwachte_betaaldatum ?? '',
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{datum(r.verwachte_betaaldatum)}</span>,
  },
  {
    key: 'opvolgdatum',
    label: 'Opvolgdatum',
    breedte: 110,
    sorteerWaarde: r => r.opvolgdatum ?? '',
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{datum(r.opvolgdatum)}</span>,
  },
]

type Scope = 'mijn' | 'alle'

type Props = {
  debiteuren: DebiteurRij[]
  redencodes: Redencode[]
  medewerkers: MedewerkerOptie[]
  layouts: GebruikerLayout[]
  user_id: string | null
  currentMedewerkerId: string | null
  magBewerken: boolean
  defaultScopeAlle: boolean
}

export default function DebiteurenOverzicht({
  debiteuren, redencodes, medewerkers, layouts, user_id, currentMedewerkerId, magBewerken, defaultScopeAlle,
}: Props) {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>(defaultScopeAlle ? 'alle' : 'mijn')
  const [geselecteerd, setGeselecteerd] = useState<DebiteurRij | null>(null)
  const [verversen, setVerversen] = useState(false)

  const zichtbaar = useMemo(() => {
    if (scope === 'alle') return debiteuren
    return debiteuren.filter(d => d.projectleider_id != null && d.projectleider_id === currentMedewerkerId)
  }, [scope, debiteuren, currentMedewerkerId])

  const totaalOpenstaand = useMemo(
    () => zichtbaar.reduce((s, d) => s + (d.bedrag ?? 0), 0),
    [zichtbaar],
  )
  const aantalRood = useMemo(() => zichtbaar.filter(d => d.stoplicht === 'rood').length, [zichtbaar])

  async function handleVerversen() {
    setVerversen(true)
    try {
      const res = await ververDebiteuren()
      if (!res.ok) { toast.error(`Verversen mislukt: ${res.error}`); return }
      toast.success(`Bijgewerkt: +${res.nieuw} nieuw, ${res.bijgewerkt} bijgewerkt`)
      router.refresh()
    } finally {
      setVerversen(false)
    }
  }

  return (
    <div className="eva-page-full">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <PageHeader eyebrow="Financieel" title="Facturen — Debiteurenbeheer" />
        <Button variant="secondary" onClick={handleVerversen} disabled={verversen} style={{ marginTop: 8, flexShrink: 0 }}>
          {verversen ? 'Bezig met verversen…' : '↻ Ververs uit Bouw7'}
        </Button>
      </div>

      {/* Samenvatting + scope-toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--bg-subtle)', borderRadius: 10, width: 'fit-content' }}>
          {(['mijn', 'alle'] as Scope[]).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                padding: '6px 14px', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                background: scope === s ? 'white' : 'transparent',
                color: scope === s ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: scope === s ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {s === 'mijn' ? 'Mijn facturen' : 'Alle facturen'}
            </button>
          ))}
        </div>
        <Stat label="Openstaand" value={euro(totaalOpenstaand)} />
        <Stat label="Aantal" value={String(zichtbaar.length)} />
        <Stat label="30+ dgn te laat" value={String(aantalRood)} tone={aantalRood > 0 ? '#dc2626' : undefined} />
      </div>

      <OverzichtTabel
        scherm="debiteuren"
        data={zichtbaar}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'dagen_na_vervaldatum', desc: true }]}
        onRijKlik={r => setGeselecteerd(r)}
      />

      <DebiteurPaneel
        rij={geselecteerd}
        redencodes={redencodes}
        medewerkers={medewerkers}
        magBewerken={magBewerken}
        onClose={() => setGeselecteerd(null)}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--fg-soft)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone ?? 'var(--fg)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
