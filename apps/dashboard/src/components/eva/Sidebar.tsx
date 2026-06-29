'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconMore, IconBase,
  IconRelaties, IconMedewerkers, IconInstellingen,
  IconAanvragen, IconOffertes, IconOpdrachten, IconManagement, IconServicedesk,
  IconProjectplanning, IconCrewplanning, IconAgenda,
  IconFacturen, IconInkoop,
  IconKam,
  IconSjablonen, IconWagenpark, IconHoutrotherstel, IconEvertsCalc,
  IconFormulieren,
} from './Icons'
import type { Tweaks } from './types'
import type { RechtenModule, RechtenSet } from '@everts/database/platform-types'
import { magOnderdeelZien } from '@/lib/auth/rechten-shared'
import { getDossierToggles, dossierHeeftCalculatie } from '@/lib/dossiers/actions'
import { TAB_TOGGLE_GATES } from '@/lib/dossiers/tab-gating'


function Wordmark({ style }: { style?: React.CSSProperties }) {
  return (
    <span style={{
      fontFamily: 'var(--font-display)', fontWeight: 800,
      letterSpacing: '0.06em', color: 'white',
      textShadow: '0 1px 2px rgba(0,0,0,0.25)', ...style,
    }}>EVERTS.</span>
  )
}

function SubIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <IconBase size={size}>
      <path d={d} />
    </IconBase>
  )
}

type NavEntry = {
  href?: string
  label: string
  Icon: React.ComponentType<{ size?: number }>
  badge?: number
  separator?: boolean
  comingSoon?: boolean
  module?: RechtenModule
}

const NAV: NavEntry[] = [
  { href: '/aanvragen',   label: 'Aanvragen',   Icon: IconAanvragen,  module: 'dossiers'    },
  { href: '/offertes',    label: 'Offertes',    Icon: IconOffertes,   module: 'dossiers'    },
  { href: '/opdrachten',  label: 'Opdrachten',  Icon: IconOpdrachten, separator: true, module: 'dossiers' },
  { href: '/servicedesk', label: 'Servicedesk', Icon: IconServicedesk, module: 'servicedesk' },
  { href: '/management/dashboard', label: 'Management', Icon: IconManagement, module: 'management' },
]

const BEHEER: NavEntry[] = [
  { href: '/relaties',    label: 'Relaties',    Icon: IconRelaties,    module: 'relaties'    },
  { href: '/medewerkers', label: 'Medewerkers', Icon: IconMedewerkers, module: 'medewerkers' },
  { href: '/wagenpark',   label: 'Wagenpark',   Icon: IconWagenpark,   module: 'wagenpark'   },
  { href: '/kam', label: 'KAM/VGM', Icon: IconKam, module: 'kam' },
]

const PLANNING_INKOOP: NavEntry[] = [
  { href: '/planning/project',         label: 'Projectplanning',    Icon: IconProjectplanning, module: 'planning' },
  { href: '/planning/medewerker',      label: 'Medewerkerplanning', Icon: IconCrewplanning,    module: 'planning' },
  { href: '/planning/bedrijfsagenda',  label: 'Bedrijfsagenda',     Icon: IconAgenda,          module: 'planning' },
]

const FINANCIEEL: NavEntry[] = [
  { href: '/facturen', label: 'Facturen', Icon: IconFacturen, module: 'financieel' },
  { label: 'Inkoop',   Icon: IconInkoop,   comingSoon: true, module: 'financieel' },
]

const APPS: NavEntry[] = [
  { href: '/formulieren',    label: 'Formulieren',     Icon: IconFormulieren,    module: 'formulieren'   },
  { href: '/taken',          label: 'Actielijsten',    Icon: IconSjablonen,      module: 'taken'         },
  { href: '/houtrotherstel', label: 'Houtrotherstel',  Icon: IconHoutrotherstel, module: 'houtrotherstel' },
  { href: '/everts-calc',    label: 'EvertsCalc',      Icon: IconEvertsCalc,     module: 'everts_calc'   },
]

const ICON_OVERZICHT = 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01'
const ICON_SJABLONEN = 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'

