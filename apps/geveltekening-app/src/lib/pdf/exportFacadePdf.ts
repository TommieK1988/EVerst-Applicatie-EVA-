import { jsPDF } from 'jspdf'
import type { Facade, FacadeElement, FacadeElementKind } from '@/lib/types'
import { facadeToGevelCode } from '@/lib/facade-utils'

// A3 liggend in mm
const PAGE_W = 420
const PAGE_H = 297
const MARGIN = 12
const TITLEBLOCK_W = 180
const TITLEBLOCK_H = 40
const LEGENDA_W = 130
const LEGENDA_H = 40

export type NominalScale = 20 | 50 | 100 | 200
export const NOMINAL_SCALES: NominalScale[] = [20, 50, 100, 200]

export interface ExportOptions {
  scale?: NominalScale | 'auto'
  showTitleblock?: boolean
  showLegenda?: boolean
  showPeilmaat?: boolean
  showNorthArrow?: boolean
  bladnummer?: string
  totaalBladen?: number
  tekenaar?: string
  projectnummer?: string
  storeyHeightMeters?: number
}

export interface BuildingInfo {
  /** Volledige adresregel (bv. "Dam 1, 1012JS Amsterdam") */
  addressLine?: string
  pandId?: string
  bouwjaar?: number
  /** Korte naam voor bestandsnaam */
  addressSlug?: string
}

interface FacadeData {
  facade: Facade
  widthMeters: number
  heightMeters: number
  elements: FacadeElement[]
}

const KIND_COLOR: Record<FacadeElementKind, [number, number, number]> = {
  window: [25, 118, 210],
  door: [109, 76, 42],
  frame: [85, 85, 85],
  'concrete-band': [68, 68, 68],
  lintel: [106, 90, 56],
  masonry: [138, 82, 54],
  fence: [51, 51, 51],
  canopy: [51, 51, 51],
  gutter: [68, 68, 68],
  'roof-edge': [34, 34, 34],
  chimney: [90, 46, 32],
  other: [102, 102, 102],
}

const KIND_FILL: Record<FacadeElementKind, [number, number, number] | null> = {
  window: [225, 238, 248],
  door: [230, 218, 202],
  frame: [235, 235, 235],
  'concrete-band': [210, 210, 210],
  lintel: [230, 222, 198],
  masonry: [235, 214, 200],
  fence: null,
  canopy: [220, 220, 220],
  gutter: null,
  'roof-edge': null,
  chimney: [210, 180, 170],
  other: [230, 230, 230],
}

