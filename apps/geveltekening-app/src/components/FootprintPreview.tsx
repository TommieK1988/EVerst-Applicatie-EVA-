'use client'

import { useMemo } from 'react'
import type { Facade, GeoJsonPolygon } from '@/lib/types'

interface Props {
  footprint: GeoJsonPolygon
  facades: Facade[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  size?: number
  /** Toon PDOK luchtfoto als achtergrond */
  showAerial?: boolean
}

/**
 * Toont een top-down SVG preview van het pand-footprint met klikbare gevelsegmenten.
 * Gebruikt lokale meter-projectie (equirectangular rond centerLat) voor visualisatie.
 * Als showAerial=true wordt de PDOK luchtfoto op exact dezelfde bbox op de achtergrond
 * geplaatst zodat je de gevels in context ziet.
 */
export function FootprintPreview({
  footprint,
  facades,
  selectedIds,
  onToggle,
  size = 360,
  showAerial = true,
}: Props) {
  const geom = useMemo(() => {
    const outer = footprint.coordinates[0]
    if (!outer || outer.length < 3) return null

    const lons = outer.map((p) => p[0])
    const lats = outer.map((p) => p[1])
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2

    const mPerDegLat = 111_000
    const mPerDegLon = 111_000 * Math.cos((centerLat * Math.PI) / 180)

    const lon0 = lons[0]
    const lat0 = lats[0]

    const pts = outer.map(([lon, lat]) => ({
      x: (lon - lon0) * mPerDegLon,
      // negatief zodat noord boven is in SVG (y neemt toe naar beneden)
      y: -(lat - lat0) * mPerDegLat,
    }))

    const minX = Math.min(...pts.map((p) => p.x))
    const maxX = Math.max(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y))
    const maxY = Math.max(...pts.map((p) => p.y))
    const w = maxX - minX
    const h = maxY - minY
    const pad = Math.max(w, h) * 0.18
    const viewW = w + pad * 2
    const viewH = h + pad * 2

    const projected = pts.map((p) => ({
      x: p.x - minX + pad,
      y: p.y - minY + pad,
    }))

    // Bereken WGS84 bbox voor de luchtfoto zodat die exact op de viewBox past.
    // (0,0) in local coords → noordwest, (viewW, viewH) → zuidoost.
    // local (x, y) ten opzichte van lon0,lat0: lon = lon0 + x/mPerDegLon, lat = lat0 - y/mPerDegLat.
    const aerialMinLocalX = minX - pad
    const aerialMaxLocalX = maxX + pad
    const aerialMinLocalY = minY - pad
    const aerialMaxLocalY = maxY + pad
    const minLon = lon0 + aerialMinLocalX / mPerDegLon
    const maxLon = lon0 + aerialMaxLocalX / mPerDegLon
    const maxLat = lat0 - aerialMinLocalY / mPerDegLat
    const minLat = lat0 - aerialMaxLocalY / mPerDegLat

    return {
      viewW,
      viewH,
      projected,
      aerialBbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    }
  }, [footprint])

  if (!geom) return null
  const { viewW, viewH, projected, aerialBbox } = geom

  // Request hogere resolutie dan display-size voor scherp beeld, cap op 1500px
  const aspectRatio = viewW / viewH
  const maxDim = 1500
  const imgW = aspectRatio >= 1 ? maxDim : Math.round(maxDim * aspectRatio)
  const imgH = aspectRatio >= 1 ? Math.round(maxDim / aspectRatio) : maxDim
  const aerialUrl = showAerial
    ? `/api/aerial?bbox=${encodeURIComponent(aerialBbox)}&w=${imgW}&h=${imgH}`
    : null

  const polygonStr = projected.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={size}
      height={size}
      className="bg-muted/30 rounded-md border"
      preserveAspectRatio="xMidYMid meet"
    >
      {aerialUrl && (
        <image
          href={aerialUrl}
          x={0}
          y={0}
          width={viewW}
          height={viewH}
          preserveAspectRatio="none"
        />
      )}

      {/* Semi-transparante overlay voor contrast met gevellijnen */}
      {aerialUrl && (
        <rect x={0} y={0} width={viewW} height={viewH} fill="white" opacity={0.15} />
      )}

      {/* Noord indicator */}
      <g transform={`translate(${viewW - viewW * 0.08}, ${viewW * 0.08})`}>
        <circle
          r={viewW * 0.05}
          fill="white"
          stroke="currentColor"
          strokeWidth={viewW * 0.004}
        />
        <text
          textAnchor="middle"
          dy={viewW * 0.018}
          fontSize={viewW * 0.05}
          fontWeight={700}
          fill="black"
        >
          N
        </text>
      </g>

      <polygon
        points={polygonStr}
        fill={aerialUrl ? 'hsl(var(--primary) / 0.04)' : 'hsl(var(--primary) / 0.08)'}
        stroke="hsl(var(--foreground) / 0.3)"
        strokeWidth={viewW * 0.004}
        strokeDasharray={`${viewW * 0.01} ${viewW * 0.01}`}
      />

      {facades.map((f, i) => {
        const a = projected[i]
        const b = projected[i + 1] ?? projected[0]
        if (!a || !b) return null
        const selected = selectedIds.has(f.id)
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        return (
          <g key={f.id} onClick={() => onToggle(f.id)} className="cursor-pointer">
            {/* Click-target breder dan zichtbare lijn */}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={viewW * 0.025}
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={selected ? 'hsl(var(--primary))' : 'white'}
              strokeWidth={selected ? viewW * 0.014 : viewW * 0.008}
              strokeLinecap="round"
              style={{
                filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))',
              }}
            />
            <circle
              cx={midX}
              cy={midY}
              r={viewW * 0.028}
              fill={selected ? 'hsl(var(--primary))' : 'white'}
              stroke={selected ? 'white' : 'hsl(var(--foreground) / 0.6)'}
              strokeWidth={viewW * 0.004}
            />
            <text
              x={midX}
              y={midY}
              textAnchor="middle"
              dy={viewW * 0.011}
              fontSize={viewW * 0.038}
              fontWeight={700}
              fill={selected ? 'white' : 'black'}
              pointerEvents="none"
            >
              {i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
