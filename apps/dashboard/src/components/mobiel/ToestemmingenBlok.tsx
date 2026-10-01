'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocatie, laatsteLocatie, type LocatieFoutSoort } from '@/lib/locatie/toestemming'
import {
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
/**
 * Soort toestel voor de herstel-uitleg. Zelfde indeling als `herstelUitleg()` in
 * `lib/locatie/toestemming` en `lib/materieel/camera`; die geven Nederlandse tekst
 * (ze draaien ook op kantoor), hier staat dezelfde uitleg in de taal van de app.
 */
function toestelSoort(): 'ios' | 'android' | 'anders' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'anders'
}

const LOCATIE_FOUT: Record<LocatieFoutSoort, 'geenGps' | 'geweigerd' | 'geenFix' | 'teTraag'> = {
  'geen-gps': 'geenGps',
  geweigerd: 'geweigerd',
  'geen-fix': 'geenFix',
  'te-traag': 'teTraag',
}

export default function ToestemmingenBlok() {
  const t = useTranslations('profiel.toestemmingen')
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
    status === 'toegestaan' ? t('toegestaan')
    : status === 'geweigerd' ? t('geweigerd')
    : status === 'vragen' ? t('nogNietGegeven')
    : bewaard ? t('eerderGebruikt') : t('nogNietGegeven')

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
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{t('titel')}</div>

      <Regel
        naam={t('locatie')}
        uitleg={t('locatieUitleg')}
        status={status === 'toegestaan' ? 'toegestaan' : status === 'geweigerd' ? 'geweigerd' : 'vragen'}
        tekst={locatieTekst}
      />

      {status !== 'toegestaan' && status !== 'geweigerd' && (
        <Knop bezig={bezig} onClick={() => vraagLocatie({ vernieuwen: true })} bezigTekst={t('bezig')} tekst={t('geven')} />
      )}

      {status === 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{t(`locatieHerstel.${toestelSoort()}`)}</p>
      )}

      {fout && status !== 'geweigerd' && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0 }}>{t(`locatieFout.${LOCATIE_FOUT[fout.soort]}`)}</p>
      )}

      <div style={{ height: 1, background: 'var(--border)' }} />

      <Regel
        naam={t('camera')}
        uitleg={t('cameraUitleg')}
        status={cameraStatus === 'toegestaan' ? 'toegestaan' : cameraStatus === 'geweigerd' ? 'geweigerd' : 'vragen'}
        tekst={
          cameraStatus === 'toegestaan' ? t('toegestaan')
          : cameraStatus === 'geweigerd' ? t('geweigerd')
          : t('nogNietGegeven')
        }
      />

      {cameraStatus !== 'toegestaan' && cameraStatus !== 'geweigerd' && (
        <Knop bezig={cameraBezig} onClick={regelCamera} bezigTekst={t('bezig')} tekst={t('geven')} />
      )}

      {/* Ook tonen als de browser de stand niet kan uitlezen maar het de vorige
          keer wél mis ging: dan is dit precies de uitleg die iemand zoekt. De
          knop blijft er dan naast staan, want misschien is het al opgelost. */}
      {(cameraStatus === 'geweigerd' || (cameraStatus === 'onbekend' && cameraEerder === 'geweigerd')) && (
        <p style={{ fontSize: 13, color: '#b42318', margin: 0, lineHeight: 1.5 }}>{t(`cameraHerstel.${toestelSoort()}`)}</p>
      )}

      {isIOS && geinstalleerd === false && (
        <p style={{ fontSize: 13, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
          {t('tipIos')}
        </p>
      )}

      <p style={{ fontSize: 12, color: '#6b757c', margin: 0, lineHeight: 1.5 }}>
        {t('fotos')}
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

function Knop({ bezig, onClick, tekst, bezigTekst }: {
  bezig: boolean
  onClick: () => void
  tekst: string
  bezigTekst: string
}) {
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
      {bezig ? bezigTekst : tekst}
    </button>
  )
}
