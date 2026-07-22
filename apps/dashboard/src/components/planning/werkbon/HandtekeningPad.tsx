'use client'

import { useRef, useEffect } from 'react'

type Props = {
  onChange: (dataUrl: string | null) => void
  /** Hoogte van het tekenvlak in CSS-pixels. Ruimer op een telefoon dan op een bureaublad. */
  hoogte?: number
}

export default function HandtekeningPad({ onChange, hoogte = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tekenend  = useRef(false)
  const heeftData = useRef(false)
  // Via een ref, zodat het opnieuw opmeten niet aan de identiteit van `onChange` hangt.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Canvas-buffer afstemmen op de wérkelijke weergavebreedte × devicePixelRatio. Zonder dit loopt
  // de teken-coördinaat (CSS-px uit getBoundingClientRect) niet gelijk met de buffer — die stond
  // hard op 360×140 terwijl het element `width: 100%` is. Op een telefoon van 393px kwam de lijn
  // daardoor verschoven en uitgerekt onder je vinger uit. Zelfde fix als in FieldRenderer.
  useEffect(() => {
    function meetOp() {
      const c = canvasRef.current
      if (!c) return
      const cssW = c.clientWidth || 300
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(cssW * dpr)
      c.height = Math.round(hoogte * dpr)
      // LET OP: het toewijzen van canvas.width/height wist de inhoud én reset de
      // context-transform. De penstijl moet dus hierna opnieuw gezet worden.
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // De handtekening is zojuist gewist. Meld dat terug, anders denkt het formulier dat er nog
      // een handtekening staat terwijl het vlak leeg is (bijv. na het draaien van de telefoon).
      if (heeftData.current) {
        heeftData.current = false
        onChangeRef.current(null)
      }
    }

    meetOp()
    window.addEventListener('resize', meetOp)
    window.addEventListener('orientationchange', meetOp)
    return () => {
      window.removeEventListener('resize', meetOp)
      window.removeEventListener('orientationchange', meetOp)
    }
  }, [hoogte])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    tekenend.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!tekenend.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    heeftData.current = true
  }

  function onPointerUp() {
    tekenend.current = false
    if (heeftData.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  function wissen() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    heeftData.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: '#fafafa',
          touchAction: 'none',
          cursor: 'crosshair',
          width: '100%',
          height: hoogte,
          display: 'block',
        }}
      />
      <button
        type="button"
        className="eva-btn-ghost"
        onClick={wissen}
        style={{ marginTop: 6, fontSize: 11 }}
      >
        Opnieuw tekenen
      </button>
    </div>
  )
}
