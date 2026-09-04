'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import NieuweMedewerkerModal from '@/components/medewerkers/NieuweMedewerkerModal'
import { PageHeader, Button, Badge, Switch } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'

type Medewerker = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  telefoon: string | null
  foto_url: string | null
  functie: string | null
  afdeling: string | null
  extern: boolean
  actief: boolean
  uurtarief_verkoop: number | null
  uurtarief_kostprijs: number | null
  cao_schaal: string | null
  cao_document_id: string | null
  cao_trede: string | null
  in_dienst_vanaf: string | null
  uit_dienst_per: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  geboortedatum: string | null
  werkmaatschappij_id: string | null
  relatie_id: string | null
  kleur: string | null
  ploeg_id: string | null
  standaard_uursoort_id: string | null
  gebruiker_type: string | null
  o365_email: string | null
  handtekening_url: string | null
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  bouw7_sync_status: string | null
  created_at: string
  updated_at: string
}

type Lookups = {
  ploegen: Record<string, string>
  werkmaatschappijen: Record<string, string>
  uursoorten: Record<string, string>
  relaties: Record<string, string>
  caoDocumenten: Record<string, string>
}

function volledigeNaam(m: Medewerker): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

function initials(m: Medewerker): string {
  return [m.voornaam?.[0] ?? '', m.achternaam?.[0] ?? ''].join('').toUpperCase()
}

function formatTarief(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDatumTijd(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const GEBRUIKER_TYPE_LABELS: Record<string, string> = {
  geen:               'Geen',
  app_gebruiker:      'App-gebruiker',
  platform_gebruiker: 'Platform-gebruiker',
}

const tekstStyle: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }
const mutedStyle: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }

