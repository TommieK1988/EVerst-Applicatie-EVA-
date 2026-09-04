'use client'

import React from 'react'
import jsQR from 'jsqr'
import { GRIJS, RAND, ROOD, secundaireKnop } from './stijl'

/**
 * QR-scanner voor de telefoon: camerabeeld met een richtkader, geeft de gelezen
 * payload door aan `onCode`.
 *
 * Twee leesmethoden, in deze volgorde:
 *  1. `BarcodeDetector` — ingebouwd in Chrome/Android, gebruikt de hardware en
 *     leest ook scheve of kleine codes goed.
 *  2. `jsQR` — pure JavaScript op de frames van een canvas. Nodig voor Safari
 *     (iPhone/iPad), dat `BarcodeDetector` niet heeft. Zonder deze terugval zou
 *     de helft van de buitendienst niets kunnen scannen.
 *
 * De camera loopt in een `requestAnimationFrame`-lus, niet op een timer: die
 * lus pauzeert vanzelf als het scherm op de achtergrond gaat, zodat een telefoon
 * in iemands zak niet leegloopt.
 *
 * Bewust géén onderdeel van dit component: wat er met de code moet gebeuren.
 * Opzoeken en doorsturen doet het scherm eromheen.
 */

/** Minimale vorm van de (nog niet overal getypeerde) BarcodeDetector-API. */
type BarcodeDetectorAchtig = {
  detect: (bron: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type BarcodeDetectorCtor = new (opties: { formats: string[] }) => BarcodeDetectorAchtig

export default function QrScanner({
  onCode,
  bezig = false,
  hint = 'Richt op de QR-code van de sticker',
}: {
  /** Wordt één keer per gelezen code aangeroepen. */
  onCode: (payload: string) => void
  /** Zet de lus stil terwijl het scherm de vorige code verwerkt. */
  bezig?: boolean
  hint?: string
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const gestopt = React.useRef(false)
  /** Voorkomt dat één sticker tijdens het richten tien keer wordt gemeld. */
  const laatsteCode = React.useRef<string>('')

  const [fout, setFout] = React.useState<string | null>(null)
  const [lampAan, setLampAan] = React.useState(false)
  const [heeftLamp, setHeeftLamp] = React.useState(false)

  // `onCode` in een ref: anders herstart de camera bij elke render van de ouder.
  const onCodeRef = React.useRef(onCode)
  onCodeRef.current = onCode
  const bezigRef = React.useRef(bezig)
  bezigRef.current = bezig

  React.useEffect(() => {
    gestopt.current = false
    let frame = 0
    let detector: BarcodeDetectorAchtig | null = null

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFout('Deze telefoon of browser geeft geen toegang tot de camera. Typ de code van de sticker over.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` en niet `exact`: op een laptop of een toestel zonder
          // achtercamera zou `exact` de hele scanner laten falen.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (gestopt.current) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        // iOS speelt alleen af als het element inline en gedempt staat; die
        // attributen staan ook in de JSX, dit is de programmatische kant.
        await video.play().catch(() => undefined)

        const track = stream.getVideoTracks()[0]
        const mogelijk = track?.getCapabilities?.() as { torch?: boolean } | undefined
        setHeeftLamp(!!mogelijk?.torch)

        const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
        if (Ctor) {
          try { detector = new Ctor({ formats: ['qr_code'] }) } catch { detector = null }
        }

        frame = requestAnimationFrame(lees)
      } catch (e) {
        const naam = (e as { name?: string }).name
        setFout(
          naam === 'NotAllowedError'
            ? 'Geen toegang tot de camera. Sta camera toe voor EVA in de instellingen van je telefoon.'
            : 'De camera start niet. Typ de code van de sticker over.',
        )
      }
    }

    async function lees() {
      if (gestopt.current) return
      const video = videoRef.current
      const canvas = canvasRef.current

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !bezigRef.current) {
        const breedte = video.videoWidth
        const hoogte = video.videoHeight
        if (breedte > 0 && hoogte > 0) {
          canvas.width = breedte
          canvas.height = hoogte
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(video, 0, 0, breedte, hoogte)
            let payload: string | null = null

            if (detector) {
              try {
                const treffers = await detector.detect(canvas)
                payload = treffers[0]?.rawValue ?? null
              } catch {
                // Detector klapt om (bijv. onbekend formaat) → verder met jsQR.
                detector = null
              }
            }
            if (!payload) {
              const beeld = ctx.getImageData(0, 0, breedte, hoogte)
              payload = jsQR(beeld.data, breedte, hoogte, { inversionAttempts: 'attemptBoth' })?.data ?? null
            }

            if (payload && payload !== laatsteCode.current) {
              laatsteCode.current = payload
              if (navigator.vibrate) navigator.vibrate(40)
              onCodeRef.current(payload)
            }
          }
        }
      }
      if (!gestopt.current) frame = requestAnimationFrame(lees)
    }

    start()

    return () => {
      gestopt.current = true
      cancelAnimationFrame(frame)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  async function wisselLamp() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const aan = !lampAan
    try {
      // `torch` staat nog niet in de standaard-typings van MediaTrackConstraints.
      await track.applyConstraints({ advanced: [{ torch: aan }] } as unknown as MediaTrackConstraints)
      setLampAan(aan)
    } catch {
      setHeeftLamp(false)
    }
  }

  if (fout) {
    return (
      <div style={{
        padding: 16, borderRadius: 12, border: `1px solid ${RAND}`,
        background: 'rgba(180,35,24,.06)', color: ROOD, fontSize: 14, lineHeight: 1.45,
      }}>
        {fout}
      </div>
    )
  }

  return (
    <div>
      <div style={{
        position: 'relative', borderRadius: 16, overflow: 'hidden',
        background: '#000', aspectRatio: '3 / 4',
      }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {/* Richtkader: puur visueel — er wordt op het hele beeld gezocht, want
            een half afgesneden QR levert niets op en frustreert alleen maar. */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none',
          }}
        >
          <div style={{
            width: '62%', aspectRatio: '1 / 1', borderRadius: 18,
            border: '3px solid rgba(255,255,255,.9)',
            boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
          }} />
        </div>
        {heeftLamp && (
          <button
            type="button"
            onClick={wisselLamp}
            style={{
              position: 'absolute', right: 12, bottom: 12,
              padding: '10px 14px', borderRadius: 999, border: 'none',
              background: lampAan ? '#fff' : 'rgba(0,0,0,.55)',
              color: lampAan ? '#111' : '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            {lampAan ? 'Lamp uit' : 'Lamp aan'}
          </button>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <p style={{ margin: '10px 2px 0', fontSize: 13, color: GRIJS, textAlign: 'center' }}>
        {bezig ? 'Even zoeken…' : hint}
      </p>
      {/* Na een treffer blijft de laatste code onthouden zodat dezelfde sticker
          niet blijft vuren. Opnieuw scannen van hetzelfde object kan hiermee. */}
      <button
        type="button"
        onClick={() => { laatsteCode.current = '' }}
        style={{ ...secundaireKnop, width: '100%', marginTop: 10 }}
      >
        Opnieuw scannen
      </button>
    </div>
  )
}
