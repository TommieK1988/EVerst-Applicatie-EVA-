'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { syncRelaties } from '@/app/(platform)/instellingen/integraties/actions'
import type { GebruikerLayout, OrganisatieType, Contactpersoon, Particulier } from '@everts/database'
import { organisatieTypeLabels, organisatieTypeTone } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button, Badge } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'
import NieuweOrganisatieModal from '@/components/relaties/NieuweOrganisatieModal'
import NieuweContactpersoonModal from '@/components/relaties/NieuweContactpersoonModal'
import NieuweParticulierModal from '@/components/relaties/NieuweParticulierModal'

/* ─── types ───────────────────────────────────────────────────────── */

type Organisatie = {
  id: string
  types: OrganisatieType[]
  naam: string
  email: string | null
  telefoon: string | null
  website: string | null
  kvk_nummer: string | null
  btw_nummer: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
  actief: boolean
  created_at: string
}

type ContactpersoonRij = Contactpersoon & {
  organisaties: { naam: string; functie: string | null }[]
}

type ParticulierRij = Particulier

type Tab = 'organisaties' | 'contactpersonen' | 'particulieren'

/* ─── helpers ─────────────────────────────────────────────────────── */

function initialen(naam: string): string {
  return naam.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function volledigeNaam(p: { voornaam: string; tussenvoegsel: string | null; achternaam: string }): string {
  return [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ')
}

/* ─── kolom-definities ────────────────────────────────────────────── */

const KOLOMMEN_ORGANISATIES: KolomDefinitie<Organisatie>[] = [
  {
    key: 'naam',
    label: 'Naam',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: r => r.naam,
    render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--accent))',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'white',
        }}>
          {initialen(r.naam)}
        </div>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {r.naam}
        </span>
      </div>
    ),
  },
  {
    key: 'types',
    label: 'Type',
    filterType: 'select',
    filterOpties: ['Opdrachtgever', 'Leverancier', 'Onderaannemer'],
    sorteerWaarde: r => r.types.map(t => organisatieTypeLabels[t]).join(', '),
    render: r => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.types.map(t => (
          <Badge key={t} tone={organisatieTypeTone[t]}>{organisatieTypeLabels[t]}</Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'adres_plaats',
    label: 'Stad',
    filterType: 'tekst',
    sorteerWaarde: r => r.adres_plaats ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.adres_plaats ?? '—'}
      </span>
    ),
  },
  {
    key: 'telefoon',
    label: 'Telefoon',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.telefoon ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.telefoon ?? '—'}
      </span>
    ),
  },
  {
    key: 'email',
    label: 'E-mail',
    filterType: 'tekst',
    sorteerWaarde: r => r.email ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.email ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: ['Actief', 'Inactief'],
    sorteerWaarde: r => r.actief ? 'Actief' : 'Inactief',
    render: r => (
      <Badge variant="outline" tone={r.actief ? 'success' : 'neutral'} dot>
        {r.actief ? 'Actief' : 'Inactief'}
      </Badge>
    ),
  },
  {
    key: 'kvk_nummer',
    label: 'KvK-nummer',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.kvk_nummer ?? '',
    render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-soft)' }}>{r.kvk_nummer ?? '—'}</span>,
  },
  {
    key: 'btw_nummer',
    label: 'BTW-nummer',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.btw_nummer ?? '',
    render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-soft)' }}>{r.btw_nummer ?? '—'}</span>,
  },
  {
    key: 'website',
    label: 'Website',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.website ?? '',
    render: r => r.website
      ? <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{r.website}</a>
      : <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>—</span>,
  },
  {
    key: 'adres_postcode',
    label: 'Postcode',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.adres_postcode ?? '',
    render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-soft)' }}>{r.adres_postcode ?? '—'}</span>,
  },
  {
    key: 'adres_land',
    label: 'Land',
    standaard_zichtbaar: false,
    filterType: 'select',
    filterOpties: ['Nederland', 'Overig'],
    sorteerWaarde: r => r.adres_land ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.adres_land ?? '—'}</span>,
  },
  {
    key: 'created_at',
    label: 'Aangemaakt',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.created_at,
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontFamily: 'var(--font-mono)' }}>{new Date(r.created_at).toLocaleDateString('nl-NL')}</span>,
  },
]

