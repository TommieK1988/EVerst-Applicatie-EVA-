import React from 'react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getBezoekOverzicht } from '@/lib/bezoek/overzicht'
import { bezoekKenmerk, voortgangLabel } from '@/lib/bezoek/types'
import BezoekRapportageKnop from '@/components/documenten/BezoekRapportageKnop'
import BezoekVenster from './BezoekVenster'

/**
 * De projectbezoeken van een dossier, op de KAM/VGM-tab.
 *
 * Tot dit scherm bestond was een afgerond bezoek op de desktop nergens te zien: de enige
 * plek waar het opdook was de bronkiezer in de genereermodal. Je kon dus niet nalezen wat
 * er op locatie is vastgelegd zonder er eerst een document van te maken.
 *
 * Per bezoek staat de rapportageknop met dít bezoek voorgevuld. Dat is het verschil met de
 * omweg via Bestanden → Document opstellen, waar je zelf de juiste bron moet aanklikken —
 * en waar je er dus makkelijk naast grijpt.
 */
export default async function ProjectbezoekDeel({ dossierId }: { dossierId: string }) {
  const bezoeken = await getBezoekOverzicht(dossierId)

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 860 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Projectbezoeken</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        Wat de projectleider op locatie heeft vastgelegd. Een bezoek start je op de telefoon,
        via het dossier of via een actie.
      </p>

      {bezoeken.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Er is nog geen projectbezoek op deze opdracht.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bezoeken.map(b => <BezoekKaart key={b.id} bezoek={b} dossierId={dossierId} />)}
        </div>
      )}
    </div>
  )
}

function datumNL(iso: string) {
  try { return format(new Date(iso), 'd MMMM yyyy', { locale: nl }) } catch { return iso }
}

function BezoekKaart({
  bezoek, dossierId,
}: {
  bezoek: Awaited<ReturnType<typeof getBezoekOverzicht>>[number]
  dossierId: string
}) {
  const definitief = bezoek.status === 'definitief'

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'var(--surface)', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{bezoekKenmerk(bezoek.volgnummer)}</span>
            <span style={{
              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: definitief ? '#dcfce7' : '#fef9c3',
              color: definitief ? '#16a34a' : '#854d0e',
            }}>
              {definitief ? 'Afgerond' : 'Concept'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
            {datumNL(bezoek.datum)}{bezoek.tijd ? ` · ${bezoek.tijd}` : ''}
            {bezoek.uitvoerder ? ` · ${bezoek.uitvoerder}` : ''}
            {bezoek.locatie ? ` · ${bezoek.locatie}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Bewerken kan altijd: een concept vul je aan, een afgerond bezoek bekijk je —
              en desgewenst zet je het met een reden weer open. */}
          <BezoekVenster
            bezoekId={bezoek.id}
            volgnummer={bezoek.volgnummer}
            definitief={definitief}
          />
          {/* De rapportageknop alleen bij een afgerond bezoek: de bronkiezer toont uitsluitend
              definitieve bezoeken, dus bij een concept zou hij op een lege keuze uitkomen. */}
          {definitief && (
            <BezoekRapportageKnop
              dossierId={dossierId}
              bron={{ soort: 'projectbezoek', id: bezoek.id }}
              compact
            />
          )}
        </div>
      </div>

      {bezoek.disciplines.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
          Nog geen disciplines gekozen.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {bezoek.disciplines.map(d => (
            <span key={d.naam} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              padding: '3px 9px', borderRadius: 99, fontSize: 12,
              border: '1px solid var(--border)', background: 'var(--bg)',
            }}>
              <span>{d.naam}</span>
              <span style={{
                fontWeight: 700,
                color: d.voortgang_pct === null ? 'var(--text-muted)' : '#009439',
              }}>
                {voortgangLabel(d.voortgang_pct)}
              </span>
            </span>
          ))}
        </div>
      )}

      {bezoek.aantalPunten > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {bezoek.aantalPunten} {bezoek.aantalPunten === 1 ? 'punt' : 'punten'} vastgelegd
          {bezoek.aantalAandachtspunten > 0
            && `, waarvan ${bezoek.aantalAandachtspunten} als aandachtspunt op het dossier`}
        </div>
      )}
    </div>
  )
}
