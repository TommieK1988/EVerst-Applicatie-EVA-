'use client'

/**
 * Wat er met de verkooptermijnen gaat gebeuren, vóór je bevestigt.
 *
 * WAAROM DIT BLOK BESTAAT
 * Het aanmaken van de termijnen draaide blind ná de statuswissel. Lukte het niet --
 * geen betalingsconditie op de offerte, geen aanneemsom, al een termijnstaat in
 * Bouw7 -- dan stond er al een gewonnen opdracht en kwam er achteraf een actie voor
 * de projectleider. Wie de opdracht inschreef, wist op dat moment niets.
 *
 * Hier staat het vooraf: de betalingsconditie, de grondslag en de regels die
 * geschreven worden, of in gewone taal waarom het niet kan.
 *
 * Alleen tonen, niet instellen. Het aanmaken zelf blijft lopen waar het liep; deze
 * sectie leest en schrijft niets. Blijkt "geen betalingsconditie" vaak voor te
 * komen, dan is handmatig instellen de logische volgende stap.
 */

import React from 'react'

import { FormSection } from '@/components/ui/form-field'
import { klein } from '../panelen/velden'
import { getTermijnvoorstelVoorIntake } from '@/lib/mailintake/dossier-kiezen'

type Voorstel = Awaited<ReturnType<typeof getTermijnvoorstelVoorIntake>>

const euro = (n: number) =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })

/**
 * De weigeringen in gewone taal.
 *
 * De codes komen uit `berekenTermijnschemaUitOfferte`; ze staan hier vertaald zodat
 * een behandelaar weet of hij iets moet doen of dat het klopt zoals het is.
 */
const UITLEG: Record<string, string> = {
  geen_bouw7: 'Dit dossier hangt nog niet aan een Bouw7-project.',
  geen_schema: 'Op de offerte staat geen betalingsconditie, dus er valt niets af te leiden.',
  bestaat_al: 'In Bouw7 staan al termijnen; die worden niet overschreven.',
  geen_bedrag: 'Er is nog geen aanneemsom bekend.',
  geen_debiteur: 'De opdrachtgever staat niet in Bouw7, dus de termijnstaat krijgt geen debiteur.',
  fout: 'Het schema kon niet worden opgehaald.',
}

export default function TermijnenSectie({
  dossierId, actief, viaOfferte = false,
}: {
  /** Het gekozen offertedossier; zonder dossier valt er niets te berekenen. */
  dossierId: string | null
  /**
   * Speelt dit blok bij deze afhandeling? Zo niet, dan blijft het gedimd staan.
   * Volgt de fasekeuze: bij een aanvraag is er geen aanneemsom, bij een opdracht wel.
   */
  actief: boolean
  /**
   * Hoort er een offerte bij deze opdracht?
   *
   * Zo ja, dan is een leeg dossier een stap die nog gezet moet worden. Zo nee -- een
   * opdrachtbon, of een aanvraag die je zelf naar Opdracht klikt -- is er geen
   * offerte om uit af te leiden, en dat is geen fout maar een feit. Zonder dit
   * onderscheid stond er "kies eerst de offerte" op een scherm waar geen offerte te
   * kiezen viel.
   */
  viaOfferte?: boolean
}) {
  const [voorstel, setVoorstel] = React.useState<Voorstel | null>(null)
  const [laden, setLaden] = React.useState(false)

  React.useEffect(() => {
    if (!actief || !dossierId) { setVoorstel(null); return }
    let weg = false
    setLaden(true)
    getTermijnvoorstelVoorIntake(dossierId)
      .then(r => { if (!weg) setVoorstel(r) })
      .catch(() => { if (!weg) setVoorstel(null) })
      .finally(() => { if (!weg) setLaden(false) })
    return () => { weg = true }
  }, [dossierId, actief])

  return (
    <FormSection
      title="Termijnen"
      description={!actief ? undefined
        : viaOfferte ? 'Wat er bij bevestigen wordt aangemaakt'
        : 'Wat er met de verkooptermijnen gebeurt'}
    >
      {/* Altijd dezelfde plek, ook als er niets te tonen valt: een blok dat
          verschijnt en verdwijnt laat de rest van het formulier verspringen. */}
      {!actief ? (
        <span style={{ ...klein, opacity: 0.6 }}>
          Speelt pas bij een opdracht — dan is er een aanneemsom om over te verdelen.
        </span>
      ) : !dossierId ? (
        <span style={klein}>
          {viaOfferte
            ? 'Kies eerst de offerte waar deze opdracht bij hoort.'
            : 'Er is geen offerte om dit uit af te leiden. Het termijnschema stel je op het '
              + 'dossier in zodra de aanneemsom vaststaat.'}
        </span>
      ) : laden ? (
        <span style={klein}>Termijnen berekenen…</span>
      ) : !voorstel ? (
        <span style={klein}>Het termijnvoorstel kon niet worden opgehaald.</span>
      ) : !voorstel.ok ? (
        <div className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] text-warning-700">
          <strong>Er worden geen termijnen aangemaakt.</strong>{' '}
          {UITLEG[voorstel.reden] ?? voorstel.error}
          {voorstel.reden !== 'bestaat_al' && (
            <span className="mt-1 block">
              De opdracht kan gewoon door; er komt een actie voor de projectleider om dit
              alsnog in te stellen.
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={klein}>
            Volgens betalingsconditie <strong>{voorstel.conditie}</strong> over{' '}
            {euro(voorstel.grondslag)}
          </span>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {voorstel.termijnen.map((t, i) => (
                <tr key={`${t.omschrijving}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 0' }}>{t.omschrijving}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--fg-muted)' }}>
                    {t.percentage.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%
                  </td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {euro(t.bedragExclBtw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormSection>
  )
}
