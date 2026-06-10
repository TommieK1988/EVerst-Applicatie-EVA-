'use client'

import { useRef, useEffect, useCallback } from 'react'

type Props = {
  onChange: (dataUrl: string | null) => void
}

export default function HandtekeningPad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tekenend  = useRef(false)
  const heeftData = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

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
        width={360}
        height={140}
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
