'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconMoon, IconSun, IconQuestion, IconSparkle } from './Icons';
import { TopbarZoek } from './GlobalSearch';
import { useBreadcrumb } from '@/lib/breadcrumb-context';
import HelpPanel from './HelpPanel';
import NotificatiesDropdown from './NotificatiesDropdown';
import { getPageHelp } from '@/lib/page-help';

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
  [/^\/wat-is-nieuw$/, { title: 'Wat is nieuw', breadcrumb: 'EVA' }],
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

  // Toolbox (sub-app)
  [/^\/toolbox\/nieuw$/, { title: 'Toolbox › Nieuw', breadcrumb: 'Apps' }],
  [/^\/toolbox\/[^/]+\/bewerken$/, { title: 'Toolbox › Bewerken', breadcrumb: 'Apps' }],
  [/^\/toolbox\/[^/]+\/presenteren$/, { title: 'Toolbox › Presenteren', breadcrumb: 'Apps' }],
  [/^\/toolbox\/[^/]+$/, { title: 'Toolbox › Rapportage', breadcrumb: 'Apps' }],
  [/^\/toolbox$/, { title: 'Toolbox', breadcrumb: 'Apps' }],

  // Materieelbeheer (sub-app, in ontwikkeling)
  [/^\/materieelbeheer\/dashboard$/, { title: 'Materieelbeheer › Dashboard', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer\/controle$/, { title: 'Materieelbeheer › Controle', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer\/instellingen$/, { title: 'Materieelbeheer › Instellingen', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer\/nieuw$/, { title: 'Materieelbeheer › Nieuw materieel', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer\/[^/]+\/bewerken$/, { title: 'Materieelbeheer › Bewerken', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer\/[^/]+$/, { title: 'Materieelbeheer › Paspoort', breadcrumb: 'Apps' }],
  [/^\/materieelbeheer$/, { title: 'Materieelbeheer', breadcrumb: 'Apps' }],

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

/* ── Fallback-logica ──────────────────────────────────────────────────────
   Routes zonder expliciete ROUTE_LABELS-regel kregen voorheen het rauwe pad
   als titel (bijv. "/instellingen/btw-tarieven"). Onderstaande maps leiden
   voor élke route een nette, consistent opgemaakte titel af uit de URL, zodat
   de topbar nooit meer leeg of onopgemaakt is.

   SLUG_LABELS: nette weergavenaam per pad-segment (overschrijft de generieke
   title-caser). BREADCRUMB_BY_ROOT: koppelt het eerste segment aan de groep
   uit de sidebar. Onbekende segmenten worden automatisch title-cased. */
const SLUG_LABELS: Record<string, string> = {
  // Hoofdproces / financieel
  'aanvragen': 'Aanvragen', 'offertes': 'Offertes', 'opdrachten': 'Opdrachten',
  'servicedesk': 'Servicedesk', 'afgesloten': 'Afgesloten', 'facturen': 'Facturen',
  // Planning
  'planning': 'Planning', 'project': 'Projectplanning', 'medewerker': 'Medewerkerplanning',
  'bedrijfsagenda': 'Bedrijfsagenda', 'mijn-werkbonnen': 'Mijn werkbonnen', 'werkbon': 'Werkbon',
  // Management
  'management': 'Management', 'lopend': 'Lopende werken', 'gereed': 'Gereed werken',
  'werkvoorraad': 'Werkvoorraad', 'verkoop': 'Verkoop', 'calculators': 'Calculators',
  'historie': 'Historie',
  // Beheer
  'relaties': 'Relaties', 'medewerkers': 'Medewerkers', 'wagenpark': 'Wagenpark',
  'kam': 'KAM / VGM', 'contactpersonen': 'Contactpersoon', 'particulieren': 'Particulier',
  // EVA / persoonlijk
  'vraag-eva': 'Vraag EVA', 'bronnen': 'Bronnen', 'bibliotheek': 'Bibliotheek',
  'mijn-taken': 'Mijn taken', 'account': 'Mijn account',
  // Apps
  'formulieren': 'Formulieren', 'taken': 'Actielijsten', 'houtrotherstel': 'Houtrotherstel',
  'materieelbeheer': 'Materieelbeheer',
  'everts-calc': 'EvertsCalc', 'calculaties': 'Calculaties', 'quotes': 'Offertes',
  'sjablonen': 'Sjablonen', 'overzicht': 'Overzicht',
  // Instellingen
  'instellingen': 'Instellingen', 'bedrijfsgegevens': 'Bedrijfsgegevens', 'huisstijl': 'Huisstijl',
  'algemene-voorwaarden': 'Algemene voorwaarden', 'betalingscondities': 'Betalingscondities',
  'btw-tarieven': 'BTW-tarieven', 'debiteur-redencodes': 'Debiteuren — redencodes',
  'dossier-categorieen': 'Dossiercategorieën', 'dossier-toggles': 'Dossier-tabbladen',
  'kostensoorten': 'Kostensoorten', 'uursoorten-tarieven': 'Uursoorten & tarieven',
  'offerte-layout': 'Offerte-opmaak', 'functies-afdelingen': 'Functies & afdelingen',
  'gebruikers': 'Gebruikers & rechten', 'medewerker-attributen': 'Medewerker-attributen',
  'integraties': 'Integraties', 'cao': 'CAO-beheer', 'formulieren-pdf': 'Formulier PDF-opmaak',
  'foutenlog': 'Foutenlog',
  // Overige
  'nieuw': 'Nieuw', 'bewerken': 'Bewerken', 'import': 'Importeren', 'sync': 'Synchroniseren',
  'zones': 'Zones', 'rapportage': 'Rapportage', 'rapportages': 'Rapportages',
  'registraties': 'Registraties', 'voertuigen': 'Voertuigen', 'bestuurders': 'Bestuurders',
  'ritten': 'Ritten', 'parkeren': 'Parkeren', 'leasecontracten': 'Leasecontracten',
  'bevindingen': 'Bevindingen', 'diagnose': 'Diagnose', 'dashboard': 'Dashboard',
  'projecten': 'Projecten', 'standaard-reparaties': 'Standaard reparaties',
  'meetstaat': 'Meetstaat', 'inzendingen': 'Inzendingen', 'invullen': 'Invullen',
}

const BREADCRUMB_BY_ROOT: Record<string, string> = {
  'vraag-eva': 'EVA', 'bronnen': 'EVA', 'bibliotheek': 'EVA',
  'aanvragen': 'Hoofdproces', 'offertes': 'Hoofdproces', 'opdrachten': 'Hoofdproces',
  'servicedesk': 'Hoofdproces', 'afgesloten': 'Hoofdproces',
  'planning': 'Planning',
  'relaties': 'Beheer', 'medewerkers': 'Beheer', 'wagenpark': 'Beheer', 'kam': 'Beheer',
  'facturen': 'Financieel', 'management': 'Financieel',
  'formulieren': 'Apps', 'taken': 'Apps', 'houtrotherstel': 'Apps', 'everts-calc': 'Apps',
  'materieelbeheer': 'Apps',
  'instellingen': 'Platform', 'account': 'Account', 'mijn-taken': 'Persoonlijk',
}

/** Segment lijkt op een record-id (uuid, getal, lange hex) → weglaten uit de titel. */
function isIdLike(seg: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) // uuid
    || /^\d+$/.test(seg)                         // numeriek id
    || /^[0-9a-f]{16,}$/i.test(seg)              // lange hex hash
}

function labelForSlug(seg: string): string {
  if (SLUG_LABELS[seg]) return SLUG_LABELS[seg]
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ')
}

/** Leidt titel + breadcrumb af uit de URL wanneer er geen expliciete regel is. */
function deriveLabel(pathname: string): { title: string; breadcrumb?: string } {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return { title: 'Overzicht' }
  const root = segments[0]
  const parts = segments.filter(s => !isIdLike(s)).map(labelForSlug)
  const title = parts.join(' › ') || labelForSlug(root)
  const breadcrumb = BREADCRUMB_BY_ROOT[root]
  return { title, breadcrumb: breadcrumb === title ? undefined : breadcrumb }
}

function resolveLabel(pathname: string): { title: string; breadcrumb?: string; withTabs?: boolean } {
  for (const [pattern, label] of ROUTE_LABELS) {
    if (pattern.test(pathname)) return label
  }
  return deriveLabel(pathname)
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
  /** Aantal ongelezen "Wat is nieuw"-updates (stip op het sterretje). */
  aantalNieuweUpdates?: number;
};

export default function TopBar({ dark, setDark, aantalOngelezen = 0, aantalNieuweUpdates = 0 }: TopBarProps) {
  const pathname = usePathname()
  const { title, breadcrumb, withTabs } = resolveLabel(pathname)
  const breadcrumbCtx = useBreadcrumb()
  const [helpOpen, setHelpOpen] = useState(false)
  const helpContent = getPageHelp(pathname)

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
        padding: '0 32px',
        gap: 12,
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 18, fontWeight: 700,
            letterSpacing: '-0.015em',
            color: 'var(--fg)',
            whiteSpace: 'nowrap',
          }}>{displayTitle}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TopbarZoek />
          <Link
            href="/wat-is-nieuw"
            style={iconBtn()}
            title="Wat is nieuw"
          >
            <IconSparkle size={20}/>
            {aantalNieuweUpdates > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 7,
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444',
              }}/>
            )}
          </Link>
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
