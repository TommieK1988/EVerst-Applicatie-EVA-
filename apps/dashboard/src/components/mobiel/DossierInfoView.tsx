import React from 'react'
import StatusBadge from './StatusBadge'
import { getAppVertaler } from '@/i18n/server'

/**
 * Dossier-informatie voor de buitendienst (mobiel).
 *
 * Bewust kaal: uitvoerend personeel heeft op een telefoon maar een paar dingen
 * nodig — waar moet ik zijn, wie bel ik, en wanneer. Grote tekst, grote
 * knoppen. Financiële cijfers horen hier niet; die staan op de desktop.
 *
 * De rollen staan er wél voluit: in het veld wil je weten wie de calculator of
 * de teamleider is om die te kunnen bellen, en alleen uitvoerder + projectleider
 * tonen betekende terug naar kantoor of naar de desktop. Alleen ingevulde rollen
 * verschijnen — vijf lege regels zijn geen informatie.
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
  /** Wie er op het werkadres zit (bewoner, beheerder ter plaatse) — niet de contactpersoon van de opdrachtgever. */
  werkadres_naam: string | null
  werkadres_telefoon: string | null
  /** Geclusterde opdracht: de overige werkadressen, elk met een eigen Navigeren-knop. */
  extraWerkadressen?: ExtraWerkadresInfo[]
  /** Ingevulde rollen in de volgorde van het Rollen-blok op de desktop; lege rollen zitten er niet in. */
  rollen: { label: string; naam: string }[]
}

export type ExtraWerkadresInfo = {
  id: string
  naam: string | null
  adres: string | null
  contact_naam: string | null
  contact_telefoon: string | null
}

const navigeerLink = (adres: string) => `https://maps.google.com/?q=${encodeURIComponent(adres)}`

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

export default async function DossierInfoView({
  info, statusKiezer,
}: {
  info: DossierInfo
  /**
   * De statuskiezer, als de gebruiker de status mag wijzigen. Komt van buiten omdat dit
   * scherm niets van rechten hoeft te weten; zonder kiezer blijft het de kale badge.
   */
  statusKiezer?: React.ReactNode
}) {
  const t = await getAppVertaler('dossiers')
  // Bellen = het werkadres: in het veld bel je wie er ter plaatse is, niet de opdrachtgever.
  // Zonder nummer blijft de knop bewust grijs; de contactpersoon staat hieronder zelf aantikbaar.
  const telefoon = info.werkadres_telefoon?.replace(/\s/g, '') || null
  const contactTel = info.contact_telefoon?.replace(/\s/g, '') || null
  const periode = [info.begindatum, info.einddatum].filter(Boolean).join(' – ') || null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Wat is dit voor werk, en hoe staat het ervoor */}
      <div style={{ ...kaart, gap: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.25 }}>
          {info.titel}
        </div>
        {statusKiezer ?? <StatusBadge label={info.statusLabel} color={info.statusColor} lg />}
        {periode && <Feit label={t('info.periode')} waarde={periode} />}
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
          {t('info.bellen')}
        </a>
        <a
          href={info.werkadres ? navigeerLink(info.werkadres) : undefined}
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
          {t('info.navigeren')}
        </a>
      </div>

      <div style={kaart}>
        <Feit label={t('info.werkadres')} waarde={info.werkadres} />
        {info.werkadres_naam && <Feit label={t('info.naam')} waarde={info.werkadres_naam} />}
        <Feit
          label={t('info.telefoon')}
          waarde={telefoon
            ? <a href={`tel:${telefoon}`} style={{ color: '#009439', textDecoration: 'none' }}>{info.werkadres_telefoon}</a>
            : null}
        />
      </div>

      {(info.extraWerkadressen ?? []).map((w, i) => {
        const tel = w.contact_telefoon?.replace(/\s/g, '') || null
        return (
          <div key={w.id} style={kaart}>
            <Feit label={w.naam ?? `Werkadres ${i + 2}`} waarde={w.adres} />
            {(w.contact_naam || tel) && (
              <Feit
                label="Contact"
                waarde={tel
                  ? <a href={`tel:${tel}`} style={{ color: '#009439', textDecoration: 'none' }}>
                      {[w.contact_naam, w.contact_telefoon].filter(Boolean).join(' · ')}
                    </a>
                  : w.contact_naam}
              />
            )}
            {w.adres && (
              <a
                href={navigeerLink(w.adres)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...knop, minHeight: 48, background: '#fff', color: '#009439', border: '1px solid #009439' }}
              >
                Navigeren
              </a>
            )}
          </div>
        )
      })}

      <div style={kaart}>
        <Feit label={t('info.opdrachtgever')} waarde={info.klant_naam} />
        <Feit
          label={t('info.contactpersoon')}
          waarde={info.contact_naam
            ? (contactTel
                ? <a href={`tel:${contactTel}`} style={{ color: '#009439', textDecoration: 'none' }}>
                    {info.contact_naam} · {info.contact_telefoon}
                  </a>
                : info.contact_naam)
            : null}
        />
      </div>

      {info.rollen.length > 0 && (
        <div style={kaart}>
          {info.rollen.map(r => <Feit key={r.label} label={r.label} waarde={r.naam} />)}
        </div>
      )}
    </div>
  )
}