const APP_SUBNAV: Record<string, {
  label: string
  Icon: React.ComponentType<{ size?: number }>
  items: { href: string; label: string; icon: string }[]
}> = {
  '/formulieren': {
    label: 'Formulieren',
    Icon: IconFormulieren,
    items: [
      { href: '/formulieren/overzicht', label: 'Overzicht',  icon: ICON_OVERZICHT },
      { href: '/formulieren/sjablonen', label: 'Sjablonen',  icon: ICON_SJABLONEN },
    ],
  },
  '/taken': {
    label: 'Actielijsten',
    Icon: IconSjablonen,
    items: [
      { href: '/taken/overzicht', label: 'Overzicht',  icon: ICON_OVERZICHT },
      { href: '/taken/lijsten',   label: 'Sjablonen',  icon: ICON_SJABLONEN },
    ],
  },
  '/houtrotherstel': {
    label: 'Houtrotherstel',
    Icon: IconHoutrotherstel,
    items: [
      { href: '/houtrotherstel/dashboard',    label: 'Dashboard',    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
      { href: '/houtrotherstel/projecten',    label: 'Projecten',    icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' },
      { href: '/houtrotherstel/registraties', label: 'Registraties', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { href: '/houtrotherstel/rapportages',  label: 'Rapportages',  icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ],
  },
  '/everts-calc': {
    label: 'EvertsCalc',
    Icon: IconEvertsCalc,
    items: [
      { href: '/everts-calc/calculaties',              label: 'Calculaties',  icon: 'M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M16 3l2 2-9 9m0 0H7m2 0V9' },
      { href: '/everts-calc/quotes',                   label: 'Offertes',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
      { href: '/everts-calc/bibliotheek/recepten',     label: 'Recepten',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { href: '/everts-calc/bibliotheek/schilderwerk', label: 'Schilderwerk', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { href: '/everts-calc/bibliotheek/materialen',   label: 'Materialen',   icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    ],
  },
  '/wagenpark': {
    label: 'Wagenpark',
    Icon: IconWagenpark,
    items: [
      { href: '/wagenpark/dashboard',   label: 'Dashboard',   icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
      { href: '/wagenpark/voertuigen',  label: 'Voertuigen',  icon: 'M8 17H5a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3m-4 9h6m-3-3v6M3 11h18' },
      { href: '/wagenpark/ritten',      label: 'Ritten',      icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
      { href: '/wagenpark/bestuurders', label: 'Bestuurders', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '/wagenpark/parkeren',    label: 'Parkeren',    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z' },
      { href: '/wagenpark/bevindingen', label: 'Bevindingen', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { href: '/wagenpark/diagnose',    label: 'Diagnose',    icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
    ],
  },
  '/management': {
    label: 'Management',
    Icon: IconManagement,
    items: [
      { href: '/management/dashboard',   label: 'Dashboard',      icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
      { href: '/management/lopend',      label: 'Lopende Werken', icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' },
      { href: '/management/gereed',      label: 'Gereed Werken',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { href: '/management/servicedesk', label: 'Servicedesk',    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/management/verkoop',     label: 'Verkoop',        icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
      { href: '/management/calculators', label: 'Calculators',    icon: 'M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M16 3l2 2-9 9m0 0H7m2 0V9' },
      { href: '/management/historie',    label: 'Historie',       icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
}

type DossierTab = { slug: string; label: string; d: string }

const AANVRAAG_TABS: DossierTab[] = [
  { slug: 'informatie', label: 'Informatie', d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'bestanden',  label: 'Bestanden',  d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { slug: 'calculatie', label: 'Calculatie', d: 'M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M16 3l2 2-9 9m0 0H7m2 0V9' },
  { slug: 'taken',      label: 'Taken',      d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4' },
]

const OPDRACHT_TABS: DossierTab[] = [
  { slug: 'informatie',    label: 'Informatie',    d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'bestanden',     label: 'Bestanden',     d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { slug: 'werkbegroting', label: 'Werkbegroting', d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { slug: 'planning',      label: 'Planning',      d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { slug: 'taken',         label: 'Taken',         d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4' },
  { slug: 'vca',           label: 'VCA',           d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { slug: 'uren',          label: 'Uren',          d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'inkoop',        label: 'Inkoop',        d: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
  { slug: 'verkoop',       label: 'Verkoop',       d: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { slug: 'meerwerk',      label: 'Meerwerk',      d: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'financieel',    label: 'Financieel',    d: 'M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'formulieren',   label: 'Formulieren',   d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
]

const SERVICEDESK_TABS: DossierTab[] = [
  { slug: 'informatie', label: 'Informatie', d: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { slug: 'bestanden',  label: 'Bestanden',  d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { slug: 'calculatie', label: 'Calculatie', d: 'M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M16 3l2 2-9 9m0 0H7m2 0V9' },
  { slug: 'planning',   label: 'Planning',   d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { slug: 'vca',        label: 'VCA',        d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { slug: 'financieel', label: 'Financieel', d: 'M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 10.5h4m-4 3h4m9-1.5a9 9 0 11-18 0 9 9 0 0118 0z' },
]

const SECTIE_LABELS: Record<string, string> = {
  aanvragen:   'Aanvragen',
  offertes:    'Offertes',
  opdrachten:  'Opdrachten',
  servicedesk: 'Servicedesk',
}

export type SidebarProps = {
  density: Tweaks['density']
  collapsed: boolean
  /** Echte vastzet-status (los van hover-uitklappen) — stuurt het punaise-icoon. */
  pinned: boolean
  onToggle: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  userName?: string
  userInitials?: string
  userSub?: string
  userFotoUrl?: string | null
  /** Effectieve rechten van de ingelogde gebruiker (sidebar-filtering). */
  rechten?: RechtenSet
}

export default function Sidebar({
  density, collapsed, pinned, onToggle, onMouseEnter, onMouseLeave,
  userName = 'M. Everts', userInitials = 'ME', userSub = 'Everts Team',
  userFotoUrl, rechten,
}: SidebarProps) {
  const pathname  = usePathname()
  const padY      = density === 'dense' ? 6 : 9
  const width     = collapsed ? 56 : 256

  // Toon een onderdeel tenzij het wordt afgedwongen én de gebruiker geen recht heeft.
  const zichtbaar = (e: NavEntry) => magOnderdeelZien(rechten ?? {}, e.module)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' :
    href === '/taken' ? pathname === '/taken' :
    pathname.startsWith(href)

  const activeAppKey = Object.keys(APP_SUBNAV).find(key => pathname.startsWith(key)) ?? null
  const activeApp    = activeAppKey ? APP_SUBNAV[activeAppKey] : null

  // Dossier detail detectie: /aanvragen/[id]/[tab], /offertes/..., /opdrachten/... of /servicedesk/...
  const dossierMatch  = pathname.match(/^\/(aanvragen|offertes|opdrachten|servicedesk)\/([^/]+)/)
  const dossierSectie = dossierMatch?.[1]
  const dossierId     = dossierMatch?.[2]
  const isDossierDetail = !!dossierSectie && !!dossierId
  const dossierTabs   =
    dossierSectie === 'opdrachten'  ? OPDRACHT_TABS :
    dossierSectie === 'servicedesk' ? SERVICEDESK_TABS :
    AANVRAAG_TABS

  // Aan-staande toggle-sleutels voor het huidige dossier; stuurt de zichtbaarheid
  // van toggle-gestuurde tabs (zie TAB_TOGGLE_GATES). Default leeg → gated tabs
  // blijven verborgen tot we weten dat de toggle aanstaat (geen flash).
  const [aanSleutels, setAanSleutels] = React.useState<Set<string>>(new Set())
  // Servicedesk: het Calculatie-tab verschijnt pas zodra er een offerte/calculatie
  // gekoppeld is (na "Offerte maken"). null = nog onbekend → tab verborgen (geen flash).
  const [heeftCalc, setHeeftCalc] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    if (!isDossierDetail || !dossierId) {
      setAanSleutels(new Set())
      setHeeftCalc(null)
      return
    }
    let actief = true
    getDossierToggles(dossierId)
      .then(toggles => {
        if (actief) setAanSleutels(new Set(toggles.filter(t => t.aan).map(t => t.sleutel)))
      })
      .catch(() => { if (actief) setAanSleutels(new Set()) })
    if (dossierSectie === 'servicedesk') {
      dossierHeeftCalculatie(dossierId)
        .then(v => { if (actief) setHeeftCalc(v) })
        .catch(() => { if (actief) setHeeftCalc(false) })
    } else {
      setHeeftCalc(null)
    }
    return () => { actief = false }
  }, [isDossierDetail, dossierId, dossierSectie])

  const zichtbareTabs = dossierTabs.filter(t => {
    const vereisteSleutel = TAB_TOGGLE_GATES[t.slug]
    if (vereisteSleutel && !aanSleutels.has(vereisteSleutel)) return false
    // Calculatie-tab is in servicedesk gegated op een gekoppelde calculatie/offerte.
    if (dossierSectie === 'servicedesk' && t.slug === 'calculatie' && !heeftCalc) return false
    return true
  })

  // Shared fade style for labels and decorations that hide when collapsed
  const labelFade: React.CSSProperties = {
    opacity: collapsed ? 0 : 1,
    transition: 'opacity 0.15s ease',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  }

  // Consistent icon slot — 20×20 flex container keeps icon perfectly centered
  // regardless of whether the sidebar is collapsed or expanded.
  // padding: padY top/bottom, 13px left aligns the center of the 18px icon
  // to exactly 22px from the aside edge, which is the center of the 44px
  // collapsed inner width (64 - 2×10 = 44, center = 22, 13 + 9 = 22). ✓
  function NavItem({
    href, icon, label, active, badge, comingSoon,
  }: {
    href?: string
    icon: React.ReactNode
    label: string
    active: boolean
    badge?: number
    comingSoon?: boolean
  }) {
    // collapsed: icon-center moet op 28px (= 56px/2) vallen.
    // Berekening: aside-pad(10) + nav-pad(?) + icon-half(9) = 28 → nav-pad = 9px
    const iconPad = collapsed ? 9 : 13
    const itemStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: `${padY}px ${iconPad}px`,
      background: active && !comingSoon ? 'var(--bg-active)' : 'transparent',
      borderRadius: 7,
      color: comingSoon
        ? 'var(--fg-muted)'
        : active
          ? 'var(--brand-700)'
          : 'var(--fg-soft)',
      fontSize: 13, fontWeight: active && !comingSoon ? 600 : 500,
      textDecoration: 'none', position: 'relative', minWidth: 0,
      opacity: comingSoon ? 0.5 : 1,
      cursor: comingSoon ? 'not-allowed' : 'pointer',
    }

    const innerContent = (
      <>
        {active && !comingSoon && (
          <span style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 2, height: 20, borderRadius: 2,
            background: 'var(--brand)',
          }}/>
        )}
        <span style={{
          width: 18, height: 18, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{ ...labelFade, flex: 1 }}>{label}</span>
        {comingSoon && (
          <span style={{
            ...labelFade,
            fontSize: 8, fontWeight: 700, color: 'var(--fg-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          }}>binnenkort</span>
        )}
        {badge != null && !comingSoon && (
          <span style={{
            ...labelFade,
            minWidth: 16, height: 16, borderRadius: 999,
            background: active ? 'var(--brand-50)' : 'var(--neutral-200)',
            color: active ? 'var(--brand-700)' : 'var(--neutral-700)',
            fontSize: 9, fontWeight: 700, display: 'grid', placeItems: 'center',
            padding: '0 4px',
          }}>{badge}</span>
        )}
      </>
    )

    if (comingSoon || !href) {
      return <div style={itemStyle}>{innerContent}</div>
    }

    return (
      <Link href={href} title={collapsed ? label : undefined} style={itemStyle}>
        {innerContent}
      </Link>
    )
  }

  return (
    <aside
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        width, flexShrink: 0,
        height: '100dvh',     // explicit height so inner flex:1 wrapper can scroll properly
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        // Fixed padding — does NOT change on collapse to avoid layout shift
        padding: '14px 10px',
        gap: 14,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        position: 'relative',
        overflow: 'hidden',   // clip labels during width animation; scrolling handled by inner wrapper
      }}
    >
      {/* ── Toggle button ── */}
      <button
        onClick={onToggle}
        title={pinned ? 'Sidebar losmaken' : 'Sidebar vastzetten'}
        style={{
          position: 'absolute', top: 70, right: 22,
          width: 22, height: 22,
          background: pinned ? 'var(--brand-50)' : 'var(--bg-elev)',
          border: `1px solid ${pinned ? 'var(--brand)' : 'var(--border)'}`,
          borderRadius: '50%',
          display: collapsed ? 'none' : 'grid', placeItems: 'center',
          color: pinned ? 'var(--brand)' : 'var(--fg-muted)',
          cursor: 'pointer', zIndex: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}
      >
        <IconBase size={12}>
          <path d="M12 17v5"/>
          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
        </IconBase>
      </button>

      {/* ── Brand panel — always rendered, wordmark fades ── */}
      <Link
        href="/"
        title="Naar overzicht"
        style={{
          // Negative margin fills the 10px aside padding on three sides
          margin: '-14px -10px 0',
          padding: '13px 10px',
          backgroundImage: 'url(/polygon-bg.png)',
          backgroundSize: 'cover', backgroundPosition: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
          position: 'relative',
        }}
      >
        {/* DS spec: ::after gradient overlay */}
        <span style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.22) 100%)',
        }}/>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-beeldmerk.svg"
          alt="Everts"
          style={{ width: 38, height: 38, objectFit: 'contain', flexShrink: 0, position: 'relative', zIndex: 1 }}
        />
        <Wordmark style={{ fontSize: 20, ...labelFade, position: 'relative', zIndex: 1 }}/>
      </Link>

{/* ── Scrollable nav area — flex:1 so it fills available space, user card stays below ── */}
      <div style={{
        flex: 1,
        overflowY: collapsed ? 'hidden' : 'auto',
        overflowX: 'hidden',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>

      {/* ── Navigation ── */}
      {isDossierDetail ? (
        <NavSection
          label={SECTIE_LABELS[dossierSectie!] ?? ''}
          collapsed={collapsed}
        >
          {/* Terug naar lijst */}
          <NavItem
            href={`/${dossierSectie}`}
            icon={<IconBase size={16}><path d="M15 19l-7-7 7-7"/></IconBase>}
            label="Terug naar overzicht"
            active={false}
          />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 13px 2px' }}/>
          {/* Offerte-koppeling: alleen zichtbaar vanuit opdracht */}
          {dossierSectie === 'opdrachten' && (
            <>
              <NavItem
                href={`/offertes/${dossierId}/informatie`}
                icon={<SubIcon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" size={16}/>}
                label="Offerte"
                active={isActive(`/offertes/${dossierId}`)}
              />
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 13px 2px' }}/>
            </>
          )}
          {/* Dossier tabs */}
          {zichtbareTabs.map(t => (
            <NavItem
              key={t.slug}
              href={`/${dossierSectie}/${dossierId}/${t.slug}`}
              icon={<SubIcon d={t.d} size={16}/>}
              label={t.label}
              active={isActive(`/${dossierSectie}/${dossierId}/${t.slug}`)}
            />
          ))}
        </NavSection>
      ) : activeApp ? (
        <NavSection label={activeApp.label} collapsed={collapsed}>
          {activeApp.items.map(({ href, label, icon }) => (
            <NavItem key={href} href={href} icon={<SubIcon d={icon} size={16}/>} label={label} active={isActive(href)}/>
          ))}
        </NavSection>
      ) : (
        <>
          <NavSection collapsed={collapsed}>
            {NAV.filter(zichtbaar).map(({ href, label, Icon, badge, separator, comingSoon }) => (
              <React.Fragment key={label}>
                {separator && (
                  <div style={{ height: 1, background: 'var(--border)', margin: '3px 13px' }}/>
                )}
                <NavItem
                  href={href}
                  icon={<Icon size={17}/>}
                  label={label}
                  active={!!href && isActive(href)}
                  badge={badge}
                  comingSoon={comingSoon}
                />
              </React.Fragment>
            ))}
          </NavSection>

          <NavSection label="Planning" collapsed={collapsed}>
            {PLANNING_INKOOP.filter(zichtbaar).map(({ href, label, Icon, comingSoon }) => (
              <NavItem
                key={label}
                href={href}
                icon={<Icon size={17}/>}
                label={label}
                active={!!href && isActive(href)}
                comingSoon={comingSoon}
              />
            ))}
          </NavSection>

          <NavSection label="Beheer" collapsed={collapsed}>
            {BEHEER.filter(zichtbaar).map(({ href, label, Icon, comingSoon }) => (
              <NavItem
                key={label}
                href={href}
                icon={<Icon size={17}/>}
                label={label}
                active={!!href && isActive(href)}
                comingSoon={comingSoon}
              />
            ))}
          </NavSection>

          <NavSection label="Financieel" collapsed={collapsed}>
            {FINANCIEEL.filter(zichtbaar).map(({ href, label, Icon, comingSoon }) => (
              <NavItem
                key={label}
                href={href}
                icon={<Icon size={17}/>}
                label={label}
                active={!!href && isActive(href)}
                comingSoon={comingSoon}
              />
            ))}
          </NavSection>

<NavSection label="Apps" collapsed={collapsed}>
            {APPS.filter(zichtbaar).map(({ href, label, Icon }) => (
              <NavItem key={label} href={href} icon={<Icon size={17}/>} label={label} active={!!href && isActive(href)}/>
            ))}
          </NavSection>
        </>
      )}


</div>{/* end scrollable nav area */}

      {/* ── Bedrijfsinstellingen ── altijd zichtbaar, boven user card ── */}
      <NavItem
        href="/instellingen"
        icon={<IconInstellingen size={17}/>}
        label="Bedrijfsinstellingen"
        active={isActive('/instellingen')}
      />

      {/* ── User card ── altijd zichtbaar onderaan ──
          Negative margins negeren de aside padding (10px links/rechts, 14px onder)
          zodat de card de volledige breedte pakt en niet geclipped wordt.
          collapsed: avatar gecentreerd; expanded: nav-stijl links uitlijnen.    */}
      <div style={{ flexShrink: 0, margin: '0 -10px -14px' }}>
        <Link
          href="/account"
          title={collapsed ? userName : undefined}
          style={{
            padding: collapsed ? `${padY}px 0` : `${padY}px 13px`,
            borderTop: '1px solid var(--border)',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 10,
            transition: 'background 0.15s',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-active)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: userFotoUrl
                ? 'transparent'
                : 'linear-gradient(135deg, var(--brand-500), var(--brand-700))',
              display: 'grid', placeItems: 'center',
              overflow: 'hidden',
              color: 'white', fontSize: 11, fontWeight: 700,
            }}
          >
            {userFotoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={userFotoUrl} alt={userName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : userInitials
            }
          </div>
          {/* User info + icon — alleen renderen wanneer expanded, zodat de avatar
              bij collapsed de enige flex-child is en perfect centreert.
              De sidebar width-transitie maskeert het abrupte tonen/verbergen.  */}
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{userName}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{userSub}</div>
              </div>
              <div style={{ display: 'grid', placeItems: 'center', color: 'var(--fg-muted)', flexShrink: 0 }}>
                <IconMore size={15}/>
              </div>
            </>
          )}
        </Link>
      </div>
    </aside>
  )
}

function NavSection({ label, action, collapsed, children }: {
  label?: string
  action?: React.ReactNode
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label && (
        // Keep natural height so items below don't shift — just fade opacity
        <div style={{
          opacity: collapsed ? 0 : 1,
          transition: 'opacity 0.15s ease',
          pointerEvents: collapsed ? 'none' : 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 13px 4px',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
          }}>{label}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