const KIND_LABEL: Record<FacadeElementKind, string> = {
  window: 'Raam',
  door: 'Deur',
  frame: 'Kozijn',
  'concrete-band': 'Betonband',
  lintel: 'Latei',
  masonry: 'Metselwerk',
  fence: 'Hekwerk',
  canopy: 'Luifel',
  gutter: 'Goot',
  'roof-edge': 'Dakrand',
  chimney: 'Schoorsteen',
  other: 'Overig',
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

/** Kies grootste schaal waarbij gevel (+ marge) past op A3 liggend */
export function pickScale(widthM: number, heightM: number, drawW: number, drawH: number): NominalScale {
  for (const s of NOMINAL_SCALES) {
    const needW = widthM * 1000 / s // mm
    const needH = heightM * 1000 / s
    if (needW <= drawW && needH <= drawH) return s
  }
  return 200
}

function formatAddress(line?: string): string {
  return line && line.trim() ? line : '—'
}

function dutchDate(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

interface DrawArea {
  x: number
  y: number
  w: number
  h: number
}

/** Teken één gevel binnen een gegeven rechthoek (in mm) op het PDF. Schaal wordt auto-gekozen tenzij opgegeven. */
function drawFacadeInArea(
  doc: jsPDF,
  fd: FacadeData,
  area: DrawArea,
  opts: { scale?: NominalScale | 'auto'; storeyHeightMeters?: number; showPeilmaat?: boolean }
): { usedScale: NominalScale } {
  // Reserveer 18mm rechts voor peilmaat-ladder en 12mm onder voor maatvoering
  const padRight = opts.showPeilmaat === false ? 4 : 22
  const padBot = 14
  const innerW = area.w - padRight
  const innerH = area.h - padBot

  const usedScale =
    opts.scale && opts.scale !== 'auto'
      ? opts.scale
      : pickScale(fd.widthMeters, fd.heightMeters, innerW, innerH)

  const mmPerMeter = 1000 / usedScale
  const drawW = fd.widthMeters * mmPerMeter
  const drawH = fd.heightMeters * mmPerMeter

  // Centreer gevel in zijn innerArea
  const ox = area.x + (innerW - drawW) / 2
  const oy = area.y + (innerH - drawH) / 2

  // Converter van gevel-meters naar PDF-mm
  const mx = (xm: number) => ox + xm * mmPerMeter
  const my = (ym: number) => oy + drawH - ym * mmPerMeter

  // Grid (5m lijnen)
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.08)
  for (let gx = 0; gx <= fd.widthMeters + 0.001; gx += 5) {
    doc.line(mx(gx), my(0), mx(gx), my(fd.heightMeters))
  }
  for (let gy = 0; gy <= fd.heightMeters + 0.001; gy += 5) {
    doc.line(mx(0), my(gy), mx(fd.widthMeters), my(gy))
  }

  // Gevel omtrek
  doc.setFillColor(250, 250, 250)
  doc.setDrawColor(34, 34, 34)
  doc.setLineWidth(0.4)
  doc.rect(mx(0), my(fd.heightMeters), drawW, drawH, 'FD')

  // Sort render order: masonry/canopy achtergrond, dan banden, dan kozijnen
  const priority = (k: FacadeElementKind) =>
    k === 'masonry' ? 0 : k === 'canopy' ? 1 : k === 'concrete-band' || k === 'lintel' ? 2 : 3
  const sorted = [...fd.elements].sort((a, b) => {
    const pa = priority(a.kind)
    const pb = priority(b.kind)
    if (pa !== pb) return pa - pb
    return b.widthMeters * b.heightMeters - a.widthMeters * a.heightMeters
  })

  const gevelCode = facadeToGevelCode(fd.facade)

  sorted.forEach((el, idx) => {
    const ex = mx(el.x)
    const ey = my(el.y + el.heightMeters)
    const ew = el.widthMeters * mmPerMeter
    const eh = el.heightMeters * mmPerMeter

    const fill = KIND_FILL[el.kind]
    const stroke = KIND_COLOR[el.kind]
    doc.setDrawColor(stroke[0], stroke[1], stroke[2])
    doc.setLineWidth(0.25)
    if (fill) {
      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.rect(ex, ey, ew, eh, 'FD')
    } else {
      doc.rect(ex, ey, ew, eh, 'S')
    }

    // Masonry pattern (horizontale lijnen)
    if (el.kind === 'masonry' && ew > 4 && eh > 4) {
      doc.setLineWidth(0.1)
      doc.setDrawColor(stroke[0], stroke[1], stroke[2])
      const stepMm = 1.4
      for (let ly = ey + stepMm; ly < ey + eh; ly += stepMm) {
        doc.line(ex, ly, ex + ew, ly)
      }
    }

    // Fence spijlen
    if (el.kind === 'fence') {
      const spacingMm = ((el.railingSpacing ?? 110) / 1000) * mmPerMeter
      doc.setLineWidth(0.2)
      doc.line(ex, ey, ex + ew, ey)
      doc.line(ex, ey + eh, ex + ew, ey + eh)
      if (spacingMm > 0.5) {
        for (let px = ex; px <= ex + ew + 0.01; px += spacingMm) {
          doc.line(px, ey, px, ey + eh)
        }
      }
    }

    // Canopy hatch
    if (el.kind === 'canopy') {
      doc.setLineWidth(0.08)
      const step = 2
      for (let off = -eh; off < ew; off += step) {
        const x1 = Math.max(ex, ex + off)
        const y1 = off < 0 ? ey - off : ey
        const x2 = Math.min(ex + ew, ex + off + eh)
        const y2 = ey + (x2 - (ex + off))
        doc.line(x1, y1, x2, y2)
      }
    }

    // Paneelverdeling & draairichting voor openings
    if (el.kind === 'window' || el.kind === 'door' || el.kind === 'frame') {
      const nH = el.paneelverdelingH ?? 0
      const nV = el.paneelverdelingV ?? 0
      doc.setLineWidth(0.15)
      for (let i = 1; i < nH; i++) {
        const lx = ex + (ew * i) / nH
        doc.line(lx, ey, lx, ey + eh)
      }
      for (let i = 1; i < nV; i++) {
        const ly = ey + (eh * i) / nV
        doc.line(ex, ly, ex + ew, ly)
      }
      if (!nH && !nV && el.kind === 'window' && ew > 4 && eh > 4) {
        doc.setLineWidth(0.1)
        doc.line(ex + ew / 2, ey, ex + ew / 2, ey + eh)
        doc.line(ex, ey + eh / 2, ex + ew, ey + eh / 2)
      }

      // Draairichting V-lijnen
      const type = el.openingType
      if (type && type !== 'vast') {
        const outward = el.opensOutward ?? false
        doc.setLineWidth(0.2)
        if (outward) doc.setLineDashPattern([], 0)
        else doc.setLineDashPattern([0.8, 0.6], 0)

        const hingeLeft = type === 'draai-links' || type === 'draai-kiep-links'
        const hingeRight = type === 'draai-rechts' || type === 'draai-kiep-rechts'
        const isKiep = type === 'kiep' || type === 'draai-kiep-links' || type === 'draai-kiep-rechts'
        const isVal = type === 'val'

        if (hingeLeft) {
          doc.line(ex, ey, ex + ew, ey + eh / 2)
          doc.line(ex + ew, ey + eh / 2, ex, ey + eh)
        }
        if (hingeRight) {
          doc.line(ex + ew, ey, ex, ey + eh / 2)
          doc.line(ex, ey + eh / 2, ex + ew, ey + eh)
        }
        if (isKiep) {
          doc.line(ex, ey, ex + ew / 2, ey + eh)
          doc.line(ex + ew / 2, ey + eh, ex + ew, ey)
        }
        if (isVal) {
          doc.line(ex, ey + eh, ex + ew / 2, ey)
          doc.line(ex + ew / 2, ey, ex + ew, ey + eh)
        }
        doc.setLineDashPattern([], 0)
      }
    }

    // Element-nummer
    if (ew > 5 && eh > 4) {
      const sameKind = sorted.filter((e) => e.kind === el.kind)
      const kIdx = sameKind.findIndex((e) => e.id === el.id)
      const number = el.elementNumber ?? `${gevelCode}-${KIND_CODE[el.kind] ?? 'X'}${String(kIdx + 1).padStart(2, '0')}`
      doc.setFontSize(5)
      doc.setTextColor(stroke[0], stroke[1], stroke[2])
      doc.text(number, ex + 0.6, ey + 1.8)
    }
    void idx
  })

  // Maaiveld arcering onder gevel
  doc.setDrawColor(34, 34, 34)
  doc.setLineWidth(0.3)
  doc.line(mx(0) - 3, my(0), mx(fd.widthMeters) + 3, my(0))
  doc.setLineWidth(0.1)
  for (let px = mx(0) - 2; px < mx(fd.widthMeters) + 2; px += 1.5) {
    doc.line(px, my(0) + 0.3, px - 1.5, my(0) + 2.5)
  }

  // Peilmaat ladder
  if (opts.showPeilmaat !== false) {
    const storey = opts.storeyHeightMeters ?? 2.8
    const xLadder = mx(fd.widthMeters) + 14
    doc.setDrawColor(50, 50, 50)
    doc.setLineWidth(0.15)
    doc.line(xLadder, my(0), xLadder, my(fd.heightMeters))

    const marks: { y: number; label: string }[] = []
    for (let y = 0; y <= fd.heightMeters + 0.001; y += storey) {
      marks.push({ y, label: y === 0 ? '0+P' : `+${Math.round(y * 1000)}+P` })
    }
    const last = marks[marks.length - 1]?.y ?? 0
    if (fd.heightMeters - last > 0.2) {
      marks.push({ y: fd.heightMeters, label: `+${Math.round(fd.heightMeters * 1000)}+P` })
    }
    doc.setFontSize(5)
    doc.setTextColor(20, 20, 20)
    marks.forEach((m) => {
      const py = my(m.y)
      doc.setLineWidth(0.1)
      doc.setDrawColor(150, 150, 150)
      doc.setLineDashPattern([0.4, 0.4], 0)
      doc.line(mx(fd.widthMeters), py, xLadder - 1, py)
      doc.setLineDashPattern([], 0)
      // Driehoek
      doc.setFillColor(50, 50, 50)
      doc.triangle(xLadder - 1, py - 0.6, xLadder + 1, py, xLadder - 1, py + 0.6, 'F')
      doc.text(m.label, xLadder + 1.8, py + 1)
    })
  }

  // Maatvoering onder
  const dimY = my(0) + 6
  doc.setDrawColor(50, 50, 50)
  doc.setLineWidth(0.2)
  doc.line(mx(0), dimY, mx(fd.widthMeters), dimY)
  doc.line(mx(0), dimY - 1.5, mx(0), dimY + 1.5)
  doc.line(mx(fd.widthMeters), dimY - 1.5, mx(fd.widthMeters), dimY + 1.5)
  doc.setFontSize(6)
  doc.setTextColor(20, 20, 20)
  doc.text(`${fd.widthMeters.toFixed(2)} m`, (mx(0) + mx(fd.widthMeters)) / 2, dimY + 4, { align: 'center' })

  // Gevel-label boven de tekening
  doc.setFontSize(8)
  doc.setTextColor(10, 10, 10)
  doc.text(`${fd.facade.label} (${gevelCode})`, mx(0), oy - 2)

  return { usedScale }
}

function drawTitleblock(
  doc: jsPDF,
  info: {
    addressLine?: string
    pandId?: string
    bouwjaar?: number
    gevelLabel: string
    schaal: string
    bladnummer: string
    totaalBladen: number
    tekenaar: string
    projectnummer: string
  }
) {
  const x = PAGE_W - MARGIN - TITLEBLOCK_W
  const y = PAGE_H - MARGIN - TITLEBLOCK_H
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.35)
  doc.rect(x, y, TITLEBLOCK_W, TITLEBLOCK_H, 'S')

  const rows = 5
  const rowH = TITLEBLOCK_H / rows
  for (let r = 1; r < rows; r++) {
    doc.setLineWidth(0.15)
    doc.line(x, y + r * rowH, x + TITLEBLOCK_W, y + r * rowH)
  }
  // Verticale scheiding tussen labels en waarden
  const labelW = 38
  doc.line(x + labelW, y, x + labelW, y + TITLEBLOCK_H)
  // Rechter deel met gevel/schaal/datum/blad
  const rightColX = x + TITLEBLOCK_W - 70
  doc.line(rightColX, y, rightColX, y + TITLEBLOCK_H)

  const pandId = info.pandId ?? '—'
  const bouwjaar = info.bouwjaar ? String(info.bouwjaar) : '—'

  const leftRows = [
    { label: 'PROJECT', value: 'Geveltekening Everts' },
    { label: 'ADRES', value: formatAddress(info.addressLine) },
    { label: 'PAND-ID', value: pandId },
    { label: 'BOUWJAAR', value: bouwjaar },
    { label: 'TEKENAAR', value: info.tekenaar },
  ]
  const rightRows = [
    { label: 'GEVEL', value: info.gevelLabel },
    { label: 'SCHAAL', value: info.schaal },
    { label: 'DATUM', value: dutchDate() },
    { label: 'BLAD', value: `${info.bladnummer} / ${info.totaalBladen}` },
    { label: 'PROJECTNR', value: info.projectnummer },
  ]

  doc.setFontSize(6)
  doc.setTextColor(80, 80, 80)
  leftRows.forEach((row, i) => {
    doc.text(row.label, x + 1.5, y + i * rowH + rowH / 2 + 0.5)
  })
  rightRows.forEach((row, i) => {
    doc.text(row.label, rightColX + 1.5, y + i * rowH + rowH / 2 + 0.5)
  })
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  leftRows.forEach((row, i) => {
    doc.text(String(row.value).slice(0, 48), x + labelW + 1.5, y + i * rowH + rowH / 2 + 0.8)
  })
  rightRows.forEach((row, i) => {
    doc.text(String(row.value).slice(0, 20), rightColX + 22, y + i * rowH + rowH / 2 + 0.8)
  })
}

