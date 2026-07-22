import React from 'react'
import StatusBadge from './StatusBadge'

/**
 * Dossier-informatie voor de buitendienst (mobiel).
 *
 * Bewust kaal: uitvoerend personeel heeft op een telefoon maar een paar dingen
 * nodig — waar moet ik zijn, wie bel ik, en wanneer. Grote tekst, grote
 * knoppen. Financiële cijfers en de volledige rollenlijst horen hier niet;
 * die staan op de desktop. Een tabletweergave met meer detail kan later.
 *
 * LET OP: dit scherm rendert géén eigen `AppHeader` — de dossierpagina doet dat
 * al. Twee headers stapelen gaf een dubbele bovenbalk waar de tabstrip tussen
 * wegviel.
 */
export type DossierInfo = {
  titel: string
  dossiernummer: string | null
  statusLabel: string
  statusColor: string
  klant_naam: string | null
  begindatum: string | null
  einddatum: string | null
  contact_naam: string | null
  contact_telefoon: string | null
  werkadres: string | null
  uitvoerder: string | null
  projectleider: string | null
}

/** Groot, goed leesbaar feit. */
function Feit({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  const leeg = waarde == null || waarde === ''
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6b757c', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: leeg ? '#9aa4ab' : '#161b20', wordBreak: 'break-word', lineHeight: 1.35 }}>
        {leeg ? '—' : waarde}
      </div>
    </div>
  )
}

const kaart: React.CSSProperties = {
  background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14,
  padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
}

const knop: React.CSSProperties = {
  flex: 1, minHeight: 56, borderRadius: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontSize: 16, fontWeight: 700, textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
}

export default function DossierInfoView({ info }: { info: DossierInfo }) {
  const telefoon = info.contact_telefoon?.replace(/\s/g, '') || null
  const periode = [info.begindatum, info.einddatum].filter(Boolean).join(' – ') || null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Wat is dit voor werk, en hoe staat het ervoor */}
      <div style={{ ...kaart, gap: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.25 }}>
          {info.titel}
        </div>
        <StatusBadge label={info.statusLabel} color={info.statusColor} lg />
      </div>

      {/* De twee dingen die je in het veld daadwerkelijk doet */}
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href={telefoon ? `tel:${telefoon}` : undefined}
          aria-disabled={!telefoon}
          style={{
            ...knop,
            background: telefoon ? '#009439' : '#e3e8ea',
            color: telefoon ? '#fff' : '#9aa4ab',
            pointerEvents: telefoon ? 'auto' : 'none',
          }}
        >
          Bellen
        </a>
        <a
          href={info.werkadres ? `https://maps.google.com/?q=${encodeURIComponent(info.werkadres)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!info.werkadres}
          style={{
            ...knop,
            background: info.werkadres ? '#fff' : '#f4f6f7',
            color: info.werkadres ? '#009439' : '#9aa4ab',
            border: `1px solid ${info.werkadres ? '#009439' : '#e3e8ea'}`,
            pointerEvents: info.werkadres ? 'auto' : 'none',
          }}
        >
          Navigeren
        </a>
      </div>

      <div style={kaart}>
        <Feit label="Werkadres" waarde={info.werkadres} />
        <Feit label="Opdrachtgever" waarde={info.klant_naam} />
        {periode && <Feit label="Periode" waarde={periode} />}
      </div>

      <div style={kaart}>
        <Feit
          label="Contactpersoon"
          waarde={info.contact_naam
            ? (telefoon
                ? <a href={`tel:${telefoon}`} style={{ color: '#009439', textDecoration: 'none' }}>
                    {info.contact_naam} · {info.contact_telefoon}
                  </a>
                : info.contact_naam)
            : null}
        />
        <Feit label="Uitvoerder" waarde={info.uitvoerder} />
        <Feit label="Projectleider" waarde={info.projectleider} />
      </div>
    </div>
  )
}
