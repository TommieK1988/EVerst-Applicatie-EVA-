'use client'

import React, { useState } from 'react'
import type { Kanaal, KanaalRechten, RechtenDocument, RechtenModule } from '@everts/database/platform-types'
import { Button } from '@/components/ui'
import RechtenMatrix from './RechtenMatrix'

/**
 * De twee kanalen naast elkaar, met één opslagknop. Desktop en mobiel zijn
 * losse sets: je kunt iemand op zijn telefoon iets geven of onthouden zonder
 * zijn werkplek te veranderen.
 */

const KANALEN: { key: Kanaal; label: string }[] = [
  { key: 'desktop', label: 'Desktop' },
  { key: 'mobiel',  label: 'Mobiel' },
]

/**
 * Waarom de mobiele lijst zo kort is. Dit is de belangrijkste tekst op dit
 * scherm: zonder deze uitleg gaat een beheerder "uren" of "verlof" zoeken, ze
 * niet vinden en denken dat er iets stuk is.
 */
const MOBIELE_UITLEG = (
  <>
    Op de telefoon bestaan alleen deze onderdelen. Uren, verlof, de planning van vandaag,
    het handboek, je profiel en meldingen staan er bewust niet bij: die gaan over je eigen
    gegevens of over je rol op een dossier, niet over een recht. Iedereen met een account
    komt daar altijd bij.
  </>
)

/**
 * En waar de scheiding ophoudt. Eerlijk benoemen is beter dan een grens
 * suggereren die er niet is.
 */
const KANAAL_KANTTEKENING =
  'Let op: dit bepaalt wat iemand in de app ziet en kan aanklikken. ' +
  'Het is geen afscherming van de gegevens zelf — daarvoor telt het hoogste van de twee kanalen.'

export type KanaalRechtenEditorProps = {
  waarde: RechtenDocument
  /** De laag eronder (de afdeling). Meegeven maakt dit een persoonlijke afwijking. */
  basis?: RechtenDocument
  opslaan: (nieuw: RechtenDocument) => Promise<void>
  vergrendeld?: (module: RechtenModule, kanaal: Kanaal) => string | null
}

export default function KanaalRechtenEditor({
  waarde, basis, opslaan, vergrendeld,
}: KanaalRechtenEditorProps) {
  const [doc, setDoc] = useState<RechtenDocument>(waarde)
  const [kanaal, setKanaal] = useState<Kanaal>('desktop')
  const [vuil, setVuil] = useState(false)
  const [bezig, setBezig] = useState(false)

  function zet(nieuw: KanaalRechten) {
    setDoc(d => ({ ...d, [kanaal]: nieuw }))
    setVuil(true)
  }

  async function bewaar() {
    setBezig(true)
    try {
      await opslaan(doc)
      setVuil(false)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div role="tablist" style={{
          display: 'flex', gap: 2, padding: 3,
          background: 'var(--neutral-100, #eef1f2)', borderRadius: 9, width: 'fit-content',
        }}>
          {KANALEN.map(k => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={kanaal === k.key}
              onClick={() => setKanaal(k.key)}
              style={{
                padding: '5px 13px', borderRadius: 7, fontSize: 12.5, fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: kanaal === k.key ? 'var(--bg-elev, #fff)' : 'transparent',
                color: kanaal === k.key ? 'var(--neutral-900, #161b20)' : 'var(--neutral-600, #58636b)',
                boxShadow: kanaal === k.key ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        {vuil && (
          <Button variant="primary" size="sm" onClick={bewaar} loading={bezig}>
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </Button>
        )}
      </div>

      <p style={{
        fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--fg-muted)',
        lineHeight: 1.5, margin: '0 0 12px', maxWidth: 760,
      }}>
        {kanaal === 'mobiel' ? MOBIELE_UITLEG : KANAAL_KANTTEKENING}
      </p>

      <RechtenMatrix
        kanaal={kanaal}
        waarde={doc[kanaal]}
        basis={basis?.[kanaal]}
        onChange={zet}
        vergrendeld={vergrendeld ? (m => vergrendeld(m, kanaal)) : undefined}
      />
    </div>
  )
}