const KOLOMMEN_CONTACTPERSONEN: KolomDefinitie<ContactpersoonRij>[] = [
  {
    key: 'naam',
    label: 'Naam',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: r => volledigeNaam(r),
    render: r => {
      const naam = volledigeNaam(r)
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent), var(--accent))',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'white',
          }}>
            {initialen(naam)}
          </div>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            {naam}
          </span>
        </div>
      )
    },
  },
  {
    key: 'organisaties',
    label: 'Organisaties',
    filterType: 'tekst',
    sorteerWaarde: r => r.organisaties.map(o => o.naam).join(', '),
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.organisaties.length > 0
          ? r.organisaties.map(o => o.naam).join(' · ')
          : '—'}
      </span>
    ),
  },
  {
    key: 'email',
    label: 'E-mail',
    filterType: 'tekst',
    sorteerWaarde: r => r.email ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.email ?? '—'}
      </span>
    ),
  },
  {
    key: 'telefoon',
    label: 'Telefoon',
    sorteerWaarde: r => r.telefoon ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.telefoon ?? r.mobiel ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: ['Actief', 'Inactief'],
    sorteerWaarde: r => r.actief ? 'Actief' : 'Inactief',
    render: r => (
      <Badge variant="outline" tone={r.actief ? 'success' : 'neutral'} dot>
        {r.actief ? 'Actief' : 'Inactief'}
      </Badge>
    ),
  },
  {
    key: 'aanhef',
    label: 'Aanhef',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.aanhef ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.aanhef ?? '—'}</span>,
  },
  {
    key: 'geslacht',
    label: 'Geslacht',
    standaard_zichtbaar: false,
    filterType: 'select',
    filterOpties: ['Man', 'Vrouw', 'Overig'],
    sorteerWaarde: r => r.geslacht ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.geslacht ? (r.geslacht.charAt(0).toUpperCase() + r.geslacht.slice(1)) : '—'}</span>,
  },
  {
    key: 'mobiel',
    label: 'Mobiel',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.mobiel ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.mobiel ?? '—'}</span>,
  },
  {
    key: 'geboortedatum',
    label: 'Geboortedatum',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.geboortedatum ?? '',
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontFamily: 'var(--font-mono)' }}>{r.geboortedatum ? new Date(r.geboortedatum).toLocaleDateString('nl-NL') : '—'}</span>,
  },
  {
    key: 'linkedin_url',
    label: 'LinkedIn',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.linkedin_url ?? '',
    render: r => r.linkedin_url
      ? <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>LinkedIn</a>
      : <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>—</span>,
  },
]

const KOLOMMEN_PARTICULIEREN: KolomDefinitie<ParticulierRij>[] = [
  {
    key: 'naam',
    label: 'Naam',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: r => volledigeNaam(r),
    render: r => {
      const naam = volledigeNaam(r)
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #64748b, #94a3b8)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'white',
          }}>
            {initialen(naam)}
          </div>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            {naam}
          </span>
        </div>
      )
    },
  },
  {
    key: 'adres_plaats',
    label: 'Stad',
    filterType: 'tekst',
    sorteerWaarde: r => r.adres_plaats ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.adres_plaats ?? '—'}
      </span>
    ),
  },
  {
    key: 'email',
    label: 'E-mail',
    filterType: 'tekst',
    sorteerWaarde: r => r.email ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.email ?? '—'}
      </span>
    ),
  },
  {
    key: 'telefoon',
    label: 'Telefoon',
    sorteerWaarde: r => r.telefoon ?? '',
    render: r => (
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.telefoon ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: ['Actief', 'Inactief'],
    sorteerWaarde: r => r.actief ? 'Actief' : 'Inactief',
    render: r => (
      <Badge variant="outline" tone={r.actief ? 'success' : 'neutral'} dot>
        {r.actief ? 'Actief' : 'Inactief'}
      </Badge>
    ),
  },
  {
    key: 'adres_postcode',
    label: 'Postcode',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.adres_postcode ?? '',
    render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-soft)' }}>{r.adres_postcode ?? '—'}</span>,
  },
  {
    key: 'mobiel',
    label: 'Mobiel',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.mobiel ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.mobiel ?? '—'}</span>,
  },
  {
    key: 'geboortedatum',
    label: 'Geboortedatum',
    standaard_zichtbaar: false,
    sorteerWaarde: r => r.geboortedatum ?? '',
    render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontFamily: 'var(--font-mono)' }}>{r.geboortedatum ? new Date(r.geboortedatum).toLocaleDateString('nl-NL') : '—'}</span>,
  },
  {
    key: 'adres_land',
    label: 'Land',
    standaard_zichtbaar: false,
    filterType: 'select',
    filterOpties: ['Nederland', 'Overig'],
    sorteerWaarde: r => r.adres_land ?? '',
    render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.adres_land ?? '—'}</span>,
  },
]

/* ─── tab-balk ────────────────────────────────────────────────────── */

const TABS: { key: Tab; label: string; count?: number }[] = [
  { key: 'organisaties', label: 'Organisaties' },
  { key: 'contactpersonen', label: 'Contactpersonen' },
  { key: 'particulieren', label: 'Particulieren' },
]

