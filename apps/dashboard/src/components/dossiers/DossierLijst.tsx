'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { NieuweAanvraagModal, type AanvraagCategorie, type AanvraagWerkmaatschappij } from './NieuweAanvraagModal'
import { getDossierSubstatus } from './types'
import type { DossierSectie, DossierSubstatus, DossierRij, StatusDef } from './types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { IconPlusDS } from '@/components/eva/Icons'

// Zelfde kleuren als DossierKanban (index-gebaseerd)
const STATUS_COLORS = [
  'var(--brand-500)',
  'var(--info-500)',
  'var(--warning-500)',
  'var(--neutral-400)',
  'var(--success-500)',
  'var(--error-500)',
]

const SECTIE_ROUTE: Record<DossierSectie, string> = {
  aanvraag:    'aanvragen',
  offerte:     'offertes',
  opdracht:    'opdrachten',
  servicedesk: 'servicedesk',
}

const HOOFDSTATUS_LABEL: Record<string, string> = {
  aanvraag: 'Aanvraag',
  offerte:  'Offerte',
  opdracht: 'Opdracht',
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

/** Compacte euro-weergave (afgekort) — voor smalle bedrag-kolommen. */
function formatBedrag(bedrag: number | null): string {
  if (bedrag == null) return '—'
  if (bedrag >= 1_000_000) return `€ ${(bedrag / 1_000_000).toFixed(1)}M`
  if (bedrag >= 1_000)     return `€ ${Math.round(bedrag / 1_000)}K`
  return `€ ${bedrag}`
}

/** Volledige euro-weergave met duizendtal-scheiding. */
function formatEuro(bedrag: number | null): string {
  if (bedrag == null) return '—'
  return `€ ${Math.round(bedrag).toLocaleString('nl-NL')}`
}

/** Datum dag-maand-jaar (zoals de Afgesloten-tab). */
function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isVerlopen(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso) < new Date()
}

/** Servicedesk gebruikt een eigen substatus-veld; overige secties gaan via getDossierSubstatus. */
function actieveSubstatus(d: DossierRij, sectie?: DossierSectie): string {
  if (sectie === 'servicedesk') return d.servicedesk_substatus ?? getDossierSubstatus(d)
  return getDossierSubstatus(d)
}

function getMonteurNamen(d: DossierRij): string[] {
  return [
    d.uitvoerder_naam, d.projectleider_naam, d.teamleider_naam,
    d.werkvoorbereider_naam, d.calculator_naam, d.controller_naam,
  ].filter((n): n is string => !!n)
}

function werkadresTekst(d: DossierRij): string {
  const straat = [d.werkadres_straat, d.werkadres_huisnummer].filter(Boolean).join(' ')
  const plaats = [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' ')
  return [straat, plaats].filter(Boolean).join(', ') || '—'
}

// ── Sub-componenten ───────────────────────────────────────────────────────────

const CREW_PALETTE = [
  '#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b',
  '#f59e0b', '#3b82f6', '#e11d48', '#0891b2',
  '#65a30d', '#9333ea',
]
function crewKleur(initialen: string): string {
  let hash = 0
  for (let i = 0; i < initialen.length; i++) hash = initialen.charCodeAt(i) + ((hash << 5) - hash)
  return CREW_PALETTE[Math.abs(hash) % CREW_PALETTE.length]
}

function MonteurStack({ namen }: { namen: string[] }) {
  if (namen.length === 0) return <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>—</span>
  const zichtbaar = namen.slice(0, 3)
  const overig    = namen.length - 3
  return (
    <div style={{ display: 'inline-flex' }}>
      {zichtbaar.map((naam, i) => {
        const initialen = naam.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
        const kleur = crewKleur(initialen)
        return (
          <div key={naam} title={naam} style={{
            width: 22, height: 22, borderRadius: '50%',
            background: `linear-gradient(135deg,${kleur},${kleur}cc)`,
            color: 'white', fontSize: 9, fontWeight: 700,
            display: 'grid', placeItems: 'center',
            boxShadow: '0 0 0 2px white', marginLeft: i > 0 ? -6 : 0,
          }}>
            {initialen}
          </div>
        )
      })}
      {overig > 0 && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'var(--neutral-200)', color: 'var(--neutral-600)',
          fontSize: 9, fontWeight: 600,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 0 0 2px white', marginLeft: -6,
        }}>+{overig}</div>
      )}
    </div>
  )
}