function drawLegenda(doc: jsPDF, elements: FacadeElement[], scaleLabel: string) {
  const x = MARGIN
  const y = PAGE_H - MARGIN - LEGENDA_H
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.rect(x, y, LEGENDA_W, LEGENDA_H, 'S')

  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('LEGENDA', x + 2, y + 4)
  doc.setLineWidth(0.1)
  doc.line(x + 2, y + 5, x + LEGENDA_W - 2, y + 5)

  const kinds = Array.from(new Set(elements.map((e) => e.kind)))
  doc.setFontSize(6)
  kinds.forEach((k, i) => {
    const row = i % 6
    const col = Math.floor(i / 6)
    const cx = x + 2 + col * 40
    const cy = y + 8 + row * 3.5
    const fill = KIND_FILL[k]
    const stroke = KIND_COLOR[k]
    doc.setDrawColor(stroke[0], stroke[1], stroke[2])
    if (fill) {
      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.rect(cx, cy - 2, 4, 2.5, 'FD')
    } else {
      doc.rect(cx, cy - 2, 4, 2.5, 'S')
    }
    doc.setTextColor(0, 0, 0)
    doc.text(KIND_LABEL[k], cx + 5, cy)
  })

  // Schaalbalk (5m)
  const sbY = y + LEGENDA_H - 8
  const scaleNum = parseInt(scaleLabel.replace('1:', ''), 10) || 100
  const barMm = (5 * 1000) / scaleNum
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(x + 2, sbY, x + 2 + barMm, sbY)
  doc.line(x + 2, sbY - 1, x + 2, sbY + 1)
  doc.line(x + 2 + barMm, sbY - 1, x + 2 + barMm, sbY + 1)
  // Helft-tick
  doc.setLineWidth(0.15)
  doc.line(x + 2 + barMm / 2, sbY - 0.8, x + 2 + barMm / 2, sbY + 0.8)
  doc.setFontSize(6)
  doc.text('0', x + 2, sbY + 3.2)
  doc.text('5 m', x + 2 + barMm - 3, sbY + 3.2)
  doc.text(`Schaal ${scaleLabel}`, x + 2, sbY + 6)
}

