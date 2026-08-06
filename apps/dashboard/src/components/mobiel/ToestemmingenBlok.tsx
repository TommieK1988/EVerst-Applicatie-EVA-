'use client'

import { useEffect, useState } from 'react'
import { useLocatie, herstelUitleg, laatsteLocatie } from '@/lib/locatie/toestemming'

/**
 * Toestemmingen-blok op "Mijn gegevens" (EVA Mobiel).
 *
 * Waarom hier: de locatievraag komt normaal pas midden in een formulier op locatie, en
 * daar is hij het lastigst te beantwoorden — geen bereik, handschoenen aan, en bij twijfel
 * tikt iedereen "niet toestaan". Op deze pagina kan de monteur het één keer rustig
 * regelen; daarna onthoudt de browser het en vraagt EVA er niet meer om.
 *
 * Het blok toont ook wanneer de toestemming geweigerd is — dat is de enige stand die EVA
 * zelf niet kan herstellen, dus daar hoort uitleg bij in plaats van een knop die het toch
 * weer probeert.
 */
export default function ToestemmingenBlok() {
  const { status, bezig, fout, locatie, vraagLocatie } = useLocatie()
  const [bewaard, setBewaard] = useState<boolean>(false)
  const [geinstalleerd, setGeinstalleerd] = useState<boolean | null>(null)

  useEffect(() => {
    setBewaard(laatsteLocatie(Infinity) !== null)
    // Draait EVA als geïnstalleerde app? Op iOS is dat bepalend: alleen dán houdt het
    // toestel de toestemming vast over sessies heen.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setGeinstalleerd(!!standalone)
  }, [locatie])

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

  const kleur =
    status === 'toegestaan' ? '#067647'
    : status === 'geweigerd' ? '#b42318'
    : '#6b757c'

  const tekst =
    status === 'toegestaan' ? 'Toegestaan'
    : status === 'geweigerd' ? 'Geweigerd'
    : status === 'vragen' ? 'Nog niet gegeven'
    : bewaard ? 'Eerder gebruikt' : 'Nog niet gegeven'

  return (
    <div style={{
      padding: 16, background: 'var(--bg-elev)',
      border: '1px solid var(--border)', borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>Toestemmingen</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>Locatie</div>
          <div style={{ fontSize: 13, color: '#6b757c', marginTop: 2 }}>
            Voor GPS-velden in formulieren en werkbonnen.
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: kleur, flexShrink: 0 }}>{tekst}</span>
      </div>

      {status !== 'toegestaan' && status !== 'geweigerd' && (
        <button
          type="button"
          disabled={bezig}
          onClick={() => vraagLocatie({ vernieuwen: true })}
          style={{
            width: '100%', padding: '13px 16px', borderRadius: 12,
            background: '#009439', color: '#fff', border: 'none',
            fontSize: 15, fontWeight: 600, opacity: bezig ? 0.6 : 1,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {bezig ? 'Bezig…' : 'Toestemming geven'}
        </button>
      )}

      {status === 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{herstelUitleg()}</p>
      )}

      {fout && status !== 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0 }}>{fout.message}</p>
      )}

      {isIOS && geinstalleerd === false && (
        <p style={{ fontSize: 13, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
          Tip: zet EVA op je beginscherm (deelknop → &quot;Zet op beginscherm&quot;). In Safari zelf
          vervalt de locatietoestemming aan het eind van de dag; in de geïnstalleerde app blijft
          hij staan.
        </p>
      )}

      <p style={{ fontSize: 12, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
        Foto&apos;s maken werkt via de camera-app van de telefoon en vraagt geen aparte toestemming
        in EVA.
      </p>
    </div>
  )
}