function maakKolommen(lookups: Lookups, data: Medewerker[]): KolomDefinitie<Medewerker>[] {
  // Distincte, gesorteerde opties uit de data — voor keuzelijst-filters op kolommen
  // die in het formulier via een dropdown/lookup gevuld worden.
  const distinct = (fn: (m: Medewerker) => string | null | undefined): string[] =>
    [...new Set(data.map(fn).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'nl'))

  const ploegNaam        = (m: Medewerker) => (m.ploeg_id && lookups.ploegen[m.ploeg_id]) || ''
  const uursoortNaam     = (m: Medewerker) => (m.standaard_uursoort_id && lookups.uursoorten[m.standaard_uursoort_id]) || ''
  const administratieNaam = (m: Medewerker) => (m.werkmaatschappij_id && lookups.werkmaatschappijen[m.werkmaatschappij_id]) || ''
  const relatieNaam      = (m: Medewerker) => (m.relatie_id && lookups.relaties[m.relatie_id]) || ''
  const caoDocumentNaam  = (m: Medewerker) => (m.cao_document_id && lookups.caoDocumenten[m.cao_document_id]) || ''

  return [
    {
      key: 'naam',
      label: 'Naam',
      vast: true,
      filterType: 'tekst',
      sorteerWaarde: m => volledigeNaam(m),
      render: m => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {m.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.foto_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent), var(--accent))',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'white',
            }}>
              {initials(m)}
            </div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              {volledigeNaam(m)}
            </div>
            {m.email && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
                {m.email}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'voornaam',
      label: 'Voornaam',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.voornaam,
      render: m => <span style={tekstStyle}>{m.voornaam}</span>,
    },
    {
      key: 'tussenvoegsel',
      label: 'Tussenvoegsel',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.tussenvoegsel ?? '',
      render: m => <span style={mutedStyle}>{m.tussenvoegsel ?? '—'}</span>,
    },
    {
      key: 'achternaam',
      label: 'Achternaam',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.achternaam,
      render: m => <span style={tekstStyle}>{m.achternaam}</span>,
    },
    {
      key: 'email',
      label: 'E-mail',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.email ?? '',
      render: m => <span style={mutedStyle}>{m.email ?? '—'}</span>,
    },
    {
      key: 'telefoon',
      label: 'Telefoon',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.telefoon ?? '',
      render: m => <span style={mutedStyle}>{m.telefoon ?? '—'}</span>,
    },
    {
      key: 'adres_straat',
      label: 'Adres',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.adres_straat ?? '',
      render: m => <span style={mutedStyle}>{m.adres_straat ?? '—'}</span>,
    },
    {
      key: 'adres_postcode',
      label: 'Postcode',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.adres_postcode ?? '',
      render: m => <span style={mutedStyle}>{m.adres_postcode ?? '—'}</span>,
    },
    {
      key: 'adres_plaats',
      label: 'Plaats',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.adres_plaats ?? '',
      render: m => <span style={mutedStyle}>{m.adres_plaats ?? '—'}</span>,
    },
    {
      key: 'geboortedatum',
      label: 'Geboortedatum',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.geboortedatum ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.geboortedatum)}</span>,
    },
    {
      key: 'functie',
      label: 'Functie',
      filterType: 'select',
      filterOpties: distinct(m => m.functie),
      sorteerWaarde: m => m.functie ?? '',
      render: m => <span style={tekstStyle}>{m.functie ?? '—'}</span>,
    },
    {
      key: 'afdeling',
      label: 'Afdeling',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(m => m.afdeling),
      sorteerWaarde: m => m.afdeling ?? '',
      render: m => <span style={mutedStyle}>{m.afdeling ?? '—'}</span>,
    },
    {
      key: 'ploeg',
      label: 'Ploeg',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(ploegNaam),
      sorteerWaarde: ploegNaam,
      render: m => <span style={mutedStyle}>{ploegNaam(m) || '—'}</span>,
    },
    {
      key: 'uursoort',
      label: 'Uursoort',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(uursoortNaam),
      sorteerWaarde: uursoortNaam,
      render: m => <span style={mutedStyle}>{uursoortNaam(m) || '—'}</span>,
    },
    {
      key: 'werkmaatschappij',
      label: 'Administratie',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(administratieNaam),
      sorteerWaarde: administratieNaam,
      render: m => <span style={mutedStyle}>{administratieNaam(m) || '—'}</span>,
    },
    {
      key: 'relatie',
      label: 'Relatie',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(relatieNaam),
      sorteerWaarde: relatieNaam,
      render: m => <span style={mutedStyle}>{relatieNaam(m) || '—'}</span>,
    },
    {
      key: 'type',
      label: 'Type',
      filterType: 'select',
      filterOpties: ['Intern', 'Extern'],
      sorteerWaarde: m => m.extern ? 'Extern' : 'Intern',
      render: m => (
        <Badge tone={m.extern ? 'warning' : 'success'}>
          {m.extern ? 'Extern' : 'Intern'}
        </Badge>
      ),
    },
    {
      key: 'uurtarief_verkoop',
      label: 'Tarief verkoop',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.uurtarief_verkoop ?? -1,
      render: m => <span style={{ fontSize: 12, color: 'var(--fg)' }}>{formatTarief(m.uurtarief_verkoop)}</span>,
    },
    {
      key: 'uurtarief_kostprijs',
      label: 'Tarief kostprijs',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.uurtarief_kostprijs ?? -1,
      render: m => <span style={{ fontSize: 12, color: 'var(--fg)' }}>{formatTarief(m.uurtarief_kostprijs)}</span>,
    },
    {
      key: 'cao_document',
      label: 'CAO document',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(caoDocumentNaam),
      sorteerWaarde: caoDocumentNaam,
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{caoDocumentNaam(m) || '—'}</span>,
    },
    {
      key: 'cao_schaal',
      label: 'CAO schaal',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(m => m.cao_schaal),
      sorteerWaarde: m => m.cao_schaal ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{m.cao_schaal ?? '—'}</span>,
    },
    {
      key: 'cao_trede',
      label: 'CAO trede',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: distinct(m => m.cao_trede),
      sorteerWaarde: m => m.cao_trede ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{m.cao_trede ?? '—'}</span>,
    },
    {
      key: 'in_dienst_vanaf',
      label: 'In dienst vanaf',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.in_dienst_vanaf ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.in_dienst_vanaf)}</span>,
    },
    {
      key: 'uit_dienst_per',
      label: 'Uit dienst per',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.uit_dienst_per ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.uit_dienst_per)}</span>,
    },
    {
      key: 'kleur',
      label: 'Kleur planning',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.kleur ?? '',
      render: m => m.kleur ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: m.kleur, border: '1px solid var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{m.kleur}</span>
        </div>
      ) : <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Automatisch</span>,
    },
    {
      key: 'gebruiker_type',
      label: 'Gebruikerstype',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: Object.values(GEBRUIKER_TYPE_LABELS),
      sorteerWaarde: m => GEBRUIKER_TYPE_LABELS[m.gebruiker_type ?? 'geen'] ?? 'Geen',
      render: m => <span style={mutedStyle}>{GEBRUIKER_TYPE_LABELS[m.gebruiker_type ?? 'geen'] ?? 'Geen'}</span>,
    },
    {
      key: 'o365_email',
      label: 'O365 e-mail',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.o365_email ?? '',
      render: m => <span style={mutedStyle}>{m.o365_email ?? '—'}</span>,
    },
    {
      key: 'handtekening',
      label: 'Handtekening',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: ['Ja', 'Nee'],
      sorteerWaarde: m => m.handtekening_url ? 'Ja' : 'Nee',
      render: m => <span style={mutedStyle}>{m.handtekening_url ? 'Ja' : 'Nee'}</span>,
    },
    {
      key: 'bouw7_id',
      label: 'Bouw7 ID',
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: m => m.bouw7_id ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{m.bouw7_id ?? '—'}</span>,
    },
    {
      key: 'bouw7_sync_status',
      label: 'Bouw7 sync-status',
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: ['synced', 'pending', 'error'],
      sorteerWaarde: m => m.bouw7_sync_status ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{m.bouw7_sync_status ?? '—'}</span>,
    },
    {
      key: 'bouw7_laatst_sync',
      label: 'Bouw7 laatste sync',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.bouw7_laatst_sync ?? '',
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatumTijd(m.bouw7_laatst_sync)}</span>,
    },
    {
      key: 'created_at',
      label: 'Aangemaakt',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.created_at,
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.created_at)}</span>,
    },
    {
      key: 'updated_at',
      label: 'Bijgewerkt',
      standaard_zichtbaar: false,
      sorteerWaarde: m => m.updated_at,
      render: m => <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.updated_at)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      filterType: 'select',
      filterOpties: ['Actief', 'Inactief'],
      sorteerWaarde: m => m.actief ? 'Actief' : 'Inactief',
      render: m => (
        <Badge variant="outline" tone={m.actief ? 'success' : 'neutral'} dot>
          {m.actief ? 'Actief' : 'Inactief'}
        </Badge>
      ),
    },
  ]
}

