'use client'
import React from 'react'
import type { DossierRij, DossierSectie } from './types'
import { IndicatorIcoon, TONE_KLEUREN, isVerlopen, type KaartIndicator } from './kaart-indicatoren'
import { berekenKaartBedrag, type KaartBedrag } from './kaart-bedrag'

/**
 * Het paneel dat onder de kanban-kaart uitschuift bij hoveren. Geeft de indicatoren van de
 * compacte kaart hun volledige uitleg, plus de datums en de klant-/prijsregels die van de
 * kaart zelf zijn gehaald om hem compact te houden.
 */

function formatBedrag(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(bedrag)
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function opslagKleur(pct: number): string {
  if (pct >= 25) return 'var(--success-600, #009439)'
  if (pct >= 15) return 'var(--warning-600, #d97706)'
  return 'var(--error-600, #d9534f)'
}

/** Eén regel in de opbouw van het kaartbedrag. */
function BedragRegel({ label, bedrag, kleur, vet = false }: {
  label: string
  bedrag: number
  kleur?: string
  vet?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
      ...(vet ? { marginTop: 2, paddingTop: 3, borderTop: '1px solid var(--border)' } : null),
    }}>
      <span style={{ fontSize: 11, color: vet ? 'var(--neutral-700)' : 'var(--neutral-500)', fontWeight: vet ? 600 : 400 }}>
        {label}
      </span>
      <span style={{
        fontSize: 11, fontWeight: vet ? 700 : 500, whiteSpace: 'nowrap',
        color: kleur ?? 'var(--neutral-700)',
      }}>
        {formatBedrag(bedrag)}
      </span>
    </div>
  )
}

function DatumRegel({ label, iso, markeerVerlopen = false }: {
  label: string
  iso: string | null
  markeerVerlopen?: boolean
}) {
  if (!iso) return null
  const verlopen = markeerVerlopen && isVerlopen(iso)
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: verlopen ? 700 : 500, whiteSpace: 'nowrap',
        color: verlopen ? 'var(--error-600, #d9534f)' : 'var(--neutral-700)',
      }}>
        {formatDatum(iso)}{verlopen ? ' · verlopen' : ''}
      </span>
    </div>
  )
}

export function DossierKaartDetail({ dossier, sectie, indicatoren, bedrag }: {
  dossier: DossierRij
  sectie?: DossierSectie
  indicatoren: KaartIndicator[]
  /** Voorberekend door DossierKaart; los aangeroepen valt hij terug op dezelfde rekenregel. */
  bedrag?: KaartBedrag
}) {
  const b = bedrag ?? berekenKaartBedrag(dossier, sectie)
  // Verkoop en kostprijs moeten uit dezelfde offerte komen, anders is de opslag betekenisloos.
  // `berekenKaartBedrag` levert ze als paar; ontbreekt de kostprijs, dan tonen we geen opslag.
  const verkoopprijs = b.aanneemsom
  const kostprijs    = b.kostprijs
  const toonFinancieel = sectie === 'offerte'
    && kostprijs != null && kostprijs > 0
    && verkoopprijs != null && verkoopprijs > 0
  const opslagPct = toonFinancieel ? ((verkoopprijs! - kostprijs!) / kostprijs!) * 100 : 0

  const heeftDatums = !!(dossier.deadline || dossier.verwacht_startdatum
    || dossier.verwacht_einddatum || (sectie === 'offerte' && dossier.verzonden_op))

  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: '1px dashed var(--border)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Klant + (bij offertes) kostprijs en opslag — van de compacte kaart hierheen verhuisd */}
      {(dossier.klant_naam || toonFinancieel) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {dossier.klant_naam && (
            <div style={{ fontSize: 12, color: 'var(--neutral-700)', fontWeight: 500 }}>
              {dossier.klant_naam}
            </div>
          )}
          {toonFinancieel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
                Kostprijs {formatBedrag(kostprijs!)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: opslagKleur(opslagPct) }}>
                {opslagPct.toFixed(1)}% opslag
              </span>
            </div>
          )}
        </div>
      )}

      {/* Opbouw van het kaartbedrag: alleen tonen als er iets bij de aanneemsom op komt, zodat
          zichtbaar is waarom de kaart een ander bedrag toont dan de kale aanneemsom. */}
      {b.heeftOpbouw && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {b.aanneemsom != null && <BedragRegel label="Aanneemsom" bedrag={b.aanneemsom} />}
          {b.meerwerk !== 0 && (
            <BedragRegel
              label={b.meerwerk < 0 ? 'Goedgekeurd minderwerk' : 'Goedgekeurd meerwerk'}
              bedrag={b.meerwerk}
              kleur={b.meerwerk < 0 ? 'var(--success-600, #009439)' : undefined}
            />
          )}
          {b.stelpostenApart !== 0 && (
            <BedragRegel label="Stelposten buiten de aanneemsom" bedrag={b.stelpostenApart} />
          )}
          {b.gekozenOpties !== 0 && <BedragRegel label="Gekozen opties" bedrag={b.gekozenOpties} />}
          {b.totaalExclBtw != null && (
            <BedragRegel label="Totaal excl. BTW" bedrag={b.totaalExclBtw} vet />
          )}
        </div>
      )}

      {/* Signalen: dezelfde indicatoren als de chips, nu met volledige uitleg */}
      {indicatoren.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {indicatoren.map(ind => {
            const kleur = TONE_KLEUREN[ind.tone]
            return (
              <div key={ind.soort} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{
                  display: 'inline-grid', placeItems: 'center',
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 0.5,
                  color: kleur.fg, background: kleur.bg, border: `1px solid ${kleur.border}`,
                }}>
                  <IndicatorIcoon soort={ind.soort} size={10} />
                </span>
                <span style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--neutral-700)' }}>
                  {ind.uitleg}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Datums */}
      {heeftDatums && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sectie === 'offerte' && <DatumRegel label="Verzonden"        iso={dossier.verzonden_op} />}
          <DatumRegel label="Gewenste deadline" iso={dossier.deadline}            markeerVerlopen />
          <DatumRegel label="Verwachte start"   iso={dossier.verwacht_startdatum} />
          <DatumRegel label="Verwacht einde"    iso={dossier.verwacht_einddatum}  markeerVerlopen />
        </div>
      )}
    </div>
  )
}
