'use client'

import { useEffect, useState } from 'react'
import { useLocatie, herstelUitleg, laatsteLocatie } from '@/lib/locatie/toestemming'
import {
  herstelUitleg as cameraHerstelUitleg,
  leesStatus as leesCameraStatus,
  onthoudenStatus as onthoudenCameraStatus,
  vraagToestemming as vraagCamera,
  type CameraStatus,
} from '@/lib/materieel/camera'

/**
 * Toestemmingen-blok op "Mijn gegevens" (EVA Mobiel).
 *
 * Waarom hier: locatie en camera worden normaal pas midden in het werk gevraagd —
 * bij een GPS-veld op locatie, of met een rol stickers in je hand voor de scanner.
 * Daar is de vraag het lastigst te beantwoorden: geen bereik, handschoenen aan,
 * en bij twijfel tikt iedereen "niet toestaan". Op deze pagina kan de monteur het
 * één keer rustig regelen; daarna onthoudt de browser het.
 *
 * Het blok toont ook wanneer een toestemming geweigerd is — dat is de enige stand
 * die EVA zelf niet kan herstellen, dus daar hoort uitleg bij in plaats van een
 * knop die het toch weer probeert.
 */
export default function ToestemmingenBlok() {
  const { status, bezig, fout, locatie, vraagLocatie } = useLocatie()
  const [bewaard, setBewaard] = useState<boolean>(false)
  const [geinstalleerd, setGeinstalleerd] = useState<boolean | null>(null)

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('onbekend')
  const [cameraEerder, setCameraEerder] = useState<CameraStatus>('onbekend')
  const [cameraBezig, setCameraBezig] = useState(false)

  useEffect(() => {
    setBewaard(laatsteLocatie(Infinity) !== null)
    // Draait EVA als geïnstalleerde app? Op iOS is dat bepalend: alleen dán houdt het
    // toestel de toestemmingen vast over sessies heen.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setGeinstalleerd(!!standalone)
  }, [locatie])

  useEffect(() => {
    setCameraEerder(onthoudenCameraStatus())
    leesCameraStatus().then(setCameraStatus)
  }, [])

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

  const locatieTekst =
    status === 'toegestaan' ? 'Toegestaan'
    : status === 'geweigerd' ? 'Geweigerd'
    : status === 'vragen' ? 'Nog niet gegeven'
    : bewaard ? 'Eerder gebruikt' : 'Nog niet gegeven'

  async function regelCamera() {
    setCameraBezig(true)
    setCameraStatus(await vraagCamera())
    setCameraBezig(false)
  }

  return (
    <div style={{
      padding: 16, background: 'var(--bg-elev)',
      border: '1px solid var(--border)', borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>Toestemmingen</div>

      <Regel
        naam="Locatie"
        uitleg="Voor GPS-velden in formulieren en werkbonnen."
        status={status === 'toegestaan' ? 'toegestaan' : status === 'geweigerd' ? 'geweigerd' : 'vragen'}
        tekst={locatieTekst}
      />

      {status !== 'toegestaan' && status !== 'geweigerd' && (
        <Knop bezig={bezig} onClick={() => vraagLocatie({ vernieuwen: true })} />
      )}

      {status === 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{herstelUitleg()}</p>
      )}

      {fout && status !== 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0 }}>{fout.message}</p>
      )}

      <div style={{ height: 1, background: 'var(--border)' }} />

      <Regel
        naam="Camera"
        uitleg="Voor het scannen van QR-stickers op materieel."
        status={cameraStatus === 'toegestaan' ? 'toegestaan' : cameraStatus === 'geweigerd' ? 'geweigerd' : 'vragen'}
        tekst={
          cameraStatus === 'toegestaan' ? 'Toegestaan'
          : cameraStatus === 'geweigerd' ? 'Geweigerd'
          : 'Nog niet gegeven'
        }
      />

      {cameraStatus !== 'toegestaan' && cameraStatus !== 'geweigerd' && (
        <Knop bezig={cameraBezig} onClick={regelCamera} />
      )}

      {/* Ook tonen als de browser de stand niet kan uitlezen maar het de vorige
          keer wél mis ging: dan is dit precies de uitleg die iemand zoekt. De
          knop blijft er dan naast staan, want misschien is het al opgelost. */}
      {(cameraStatus === 'geweigerd' || (cameraStatus === 'onbekend' && cameraEerder === 'geweigerd')) && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{cameraHerstelUitleg()}</p>
      )}

      {isIOS && geinstalleerd === false && (
        <p style={{ fontSize: 13, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
          Tip: zet EVA op je beginscherm (deelknop → &quot;Zet op beginscherm&quot;). In Safari zelf
          vervallen locatie- en cameratoestemming aan het eind van de dag — daarom vraagt de
          scanner er dan steeds opnieuw om. In de geïnstalleerde app blijven ze staan.
        </p>
      )}

      <p style={{ fontSize: 12, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
        Foto&apos;s maken bij een formulier of een stuk materieel loopt via de camera-app van de
        telefoon en vraagt geen aparte toestemming in EVA.
      </p>
    </div>
  )
}

function Regel({
  naam, uitleg, status, tekst,
}: {
  naam: string
  uitleg: string
  status: 'toegestaan' | 'geweigerd' | 'vragen'
  tekst: string
}) {
  const kleur = status === 'toegestaan' ? '#067647' : status === 'geweigerd' ? '#b42318' : '#6b757c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--fg)' }}>{naam}</div>
        <div style={{ fontSize: 13, color: '#6b757c', marginTop: 2 }}>{uitleg}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: kleur, flexShrink: 0 }}>{tekst}</span>
    </div>
  )
}

function Knop({ bezig, onClick }: { bezig: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={bezig}
      onClick={onClick}
      style={{
        width: '100%', padding: '13px 16px', borderRadius: 12,
        background: '#009439', color: '#fff', border: 'none',
        fontSize: 15, fontWeight: 600, opacity: bezig ? 0.6 : 1,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {bezig ? 'Bezig…' : 'Toestemming geven'}
    </button>
  )
}
