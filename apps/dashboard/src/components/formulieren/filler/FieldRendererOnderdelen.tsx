'use client'

import React, { useRef, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocatie, toestelSoort, LOCATIE_FOUT_SLEUTEL } from '@/lib/locatie/toestemming'

// Onderdelen van FieldRenderer (foto's bij een aandachtspunt, locatie, sterren, handtekening).
// Losgehaald zodat FieldRenderer niet verder boven de 800 regels groeit.

// ── Foto's bij een aandachtspunt ──────────────────────────────────────
//
// Anders dan het `photo`-veld slaan we hier géén data-URL op: de foto gaat meteen naar de opslag en
// alleen de URL komt in de inzending. Dat houdt de payload klein genoeg om te kunnen versturen.

export function AandachtspuntFotos({
  fotos, max, onFotoUpload, onChange,
}: {
  fotos: string[]
  max: number
  onFotoUpload?: (file: File) => Promise<string | null>
  onChange: (fotos: string[]) => void
}) {
  const t = useTranslations('formulieren')
  const [bezig, setBezig] = useState(0)
  const [fout, setFout] = useState<string | null>(null)

  async function kies(e: React.ChangeEvent<HTMLInputElement>) {
    if (!onFotoUpload) return
    const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, max - fotos.length))
    e.target.value = ''
    if (files.length === 0) return

    setFout(null)
    setBezig(n => n + files.length)
    const urls: string[] = []
    for (const file of files) {
      try {
        const url = await onFotoUpload(file)
        if (url) urls.push(url)
        else setFout(t('veld.fotoUploadMislukt'))
      } catch {
        setFout(t('veld.fotoUploadMislukt'))
      } finally {
        setBezig(n => n - 1)
      }
    }
    if (urls.length) onChange([...fotos, ...urls])
  }

  const vol = fotos.length + bezig >= max

  return (
    <div style={{ marginTop: 8 }}>
      {(fotos.length > 0 || bezig > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {fotos.map((url, i) => (
            <div key={url} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  background: 'rgba(0,0,0,0.5)', border: 'none',
                  borderRadius: '50%', width: 18, height: 18,
                  color: 'white', cursor: 'pointer', fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>
          ))}
          {Array.from({ length: bezig }).map((_, i) => (
            <div
              key={`bezig-${i}`}
              style={{
                width: 64, height: 64, borderRadius: 6,
                border: '1px dashed var(--border)', background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'var(--text-muted)',
              }}
            >…</div>
          ))}
        </div>
      )}

      {!onFotoUpload ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          {t('veld.fotosInEchtFormulier')}
        </p>
      ) : !vol && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 7,
          border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {t('veld.fotoToevoegen')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={kies}
          />
        </label>
      )}

      {fout && <p style={{ fontSize: 12, color: '#e53e3e', margin: '4px 0 0' }}>{fout}</p>}
    </div>
  )
}

// ── Locatie / GPS ─────────────────────────────────────────────────────

export type LocatieWaarde = { lat: number; lng: number; adres?: string } | null

const locatieKnop: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 13, cursor: 'pointer',
}

function LocatiePin({ maat = 14 }: { maat?: number }) {
  return (
    <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
      <circle cx="12" cy="11" r="3"/>
    </svg>
  )
}

/**
 * GPS-veld. Haalt de locatie op via `lib/locatie/toestemming`, die een net opgehaalde
 * positie hergebruikt — daardoor levert een reeks velden op hetzelfde adres hooguit één
 * toestemmingsvraag op in plaats van één per veld.
 */