function ProgressBar({ pct, kleur }: { pct: number; kleur: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 90 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--neutral-200)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: kleur, borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--neutral-500)', minWidth: 24 }}>
        {pct}%
      </span>
    </div>
  )
}

function Tekst({ waarde, kleur = 'var(--neutral-600)', gewicht = 400 }: { waarde: string | null; kleur?: string; gewicht?: number }) {
  return (
    <span style={{ fontSize: 12.5, color: waarde ? kleur : 'var(--neutral-400)', fontWeight: gewicht }}>
      {waarde || '—'}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  dossiers: DossierRij[]
  sectie?: DossierSectie
  statussen: StatusDef<DossierSubstatus>[]
  layouts: GebruikerLayout[]
  user_id: string | null
  kanNieuwAanmaken?: boolean
  categorieen?: AanvraagCategorie[]
  werkmaatschappijen?: AanvraagWerkmaatschappij[]
  viewToggle?: React.ReactNode
  extraActies?: React.ReactNode
  onDossierKlik?: (d: DossierRij) => void
  /** Override voor de layout-sleutel (OverzichtTabel `scherm`); standaard afgeleid uit `sectie`. */
  scherm?: string
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export function DossierLijst({
  dossiers,
  sectie,
  statussen,
  layouts,
  user_id,
  kanNieuwAanmaken = false,
  categorieen,
  werkmaatschappijen,
  viewToggle,
  extraActies,
  onDossierKlik,
  scherm: schermProp,
}: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [data, setData] = React.useState<DossierRij[]>(dossiers)
  React.useEffect(() => { setData(dossiers) }, [dossiers])

  const scherm = schermProp ?? (sectie ? `dossiers-${sectie}` : 'dossiers')

  // ── Kolomdefinities ─────────────────────────────────────────────────────────
  // Standaard zichtbaar: een compacte kern. Alle overige kolommen zijn via
  // kolombeheer aan te zetten (standaard_zichtbaar: false) — liever te veel dan te weinig.
  const kolommen: KolomDefinitie<DossierRij>[] = React.useMemo(() => [
    // ── Kern (standaard zichtbaar) ──────────────────────────────────────────
    {
      key: 'dossiernummer',
      label: 'Dossiernr.',
      vast: true,
      breedte: 120,
      filterType: 'tekst',
      sorteerWaarde: d => d.dossiernummer ?? '',
      render: d => (
        <span style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: 12.5 }}>
          {d.dossiernummer ?? d.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'omschrijving',
      label: 'Omschrijving',
      breedte: 280,
      filterType: 'tekst',
      sorteerWaarde: d => d.titel ?? '',
      render: d => (
        <span style={{ color: 'var(--neutral-800)', fontSize: 12.5 }}>{d.titel}</span>
      ),
    },
    {
      key: 'opdrachtgever',
      label: 'Opdrachtgever',
      breedte: 190,
      filterType: 'tekst',
      sorteerWaarde: d => d.klant_naam ?? '',
      render: d => <Tekst waarde={d.klant_naam} />,
    },
    {
      key: 'status',
      label: 'Status',
      breedte: 165,
      filterType: 'select',
      filterOpties: statussen.map(s => s.label),
      sorteerWaarde: d => {
        const idx = statussen.findIndex(s => s.key === actieveSubstatus(d, sectie))
        return idx >= 0 ? idx : statussen.length
      },
      render: d => {
        const sub = actieveSubstatus(d, sectie)
        const idx = statussen.findIndex(s => s.key === sub)
        const label = statussen[idx]?.label ?? sub
        const kleur = STATUS_COLORS[idx >= 0 ? idx % STATUS_COLORS.length : 0]
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px 2px 6px', borderRadius: 9999,
            fontSize: 11, fontWeight: 600,
            background: `color-mix(in srgb, ${kleur} 12%, white)`,
            color: kleur,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            {label}
          </span>
        )
      },
    },
    {
      key: 'deadline',
      label: 'Deadline',
      breedte: 120,
      sorteerWaarde: d => d.verwacht_einddatum ?? '',
      render: d => {
        const verlopen = isVerlopen(d.verwacht_einddatum)
        return (
          <span style={{
            fontSize: 12,
            color: verlopen ? 'var(--warning-700)' : 'var(--neutral-500)',
            fontWeight: verlopen ? 600 : 400,
          }}>
            {verlopen ? '⚠ Verlopen' : formatDatum(d.verwacht_einddatum)}
          </span>
        )
      },
    },
    {
      key: 'bedrag',
      label: 'Bedrag',
      breedte: 100,
      sorteerWaarde: d => d.bedrag_excl_btw ?? 0,
      render: d => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-700)', fontWeight: 500 }}>
          {formatBedrag(d.bedrag_excl_btw)}
        </span>
      ),
    },

    // ── Contact (standaard verborgen) ───────────────────────────────────────
    {
      key: 'contactpersoon',
      label: 'Contactpersoon',
      breedte: 170,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.contactpersoon_naam ?? '',
      render: d => <Tekst waarde={d.contactpersoon_naam} />,
    },
    {
      key: 'contact_email',
      label: 'Contact e-mail',
      breedte: 210,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.contactpersoon_email ?? '',
      render: d => <Tekst waarde={d.contactpersoon_email} />,
    },
    {
      key: 'contact_telefoon',
      label: 'Contact telefoon',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.contactpersoon_telefoon ?? '',
      render: d => <Tekst waarde={d.contactpersoon_telefoon} />,
    },

    // ── Voortgang & team (standaard verborgen) ──────────────────────────────
    {
      key: 'voortgang',
      label: 'Voortgang',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: d => {
        const idx = statussen.findIndex(s => s.key === actieveSubstatus(d, sectie))
        return statussen.length > 1 ? Math.round((Math.max(0, idx) / (statussen.length - 1)) * 100) : 0
      },
      render: d => {
        const idx = statussen.findIndex(s => s.key === actieveSubstatus(d, sectie))
        const pct = statussen.length > 1 ? Math.round((Math.max(0, idx) / (statussen.length - 1)) * 100) : 0
        const kleur = STATUS_COLORS[idx >= 0 ? idx % STATUS_COLORS.length : 0]
        return <ProgressBar pct={pct} kleur={kleur} />
      },
    },
    {
      key: 'team',
      label: 'Team',
      breedte: 90,
      standaard_zichtbaar: false,
      render: d => <MonteurStack namen={getMonteurNamen(d)} />,
    },

    // ── Rollen (standaard verborgen) ────────────────────────────────────────
    {
      key: 'projectleider',
      label: 'Projectleider',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.projectleider_naam ?? '',
      render: d => <Tekst waarde={d.projectleider_naam} />,
    },
    {
      key: 'calculator',
      label: 'Calculator',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.calculator_naam ?? '',
      render: d => <Tekst waarde={d.calculator_naam} />,
    },
    {
      key: 'werkvoorbereider',
      label: 'Werkvoorbereider',
      breedte: 160,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.werkvoorbereider_naam ?? '',
      render: d => <Tekst waarde={d.werkvoorbereider_naam} />,
    },
    {
      key: 'uitvoerder',
      label: 'Uitvoerder',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.uitvoerder_naam ?? '',
      render: d => <Tekst waarde={d.uitvoerder_naam} />,
    },
    {
      key: 'teamleider',
      label: 'Teamleider',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.teamleider_naam ?? '',
      render: d => <Tekst waarde={d.teamleider_naam} />,
    },
    {
      key: 'controller',
      label: 'Controller',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.controller_naam ?? '',
      render: d => <Tekst waarde={d.controller_naam} />,
    },

    // ── Classificatie & referenties (standaard verborgen) ───────────────────
    {
      key: 'categorie',
      label: 'Categorie',
      breedte: 160,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.categorie ?? d.bouw7_categorie_naam ?? '',
      render: d => <Tekst waarde={d.categorie ?? d.bouw7_categorie_naam} />,
    },
    {
      key: 'fase',
      label: 'Fase',
      breedte: 110,
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: ['Aanvraag', 'Offerte', 'Opdracht'],
      sorteerWaarde: d => d.hoofdstatus,
      render: d => <Tekst waarde={HOOFDSTATUS_LABEL[d.hoofdstatus] ?? d.hoofdstatus} />,
    },
    {
      key: 'referentie',
      label: 'Referentie',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.referentie ?? '',
      render: d => <Tekst waarde={d.referentie} />,
    },
    {
      key: 'opdracht_referentie',
      label: 'Inkoopordernr.',
      breedte: 150,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.opdracht_referentie ?? '',
      render: d => <Tekst waarde={d.opdracht_referentie} />,
    },
    {
      key: 'vve_code',
      label: 'VvE-code',
      breedte: 120,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.vve_code ?? '',
      render: d => <Tekst waarde={d.vve_code} />,
    },

    // ── Werkadres (standaard verborgen) ─────────────────────────────────────
    {
      key: 'werkadres',
      label: 'Werkadres',
      breedte: 240,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => werkadresTekst(d),
      render: d => <Tekst waarde={werkadresTekst(d)} />,
    },
    {
      key: 'stad',
      label: 'Plaats',
      breedte: 130,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.werkadres_stad ?? '',
      render: d => <Tekst waarde={d.werkadres_stad} />,
    },
    {
      key: 'postcode',
      label: 'Postcode',
      breedte: 100,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.werkadres_postcode ?? '',
      render: d => <Tekst waarde={d.werkadres_postcode} />,
    },

    // ── Financieel (standaard verborgen) ────────────────────────────────────
    {
      key: 'bedrag_incl',
      label: 'Bedrag incl. btw',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.bedrag_incl_btw ?? 0,
      render: d => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-700)' }}>{formatEuro(d.bedrag_incl_btw)}</span>
      ),
    },
    {
      key: 'kostprijs',
      label: 'Kostprijs',
      breedte: 120,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.kostprijs_excl_btw ?? 0,
      render: d => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-600)' }}>{formatEuro(d.kostprijs_excl_btw)}</span>
      ),
    },
    {
      key: 'marge',
      label: 'Marge',
      breedte: 110,
      standaard_zichtbaar: false,
      sorteerWaarde: d =>
        d.bedrag_excl_btw == null && d.kostprijs_excl_btw == null
          ? Number.NEGATIVE_INFINITY
          : (d.bedrag_excl_btw ?? 0) - (d.kostprijs_excl_btw ?? 0),
      render: d => {
        if (d.bedrag_excl_btw == null && d.kostprijs_excl_btw == null) return <Tekst waarde={null} />
        const marge = (d.bedrag_excl_btw ?? 0) - (d.kostprijs_excl_btw ?? 0)
        return (
          <span style={{ fontSize: 12.5, fontWeight: 500, color: marge < 0 ? 'var(--error-600)' : 'var(--success-700)' }}>
            {formatEuro(marge)}
          </span>
        )
      },
    },
    {
      key: 'marge_pct',
      label: 'Marge %',
      breedte: 90,
      standaard_zichtbaar: false,
      sorteerWaarde: d => {
        const omzet = d.bedrag_excl_btw ?? 0
        if (!omzet) return Number.NEGATIVE_INFINITY
        return ((omzet - (d.kostprijs_excl_btw ?? 0)) / omzet) * 100
      },
      render: d => {
        const omzet = d.bedrag_excl_btw ?? 0
        if (!omzet) return <Tekst waarde={null} />
        const pct = ((omzet - (d.kostprijs_excl_btw ?? 0)) / omzet) * 100
        return (
          <span style={{ fontSize: 12.5, color: pct < 0 ? 'var(--error-600)' : 'var(--neutral-700)' }}>
            {pct.toFixed(1)}%
          </span>
        )
      },
    },
    {
      key: 'mandaat',
      label: 'Mandaat',
      breedte: 110,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.mandaat_bedrag ?? 0,
      render: d => (
        <span style={{ fontSize: 12.5, color: 'var(--neutral-600)' }}>{formatEuro(d.mandaat_bedrag)}</span>
      ),
    },
    {
      key: 'facturatiemethode',
      label: 'Facturatie',
      breedte: 120,
      standaard_zichtbaar: false,
      filterType: 'select',
      filterOpties: ['Regie', 'Termijnen'],
      sorteerWaarde: d => d.facturatiemethode ?? '',
      render: d => <Tekst waarde={d.facturatiemethode === 'termijnen' ? 'Termijnen' : d.facturatiemethode === 'regie' ? 'Regie' : null} />,
    },

    // ── Datums (standaard verborgen) ────────────────────────────────────────
    {
      key: 'startdatum',
      label: 'Startdatum',
      breedte: 120,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.verwacht_startdatum ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.verwacht_startdatum)}</span>,
    },
    {
      key: 'aanvraagdatum',
      label: 'Aanvraagdatum',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.aanvraagdatum ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.aanvraagdatum)}</span>,
    },
    {
      key: 'deadline_wens',
      label: 'Gewenste deadline',
      breedte: 140,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.deadline ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.deadline)}</span>,
    },
    {
      key: 'verzonden_op',
      label: 'Verzonden op',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.verzonden_op ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.verzonden_op)}</span>,
    },
    {
      key: 'aangemaakt',
      label: 'Aangemaakt',
      breedte: 120,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.created_at ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.created_at)}</span>,
    },
    {
      key: 'laatst_bewerkt',
      label: 'Laatst bewerkt',
      breedte: 120,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.updated_at ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.updated_at)}</span>,
    },

    // ── Bouw7 (standaard verborgen) ─────────────────────────────────────────
    {
      key: 'bouw7_projectnr',
      label: 'Bouw7-projectnr.',
      breedte: 140,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.bouw7_id ?? '',
      render: d => <Tekst waarde={d.bouw7_id} />,
    },
    {
      key: 'bouw7_projectstatus',
      label: 'Bouw7-status',
      breedte: 160,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.bouw7_projectstatus_naam ?? '',
      render: d => <Tekst waarde={d.bouw7_projectstatus_naam} />,
    },
    {
      key: 'bouw7_categorie',
      label: 'Bouw7-categorie',
      breedte: 160,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.bouw7_categorie_naam ?? '',
      render: d => <Tekst waarde={d.bouw7_categorie_naam} />,
    },
    {
      key: 'bouw7_offertestatus',
      label: 'Bouw7-offertestatus',
      breedte: 170,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.bouw7_quotation_status ?? '',
      render: d => <Tekst waarde={d.bouw7_quotation_status} />,
    },
    {
      key: 'bouw7_aanmaakdatum',
      label: 'Bouw7-aanmaakdatum',
      breedte: 160,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.bouw7_aanmaakdatum ?? '',
      render: d => <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{formatDatum(d.bouw7_aanmaakdatum)}</span>,
    },
    {
      key: 'bouw7_sync',
      label: 'Sync-status',
      breedte: 140,
      standaard_zichtbaar: false,
      sorteerWaarde: d => d.bouw7_sync_status ?? '',
      render: d => {
        const s = d.bouw7_sync_status
        if (!s) return <Tekst waarde={null} />
        const meta: Record<string, { label: string; kleur: string }> = {
          synced:  { label: 'Gesynct', kleur: 'var(--success-600)' },
          pending: { label: 'Wacht',   kleur: 'var(--warning-600)' },
          error:   { label: 'Fout',    kleur: 'var(--error-600)'   },
        }
        const m = meta[s] ?? { label: s, kleur: 'var(--neutral-500)' }
        return (
          <span title={d.bouw7_laatst_sync ? `Laatst: ${formatDatum(d.bouw7_laatst_sync)}` : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: m.kleur, fontWeight: 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            {m.label}
          </span>
        )
      },
    },

    // ── Bewaking & notities (standaard verborgen) ───────────────────────────
    {
      key: 'bewaking',
      label: 'Bewaking',
      breedte: 130,
      standaard_zichtbaar: false,
      sorteerWaarde: d =>
        (d.bouw7_bestelregels_afwijking ? 1 : 0) +
        (d.bouw7_uren_overschrijding ? 1 : 0) +
        (d.wb_ongeaccordeerde_wijzigingen ? 1 : 0),
      render: d => {
        const badges: { label: string; titel: string; kleur: string }[] = []
        if (d.bouw7_bestelregels_afwijking) badges.push({ label: 'BR', titel: 'Bestelregels wijken af van werkbegroting', kleur: 'var(--error-600)' })
        if (d.bouw7_uren_overschrijding)    badges.push({ label: 'U',  titel: 'Uren-overschrijding', kleur: 'var(--warning-700)' })
        if (d.wb_ongeaccordeerde_wijzigingen) badges.push({ label: 'WB!', titel: 'Ongeaccordeerde werkbegroting-wijzigingen', kleur: 'var(--warning-700)' })
        if (badges.length === 0) return <Tekst waarde={null} />
        return (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {badges.map(b => (
              <span key={b.label} title={b.titel} style={{
                fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: `color-mix(in srgb, ${b.kleur} 14%, white)`, color: b.kleur,
              }}>{b.label}</span>
            ))}
          </span>
        )
      },
    },
    {
      key: 'opmerkingen',
      label: 'Opmerkingen',
      breedte: 260,
      standaard_zichtbaar: false,
      filterType: 'tekst',
      sorteerWaarde: d => d.opmerkingen ?? '',
      render: d => (
        <span title={d.opmerkingen ?? undefined} style={{
          fontSize: 12, color: d.opmerkingen ? 'var(--neutral-600)' : 'var(--neutral-400)',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {d.opmerkingen || '—'}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [statussen, sectie])

  // ── Klik-handler ────────────────────────────────────────────────────────────
  function handleKlik(d: DossierRij) {
    if (onDossierKlik) {
      onDossierKlik(d)
    } else if (sectie) {
      router.push(`/${SECTIE_ROUTE[sectie]}/${d.id}/informatie`)
    }
  }

  // ── Acties slot voor OverzichtTabel toolbar ──────────────────────────────────
  const acties = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {extraActies}
      {viewToggle}
      {kanNieuwAanmaken && (
        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', borderRadius: 6,
            background: 'var(--brand-500)', color: 'white',
            fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}
        >
          <IconPlusDS size={12} />
          Nieuwe aanvraag
        </button>
      )}
    </div>
  )

  return (
    <>
      {kanNieuwAanmaken && (
        <NieuweAanvraagModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onAanmaken={nieuw => setData(prev => [nieuw, ...prev])}
          categorieen={categorieen}
          werkmaatschappijen={werkmaatschappijen}
        />
      )}

      <div style={{ padding: '20px 28px', minHeight: '100%' }}>
        <OverzichtTabel
          scherm={scherm}
          data={data}
          kolommen={kolommen}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={handleKlik}
          acties={acties}
          dicht
          selecteerbaar={false}
          toonRijActie={false}
        />
      </div>
    </>
  )
}
