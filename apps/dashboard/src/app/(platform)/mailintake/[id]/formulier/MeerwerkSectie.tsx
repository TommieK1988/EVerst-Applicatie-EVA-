'use client'

/**
 * Meerwerk op een lopend dossier, als volwaardige keuze in het vaste formulier.
 *
 * WAAROM DIT BLOK ER KOMT
 * Meerwerk was de enige soort zonder eigen plek. In de sectie "Het dossier" stond
 * dat EVA er een nieuw dossier van zou maken -- wat voor meerwerk nooit klopt -- en
 * de enige knop zat weggestopt rechts in het beoordelingspaneel, bij een
 * duplicaatkandidaat. Wie een meerwerkmail opende, zag dus de verkeerde afhandeling
 * voorgesteld en moest de juiste zelf gaan zoeken.
 *
 * EVA maakt zelf nooit een meerwerkregel aan: een bedrag en een omschrijving uit een
 * bijlage kiezen is een afspraak met de klant, geen invulveld. Wat hier gebeurt is
 * het bericht aan het juiste dossier koppelen; wat daarna met de regel gebeurt staat
 * in de bevestiging.
 */

import React from 'react'

import { Button } from '@/components/ui'
import { FormSection } from '@/components/ui/form-field'
import { klein, veldStijl } from '../panelen/velden'
import { zoekDossierVoorIntake } from '@/lib/mailintake/dossier-kiezen'

export interface MeerwerkKandidaat {
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  score: number
  redenen: string[]
}

type Gevonden = Awaited<ReturnType<typeof zoekDossierVoorIntake>>

export default function MeerwerkSectie({
  kandidaten, bewerkbaar, gekozen, onKies, onKoppel, bezig,
}: {
  /** Dossiers die EVA als kandidaat zag: lopende opdrachten van deze klant. */
  kandidaten: MeerwerkKandidaat[]
  bewerkbaar: boolean
  gekozen: string | null
  onKies: (dossierId: string) => void
  onKoppel: (dossierId: string) => void
  bezig: boolean
}) {
  const [zoek, setZoek] = React.useState('')
  const [gevonden, setGevonden] = React.useState<Gevonden>([])
  const [zoekt, setZoekt] = React.useState(false)

  async function zoeken() {
    if (zoek.trim().length < 2) return
    setZoekt(true)
    try { setGevonden(await zoekDossierVoorIntake(zoek)) }
    catch { setGevonden([]) }
    finally { setZoekt(false) }
  }

  const regel = (
    id: string,
    nummer: string | null,
    titel: string | null,
    extra: React.ReactNode,
  ) => (
    <label
      key={id}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px',
        border: `1px solid ${gekozen === id ? 'rgb(var(--su-300))' : 'var(--border)'}`,
        background: gekozen === id ? 'rgb(var(--su-50))' : 'transparent',
        borderRadius: 6, cursor: bewerkbaar ? 'pointer' : 'default',
      }}
    >
      <input
        type="radio" name="meerwerk-dossier" checked={gekozen === id}
        disabled={!bewerkbaar} onChange={() => onKies(id)} style={{ marginTop: 3 }}
      />
      <span style={{ fontSize: 13 }}>
        <strong>{nummer ?? 'dossier'}</strong>
        {titel ? ` — ${titel}` : ''}
        {extra}
      </span>
    </label>
  )

  return (
    <FormSection title="Het dossier" description="Bij welke opdracht hoort dit meerwerk?">
      {kandidaten.length === 0 && gevonden.length === 0 && (
        <p style={klein}>
          EVA vond geen lopende opdracht die hierbij past. Zoek het dossier hieronder op.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {kandidaten.map(k => regel(
          k.dossierId, k.dossiernummer, k.titel,
          <>
            {k.klantnaam && <span style={klein}> · {k.klantnaam}</span>}
            {k.redenen.length > 0 && (
              <span style={{ ...klein, display: 'block' }}>{k.redenen.join(' · ')}</span>
            )}
          </>,
        ))}
      </div>

      {bewerkbaar && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            style={{ ...veldStijl, flex: 1 }}
            placeholder="Zoek op offertenummer, dossiernummer, titel of straat…"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void zoeken() } }}
          />
          <Button variant="outline" onClick={() => void zoeken()} disabled={zoekt}>
            {zoekt ? 'Zoeken…' : 'Zoeken'}
          </Button>
        </div>
      )}

      {gevonden.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {gevonden.map(d => regel(
            d.dossierId, d.dossiernummer, d.titel,
            <>
              {d.klantnaam && <span style={klein}> · {d.klantnaam}</span>}
              {d.viaOfferte && <span style={klein}> · offerte {d.viaOfferte}</span>}
            </>,
          ))}
        </div>
      )}

      {bewerkbaar && (
        <div style={{ marginTop: 10 }}>
          <Button
            variant="primary"
            onClick={() => gekozen && onKoppel(gekozen)}
            disabled={!gekozen || bezig}
          >
            {bezig ? 'Bezig…' : 'Meerwerk op dit dossier'}
          </Button>
          {!gekozen && (
            <span style={{ ...klein, marginLeft: 8 }}>Kies eerst het dossier.</span>
          )}
        </div>
      )}
    </FormSection>
  )
}