function drawNorthArrow(doc: jsPDF, azimuthDegrees: number) {
  const cx = PAGE_W - MARGIN - 12
  const cy = MARGIN + 12
  const r = 10
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.circle(cx, cy, r, 'S')
  // Pijl naar noorden, gedraaid met azimut (noord is negatief y-as in PDF; y neemt toe naar beneden)
  const rad = (azimuthDegrees * Math.PI) / 180
  const tipX = cx + Math.sin(rad - Math.PI) * (r - 1)
  const tipY = cy + Math.cos(rad - Math.PI) * (r - 1) * -1
  // Eenvoudiger: noord-pijl wijst altijd naar boven in PDF (y neemt af = omhoog)
  // We tekenen een vaste noord-pijl; azimuth geeft alleen richting aan
  void tipX
  void tipY
  const nx = cx
  const ny = cy - r + 1.5
  const sx = cx
  const sy = cy + r - 1.5
  doc.setFillColor(0, 0, 0)
  doc.triangle(nx - 2, cy, nx, ny, nx + 2, cy, 'F')
  doc.setLineWidth(0.15)
  doc.line(sx, cy, sx, sy)
  doc.setFontSize(7)
  doc.setTextColor(0, 0, 0)
  doc.text('N', cx - 1.2, ny - 0.8)
  // Azimuth-tekst onder
  doc.setFontSize(5)
  doc.setTextColor(80, 80, 80)
  doc.text(`${Math.round(azimuthDegrees)}°`, cx - 3, cy + r + 3)
}

