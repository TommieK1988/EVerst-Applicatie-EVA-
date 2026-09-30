'use client'

/**
 * De projectrollen, meteen invulbaar bij de intake.
 *
 * WAAROM HIER
 * De rollen werden pas op het dossier zelf gezet, terwijl bij het inschrijven vaak
 * al bekend is wie het gaat doen. Alleen de calculator kon hier worden aangewezen;
 * de rest moest je achteraf in een ander scherm opzoeken.
 *
 * Geen van de rollen is verplicht, dus ze worden nooit rood. Bij een verse aanvraag
 * is de projectleider nog onbekend, en dat is de normale gang van zaken.
 *
 * Bij een opdracht op een offerte staan de rolhouders van het gekozen dossier al
 * ingevuld; wijzigen gaat dan langs dezelfde weg als op het dossier zelf
 * (`updateDossierRollen`, inclusief de schrijfactie naar Bouw7).
 */

import React from 'react'

import { FormSection } from '@/components/ui/form-field'
import { Veld, veldStijl, klein } from '../panelen/velden'

/** De zes rollen zoals `updateDossierRollen` ze kent. */
export const ROLLEN = [
  { sleutel: 'project_manager_id', label: 'Projectleider' },
  { sleutel: 'teamleider_id', label: 'Teamleider' },
  { sleutel: 'werkvoorbereider_id', label: 'Werkvoorbereider' },
  { sleutel: 'calculator_id', label: 'Calculator' },
  { sleutel: 'uitvoerder_id', label: 'Uitvoerder' },
  { sleutel: 'controller_id', label: 'Controller' },
] as const

export type RolSleutel = (typeof ROLLEN)[number]['sleutel']
export type Rolbezetting = Partial<Record<RolSleutel, string>>

export default function RollenSectie({
  waarden, opWijzig, medewerkers, bewerkbaar, uitDossier,
}: {
  waarden: Rolbezetting
  opWijzig: (rol: RolSleutel, medewerkerId: string) => void
  medewerkers: { id: string; naam: string }[]
  bewerkbaar: boolean
  /** Dossiernummer als de rollen daarvandaan komen; dan is het geen voorstel maar een stand. */
  uitDossier?: string | null
}) {
  return (
    <FormSection
      title="Rollen"
      description={uitDossier ? `Zoals ze op ${uitDossier} staan` : 'Optioneel — later aanvullen mag ook'}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ROLLEN.map(r => (
          <Veld key={r.sleutel} label={r.label}>
            <select
              style={veldStijl}
              value={waarden[r.sleutel] ?? ''}
              disabled={!bewerkbaar}
              onChange={e => opWijzig(r.sleutel, e.target.value)}
            >
              <option value="">— nog niet toewijzen —</option>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
            </select>
          </Veld>
        ))}
      </div>
      <span style={klein}>
        Wat je hier invult komt op het dossier te staan en gaat mee naar Bouw7.
      </span>
    </FormSection>
  )
}
