'use client'

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { usePush, isIOS, isGeinstalleerd } from '@/lib/push/client'

/**
 * Aan/uit-schakelaar voor pushmeldingen op dít apparaat.
 *
 * Staat op twee plekken: "Mijn gegevens" in EVA Mobiel (weergave 'mobiel') en
 * "Mijn account" op de desktop (weergave 'desktop'). Het is bewust een instelling
 * per apparaat en niet per gebruiker: je wilt de meldingen op je telefoon, niet ook
 * nog eens op de balie-pc waar je 's ochtends toevallig hebt ingelogd.
 *
 * De testknop is geen luxe — als push níét werkt merk je dat anders pas op het
 * moment dat je een melding mist.
 */
export default function PushMeldingen({ weergave = 'desktop' }: { weergave?: 'mobiel' | 'desktop' }) {
  const { status, bezig, fout, aanzetten, uitzetten, testen, hercontroleer } = usePush()
  const [apparaat, setApparaat] = useState<'ios' | 'anders'>('anders')

  useEffect(() => {
    setApparaat(isIOS() ? 'ios' : 'anders')
  }, [])

  const aan = status === 'aan'
  const schakelbaar = status === 'uit' || status === 'aan'
  // Standen die de gebruiker buiten EVA om kan oplossen; dan hoort er een knop
  // bij om opnieuw te kijken, want de browser meldt zo'n wijziging niet.
  const opTeLossen = status === 'geweigerd' || status === 'installeren'

  const statusTekst =
    status === 'laden'            ? 'Controleren…'
    : status === 'aan'            ? 'Aan op dit apparaat'
    : status === 'uit'            ? 'Uit'
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
      ? 'Op de iPhone kan alleen de geïnstalleerde app meldingen geven. Tik onderin op de deelknop en kies "Zet op beginscherm"; open EVA daarna via dat icoon en zet deze schakelaar aan.'
    : status === 'geweigerd'
      ? apparaat === 'ios'
        ? 'Meldingen zijn voor EVA geblokkeerd. iOS onthoudt een weigering en vraagt het niet nog een keer: zet het aan via Instellingen → EVA → Berichtgeving. Staat EVA daar niet tussen, verwijder het icoon dan van je beginscherm en zet het er opnieuw op — daarna mag EVA het opnieuw vragen.'
        : 'Meldingen zijn voor EVA geblokkeerd. Dat kan EVA niet zelf terugzetten. In Chrome: tik op het slotje of de instellingen naast het webadres → Meldingen → Toestaan. In de geïnstalleerde app: Instellingen → Apps → EVA → Meldingen.'
    : status === 'geen-sw'
      ? 'Pushmeldingen werken in de gepubliceerde app. In een testomgeving op je eigen pc draait de achtergronddienst niet.'
    : status === 'niet-ondersteund'
      ? 'Deze browser kan geen pushmeldingen ontvangen. Op de iPhone lukt het vanaf iOS 16.4, mits EVA op het beginscherm staat.'
    : 'Je krijgt meldingen op dit apparaat, ook als EVA dicht staat.'

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

        {schakelbaar ? (
          <button
            role="switch"
            aria-checked={aan}
            aria-label="Pushmeldingen op dit apparaat"
            disabled={bezig}
            onClick={() => (aan ? uitzetten() : aanzetten())}
            style={{
              position: 'relative', width: 46, height: 28, flexShrink: 0,
              borderRadius: 99, border: 'none', padding: 0,
              cursor: bezig ? 'progress' : 'pointer',
              opacity: bezig ? 0.6 : 1,
              background: aan ? '#009439' : '#c7ced2',
              transition: 'background 140ms', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: aan ? 21 : 3,
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              transition: 'left 140ms', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }} />
          </button>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: statusKleur, flexShrink: 0 }}>
            {statusTekst}
          </span>
        )}
      </div>

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
