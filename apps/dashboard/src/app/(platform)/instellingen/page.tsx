import React from 'react'
import Link from 'next/link'
import { PageHeader, Badge } from '@/components/ui'

export const metadata = { title: 'Instellingen' }

const platformItems = [
  {
    href: '/instellingen/functies-afdelingen',
    title: 'Functies & Afdelingen',
    description: 'Beheer de beschikbare functies en afdelingen die als keuze verschijnen bij medewerkerprofielen.',
    ready: true,
    kicker: 'Medewerkers',
  },
  {
    href: '/instellingen/cao',
    title: 'CAO beheer',
    description: 'Upload een CAO-document als PDF. EVA leest de loonschalen en treden automatisch in via AI.',
    ready: true,
    kicker: 'Medewerkers',
  },
  {
    href: '/instellingen/bedrijfsgegevens',
    title: 'Organisatiegegevens',
    description: 'Organisatie en werkmaatschappijen — naam, KvK, BTW-nummer, adres.',
    ready: true,
    kicker: 'Bedrijf',
  },
  {
    href: '/instellingen/bedrijfsgegevens/huisstijl',
    title: 'Huisstijl',
    description: "Logo's in meerdere formaten, kleurenpalet, typografie en huisstijlregels.",
    ready: true,
    kicker: 'Ontwerp',
  },
  {
    href: '/instellingen/gebruikers',
    title: 'Gebruikers & rechten',
    description: 'Wie heeft toegang tot het platform, welk type gebruiker ze zijn en rechten per afdeling.',
    ready: true,
    kicker: 'Team',
  },
  {
    href: '/instellingen/integraties',
    title: 'Integraties',
    description: 'Exact Bouw7 API-key, sync en overige koppelingen.',
    ready: true,
    kicker: 'Systeem',
  },
  {
    href: '/instellingen',
    title: 'Systeem',
    description: 'Feature flags, cache, logs en backups.',
    ready: false,
    kicker: 'Geavanceerd',
  },
]

const calcOfferteItems = [
  {
    href: '/instellingen/dossier-categorieen',
    title: 'Dossier categorieën',
    description: 'Beschikbare categorieën voor aanvragen, offertes en opdrachten.',
    ready: true,
    kicker: 'Dossiers',
  },
  {
    href: '/instellingen/dossier-toggles',
    title: 'Dossier toggles',
    description: 'Aan/uit-schakelaars per dossier; bruikbaar als trigger of conditie voor actielijsten.',
    ready: true,
    kicker: 'Dossiers',
  },
  {
    href: '/instellingen/btw-tarieven',
    title: 'BTW tarieven',
    description: 'Beschikbare BTW-percentages voor calculatieregels en offertes.',
    ready: true,
    kicker: 'Calculatie',
  },
  {
    href: '/instellingen/betalingscondities',
    title: 'Betalingscondities',
    description: 'Termijnschema\'s voor de aanneemsom — welk percentage wanneer verschuldigd is.',
    ready: true,
    kicker: 'Offerte',
  },
  {
    href: '/instellingen/algemene-voorwaarden',
    title: 'Algemene Voorwaarden',
    description: 'Upload en beheer PDF-documenten met algemene voorwaarden voor offertes.',
    ready: true,
    kicker: 'Offerte',
  },
  {
    href: '/instellingen/offerte-layout',
    title: 'Offerte layout',
    description: 'Word-sjablonen met huisstijl, kleuren en papierindeling voor offertes.',
    ready: true,
    kicker: 'Offerte',
  },
]

const appItems = [
  {
    href: '/instellingen/planning',
    title: 'Planning',
    description: 'Uursoorten, everts-calc sync-koppeling en capaciteitsinstellingen.',
    ready: true,
    kicker: 'Planning',
  },
  {
    href: '/everts-calc/instellingen',
    title: 'EvertsCalc',
    description: 'Rekenregels, prijslijsten en standaard calculatie-instellingen.',
    ready: true,
    kicker: 'Calculatie',
  },
  {
    href: '/houtrotherstel/instellingen',
    title: 'Houtrotherstel',
    description: 'Producten, behandelingen, rapportage-sjablonen en tarieven.',
    ready: true,
    kicker: 'Houtrotherstel',
  },
  {
    href: '/wagenpark/instellingen',
    title: 'Wagenpark',
    description: 'Voertuigcategorieën, brandstofnormen en koppeling met cartracker.',
    ready: true,
    kicker: 'Wagenpark',
  },
  {
    href: '/taken/instellingen',
    title: 'Actielijsten',
    description: 'Standaard rollen en doorlooptijden voor actielijsten.',
    ready: false,
    kicker: 'Taken',
  },
  {
    href: '/geveltekening/instellingen',
    title: 'Geveltekeningen',
    description: 'Sjablonen, exportformaten en lagen-configuratie.',
    ready: false,
    kicker: 'Geveltekening',
  },
]

function SettingsCard({ item }: { item: typeof platformItems[number] }) {
  const inner = (
    <>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        {item.kicker}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: item.ready ? 'var(--fg)' : 'var(--fg-muted)', marginBottom: 5 }}>
        {item.title}
      </div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
        {item.description}
      </div>
      {!item.ready && (
        <div style={{ marginTop: 10 }}>
          <Badge variant="outline" tone="neutral" size="sm" className="font-bold uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--font-mono)' }}>
            binnenkort
          </Badge>
        </div>
      )}
    </>
  )
  const cardStyle = {
    display: 'block',
    padding: '18px 20px',
    background: 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    textDecoration: 'none',
    opacity: item.ready ? 1 : 0.6,
    transition: 'background 0.15s',
  } as React.CSSProperties

  return item.ready ? (
    <Link href={item.href} style={cardStyle}>{inner}</Link>
  ) : (
    <div style={cardStyle}>{inner}</div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--fg-muted)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 10,
}

export default function Page() {
  return (
    <div className="eva-page">
      <PageHeader eyebrow="Platform" title="Bedrijfsinstellingen" />
      <p className="eva-page-desc">Algemene instellingen — bedrijfsgegevens, gebruikers, apps en systeemconfiguratie.</p>

      <div style={{ marginBottom: 6 }}>
        <div style={sectionLabel}>Algemeen</div>
        <div style={grid}>
          {platformItems.map(item => <SettingsCard key={item.title} item={item} />)}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={sectionLabel}>Calculatie &amp; Offertes</div>
        <div style={grid}>
          {calcOfferteItems.map(item => <SettingsCard key={item.title} item={item} />)}
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={sectionLabel}>Apps</div>
        <div style={grid}>
          {appItems.map(item => <SettingsCard key={item.title} item={item} />)}
        </div>
      </div>
    </div>
  )
}