function TabBalk({ actief, setActief, counts }: {
  actief: Tab
  setActief: (t: Tab) => void
  counts: Record<Tab, number>
}) {
  return (
    <div style={{
      display: 'flex', gap: 2, padding: '4px',
      background: 'var(--bg-subtle)', borderRadius: 10,
      width: 'fit-content', marginBottom: 16,
    }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => setActief(t.key)}
          style={{
            padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
            transition: 'all 0.15s',
            background: actief === t.key ? 'var(--bg)' : 'transparent',
            color: actief === t.key ? 'var(--fg)' : 'var(--fg-muted)',
            boxShadow: actief === t.key ? 'var(--shadow-sm)' : 'none',
          }}
        >
          {t.label}
          {counts[t.key] > 0 && (
            <span style={{
              marginLeft: 6, padding: '1px 6px', borderRadius: 10,
              background: actief === t.key ? 'var(--bg-subtle)' : 'transparent',
              fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)',
            }}>
              {counts[t.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ─── hoofd component ─────────────────────────────────────────────── */

type Props = {
  organisaties: Organisatie[]
  contactpersonen: ContactpersoonRij[]
  particulieren: ParticulierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export default function RelatiesOverzicht({ organisaties, contactpersonen, particulieren, layouts, user_id }: Props) {
  const router = useRouter()
  const [actieveTab, setActieveTab] = useState<Tab>('organisaties')
  const [showNieuweOrganisatie, setShowNieuweOrganisatie] = useState(false)
  const [showNieuweContactpersoon, setShowNieuweContactpersoon] = useState(false)
  const [showNieuweParticulier, setShowNieuweParticulier] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await syncRelaties()
      if (!res.ok) {
        toast.error(`Sync mislukt: ${res.error}`)
        return
      }
      const fouten = res.organisaties.fouten + res.contactpersonen.fouten
      const nieuw = res.organisaties.nieuw + res.contactpersonen.nieuw
      const bijgewerkt = res.organisaties.bijgewerkt + res.contactpersonen.bijgewerkt

      if (fouten > 0 && nieuw + bijgewerkt === 0) {
        const foutMelding = res.organisaties.foutMelding ?? res.contactpersonen.foutMelding ?? 'onbekende fout'
        toast.error(`Sync mislukt (${fouten} fouten): ${foutMelding}`)
      } else if (fouten > 0) {
        toast.success(`Sync klaar met waarschuwingen: +${res.organisaties.nieuw} org., +${res.contactpersonen.nieuw} contacten — ${fouten} fout(en)`)
        router.refresh()
      } else {
        toast.success(`Sync klaar: +${res.organisaties.nieuw} org., +${res.contactpersonen.nieuw} contacten (${bijgewerkt} bijgewerkt)`)
        if (nieuw + bijgewerkt > 0) router.refresh()
      }
    } finally {
      setSyncing(false)
    }
  }

  function wisselTab(tab: Tab) {
    setActieveTab(tab)
  }

  const counts: Record<Tab, number> = {
    organisaties: organisaties.length,
    contactpersonen: contactpersonen.length,
    particulieren: particulieren.length,
  }

  return (
    <div className="eva-page-full">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <PageHeader eyebrow="CRM" title="Relaties" />
        <Button
          variant="secondary"
          onClick={handleSync}
          disabled={syncing}
          style={{ marginTop: 8, flexShrink: 0 }}
        >
          {syncing ? 'Bezig met synchen...' : '↻ Sync Bouw7'}
        </Button>
      </div>

      <TabBalk actief={actieveTab} setActief={wisselTab} counts={counts} />

      {actieveTab === 'organisaties' && (
        <OverzichtTabel
          scherm="relaties-organisaties"
          data={organisaties}
          kolommen={KOLOMMEN_ORGANISATIES}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={r => router.push(`/relaties/${r.id}`)}
          acties={
            <Button variant="primary" onClick={() => setShowNieuweOrganisatie(true)}>
              <IconPlus size={14} />
              Nieuwe organisatie
            </Button>
          }
        />
      )}

      {actieveTab === 'contactpersonen' && (
        <OverzichtTabel
          scherm="relaties-contactpersonen"
          data={contactpersonen}
          kolommen={KOLOMMEN_CONTACTPERSONEN}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={r => router.push(`/relaties/contactpersonen/${r.id}`)}
          acties={
            <Button variant="primary" onClick={() => setShowNieuweContactpersoon(true)}>
              <IconPlus size={14} />
              Nieuwe contactpersoon
            </Button>
          }
        />
      )}

      {actieveTab === 'particulieren' && (
        <OverzichtTabel
          scherm="relaties-particulieren"
          data={particulieren}
          kolommen={KOLOMMEN_PARTICULIEREN}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={r => router.push(`/relaties/particulieren/${r.id}`)}
          acties={
            <Button variant="primary" onClick={() => setShowNieuweParticulier(true)}>
              <IconPlus size={14} />
              Nieuwe particulier
            </Button>
          }
        />
      )}

      {showNieuweOrganisatie && (
        <NieuweOrganisatieModal onSluit={() => setShowNieuweOrganisatie(false)} />
      )}
      {showNieuweContactpersoon && (
        <NieuweContactpersoonModal onSluit={() => setShowNieuweContactpersoon(false)} />
      )}
      {showNieuweParticulier && (
        <NieuweParticulierModal onSluit={() => setShowNieuweParticulier(false)} />
      )}
    </div>
  )
}
