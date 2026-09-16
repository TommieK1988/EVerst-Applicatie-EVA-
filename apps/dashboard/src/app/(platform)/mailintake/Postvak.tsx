'use client'

import React, { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'

import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button, Badge } from '@/components/ui'
import {
  POSTVAK_TABS, MAIL_SOORT_LABELS, DUPLICAAT_HARD, DUPLICAAT_TWIJFEL, AFZENDER_ONBEKEND,
  type PostvakRij, type PostvakTab,
} from '@/lib/mailintake/types'
import { haalNuOp } from '@/lib/mailintake/actions'

const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const

function datumTijd(iso: string): string {
  const d = new Date(iso)
  const nu = Date.now()
  if (nu - d.getTime() < 24 * 3600 * 1000) {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) + ' vandaag'
  }
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

/** Klein staafje voor een score van 0-1. Zegt in één blik meer dan een getal. */
function Vertrouwen({ waarde }: { waarde: number | null }) {
  if (waarde == null) return <span style={klein}>—</span>
  const pct = Math.round(waarde * 100)
  const kleur = waarde >= 0.8 ? 'var(--su-600, #16a34a)' : waarde >= 0.5 ? 'var(--wa-600, #d97706)' : 'var(--da-600, #dc2626)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 42, height: 6, borderRadius: 3, background: 'var(--n-200, #e5e7eb)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur }} />
      </div>
      <span style={{ ...klein, minWidth: 30 }}>{pct}%</span>
    </div>
  )
}

const STATUS_TOON: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  wacht_op_mens: 'warning',
  verwerkt: 'success',
  geen_aanvraag: 'neutral',
  genegeerd: 'neutral',
  mislukt: 'error',
  bezig: 'neutral',
  nieuw: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  wacht_op_mens: 'Te behandelen',
  verwerkt: 'Verwerkt',
  geen_aanvraag: 'Geen aanvraag',
  genegeerd: 'Genegeerd',
  mislukt: 'Mislukt',
  bezig: 'Bezig',
  nieuw: 'Nieuw',
}

const KOLOMMEN: KolomDefinitie<PostvakRij>[] = [
  {
    key: 'ontvangen',
    label: 'Ontvangen',
    vast: true,
    breedte: 140,
    sorteerWaarde: r => r.ontvangenOp,
    filterWaarde: r => new Date(r.ontvangenOp).toLocaleDateString('nl-NL'),
    render: r => <span style={zacht}>{datumTijd(r.ontvangenOp)}</span>,
  },
  {
    key: 'postbus',
    label: 'Postbus',
    filterType: 'select',
    filterWaarde: r => r.postbusNaam,
    sorteerWaarde: r => r.postbusNaam,
    render: r => <Badge tone="neutral">{r.postbusNaam}</Badge>,
  },
  {
    key: 'afzender',
    label: 'Afzender',
    breedte: 220,
    filterType: 'tekst',
    sorteerWaarde: r => (r.vanNaam ?? r.vanAdres ?? '').toLowerCase(),
    render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{r.vanNaam ?? r.vanAdres ?? '—'}</span>
        {r.vanNaam && <span style={klein}>{r.vanAdres}</span>}
      </div>
    ),
  },
  {
    key: 'onderwerp',
    label: 'Onderwerp',
    breedte: 320,
    filterType: 'tekst',
    sorteerWaarde: r => (r.onderwerp ?? '').toLowerCase(),
    render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span>
          {r.heeftBijlagen && <span title="Bevat bijlagen" style={{ marginRight: 5 }}>📎</span>}
          {r.onderwerp ?? '(geen onderwerp)'}
        </span>
        {r.samenvatting && <span style={klein}>{r.samenvatting}</span>}
      </div>
    ),
  },
  {
    key: 'soort',
    label: 'Soort',
    filterType: 'select',
    filterOpties: Object.values(MAIL_SOORT_LABELS),
    filterWaarde: r => (r.soort ? MAIL_SOORT_LABELS[r.soort] : 'Nog niet beoordeeld'),
    sorteerWaarde: r => (r.soort ? MAIL_SOORT_LABELS[r.soort] : ''),
    render: r => r.soort
      ? <Badge tone="neutral">{MAIL_SOORT_LABELS[r.soort]}</Badge>
      : <span style={klein}>—</span>,
  },
  {
    key: 'klant',
    label: 'Opdrachtgever',
    breedte: 200,
    filterType: 'tekst',
    sorteerWaarde: r => (r.relatieNaam ?? 'zzz').toLowerCase(),
    render: r => r.relatieNaam
      ? <span>{r.relatieNaam}</span>
      : (
        <span style={{ ...klein, color: (r.herkenningScore ?? 0) < AFZENDER_ONBEKEND ? 'var(--wa-700, #b45309)' : undefined }}>
          Onbekend
        </span>
      ),
  },
  {
    key: 'vertrouwen',
    label: 'Vertrouwen',
    breedte: 110,
    sorteerWaarde: r => r.soortVertrouwen ?? -1,
    filterWaarde: r => r.soortVertrouwen == null ? 'onbekend'
      : r.soortVertrouwen >= 0.8 ? 'hoog' : r.soortVertrouwen >= 0.5 ? 'gemiddeld' : 'laag',
    filterType: 'select',
    filterOpties: ['hoog', 'gemiddeld', 'laag', 'onbekend'],
    render: r => <Vertrouwen waarde={r.soortVertrouwen} />,
  },
  {
    key: 'duplicaat',
    label: 'Duplicaat',
    breedte: 170,
    sorteerWaarde: r => r.duplicaatTopscore ?? -1,
    filterWaarde: r => {
      const s = r.duplicaatTopscore ?? 0
      return s >= DUPLICAAT_HARD ? 'waarschijnlijk' : s >= DUPLICAAT_TWIJFEL ? 'mogelijk' : 'geen'
    },
    filterType: 'select',
    filterOpties: ['waarschijnlijk', 'mogelijk', 'geen'],
    render: r => {
      const s = r.duplicaatTopscore ?? 0
      if (s < DUPLICAAT_TWIJFEL) return <span style={klein}>—</span>
      return (
        <Badge tone={s >= DUPLICAAT_HARD ? 'error' : 'warning'}>
          {r.duplicaatDossiernummer ? `Lijkt op ${r.duplicaatDossiernummer}` : 'Mogelijk dubbel'}
        </Badge>
      )
    },
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: Object.values(STATUS_LABEL),
    filterWaarde: r => STATUS_LABEL[r.status] ?? r.status,
    sorteerWaarde: r => r.status,
    render: r => <Badge tone={STATUS_TOON[r.status] ?? 'neutral'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>,
  },
  {
    key: 'dossier',
    label: 'Dossier',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.dossiernummer ?? '',
    render: r => r.dossiernummer ? <span style={zacht}>{r.dossiernummer}</span> : <span style={klein}>—</span>,
  },
  {
    key: 'toegewezen',
    label: 'Toegewezen',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => (r.toegewezenNaam ?? '').toLowerCase(),
    render: r => <span style={zacht}>{r.toegewezenNaam ?? '—'}</span>,
  },
  {
    key: 'fout',
    label: 'Melding',
    standaard_zichtbaar: false,
    breedte: 260,
    render: r => <span style={klein}>{r.laatsteFout ?? '—'}</span>,
  },
]