export function exportSingleFacadePdf(
  fd: FacadeData,
  building: BuildingInfo,
  options: ExportOptions = {}
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })

  const drawArea: DrawArea = {
    x: MARGIN + 5,
    y: MARGIN + 5,
    w: PAGE_W - MARGIN * 2 - 10,
    h: PAGE_H - MARGIN * 2 - LEGENDA_H - 10,
  }

  const { usedScale } = drawFacadeInArea(doc, fd, drawArea, {
    scale: options.scale ?? 'auto',
    storeyHeightMeters: options.storeyHeightMeters ?? 2.8,
    showPeilmaat: options.showPeilmaat !== false,
  })

  const scaleLabel = `1:${usedScale}`

  if (options.showTitleblock !== false) {
    drawTitleblock(doc, {
      addressLine: building.addressLine,
      pandId: building.pandId,
      bouwjaar: building.bouwjaar,
      gevelLabel: fd.facade.label,
      schaal: scaleLabel,
      bladnummer: options.bladnummer ?? '01',
      totaalBladen: options.totaalBladen ?? 1,
      tekenaar: options.tekenaar ?? 'Everts',
      projectnummer: options.projectnummer ?? '—',
    })
  }
  if (options.showLegenda !== false) {
    drawLegenda(doc, fd.elements, scaleLabel)
  }
  if (options.showNorthArrow !== false) {
    drawNorthArrow(doc, fd.facade.orientation.azimuthDegrees)
  }

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2, 'S')

  const slug = building.addressSlug ?? 'gevel'
  const fname = `gevel-${facadeToGevelCode(fd.facade)}-${slug}.pdf`
  doc.save(fname.replace(/[^\w.\-]/g, '_'))
}

