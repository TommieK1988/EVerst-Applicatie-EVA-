'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { rectifyImage, type Point } from '@/lib/homography'
import { Scan, X, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  /** Bron-afbeelding als data-URL of http(s)-URL */
  imageSrc: string
  /** Werkelijke gevel-afmetingen in meters; bepalen de aspect-ratio van het output-beeld */
  widthMeters: number
  heightMeters: number
  /** Wordt aangeroepen met de data-URL van het gerectificeerde beeld (image/jpeg) */
  onRectified: (rectifiedDataUrl: string) => void
  onCancel: () => void
}

const HANDLE_LABELS = ['Linksboven', 'Rechtsboven', 'Rechtsonder', 'Linksonder']

export function PerspectiveCorrector({
  imageSrc,
  widthMeters,
  heightMeters,
  onRectified,
  onCancel,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)

  // Initialiseer de 4 hoeken op een kwart-inset zodra de afbeelding geladen is.
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    function onLoad() {
      const w = img!.naturalWidth
      const h = img!.naturalHeight
      setDims({ w, h })
      const inset = 0.1
      setPoints([
        { x: w * inset, y: h * inset },
        { x: w * (1 - inset), y: h * inset },
        { x: w * (1 - inset), y: h * (1 - inset) },
        { x: w * inset, y: h * (1 - inset) },
      ])
    }
    if (img.complete) onLoad()
    else img.addEventListener('load', onLoad)
    return () => img?.removeEventListener('load', onLoad)
  }, [imageSrc])

  function svgPointFromEvent(e: React.PointerEvent<SVGSVGElement>): Point | null {
    const svg = svgRef.current
    if (!svg || !dims) return null
    const rect = svg.getBoundingClientRect()
    const scaleX = dims.w / rect.width
    const scaleY = dims.h / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function onPointerDown(index: number) {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      setDragging(index)
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragging === null || !dims) return
    const p = svgPointFromEvent(e)
    if (!p) return
    const clamped: Point = {
      x: Math.max(0, Math.min(dims.w, p.x)),
      y: Math.max(0, Math.min(dims.h, p.y)),
    }
    setPoints((prev) => prev.map((pt, i) => (i === dragging ? clamped : pt)))
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragging !== null) {
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      setDragging(null)
    }
  }

  async function handleRectify() {
    const img = imgRef.current
    if (!img || points.length !== 4) return
    setProcessing(true)
    try {
      // Bepaal output-resolutie op basis van werkelijke aspect ratio (begrens op 1600 px lang).
      const aspect = widthMeters / heightMeters
      const maxDim = 1600
      const outW = aspect >= 1 ? maxDim : Math.round(maxDim * aspect)
      const outH = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim
      // Kleine timeout zodat de UI de spinner kan renderen voor een zware sync-loop.
      await new Promise((r) => setTimeout(r, 20))
      const dataUrl = rectifyImage(img, points, outW, outH)
      if (!dataUrl) {
        toast.error('Rectificatie mislukt — probeer andere hoekpunten')
        return
      }
      onRectified(dataUrl)
    } finally {
      setProcessing(false)
    }
  }

  const polygonStr = points.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Hoeken van de gevel markeren</p>
          <p className="text-xs text-muted-foreground">
            Sleep de 4 punten naar de hoeken van de gevel (linksboven, rechtsboven, rechtsonder, linksonder).
            Claude krijgt daarna een rechtgetrokken beeld.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative w-full overflow-hidden rounded-md border bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Gevel — hoeken markeren"
          className="block w-full select-none"
          draggable={false}
        />
        {dims && points.length === 4 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <polygon
              points={polygonStr}
              fill="rgba(16, 163, 74, 0.15)"
              stroke="#0a7a35"
              strokeWidth={Math.max(2, dims.w / 400)}
            />
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(12, dims.w / 80)}
                  fill="white"
                  stroke="#0a7a35"
                  strokeWidth={Math.max(2, dims.w / 400)}
                  onPointerDown={onPointerDown(i)}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                />
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(10, dims.w / 120)}
                  fontWeight={700}
                  fill="#0a7a35"
                  pointerEvents="none"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {HANDLE_LABELS.map((l, i) => `${i + 1}. ${l}`).join(' · ')}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={processing}>
            Overslaan
          </Button>
          <Button onClick={handleRectify} disabled={processing || points.length !== 4}>
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rectificeren...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                <Scan className="mr-2 h-4 w-4" />
                Rechttrekken en gebruiken
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