export default function Postvak({
  rijen, tellers, actieveTab, layouts, user_id, magSchrijven, magBeheren,
}: {
  rijen: PostvakRij[]
  tellers: Record<string, number>
  actieveTab: PostvakTab
  layouts: GebruikerLayout[]
  user_id: string | null
  magSchrijven: boolean
  magBeheren: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [bezig, setBezig] = useState(false)

  const tellerVoor = (tab: PostvakTab): number | null => {
    switch (tab) {
      case 'te_behandelen': return tellers.wacht_op_mens ?? 0
      case 'geen_aanvraag': return tellers.geen_aanvraag ?? 0
      case 'genegeerd':     return tellers.genegeerd ?? 0
      case 'mislukt':       return tellers.mislukt ?? 0
      default: return null
    }
  }

  async function nuOphalen() {
    setBezig(true)
    try {
      const res = await haalNuOp()
      if (res.fouten.length) toast.error(res.fouten.join(' · '))
      else toast.success(res.nieuw ? `${res.nieuw} nieuw bericht${res.nieuw === 1 ? '' : 'en'} opgehaald` : 'Geen nieuwe berichten')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ophalen mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    // eva-page-full is de container die de andere overzichten (Objecten, Relaties,
    // Medewerkers) ook gebruiken: vaste marges rondom en volle breedte voor de tabel.
    // Zonder die klasse plakt de inhoud tegen de rand en klopt de witruimte niet.
    <div className="eva-page-full">
      <PageHeader eyebrow="Beheer" title="Postvak" />
      <p className="eva-page-desc">
        Binnengekomen post uit de intakepostbussen. EVA doet een voorstel; jij beslist.
      </p>

      {/* Tabbladen. Via de URL, zodat een link naar "te behandelen" deelbaar is. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {POSTVAK_TABS.map(t => {
          const actief = t.key === actieveTab
          const teller = tellerVoor(t.key)
          return (
            <button
              key={t.key}
              onClick={() => router.push(`${pathname}?tab=${t.key}`)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${actief ? 'transparent' : 'var(--border)'}`,
                background: actief ? 'hsl(var(--primary))' : 'var(--surface)',
                color: actief ? 'hsl(var(--primary-foreground))' : 'var(--fg)',
                fontWeight: actief ? 600 : 400,
              }}
            >
              {t.label}
              {teller ? <span style={{ marginLeft: 6, opacity: 0.8 }}>{teller}</span> : null}
            </button>
          )
        })}
      </div>

      <OverzichtTabel
        scherm="mailintake"
        data={rijen}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        dicht
        beginSortering={[{ id: 'ontvangen', desc: true }]}
        onRijKlik={r => router.push(`/mailintake/${r.id}`)}
        acties={magBeheren ? (
          <Button variant="outline" onClick={nuOphalen} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Nu ophalen'}
          </Button>
        ) : undefined}
      />

      {!magSchrijven && (
        <p style={{ ...klein, marginTop: 12 }}>
          Je kunt hier meekijken, maar niet behandelen. Vraag om schrijfrechten op Mailintake als dat wel nodig is.
        </p>
      )}
    </div>
  )
}
