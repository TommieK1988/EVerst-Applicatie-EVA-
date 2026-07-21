'use client';
import React from 'react';

type IconProps = {
  size?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

// strokeWidth: 2px per DS-spec (24-grid); 1.5px bij <=16px weergave
function strokeForSize(size: number) {
  return size <= 16 ? 1.5 : 2;
}

export function IconBase({ size = 20, children, style }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeForSize(size)} strokeLinecap="round" strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

// Basis-set (herschaald van 20->24 grid, factor x1.2)

export function IconFormulieren(p: IconProps) { return <IconBase {...p}><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3l5 5h-5z" fill="currentColor" stroke="none"/><path d="M8 13h8M8 16.5h5"/></IconBase> }

export function IconToolbox(p: IconProps) { return <IconBase {...p}><path d="M2.4 16.8h19.2v1.8H2.4z"/><path d="M4.8 16.8v-1.2a7.2 7.2 0 0 1 4.8-6.8V6a1.2 1.2 0 0 1 1.2-1.2h2.4A1.2 1.2 0 0 1 14.4 6v2.8a7.2 7.2 0 0 1 4.8 6.8v1.2"/></IconBase> }

export function IconMaterieel(p: IconProps) { return <IconBase {...p}><path d="M3 8.4h18v10.2a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 18.6V8.4Z"/><path d="M8.4 8.4V6a1.8 1.8 0 0 1 1.8-1.8h3.6A1.8 1.8 0 0 1 15.6 6v2.4"/><path d="M3 12.6h18"/></IconBase> }

export const IconHome     = (p: IconProps) => <IconBase {...p}><path d="M3.6 10.2L12 3.6l8.4 6.6V19.2a1.2 1.2 0 0 1-1.2 1.2H15V14.4H9V20.4H4.8a1.2 1.2 0 0 1-1.2-1.2V10.2Z"/></IconBase>;
export const IconChat     = (p: IconProps) => <IconBase {...p}><path d="M3.6 7.2a2.4 2.4 0 0 1 2.4-2.4h12a2.4 2.4 0 0 1 2.4 2.4v7.2a2.4 2.4 0 0 1-2.4 2.4H12l-4.8 3.6V16.8H6a2.4 2.4 0 0 1-2.4-2.4V7.2Z"/></IconBase>;
export const IconLibrary  = (p: IconProps) => <IconBase {...p}><path d="M4.8 4.8h4.8v14.4H4.8zM10.8 4.8h3.6v14.4H10.8zM16.2 6l3.6.96L16.8 19.8l-3.6-.96L16.2 6Z"/></IconBase>;
export const IconSettings = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2.4v2.4M12 19.2v2.4M5.04 5.04l1.68 1.68M17.28 17.28l1.68 1.68M2.4 12h2.4M19.2 12h2.4M5.04 18.96l1.68-1.68M17.28 6.72l1.68-1.68"/></IconBase>;
export const IconSearch   = (p: IconProps) => <IconBase {...p}><circle cx="10.8" cy="10.8" r="6"/><path d="m15.6 15.6 4.8 4.8"/></IconBase>;
export const IconPlus     = (p: IconProps) => <IconBase {...p}><path d="M12 4.8v14.4M4.8 12h14.4"/></IconBase>;
export const IconSend     = (p: IconProps) => <IconBase {...p}><path d="M3.6 12 20.4 3.6l-4.8 16.8-3.6-7.2-8.4-1.2Z"/></IconBase>;
export const IconAttach   = (p: IconProps) => <IconBase {...p}><path d="M16.8 8.4l-7.2 7.2a3.6 3.6 0 0 0 4.8 4.8l7.2-7.2a6 6 0 0 0-8.4-8.4L6 12a8.4 8.4 0 0 0 12 12"/></IconBase>;
export const IconMic      = (p: IconProps) => <IconBase {...p}><rect x="9.6" y="2.4" width="4.8" height="12" rx="2.4"/><path d="M6 12a6 6 0 0 0 12 0M12 18v3.6"/></IconBase>;
export const IconSparkle  = (p: IconProps) => <IconBase {...p}><path d="M12 3.6l2.16 5.04L19.2 10.8l-5.04 2.16L12 18l-2.16-5.04L4.8 10.8l5.04-2.16L12 3.6ZM18.6 15.6l.84 2.16 2.16.84-2.16.84-.84 2.16-.84-2.16-2.16-.84 2.16-.84.84-2.16Z"/></IconBase>;
export const IconFile     = (p: IconProps) => <IconBase {...p}><path d="M6 3.6h8.4l4.8 4.8V20.4a1.2 1.2 0 0 1-1.2 1.2H6a1.2 1.2 0 0 1-1.2-1.2V4.8A1.2 1.2 0 0 1 6 3.6Z"/><path d="M14.4 3.6v4.8h4.8"/></IconBase>;
export const IconCheck    = (p: IconProps) => <IconBase {...p}><path d="M4.8 12l4.8 4.8 9.6-10.8"/></IconBase>;
export const IconClock    = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="8.4"/><path d="M12 7.2v4.8l3.6 2.4"/></IconBase>;
export const IconMore     = (p: IconProps) => <IconBase {...p}><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/></IconBase>;
export const IconArrowUp  = (p: IconProps) => <IconBase {...p}><path d="M12 19.2V4.8M6 10.8l6-6 6 6"/></IconBase>;
export const IconArrowRight = (p: IconProps) => <IconBase {...p}><path d="M4.8 12h14.4M13.2 6l6 6-6 6"/></IconBase>;
export const IconBolt     = (p: IconProps) => <IconBase {...p}><path d="M13.2 2.4 4.8 13.2h6l-1.2 8.4 8.4-10.8h-6l1.2-8.4Z"/></IconBase>;
export const IconFolder   = (p: IconProps) => <IconBase {...p}><path d="M3.6 7.2a1.2 1.2 0 0 1 1.2-1.2h4.8l2.4 2.4h7.2a1.2 1.2 0 0 1 1.2 1.2v8.4a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2V7.2Z"/></IconBase>;
export const IconUser     = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.4c.96-3.6 3.6-6 7.2-6s6.24 2.4 7.2 6"/></IconBase>;
export const IconBell     = (p: IconProps) => <IconBase {...p}><path d="M6 9.6a6 6 0 0 1 12 0v4.8l1.8 3H4.2l1.8-3V9.6ZM9.6 19.2a2.4 2.4 0 0 0 4.8 0"/></IconBase>;
export const IconClose    = (p: IconProps) => <IconBase {...p}><path d="M6 6l12 12M18 6 6 18"/></IconBase>;
export const IconMoon     = (p: IconProps) => <IconBase {...p}><path d="M18 13.2a7.2 7.2 0 0 1-9.6-9.6 7.2 7.2 0 1 0 9.6 9.6Z"/></IconBase>;
export const IconSun      = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.4 5.4l1.68 1.68M16.92 16.92l1.68 1.68M5.4 18.6l1.68-1.68M16.92 7.08l1.68-1.68"/></IconBase>;
export const IconGrid     = (p: IconProps) => <IconBase {...p}><rect x="3.6" y="3.6" width="7.2" height="7.2" rx="1.2"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="1.2"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="1.2"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="1.2"/></IconBase>;
export const IconChart    = (p: IconProps) => <IconBase {...p}><path d="M3.6 20.4h16.8M7.2 16.8V12M12 16.8V7.2M16.8 16.8V9.6"/></IconBase>;
export const IconPin      = (p: IconProps) => <IconBase {...p}><path d="M9.6 3.6h4.8l-1.2 4.8 3.6 3.6H7.2l3.6-3.6-1.2-4.8ZM12 15.6v4.8"/></IconBase>;
export const IconCommand  = (p: IconProps) => <IconBase {...p}><path d="M7.2 3.6a3.6 3.6 0 0 1 3.6 3.6v9.6a3.6 3.6 0 0 1-3.6 3.6 3.6 3.6 0 0 1 0-7.2h9.6a3.6 3.6 0 0 1 0 7.2 3.6 3.6 0 0 1-3.6-3.6V7.2a3.6 3.6 0 0 1 3.6-3.6 3.6 3.6 0 0 1 0 7.2H7.2a3.6 3.6 0 0 1 0-7.2Z"/></IconBase>;
export const IconPlug     = (p: IconProps) => <IconBase {...p}><path d="M8.4 3.6v6M15.6 3.6v6M6 9.6h12v3.6a6 6 0 0 1-6 6 6 6 0 0 1-6-6V9.6ZM12 19.2v2.4"/></IconBase>;
export const IconSync     = (p: IconProps) => <IconBase {...p}><path d="M3.6 12a8.4 8.4 0 0 1 14.4-6l2.4 2.4M20.4 12a8.4 8.4 0 0 1-14.4 6l-2.4-2.4M18 3.6v4.8h-4.8M6 20.4v-4.8h4.8"/></IconBase>;
export const IconWarn     = (p: IconProps) => <IconBase {...p}><path d="M12 3.6 2.4 20.4h19.2L12 3.6ZM12 9.6v4.8M12 18v.6"/></IconBase>;
export const IconBuilding = (p: IconProps) => <IconBase {...p}><path d="M4.8 20.4V6a1.2 1.2 0 0 1 1.2-1.2h7.2a1.2 1.2 0 0 1 1.2 1.2v14.4M14.4 20.4V10.8h3.6a1.2 1.2 0 0 1 1.2 1.2v8.4M3.6 20.4h16.8M8.4 8.4h2.4M8.4 12h2.4M8.4 15.6h2.4"/></IconBase>;
export const IconEuro     = (p: IconProps) => <IconBase {...p}><path d="M18 6a6 6 0 0 0-10.8 3.6M18 18a6 6 0 0 1-10.8-3.6M3.6 10.8h9.6M3.6 14.4h8.4"/></IconBase>;
export const IconOffice      = (p: IconProps) => <IconBase {...p}><path d="M4.8 4.8l9.6-1.2v16.8l-9.6-1.2V4.8ZM14.4 6h4.8v12h-4.8"/></IconBase>;
export const IconRelaties    = (p: IconProps) => <IconBase {...p}><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 12h3.6l2.4-3.6M12.6 12l2.4 3.6"/></IconBase>;
export const IconMedewerkers = (p: IconProps) => <IconBase {...p}><circle cx="9" cy="7.2" r="3"/><path d="M2.4 20.4c.84-3.36 3.36-5.4 6.6-5.4s5.76 2.04 6.6 5.4"/><circle cx="16.8" cy="7.2" r="2.4"/><path d="M16.2 15c1.56-.36 3.24.24 4.2 1.8"/></IconBase>;
export const IconQuestion    = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 1.8-1.8 2.4-3 3.6"/><circle cx="12" cy="17.4" r=".72" fill="currentColor" strokeWidth="0"/></IconBase>;

// Navigatie-iconen uit DS-spec (24-grid, 2px stroke, exacte paden uit brand-nav-icons.html)

// Dashboard: 4 vakjes met rx="1"
export const IconDashboard = (p: IconProps) => <IconBase {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></IconBase>;

// Dossiers / File: path + polyline
export const IconDossiers = (p: IconProps) => <IconBase {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></IconBase>;

// Werkbonnen: check + square
export const IconWerkbonnen = (p: IconProps) => <IconBase {...p}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></IconBase>;

// Planning: kalender met lijnen
export const IconPlanning = (p: IconProps) => <IconBase {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></IconBase>;

// Calculatie: verticale balkjes
export const IconCalculatieNav = (p: IconProps) => <IconBase {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></IconBase>;

// Medewerkers: personen-groep
export const IconMedewerkersDS = (p: IconProps) => <IconBase {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></IconBase>;

// Wagenpark: monitor/scherm
export const IconWagenparkDS = (p: IconProps) => <IconBase {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></IconBase>;

// Financieel: dollar-teken
export const IconFinancieelDS = (p: IconProps) => <IconBase {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></IconBase>;

// Vraag EVA: chat-bubble
export const IconVraagEVA = (p: IconProps) => <IconBase {...p}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></IconBase>;

// Zoeken
export const IconZoeken = (p: IconProps) => <IconBase {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></IconBase>;

// Inkoop: schild
export const IconInkoopDS = (p: IconProps) => <IconBase {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></IconBase>;

// Plus: twee lijnen
export const IconPlusDS = (p: IconProps) => <IconBase {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></IconBase>;

// Rapportage: file met regels
export const IconRapportage = (p: IconProps) => <IconBase {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></IconBase>;

// Instellingen DS: cog/gear met signaalcirkels
export const IconInstellingenDS = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M16.24 7.76a6 6 0 010 8.49M4.93 19.07a10 10 0 010-14.14M7.76 16.24a6 6 0 010-8.49"/></IconBase>;

// Hoofdmodules (bestaande exports)
export const IconAanvragen = (p: IconProps) => <IconBase {...p}><path d="M3 13h4l2 3h6l2-3h4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13l2.3-7a1 1 0 0 1 1-.7h11.4a1 1 0 0 1 1 .7L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h4l2 3h6l2-3h4"/></IconBase>;
export const IconOffertes  = (p: IconProps) => <IconBase {...p}><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3l5 5h-5z"/><path d="M8 13h8M8 16.5h5"/></IconBase>;
export const IconOpdrachten = (p: IconProps) => <IconBase {...p}><path d="M6 4s1-.8 3.5-.8S13 4.6 16 4.6 19 4 19 4v8s-1 .6-3 .6-4.5-1.4-7-1.4S6 12 6 12z"/><path d="M6 21V4"/></IconBase>;
export const IconServicedesk = (p: IconProps) => <IconBase {...p}><path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="2.5" y="14.5" width="4" height="6.5" rx="2"/><rect x="17.5" y="14.5" width="4" height="6.5" rx="2"/><path d="M20 19v.5a3 3 0 0 1-3 3h-3"/></IconBase>;
export const IconManagement = (p: IconProps) => <IconBase {...p}><path d="M4 20v-16h16"/><rect x="7" y="12" width="3" height="5" rx="0.6"/><rect x="12" y="8" width="3" height="9" rx="0.6"/><rect x="17" y="5" width="3" height="12" rx="0.6"/></IconBase>;
export const IconAfgesloten = (p: IconProps) => <IconBase {...p}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 12l2 2 4-4"/></IconBase>;

// Beheer
export const IconRelatiesNav    = IconRelaties; // alias
export const IconMedewerkersNav = IconMedewerkers; // alias
export const IconInstellingen   = (p: IconProps) => <IconBase {...p}><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2.4" fill="currentColor" stroke="none"/></IconBase>;

// Planning & Inkoop
export const IconProjectplanning   = (p: IconProps) => <IconBase {...p}><path d="M4 4v16h16"/><rect x="7" y="6" width="9" height="3.2" rx="1" fill="currentColor" stroke="none"/><rect x="7" y="13" width="12" height="3.2" rx="1" fill="currentColor" stroke="none"/></IconBase>;
export const IconCrewplanning      = (p: IconProps) => <IconBase {...p}><path d="M4 4v16h16"/><rect x="7" y="6" width="8" height="3.2" rx="1" fill="currentColor" stroke="none"/><rect x="7" y="13" width="6" height="3.2" rx="1" fill="currentColor" stroke="none"/><circle cx="18" cy="14.6" r="2"/></IconBase>;
export const IconAgenda            = (p: IconProps) => <IconBase {...p}><rect x="4" y="5" width="16" height="16" rx="2.4"/><path d="M4 9.5h16M8 3v4M16 3v4"/><rect x="7" y="12" width="3" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="11" y="12" width="3" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="7" y="16" width="3" height="2.6" rx="0.5" fill="currentColor" stroke="none"/></IconBase>;

// Financieel
export const IconFacturen = (p: IconProps) => <IconBase {...p}><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3l5 5h-5z"/><path d="M14 13h-3.5a1.8 1.8 0 0 0 0 3.6H12M8 13h3.5"/></IconBase>;
export const IconInkoop   = (p: IconProps) => <IconBase {...p}><path d="M12 2.5l9 5-9 5-9-5z"/><path d="M3 7.5v9l9 5 9-5v-9"/><path d="M12 12.5v9"/></IconBase>;

// Organisatie & Apps
export const IconKam           = (p: IconProps) => <IconBase {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z"/><path d="M9 12l2 2 4-4"/></IconBase>;
export const IconSjablonen     = (p: IconProps) => <IconBase {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none"/><path d="M17 14.5v6M14 17.5h6"/></IconBase>;
export const IconWagenpark     = (p: IconProps) => <IconBase {...p}><path d="M2 14V6h12v3h4l3 3v2h-3M14 14h-3M9 14H2"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></IconBase>;
export const IconHoutrotherstel = (p: IconProps) => <IconBase {...p}><path d="M4 20V9l8-5 8 5v11"/><path d="M4 20h16"/><path d="M9 20v-4a3 3 0 0 1 6 0v4z" fill="currentColor" stroke="none"/><path d="M9 9c1.2.8 1.6 2 1.2 3.2M14 8c1.2 1 1.6 2.4 1 4"/></IconBase>;
export const IconEvertsCalc    = (p: IconProps) => <IconBase {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.2"/><rect x="7" y="12" width="2.6" height="5" rx="0.5" fill="currentColor" stroke="none"/><rect x="11" y="8.5" width="2.6" height="8.5" rx="0.5" fill="currentColor" stroke="none"/><rect x="15" y="10.5" width="2.6" height="6.5" rx="0.5" fill="currentColor" stroke="none"/></IconBase>;
export const IconMijnTaken     = (p: IconProps) => <IconBase {...p}><circle cx="9" cy="7" r="3.2"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2"/><path d="M13.5 17.5l2 2 4-4.5"/></IconBase>;

// Dossier-modules
export const IconInformatie = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="1.4" fill="currentColor" stroke="none"/><path d="M12 11v6"/></IconBase>;
export const IconBestanden  = (p: IconProps) => <IconBase {...p}><path d="M3 8a2 2 0 0 1 2-2h3.5l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></IconBase>;
export const IconWerkbegroting = IconManagement; // zelfde patroon (staven)
export const IconCalculatie = (p: IconProps) => <IconBase {...p}><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 4h17v4h-17z" fill="currentColor" stroke="none"/><path d="M9 8v12M3.5 13h17"/></IconBase>;
export const IconTaken      = (p: IconProps) => <IconBase {...p}><path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9.5 3h5a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/><path d="M9 13l2 2 4-4"/></IconBase>;
export const IconVca        = (p: IconProps) => <IconBase {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z"/><path d="M12 6.5l5 2v3.5c0 3-2 5-5 6.2z" fill="currentColor" stroke="none" opacity="0.9"/></IconBase>;
export const IconVerkoop    = (p: IconProps) => <IconBase {...p}><path d="M2 3h3l2.2 12.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3L21 6H6"/><circle cx="9" cy="20" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="20" r="1.6" fill="currentColor" stroke="none"/></IconBase>;
export const IconMeerwerk   = (p: IconProps) => <IconBase {...p}><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M12 7.5v9M7.5 12h9" stroke="white"/></IconBase>;
export const IconList       = (p: IconProps) => <IconBase {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></IconBase>;

// Twee-tonige domein-iconen (48x48 viewBox, navy #1f2933 + lime #6cb33f)
// Geen stroke/color props — kleuren zijn fixed per brand-icons.html

type TwoToneIconProps = {
  size?: number;
  style?: React.CSSProperties;
};

export function IconDomeinOnderhoud({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path stroke="#1f2933" strokeWidth="2.6" d="M7 23L24 9l17 14"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M11 21V38a1 1 0 001 1h24a1 1 0 001-1V21"/>
      <path fill="#6cb33f" d="M28.5 22.3a4.6 4.6 0 00-5.9 5.3l-5.2 5.2a1.6 1.6 0 002.3 2.3l5.2-5.2a4.6 4.6 0 005.3-5.9l-2.4 2.4-2.2-.4-.4-2.2 2.3-2.3z"/>
    </svg>
  );
}

export function IconDomeinRenovatie({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect fill="#6cb33f" x="12" y="13" width="20" height="9" rx="2"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M32 15h5a2 2 0 012 2v4a2 2 0 01-2 2H24"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M24 23v4a2 2 0 01-2 2h-1a1 1 0 00-1 1v3"/>
      <rect fill="#1f2933" x="17.5" y="33" width="5" height="7" rx="1.4"/>
    </svg>
  );
}

export function IconDomeinPlanning({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect stroke="#1f2933" strokeWidth="2.6" x="12" y="11" width="20" height="28" rx="2.5"/>
      <path fill="#6cb33f" d="M18 9h8a1 1 0 011 1v2a1 1 0 01-1 1h-8a1 1 0 01-1-1v-2a1 1 0 011-1z"/>
      <rect stroke="#1f2933" strokeWidth="2" x="17" y="19" width="7" height="6"/>
      <path stroke="#1f2933" strokeWidth="2" d="M17 30h7M17 34h5"/>
      <path fill="#1f2933" d="M33 23l4 4-7 7-4 1 1-4z"/>
      <path fill="#6cb33f" d="M33 23l4 4-1.6 1.6-4-4z"/>
    </svg>
  );
}

export function IconDomeinVakmanschap({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path stroke="#1f2933" strokeWidth="2.4" d="M13 35L31 17l4 4-18 18-5 1z"/>
      <path fill="#6cb33f" d="M31 17l3-3a1.4 1.4 0 012 0l2 2a1.4 1.4 0 010 2l-3 3z"/>
      <path stroke="#1f2933" strokeWidth="2.4" d="M11 16l4-4 9 9-4 4"/>
      <path stroke="#1f2933" strokeWidth="1.8" d="M14 13v3M17 16v3M20 19v3"/>
    </svg>
  );
}

export function IconDomeinWoningen({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path fill="#6cb33f" d="M24 9L41 23H7z"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M11 21V38a1 1 0 001 1h24a1 1 0 001-1V21"/>
      <rect fill="#6cb33f" x="20" y="27" width="8" height="8" rx="1"/>
      <path stroke="#1f2933" strokeWidth="1.8" d="M24 27v8M20 31h8"/>
    </svg>
  );
}

export function IconDomeinCalculatie({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect fill="#6cb33f" x="11" y="14" width="11" height="6" rx="1"/>
      <rect stroke="#1f2933" strokeWidth="2.2" x="24" y="14" width="13" height="6" rx="1"/>
      <rect stroke="#1f2933" strokeWidth="2.2" x="11" y="22" width="13" height="6" rx="1"/>
      <rect fill="#6cb33f" x="26" y="22" width="11" height="6" rx="1"/>
      <rect fill="#6cb33f" x="11" y="30" width="11" height="6" rx="1"/>
      <rect stroke="#1f2933" strokeWidth="2.2" x="24" y="30" width="13" height="6" rx="1"/>
    </svg>
  );
}

export function IconDomeinWerkbon({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect stroke="#1f2933" strokeWidth="2.4" x="10" y="9" width="22" height="30" rx="2.5"/>
      <path fill="#6cb33f" d="M19 7h6a1 1 0 011 1v3a1 1 0 01-1 1h-6a1 1 0 01-1-1V8a1 1 0 011-1z"/>
      <path stroke="#1f2933" strokeWidth="1.8" d="M16 21h10M16 26h7M16 31h8"/>
      <path fill="#6cb33f" d="M28 28l8 4-8 4z"/>
    </svg>
  );
}

export function IconDomeinWagenpark({ size = 48, style }: TwoToneIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path fill="#6cb33f" d="M10 27h28l-4-10H14z"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M7 27h34v7a1 1 0 01-1 1H8a1 1 0 01-1-1v-7z"/>
      <path stroke="#1f2933" strokeWidth="2.6" d="M14 17l-4 10h28l-4-10H14z"/>
      <circle fill="#1f2933" cx="16" cy="35" r="3"/>
      <circle fill="#1f2933" cx="32" cy="35" r="3"/>
      <path stroke="#1f2933" strokeWidth="2" d="M19 22h10"/>
    </svg>
  );
}
