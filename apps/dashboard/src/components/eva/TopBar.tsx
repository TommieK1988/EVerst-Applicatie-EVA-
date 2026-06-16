'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconMoon, IconSun, IconChat, IconQuestion, IconBase } from './Icons';
import { useBreadcrumb } from '@/lib/breadcrumb-context';
import HelpPanel from './HelpPanel';
import NotificatiesDropdown from './NotificatiesDropdown';
import { getPageHelp } from '@/lib/page-help';
import { useIsMobile } from '@/lib/hooks/useMediaQuery';

/* ── Tab-slug → label (voor dossier-detailpagina's) ── */
const TAB_LABELS: Record<string, string> = {
  informatie:    'Informatie',
  bestanden:     'Bestanden',
  calculatie:    'Calculatie',
  werkbegroting: 'Werkbegroting',
  planning:      'Planning',
  vca:           'VCA',
  inkoop:        'Inkoop',
  verkoop:       'Verkoop',
  meerwerk:      'Meerwerk',
  financieel:    'Financieel',
  formulieren:   'Formulieren',
}

/* ── Pad → paginatitel ── */
const ROUTE_LABELS: Array<[RegExp, { title: string; breadcrumb?: string; withTabs?: boolean }]> = [
  // Overzicht
  [/^\/$/, { title: 'Overzicht' }],

  // EVA
  [/^\/vraag-eva$/, { title: 'Vraag EVA', breadcrumb: 'EVA' }],
  [/^\/bronnen$/, { title: 'Bronnen', breadcrumb: 'EVA' }],
  [/^\/bibliotheek$/, { title: 'Bibliotheek', breadcrumb: 'EVA' }],

  // Hoofdproces
  [/^\/aanvragen\/[^/]+\/[^/]+$/, { title: 'Aanvragen', breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/aanvragen\/[^/]+$/,        { title: 'Aanvragen', breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/aanvragen$/,               { title: 'Aanvragen', breadcrumb: 'Hoofdproces' }],
  [/^\/offertes\/[^/]+\/[^/]+$/,  { title: 'Offertes',  breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/offertes\/[^/]+$/,         { title: 'Offertes',  breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/offertes$/,                { title: 'Offertes',  breadcrumb: 'Hoofdproces' }],
  [/^\/opdrachten\/[^/]+\/[^/]+$/,{ title: 'Opdrachten',breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/opdrachten\/[^/]+$/,       { title: 'Opdrachten',breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/opdrachten$/,              { title: 'Opdrachten',breadcrumb: 'Hoofdproces' }],
  [/^\/servicedesk\/[^/]+\/[^/]+$/,{ title: 'Servicedesk',breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/servicedesk\/[^/]+$/,       { title: 'Servicedesk',breadcrumb: 'Hoofdproces', withTabs: true }],
  [/^\/servicedesk$/,              { title: 'Servicedesk',breadcrumb: 'Hoofdproces' }],

  // Beheer
  [/^\/relaties$/, { title: 'Relaties', breadcrumb: 'Beheer' }],
  [/^\/medewerkers$/, { title: 'Medewerkers', breadcrumb: 'Beheer' }],
  [/^\/management\/instellingen$/, { title: 'Management › Instellingen', breadcrumb: 'Beheer' }],
  [/^\/management$/, { title: 'Management', breadcrumb: 'Beheer' }],

  // Platform instellingen
  [/^\/instellingen\/bedrijfsgegevens\/huisstijl$/, { title: 'Instellingen › Huisstijl', breadcrumb: 'Platform' }],
  [/^\/instellingen\/bedrijfsgegevens\/[^/]+$/, { title: 'Instellingen › Bedrijfsgegevens › Detail', breadcrumb: 'Platform' }],
  [/^\/instellingen\/bedrijfsgegevens$/, { title: 'Instellingen › Bedrijfsgegevens', breadcrumb: 'Platform' }],
  [/^\/instellingen\/integraties$/, { title: 'Instellingen › Integraties', breadcrumb: 'Platform' }],
  [/^\/instellingen\/formulieren-pdf$/, { title: 'Instellingen › Formulier PDF-opmaak', breadcrumb: 'Platform' }],
  [/^\/instellingen$/, { title: 'Instellingen', breadcrumb: 'Platform' }],
  [/^\/account$/, { title: 'Mijn account', breadcrumb: 'Account' }],

  // Actielijsten (sub-app)
  [/^\/taken\/lijsten\/[^/]+$/, { title: 'Actielijsten › Detail', breadcrumb: 'Apps' }],
  [/^\/taken\/lijsten$/, { title: 'Actielijsten', breadcrumb: 'Apps' }],
  [/^\/taken$/, { title: 'Actielijsten', breadcrumb: 'Apps' }],

  // Wagenpark (sub-app)
  [/^\/wagenpark\/voertuigen\/nieuw$/, { title: 'Wagenpark › Voertuigen › Nieuw', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/voertuigen\/[^/]+$/, { title: 'Wagenpark › Voertuigen › Detail', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/voertuigen$/, { title: 'Wagenpark › Voertuigen', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/bestuurders\/[^/]+$/, { title: 'Wagenpark › Bestuurders › Detail', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/bestuurders$/, { title: 'Wagenpark › Bestuurders', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/ritten\/import$/, { title: 'Wagenpark › Ritten › Importeren', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/ritten\/sync$/, { title: 'Wagenpark › Ritten › Synchroniseren', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/ritten$/, { title: 'Wagenpark › Ritten', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/parkeren\/import$/, { title: 'Wagenpark › Parkeren › Importeren', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/parkeren\/zones$/, { title: 'Wagenpark › Parkeren › Zones', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/parkeren$/, { title: 'Wagenpark › Parkeren', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/leasecontracten$/, { title: 'Wagenpark › Leasecontracten', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/diagnose$/, { title: 'Wagenpark › Diagnose', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/bevindingen$/, { title: 'Wagenpark › Bevindingen', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/instellingen$/, { title: 'Wagenpark › Instellingen', breadcrumb: 'Apps' }],
  [/^\/wagenpark\/dashboard$/, { title: 'Wagenpark › Dashboard', breadcrumb: 'Apps' }],
  [/^\/wagenpark$/, { title: 'Wagenpark', breadcrumb: 'Apps' }],

  // Houtrotherstel (sub-app)
  [/^\/houtrotherstel\/projecten\/nieuw$/, { title: 'Houtrotherstel › Projecten › Nieuw', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/bewerken$/, { title: 'Houtrotherstel › Projecten › Bewerken', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/rapportage$/, { title: 'Houtrotherstel › Projecten › Rapportage', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/geveldelen\/[^/]+\/locaties\/[^/]+$/, { title: 'Houtrotherstel › Geveldeel › Locatie', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/geveldelen\/[^/]+$/, { title: 'Houtrotherstel › Geveldeel', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+\/registraties\/[^/]+$/, { title: 'Houtrotherstel › Locatie › Registratie', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+$/, { title: 'Houtrotherstel › Projectdeel › Locatie', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+$/, { title: 'Houtrotherstel › Projectdeel', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten\/[^/]+$/, { title: 'Houtrotherstel › Projecten › Detail', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/projecten$/, { title: 'Houtrotherstel › Projecten', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/rapportages$/, { title: 'Houtrotherstel › Rapportages', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/registraties\/nieuw$/, { title: 'Houtrotherstel › Registraties › Nieuw', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/registraties\/[^/]+$/, { title: 'Houtrotherstel › Registraties › Detail', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/registraties$/, { title: 'Houtrotherstel › Registraties', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/standaard-reparaties\/nieuw$/, { title: 'Houtrotherstel › Standaard reparaties › Nieuw', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/standaard-reparaties$/, { title: 'Houtrotherstel › Standaard reparaties', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/gebruikers$/, { title: 'Houtrotherstel › Gebruikers', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/instellingen$/, { title: 'Houtrotherstel › Instellingen', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel\/dashboard$/, { title: 'Houtrotherstel › Dashboard', breadcrumb: 'Apps' }],
  [/^\/houtrotherstel$/, { title: 'Houtrotherstel', breadcrumb: 'Apps' }],

  // EvertsCalc (sub-app)
  [/^\/everts-calc\/meetstaat\/[^/]+$/, { title: 'EvertsCalc › Meetstaat', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/quotes\/new$/, { title: 'EvertsCalc › Offertes › Nieuwe offerte', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/quotes\/[^/]+\/preview$/, { title: 'EvertsCalc › Offertes › Preview', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/quotes\/[^/]+$/, { title: 'EvertsCalc › Offertes › Details', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/quotes$/, { title: 'EvertsCalc › Offertes', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/bibliotheek\/recepten$/, { title: 'EvertsCalc › Bibliotheek › Recepten', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/bibliotheek\/schilderwerk$/, { title: 'EvertsCalc › Bibliotheek › Schilderwerk', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/bibliotheek\/materialen$/, { title: 'EvertsCalc › Bibliotheek › Materialen', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/bibliotheek\/behandelingen$/, { title: 'EvertsCalc › Bibliotheek › Behandelingen', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/bibliotheek$/, { title: 'EvertsCalc › Bibliotheek', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/rapportages$/, { title: 'EvertsCalc › Rapportages', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/instellingen\/offertes\/layouts\/[^/]+$/, { title: 'EvertsCalc › Instellingen › Offerte layouts › Editor', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/instellingen\/offertes\/layouts$/, { title: 'EvertsCalc › Instellingen › Offerte layouts', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/instellingen\/offertes$/, { title: 'EvertsCalc › Instellingen › Offertes', breadcrumb: 'Apps' }],
  [/^\/everts-calc\/instellingen$/, { title: 'EvertsCalc › Instellingen', breadcrumb: 'Apps' }],
  [/^\/everts-calc$/, { title: 'EvertsCalc', breadcrumb: 'Apps' }],

  // KAM / VGM
  [/^\/kam$/, { title: 'KAM / VGM', breadcrumb: 'Organisatie' }],

  // Formulieren (sub-app)
  [/^\/formulieren\/[^/]+\/inzendingen\/[^/]+$/, { title: 'Formulieren › Inzending detail', breadcrumb: 'Apps' }],
  [/^\/formulieren\/[^/]+\/inzendingen$/, { title: 'Formulieren › Inzendingen', breadcrumb: 'Apps' }],
  [/^\/formulieren\/[^/]+\/bewerken$/, { title: 'Formulieren › Bewerken', breadcrumb: 'Apps' }],
  [/^\/formulieren\/[^/]+\/invullen$/, { title: 'Formulieren › Invullen', breadcrumb: 'Apps' }],
  [/^\/formulieren\/nieuw$/, { title: 'Formulieren › Nieuw formulier', breadcrumb: 'Apps' }],
  [/^\/formulieren$/, { title: 'Formulieren', breadcrumb: 'Apps' }],
]

function resolveLabel(pathname: string) {
  for (const [pattern, label] of ROUTE_LABELS) {
    if (pattern.test(pathname)) return label
  }
  return { title: pathname }
}

function iconBtn(): React.CSSProperties {
  return {
    position: 'relative',
    width: 32, height: 32,
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'var(--fg-soft)',
    cursor: 'pointer',
    display: 'grid', placeItems: 'center',
    flexShrink: 0,
  };
}

type TopBarProps = {
  dark: boolean;
  setDark: (v: boolean) => void;
  aantalOngelezen?: number;
  /** Opent de mobiele navigatie-drawer (alleen relevant onder md). */
  onMenuClick?: () => void;
};

export default function TopBar({ dark, setDark, aantalOngelezen = 0, onMenuClick }: TopBarProps) {
  const pathname = usePathname()
  const { title, breadcrumb, withTabs } = resolveLabel(pathname)
  const breadcrumbCtx = useBreadcrumb()
  const [helpOpen, setHelpOpen] = useState(false)
  const helpContent = getPageHelp(pathname)
  const isMobile = useIsMobile()

  let displayTitle = title
  if (withTabs && breadcrumbCtx?.recordName) {
    const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
    const tabLabel = TAB_LABELS[lastSegment]
    displayTitle = tabLabel
      ? `${title} › ${breadcrumbCtx.recordName} › ${tabLabel}`
      : `${title} › ${breadcrumbCtx.recordName}`
  }

  return (
    <React.Fragment>
      <div style={{
        height: 60, flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px' : '0 32px',
        gap: isMobile ? 8 : 12,
      }}>
        {isMobile && (
          <button
            onClick={onMenuClick}
            aria-label="Menu openen"
            style={{
              width: 'var(--touch-target)', height: 'var(--touch-target)',
              flexShrink: 0, marginLeft: -8,
              background: 'none', border: 'none', padding: 0,
              color: 'var(--fg-soft)', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            <IconBase size={24}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </IconBase>
          </button>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: isMobile ? 15 : 18, fontWeight: 700,
            letterSpacing: '-0.015em',
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{displayTitle}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isMobile && (
            <Link href="/vraag-eva" title="Vraag EVA" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px',
              background: 'var(--accent)',
              color: 'white',
              borderRadius: 6, fontSize: 12, fontWeight: 700,
              textDecoration: 'none', letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}>
              <IconChat size={14}/>
              Vraag EVA
            </Link>
          )}
          <button
            onClick={() => setHelpOpen(true)}
            style={iconBtn()}
            title="Handleiding"
          >
            <IconQuestion size={22}/>
          </button>
          <button onClick={() => setDark(!dark)} style={iconBtn()} title={dark ? 'Licht thema' : 'Donker thema'}>
            {dark ? <IconSun size={22}/> : <IconMoon size={22}/>}
          </button>
          <NotificatiesDropdown aantalOngelezen={aantalOngelezen} />
        </div>
      </div>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} content={helpContent} />
    </React.Fragment>
  );
}