export function LocatieVeld({ value, onChange }: { value: LocatieWaarde; onChange: (v: unknown) => void }) {
  const t = useTranslations('formulieren')
  const { status, bezig, fout, vraagLocatie } = useLocatie()

  async function pak(vernieuwen = false) {
    const fix = await vraagLocatie({ vernieuwen })
    if (fix) onChange({ lat: fix.lat, lng: fix.lng })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value ? (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--surface-2)', fontSize: 13 }}>
          📍 {value.adres ?? `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`}
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
          >
            {t('veld.wissen')}
          </button>
        </div>
      ) : (
        <button type="button" disabled={bezig} onClick={() => pak(false)} style={{ ...locatieKnop, opacity: bezig ? 0.6 : 1 }}>
          <LocatiePin />
          {bezig ? t('veld.locatieOphalen') : t('veld.huidigeLocatie')}
        </button>
      )}

      {fout && (
        <p style={{ fontSize: 12, color: '#e53e3e', margin: 0 }}>
          {t(`veld.locatieFout.${LOCATIE_FOUT_SLEUTEL[fout.soort]}`)}
          {status === 'geweigerd' && <> {t(`veld.locatieHerstel.${toestelSoort()}`)}</>}
          {/* Geen fix maar wel iets bekends: aanbieden in plaats van de gebruiker laten hangen. */}
          {fout.laatstBekend && fout.soort !== 'geweigerd' && (
            <button
              type="button"
              onClick={() => onChange({ lat: fout.laatstBekend!.lat, lng: fout.laatstBekend!.lng })}
              style={{ marginLeft: 6, background: 'none', border: 'none', padding: 0, color: 'var(--text)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}
            >
              {t('veld.laatstBekendeLocatie')}
            </button>
          )}
        </p>
      )}
    </div>
  )
}

// ── Sterren-rating ────────────────────────────────────────────────────

export function SterrenRating({
  opties, huidig, accent, readOnly, mobiel, onChange,
}: {
  opties: number[]
  huidig: number | null
  accent: string
  readOnly?: boolean
  mobiel?: boolean
  onChange: (v: number | null) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const maat = mobiel ? 34 : 28
  const actiefTot = hover ?? huidig ?? 0
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {opties.map(n => {
        const gevuld = n <= actiefTot
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n}`}
            aria-pressed={huidig === n}
            onClick={() => onChange(huidig === n ? null : n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            style={{
              background: 'none', border: 'none', padding: 0, lineHeight: 0,
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            <svg
              width={maat} height={maat} viewBox="0 0 24 24"
              fill={gevuld ? accent : 'none'}
              stroke={gevuld ? accent : 'var(--border)'}
              strokeWidth={1.5}
            >
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
        )
      })}
    </div>
  )
}

// ── Handtekening-component ────────────────────────────────────────────

const SIG_HEIGHT = 160

export function SignaturePad({ onSave }: { onSave: (data: string) => void }) {
  const t = useTranslations('formulieren')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const hasData   = useRef(false)

  // Canvas-buffer afstemmen op de werkelijke (responsive) weergavebreedte ×
  // devicePixelRatio. Zónder dit loopt de teken-coördinaat (CSS-px) niet gelijk
  // met de buffer (was hard 560px), wat de lijn verschoven/uitgerekt maakte op
  // smalle schermen. Configureert tevens de penstijl; canvas.width-toewijzing
  // reset namelijk de context-transform.
  function sizeCanvas() {
    const c = canvasRef.current
    if (!c) return
    const cssW = c.clientWidth || 300
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(cssW * dpr)
    c.height = Math.round(SIG_HEIGHT * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    hasData.current = false
  }

  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    window.addEventListener('orientationchange', sizeCanvas)
    return () => {
      window.removeEventListener('resize', sizeCanvas)
      window.removeEventListener('orientationchange', sizeCanvas)
    }
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasData.current = true
  }

  function onUp() {
    drawing.current = false
    if (hasData.current && canvasRef.current) {
      onSave(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clear() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    // wis in buffer-coördinaten
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.restore()
    hasData.current = false
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 7,
          background: '#fafafa',
          touchAction: 'none',
          cursor: 'crosshair',
          width: '100%',
          height: SIG_HEIGHT,
          display: 'block',
        }}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          marginTop: 6, fontSize: 12, color: 'var(--text-muted)',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        {t('veld.leegmaken')}
      </button>
    </div>
  )
}