export function exportOverviewPdf(
  facades: FacadeData[],
  building: BuildingInfo,
  options: ExportOptions = {}
): void {
  if (facades.length === 0) return
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })

  const totalDrawW = PAGE_W - MARGIN * 2 - 10
  const totalDrawH = PAGE_H - MARGIN * 2 - LEGENDA_H - 10
  // Verdeel breedte gelijk per gevel
  const cellW = totalDrawW / facades.length
  // Kies één gemeenschappelijke schaal die voor alle gevels past
  let commonScale: NominalScale = 200
  for (const s of NOMINAL_SCALES) {
    const fitsAll = facades.every(
      (fd) => (fd.widthMeters * 1000) / s <= cellW - 6 && (fd.heightMeters * 1000) / s <= totalDrawH - 8
    )
    if (fitsAll) {
      commonScale = s
      break
    }
  }

  const allElements: FacadeElement[] = facades.flatMap((f) => f.elements)

  facades.forEach((fd, i) => {
    drawFacadeInArea(
      doc,
      fd,
      {
        x: MARGIN + 5 + i * cellW,
        y: MARGIN + 5,
        w: cellW,
        h: totalDrawH,
      },
      {
        scale: commonScale,
        storeyHeightMeters: options.storeyHeightMeters ?? 2.8,
        showPeilmaat: i === facades.length - 1 && options.showPeilmaat !== false,
      }
    )
  })

  const scaleLabel = `1:${commonScale}`
  if (options.showTitleblock !== false) {
    drawTitleblock(doc, {
      addressLine: building.addressLine,
      pandId: building.pandId,
      bouwjaar: building.bouwjaar,
      gevelLabel: `${facades.length} gevels`,
      schaal: scaleLabel,
      bladnummer: options.bladnummer ?? '01',
      totaalBladen: options.totaalBladen ?? 1,
      tekenaar: options.tekenaar ?? 'Everts',
      projectnummer: options.projectnummer ?? '—',
    })
  }
  if (options.showLegenda !== false) {
    drawLegenda(doc, allElements, scaleLabel)
  }
  if (options.showNorthArrow !== false) {
    drawNorthArrow(doc, facades[0]?.facade.orientation.azimuthDegrees ?? 0)
  }
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2, 'S')

  const slug = building.addressSlug ?? 'gevels'
  const fname = `overzicht-${slug}.pdf`
  doc.save(fname.replace(/[^\w.\-]/g, '_'))
}
