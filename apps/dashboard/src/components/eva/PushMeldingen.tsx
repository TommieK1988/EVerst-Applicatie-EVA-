'use client'

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { usePush, isIOS, isGeinstalleerd } from '@/lib/push/client'

/**
 * Stand van de pushmeldingen op dít apparaat.
 *
 * Staat op twee plekken: "Mijn gegevens" in EVA Mobiel (weergave 'mobiel') en
 * "Mijn account" op de desktop (weergave 'desktop'). Het is bewust per apparaat en
 * niet per gebruiker: je wilt de meldingen op je telefoon, niet ook nog eens op de
 * balie-pc waar je 's ochtends toevallig hebt ingelogd.
 *
 * Bewust géén aan/uit-schakelaar. Meldingen horen aan te staan; een schakelaar
 * suggereert dat "uit" een normale stand is en nodigt uit tot per ongeluk
 * uitzetten. Alleen de allereerste keer is één tik nodig, omdat de browser
 * toestemming uitsluitend na een handeling van de gebruiker vraagt. Daarna houdt
 * PushHersteller het abonnement in de lucht. Echt uitzetten doe je bij de
 * meldingsinstellingen van de telefoon — daar hoort het thuis, en alleen daar kan
 * EVA het ook niet ongemerkt terugdraaien.
 *
 * De testknop is geen luxe — als push níét werkt merk je dat anders pas op het
 * moment dat je een melding mist.
 */
export default function PushMeldingen({ weergave = 'desktop' }: { weergave?: 'mobiel' | 'desktop' }) {
  const { status, bezig, fout, aanzetten, testen, hercontroleer } = usePush()
  const [apparaat, setApparaat] = useState<'ios' | 'anders'>('anders')

  useEffect(() => {
    setApparaat(isIOS() ? 'ios' : 'anders')
  }, [])

  const aan = status === 'aan'
  // Geen aan/uit-schakelaar meer: meldingen horen gewoon aan te staan. Alleen de
  // allereerste keer is een tik nodig, omdat de browser toestemming alleen vraagt
  // na een handeling van de gebruiker. Uitzetten kan nog wel — in de instellingen
  // van de telefoon zelf, waar het thuishoort.
  const moetAanzetten = status === 'uit'
  // Standen die de gebruiker buiten EVA om kan oplossen; dan hoort er een knop
  // bij om opnieuw te kijken, want de browser meldt zo'n wijziging niet.
  const opTeLossen = status === 'geweigerd' || status === 'installeren'

  const statusTekst =
    status === 'laden'            ? 'Controleren…'
    : status === 'aan'            ? 'Aan op dit apparaat'
    : status === 'uit'            ? 'Nog niet aangezet'
    : status === 'installeren'    ? 'App nog niet geïnstalleerd'
    : status === 'geweigerd'      ? 'Geblokkeerd'
    : status === 'geen-sw'        ? 'Nog niet beschikbaar'
    : 'Niet ondersteund'

  const statusKleur =
    status === 'aan'                                ? '#067647'
    : status === 'geweigerd'                        ? '#b42318'
    : status === 'installeren'                      ? '#b54708'
    : '#6b757c'

  const uitleg =
    status === 'installeren'
      ? 'Op de iPhone kan alleen de geïnstalleerde app meldingen geven. Tik onderin op de deelknop en kies "Zet op beginscherm"; open EVA daarna via dat icoon en zet ze daar aan.'
    : status === 'geweigerd'
      ? apparaat === 'ios'
        ? 'Meldingen zijn voor EVA geblokkeerd. iOS onthoudt een weigering en vraagt het niet nog een keer: zet het aan via Instellingen → EVA → Berichtgeving. Staat EVA daar niet tussen, verwijder het icoon dan van je beginscherm en zet het er opnieuw op — daarna mag EVA het opnieuw vragen.'
        : 'Meldingen zijn voor EVA geblokkeerd. Dat kan EVA niet zelf terugzetten. In Chrome: tik op het slotje of de instellingen naast het webadres → Meldingen → Toestaan. In de geïnstalleerde app: Instellingen → Apps → EVA → Meldingen.'
    : status === 'geen-sw'
      ? 'Pushmeldingen werken in de gepubliceerde app. In een testomgeving op je eigen pc draait de achtergronddienst niet.'
    : status === 'niet-ondersteund'
      ? 'Deze browser kan geen pushmeldingen ontvangen. Op de iPhone lukt het vanaf iOS 16.4, mits EVA op het beginscherm staat.'
    : status === 'uit'
      ? 'Eén keer aanzetten en het blijft aan staan — de browser wil daar één tik voor. Daarna houdt EVA het zelf bij, ook als je toestel het abonnement tussendoor opruimt.'
    : 'Je krijgt meldingen op dit apparaat, ook als EVA dicht staat. Uitzetten kan bij de meldingsinstellingen van je telefoon.'

  async function testMelding() {
    if (await testen()) toast.success('Testmelding verstuurd')
    else toast.error('Versturen mislukt')
  }

  const mobiel = weergave === 'mobiel'

  return (
    <div
      style={
        mobiel
          ? {
              padding: 16, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 14,
              display: 'flex', flexDirection: 'column', gap: 12,
            }
          : { display: 'flex', flexDirection: 'column', gap: 12 }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: mobiel ? undefined : 'var(--font-ui)',
            fontSize: mobiel ? 15 : 13.5,
            fontWeight: mobiel ? 600 : 500,
            color: 'var(--fg)',
          }}>
            Pushmeldingen op dit apparaat
          </div>
          <div style={{ fontSize: 12.5, color: '#6b757c', marginTop: 3, lineHeight: 1.45 }}>
            {uitleg}
          </div>
        </div>

        <span style={{
          fontSize: 13, fontWeight: 600, color: statusKleur, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {aan && (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {statusTekst}
        </span>
      </div>

      {moetAanzetten && (
        <button
          type="button"
          disabled={bezig}
          onClick={aanzetten}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '14px 16px' : '9px 16px',
            borderRadius: mobiel ? 12 : 8,
            background: '#009439', color: '#fff', border: 'none',
            fontSize: mobiel ? 15 : 13, fontWeight: 700,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? 'Bezig…' : 'Meldingen aanzetten'}
        </button>
      )}

      {aan && (
        <button
          type="button"
          disabled={bezig}
          onClick={testMelding}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '13px 16px' : '8px 14px',
            borderRadius: mobiel ? 12 : 8,
            background: 'transparent', color: 'var(--fg)',
            border: '1px solid var(--border)',
            fontSize: mobiel ? 15 : 13, fontWeight: 600,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? 'Bezig…' : 'Testmelding sturen'}
        </button>
      )}

      {opTeLossen && (
        <button
          type="button"
          disabled={bezig}
          onClick={hercontroleer}
          style={{
            alignSelf: mobiel ? 'stretch' : 'flex-start',
            padding: mobiel ? '13px 16px' : '8px 14px',
            borderRadius: mobiel ? 12 : 8,
            background: 'transparent', color: 'var(--fg)',
            border: '1px solid var(--border)',
            fontSize: mobiel ? 15 : 13, fontWeight: 600,
            cursor: 'pointer', opacity: bezig ? 0.6 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? 'Bezig…' : 'Opnieuw controleren'}
        </button>
      )}

      {fout && (
        <p style={{ fontSize: 12.5, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{fout}</p>
      )}
    </div>
  )
}