type Props = {
  medewerkers: Medewerker[]
  layouts: GebruikerLayout[]
  user_id: string | null
  functies: { id: string; naam: string }[]
  lookups: Lookups
}

export default function MedewerkersOverzicht({ medewerkers, layouts, user_id, functies, lookups }: Props) {
  const router = useRouter()
  const [showNieuw, setShowNieuw] = useState(false)
  // Uit dienst blijft overal buiten beeld; dit scherm is de enige plek waar je ze
  // er bewust bij kunt zetten. Bewust géén kolomfilter: een bewaarde werkstand van
  // vóór deze regel zou die stilletjes weer uitzetten.
  const [toonInactief, setToonInactief] = useState(false)

  const zichtbaar = useMemo(
    () => toonInactief ? medewerkers : medewerkers.filter(m => m.actief),
    [medewerkers, toonInactief],
  )
  const aantalInactief = useMemo(() => medewerkers.filter(m => !m.actief).length, [medewerkers])
  const kolommen = useMemo(() => maakKolommen(lookups, zichtbaar), [lookups, zichtbaar])

  return (
    <div className="eva-page-full">
      {/* Header */}
      <PageHeader eyebrow="HR" title="Medewerkers" />

      {/* Tabel */}
      <OverzichtTabel
        scherm="medewerkers"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        onRijKlik={m => router.push(`/medewerkers/${m.id}`)}
        acties={
          <>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg-muted)', cursor: 'pointer' }}
            >
              <Switch size="sm" checked={toonInactief} onCheckedChange={setToonInactief} />
              Uit dienst tonen{aantalInactief > 0 ? ` (${aantalInactief})` : ''}
            </label>
            <Button variant="primary" onClick={() => setShowNieuw(true)}>
              <IconPlus size={14} />
              Nieuwe medewerker
            </Button>
          </>
        }
      />

      {/* Nieuw modal */}
      {showNieuw && <NieuweMedewerkerModal onClose={() => setShowNieuw(false)} functies={functies} />}
    </div>
  )
}
