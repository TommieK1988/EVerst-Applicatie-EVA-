'use client'

import { useRef, useState } from 'react'
import type { FacadeDrawing, FacadeElement, FacadeElementKind } from '@/lib/types'

interface Props {
  drawing: FacadeDrawing
  selectedElementId?: string | null
  onSelectElement?: (id: string | null) => void
  /** Wordt aangeroepen tijdens drag/resize van het geselecteerde element */
  onChangeElement?: (id: string, patch: Partial<FacadeElement>) => void
  /** Pixelbreedte (schaal wordt automatisch bepaald) */
  pixelWidth?: number
  showDimensions?: boolean
  showGrid?: boolean
  /** Verdiepingshoogte voor peilmaat-ladder (m), default 2.80 */
  storeyHeightMeters?: number
  /** Laat peilmaatladder rechts zien */
  showPeilmaat?: boolean
  /** Laat maaiveld-arcering onderaan zien */
  showMaaiveld?: boolean
  /** Gevelcode voor auto-nummering (bv. "VG") */
  gevelCode?: string
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw'

interface DragState {
  id: string
  mode: DragMode
  origMetersX: number
  origMetersY: number
  origEl: FacadeElement
}

const ELEMENT_STYLES: Record<FacadeElementKind, { fill: string; stroke: string; label: string }> = {
  window: { fill: 'rgba(100, 180, 230, 0.18)', stroke: '#1976d2', label: 'Raam' },
  door: { fill: 'rgba(140, 100, 60, 0.2)', stroke: '#6d4c2a', label: 'Deur' },
  frame: { fill: 'rgba(180, 180, 180, 0.18)', stroke: '#555', label: 'Kozijn' },
  'concrete-band': { fill: 'rgba(160, 160, 160, 0.5)', stroke: '#444', label: 'Betonband' },
  lintel: { fill: 'rgba(180, 170, 140, 0.55)', stroke: '#6a5a38', label: 'Latei' },
  masonry: { fill: 'rgba(180, 120, 90, 0.15)', stroke: '#8a5236', label: 'Metselwerk' },
  fence: { fill: 'none', stroke: '#333', label: 'Hekwerk' },
  canopy: { fill: 'rgba(120, 120, 120, 0.25)', stroke: '#333', label: 'Luifel' },
  gutter: { fill: 'none', stroke: '#444', label: 'Goot' },
  'roof-edge': { fill: 'none', stroke: '#222', label: 'Dakrand' },
  chimney: { fill: 'rgba(150, 80, 60, 0.4)', stroke: '#5a2e20', label: 'Schoorsteen' },
  other: { fill: 'rgba(200, 200, 200, 0.3)', stroke: '#666', label: 'Overig' },
}

const KIND_CODE: Partial<Record<FacadeElementKind, string>> = {
  window: 'R',
  door: 'D',
  frame: 'K',
  'concrete-band': 'B',
  lintel: 'L',
  masonry: 'M',
  fence: 'H',
  canopy: 'C',
  gutter: 'G',
  'roof-edge': 'DR',
  chimney: 'S',
  other: 'O',
}

function autoNumber(elements: FacadeElement[], el: FacadeElement, gevelCode: string): string {
  if (el.elementNumber) return el.elementNumber
  const code = KIND_CODE[el.kind] ?? 'X'
  const sameKind = elements.filter((e) => e.kind === el.kind)
  const idx = sameKind.findIndex((e) => e.id === el.id)
  return `${gevelCode}-${code}${String(idx + 1).padStart(2, '0')}`
}

export function FacadeDrawingCanvas({
  drawing,
  selectedElementId,
  onSelectElement,
  onChangeElement,
  pixelWidth = 800,
  showDimensions = true,
  showGrid = true,
  storeyHeightMeters = 2.8,
  showPeilmaat = true,
  showMaaiveld = true,
  gevelCode = 'VG',
}: Props) {
  const marginLeft = 60
  const marginRight = showPeilmaat ? 110 : 60
  const marginTop = 60
  const marginBottom = showMaaiveld ? 90 : 60
  const scale = (pixelWidth - marginLeft - marginRight) / drawing.widthMeters
  const drawingHeightPx = drawing.heightMeters * scale
  const totalHeight = drawingHeightPx + marginTop + marginBottom
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  function mx(xMeters: number): number {
    return marginLeft + xMeters * scale
  }
  function my(yMeters: number): number {
    return marginTop + drawingHeightPx - yMeters * scale
  }

  function pointerMeters(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) / rect.width) * pixelWidth
    const sy = ((e.clientY - rect.top) / rect.height) * totalHeight
    return {
      x: (sx - marginLeft) / scale,
      y: (marginTop + drawingHeightPx - sy) / scale,
    }
  }

  function clampPatch(el: FacadeElement, patch: Partial<FacadeElement>): Partial<FacadeElement> {
    const next = { ...el, ...patch }
    const minSize = 0.05
    next.widthMeters = Math.max(minSize, next.widthMeters)
    next.heightMeters = Math.max(minSize, next.heightMeters)
    next.x = Math.max(0, Math.min(drawing.widthMeters - next.widthMeters, next.x))
    next.y = Math.max(0, Math.min(drawing.heightMeters - next.heightMeters, next.y))
    return {
      x: Math.round(next.x * 1000) / 1000,
      y: Math.round(next.y * 1000) / 1000,
      widthMeters: Math.round(next.widthMeters * 1000) / 1000,
      heightMeters: Math.round(next.heightMeters * 1000) / 1000,
    }
  }

  function startDrag(el: FacadeElement, mode: DragMode) {
    return (e: React.PointerEvent) => {
      if (!onChangeElement) return
      e.stopPropagation()
      const p = pointerMeters(e)
      if (!p) return
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      setDrag({ id: el.id, mode, origMetersX: p.x, origMetersY: p.y, origEl: el })
      onSelectElement?.(el.id)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !onChangeElement) return
    const p = pointerMeters(e)
    if (!p) return
    const dx = p.x - drag.origMetersX
    const dy = p.y - drag.origMetersY
    const o = drag.origEl
    let patch: Partial<FacadeElement> = {}
    switch (drag.mode) {
      case 'move':
        patch = { x: o.x + dx, y: o.y + dy }
        break
      case 'ne':
        patch = { widthMeters: o.widthMeters + dx, heightMeters: o.heightMeters + dy }
        break
      case 'nw':
        patch = { x: o.x + dx, widthMeters: o.widthMeters - dx, heightMeters: o.heightMeters + dy }
        break
      case 'se':
        patch = { widthMeters: o.widthMeters + dx, y: o.y + dy, heightMeters: o.heightMeters - dy }
        break
      case 'sw':
        patch = {
          x: o.x + dx,
          widthMeters: o.widthMeters - dx,
          y: o.y + dy,
          heightMeters: o.heightMeters - dy,
        }
        break
    }
    onChangeElement(drag.id, clampPatch(o, patch))
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag) {
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      setDrag(null)
    }
  }

  const gridLines: React.ReactNode[] = []
  if (showGrid) {
    for (let x = 0; x <= drawing.widthMeters; x += 1) {
      gridLines.push(
        <line
          key={`vg-${x}`}
          x1={mx(x)}
          y1={marginTop}
          x2={mx(x)}
          y2={marginTop + drawingHeightPx}
          stroke="#e5e7eb"
          strokeWidth={x % 5 === 0 ? 0.8 : 0.4}
        />
      )
    }
    for (let y = 0; y <= drawing.heightMeters; y += 1) {
      gridLines.push(
        <line
          key={`hg-${y}`}
          x1={marginLeft}
          y1={my(y)}
          x2={marginLeft + drawing.widthMeters * scale}
          y2={my(y)}
          stroke="#e5e7eb"
          strokeWidth={y % 5 === 0 ? 0.8 : 0.4}
        />
      )
    }
  }

  /** Render draairichting (V-lijnen + eventueel kiep-driehoek) op kozijn-element */
  function renderDraairichting(el: FacadeElement, x: number, y: number, w: number, h: number) {
    const type = el.openingType
    if (!type || type === 'vast') return null
    const outward = el.opensOutward ?? false
    const stroke = ELEMENT_STYLES[el.kind].stroke
    const dash = outward ? undefined : '3 2'
    const lines: React.ReactNode[] = []

    const hingeLeft = type === 'draai-links' || type === 'draai-kiep-links'
    const hingeRight = type === 'draai-rechts' || type === 'draai-kiep-rechts'
    const isKiep = type === 'kiep' || type === 'draai-kiep-links' || type === 'draai-kiep-rechts'
    const isVal = type === 'val'
    const isSchuif = type === 'schuif-links' || type === 'schuif-rechts'

    if (hingeLeft) {
      // V-apex = rechtermidden (handle), base = linkerrand (scharnier)
      lines.push(
        <polyline
          key="drv-l"
          points={`${x},${y} ${x + w},${y + h / 2} ${x},${y + h}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      )
    }
    if (hingeRight) {
      lines.push(
        <polyline
          key="drv-r"
          points={`${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      )
    }
    if (isKiep) {
      // Horizontale driehoek: apex onderaan-midden, base = bovenzijde
      lines.push(
        <polyline
          key="kiep"
          points={`${x},${y} ${x + w / 2},${y + h} ${x + w},${y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      )
    }
    if (isVal) {
      // Val: apex bovenmidden, base = onderzijde (valraam, kantelt rond bovenrand)
      lines.push(
        <polyline
          key="val"
          points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={dash}
        />
      )
    }
    if (isSchuif) {
      const right = type === 'schuif-rechts'
      lines.push(
        <line
          key="schuif"
          x1={x + w / 2}
          y1={y + h / 2}
          x2={right ? x + w : x}
          y2={y + h / 2}
          stroke={stroke}
          strokeWidth={1.5}
          markerEnd={`url(#arrow-${el.id})`}
        />,
        <defs key="schuif-defs">
          <marker
            id={`arrow-${el.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
          </marker>
        </defs>
      )
    }
    return <g>{lines}</g>
  }

  function renderPaneelverdeling(el: FacadeElement, x: number, y: number, w: number, h: number) {
    const stroke = ELEMENT_STYLES[el.kind].stroke
    const nH = el.paneelverdelingH ?? 0
    const nV = el.paneelverdelingV ?? 0
    const lines: React.ReactNode[] = []
    for (let i = 1; i < nH; i++) {
      const lx = x + (w * i) / nH
      lines.push(
        <line key={`ph-${i}`} x1={lx} y1={y} x2={lx} y2={y + h} stroke={stroke} strokeWidth={0.8} opacity={0.7} />
      )
    }
    for (let i = 1; i < nV; i++) {
      const ly = y + (h * i) / nV
      lines.push(
        <line key={`pv-${i}`} x1={x} y1={ly} x2={x + w} y2={ly} stroke={stroke} strokeWidth={0.8} opacity={0.7} />
      )
    }
    // Fallback: simpel kruis als geen paneelverdeling maar wel raam
    if (!lines.length && el.kind === 'window' && w > 20 && h > 20) {
      lines.push(
        <line
          key="cross-v"
          x1={x + w / 2}
          y1={y}
          x2={x + w / 2}
          y2={y + h}
          stroke={stroke}
          strokeWidth={0.8}
          opacity={0.5}
        />,
        <line
          key="cross-h"
          x1={x}
          y1={y + h / 2}
          x2={x + w}
          y2={y + h / 2}
          stroke={stroke}
          strokeWidth={0.8}
          opacity={0.5}
        />
      )
    }
    return <g>{lines}</g>
  }

  function renderFence(el: FacadeElement, x: number, y: number, w: number, h: number) {
    const stroke = ELEMENT_STYLES.fence.stroke
    const spacingMm = el.railingSpacing ?? 110
    const spacingPx = (spacingMm / 1000) * scale
    const lines: React.ReactNode[] = []
    // horizontale regels onder/boven
    lines.push(
      <line key="top" x1={x} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={1.2} />,
      <line key="bot" x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={stroke} strokeWidth={1.2} />
    )
    if (spacingPx > 2) {
      for (let px = x; px <= x + w + 0.1; px += spacingPx) {
        lines.push(
          <line key={`r-${px}`} x1={px} y1={y} x2={px} y2={y + h} stroke={stroke} strokeWidth={0.8} />
        )
      }
    }
    return <g>{lines}</g>
  }

  function renderCanopy(el: FacadeElement, x: number, y: number, w: number, h: number) {
    const stroke = ELEMENT_STYLES.canopy.stroke
    // diagonaal-arcering binnen rechthoek
    const lines: React.ReactNode[] = []
    const step = 8
    for (let off = -h; off < w; off += step) {
      const x1 = Math.max(x, x + off)
      const y1 = off < 0 ? y - off : y
      const x2 = Math.min(x + w, x + off + h)
      const y2 = y + (x2 - (x + off))
      lines.push(<line key={`c-${off}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={0.5} opacity={0.5} />)
    }
    return <g>{lines}</g>
  }

  function renderLintel(el: FacadeElement, x: number, y: number, w: number, h: number) {
    const stroke = ELEMENT_STYLES.lintel.stroke
    const lines: React.ReactNode[] = []
    const step = 6
    for (let px = x; px < x + w; px += step) {
      lines.push(<line key={`l-${px}`} x1={px} y1={y} x2={px + 3} y2={y + h} stroke={stroke} strokeWidth={0.4} opacity={0.6} />)
    }
    return <g>{lines}</g>
  }

  function renderElement(el: FacadeElement) {
    const style = ELEMENT_STYLES[el.kind] ?? ELEMENT_STYLES.other
    const x = mx(el.x)
    const y = my(el.y + el.heightMeters)
    const w = el.widthMeters * scale
    const h = el.heightMeters * scale
    const selected = selectedElementId === el.id

    const editable = !!onChangeElement
    const moveCursor = editable ? (drag?.id === el.id ? 'grabbing' : 'grab') : 'pointer'

    const useMasonryFill = el.kind === 'masonry'
    const fill = useMasonryFill ? `url(#masonry-${el.id})` : style.fill
    const number = autoNumber(drawing.elements, el, gevelCode)

    return (
      <g
        key={el.id}
        onClick={(e) => {
          e.stopPropagation()
          onSelectElement?.(el.id)
        }}
      >
        {useMasonryFill && (
          <defs>
            <pattern id={`masonry-${el.id}`} width={16} height={8} patternUnits="userSpaceOnUse">
              <rect width={16} height={8} fill="rgba(180, 120, 90, 0.12)" />
              <path d="M0 0 L16 0 M0 4 L16 4 M0 8 L16 8 M0 0 L0 4 M8 4 L8 8 M16 0 L16 4" stroke="#8a5236" strokeWidth={0.4} opacity={0.6} />
            </pattern>
          </defs>
        )}
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fill}
          stroke={selected ? '#0a7a35' : style.stroke}
          strokeWidth={selected ? 2.5 : 1.5}
          onPointerDown={editable ? startDrag(el, 'move') : undefined}
          style={{ cursor: moveCursor, touchAction: 'none' }}
        />

        {(el.kind === 'window' || el.kind === 'door' || el.kind === 'frame') && (
          <>
            {renderPaneelverdeling(el, x, y, w, h)}
            {renderDraairichting(el, x, y, w, h)}
          </>
        )}
        {el.kind === 'fence' && renderFence(el, x, y, w, h)}
        {el.kind === 'canopy' && renderCanopy(el, x, y, w, h)}
        {el.kind === 'lintel' && renderLintel(el, x, y, w, h)}

        {/* Element-nummer */}
        {w > 20 && h > 14 && (
          <text
            x={x + 3}
            y={y + 10}
            fontSize={8}
            fill={style.stroke}
            fontWeight={600}
            pointerEvents="none"
          >
            {number}
          </text>
        )}

        {selected && (
          <>
            <text
              x={x + w / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize={10}
              fill="#0a7a35"
              fontWeight={600}
            >
              {(el.widthMeters * 100).toFixed(0)} cm
            </text>
            <text
              x={x + w + 4}
              y={y + h / 2}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={10}
              fill="#0a7a35"
              fontWeight={600}
            >
              {(el.heightMeters * 100).toFixed(0)} cm
            </text>
          </>
        )}

        {selected && editable && (
          <>
            {(
              [
                { mode: 'nw' as const, cx: x, cy: y, cursor: 'nwse-resize' },
                { mode: 'ne' as const, cx: x + w, cy: y, cursor: 'nesw-resize' },
                { mode: 'se' as const, cx: x + w, cy: y + h, cursor: 'nwse-resize' },
                { mode: 'sw' as const, cx: x, cy: y + h, cursor: 'nesw-resize' },
              ]
            ).map((handle) => (
              <rect
                key={handle.mode}
                x={handle.cx - 5}
                y={handle.cy - 5}
                width={10}
                height={10}
                fill="white"
                stroke="#0a7a35"
                strokeWidth={1.5}
                onPointerDown={startDrag(el, handle.mode)}
                style={{ cursor: handle.cursor, touchAction: 'none' }}
              />
            ))}
          </>
        )}
      </g>
    )
  }

  const sortedElements = [...drawing.elements].sort((a, b) => {
    // Render masonry & canopy als achtergrond (groot), dan kozijnen/raam/deur erbovenop
    const priority = (k: FacadeElementKind) =>
      k === 'masonry' ? 0 : k === 'canopy' ? 1 : k === 'concrete-band' || k === 'lintel' ? 2 : 3
    const pa = priority(a.kind)
    const pb = priority(b.kind)
    if (pa !== pb) return pa - pb
    return b.widthMeters * b.heightMeters - a.widthMeters * a.heightMeters
  })

  // Peilmaat-ladder rechts van de gevel
  const peilmaatX = marginLeft + drawing.widthMeters * scale + 40
  const peilmaatEntries: { y: number; label: string }[] = []
  if (showPeilmaat) {
    for (let y = 0; y <= drawing.heightMeters + 0.001; y += storeyHeightMeters) {
      peilmaatEntries.push({
        y,
        label: y === 0 ? '0+P' : `+${Math.round(y * 1000)}+P`,
      })
    }
    // Nok/dakrand indien nog niet gedekt
    const lastY = peilmaatEntries[peilmaatEntries.length - 1]?.y ?? 0
    if (drawing.heightMeters - lastY > 0.2) {
      peilmaatEntries.push({
        y: drawing.heightMeters,
        label: `+${Math.round(drawing.heightMeters * 1000)}+P`,
      })
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${pixelWidth} ${totalHeight}`}
      width="100%"
      height="auto"
      className="bg-white border rounded-md"
      onClick={() => onSelectElement?.(null)}
      onPointerMove={onChangeElement ? onPointerMove : undefined}
      onPointerUp={onChangeElement ? onPointerUp : undefined}
      onPointerCancel={onChangeElement ? onPointerUp : undefined}
    >
      <defs>
        <pattern id="maaiveld-hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={8} stroke="#666" strokeWidth={0.6} />
        </pattern>
      </defs>

      {gridLines}

      {/* Gevel-omtrek */}
      <rect
        x={marginLeft}
        y={marginTop}
        width={drawing.widthMeters * scale}
        height={drawingHeightPx}
        fill="#fafafa"
        stroke="#222"
        strokeWidth={2}
      />

      {sortedElements.map(renderElement)}

      {/* Maaiveld-arcering onder de gevel */}
      {showMaaiveld && (
        <g>
          <line
            x1={marginLeft - 10}
            y1={marginTop + drawingHeightPx}
            x2={marginLeft + drawing.widthMeters * scale + 10}
            y2={marginTop + drawingHeightPx}
            stroke="#222"
            strokeWidth={1.5}
          />
          <rect
            x={marginLeft - 10}
            y={marginTop + drawingHeightPx}
            width={drawing.widthMeters * scale + 20}
            height={14}
            fill="url(#maaiveld-hatch)"
          />
          <text
            x={marginLeft + drawing.widthMeters * scale + 14}
            y={marginTop + drawingHeightPx + 10}
            fontSize={9}
            fill="#555"
          >
            Maaiveld
          </text>
        </g>
      )}

      {/* Peilmaat-ladder */}
      {showPeilmaat && (
        <g>
          <line
            x1={peilmaatX}
            y1={marginTop}
            x2={peilmaatX}
            y2={marginTop + drawingHeightPx}
            stroke="#333"
            strokeWidth={0.8}
          />
          {peilmaatEntries.map((p, i) => {
            const cy = my(p.y)
            return (
              <g key={i}>
                <line
                  x1={marginLeft + drawing.widthMeters * scale}
                  y1={cy}
                  x2={peilmaatX + 4}
                  y2={cy}
                  stroke="#888"
                  strokeWidth={0.3}
                  strokeDasharray="2 3"
                />
                <polygon
                  points={`${peilmaatX - 4},${cy - 3} ${peilmaatX + 4},${cy} ${peilmaatX - 4},${cy + 3}`}
                  fill="#333"
                />
                <text x={peilmaatX + 8} y={cy + 3} fontSize={9} fill="#222" fontWeight={600}>
                  {p.label}
                </text>
              </g>
            )
          })}
        </g>
      )}

      {/* Maatvoering onder (breedte) */}
      {showDimensions && (
        <g>
          <line
            x1={marginLeft}
            y1={marginTop + drawingHeightPx + 34}
            x2={marginLeft + drawing.widthMeters * scale}
            y2={marginTop + drawingHeightPx + 34}
            stroke="#333"
            strokeWidth={0.8}
          />
          <line
            x1={marginLeft}
            y1={marginTop + drawingHeightPx + 28}
            x2={marginLeft}
            y2={marginTop + drawingHeightPx + 40}
            stroke="#333"
            strokeWidth={0.8}
          />
          <line
            x1={marginLeft + drawing.widthMeters * scale}
            y1={marginTop + drawingHeightPx + 28}
            x2={marginLeft + drawing.widthMeters * scale}
            y2={marginTop + drawingHeightPx + 40}
            stroke="#333"
            strokeWidth={0.8}
          />
          <text
            x={marginLeft + (drawing.widthMeters * scale) / 2}
            y={marginTop + drawingHeightPx + 52}
            textAnchor="middle"
            fontSize={12}
            fill="#333"
            fontWeight={600}
          >
            {drawing.widthMeters.toFixed(2)} m
          </text>
        </g>
      )}
    </svg>
  )
}
