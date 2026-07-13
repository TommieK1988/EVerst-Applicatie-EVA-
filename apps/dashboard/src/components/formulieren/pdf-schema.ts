import type jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CalloutVariant, FormPdfConfig } from './types'
import { CALLOUT_VARIANTEN } from './types'
import { fetchBriefpapier, mergeBriefpapierBackground } from '@/lib/everts-calc/briefpapier'

// ── Per-sjabloon PDF-config over de globale singleton leggen ───────────

export type GlobalePdfConfig = {
  toon_logo: boolean
  toon_invuller: boolean
  toon_project_ref: boolean
  koptekst: string | null
  voettekst: string | null
} | null

export type EffectievePdfConfig = {
  toonLogo: boolean
  toonInvuller: boolean
  toonProjectRef: boolean
  koptekst: string | null
  voettekst: string | null
  briefpapierUrl: string | null
}

/**
 * Combineert de globale `formulier_pdf_config` met de per-sjabloon override uit
 * `schema.instellingen.pdf`. Een niet-gezette override valt terug op de globale
 * waarde; een ontbrekende globale waarde valt terug op de standaard.
 */
export function mergePdfConfig(globaal: GlobalePdfConfig, perSjabloon?: FormPdfConfig): EffectievePdfConfig {
  const kies = <T>(override: T | undefined, glob: T | undefined, standaard: T): T =>
    override !== undefined && override !== null ? override : (glob ?? standaard)

  return {
    toonLogo:       kies(perSjabloon?.toonLogo,       globaal?.toon_logo,        true),
    toonInvuller:   kies(perSjabloon?.toonInvuller,   globaal?.toon_invuller,    true),
    toonProjectRef: kies(perSjabloon?.toonProjectRef, globaal?.toon_project_ref, true),
    koptekst:       (perSjabloon?.koptekst ?? undefined) || (globaal?.koptekst ?? null),
    voettekst:      (perSjabloon?.voettekst ?? undefined) || (globaal?.voettekst ?? null),
    briefpapierUrl: perSjabloon?.briefpapierUrl ?? null,
  }
}

// ── Hulp ───────────────────────────────────────────────────────────────

/** Hex (#rrggbb) → [r,g,b]; ongeldige of niet-hex waarden → null (val terug op standaard). */
export function hexNaarRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** URL → base64 data-URL (server-side fetch). Null bij fout. */
export async function urlNaarBase64(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' | 'WEBP' } | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf  = await resp.arrayBuffer()
    const b64  = Buffer.from(buf).toString('base64')
    const mime = resp.headers.get('content-type') ?? 'image/png'
    const format = mime.includes('jpeg') || mime.includes('jpg') ? 'JPEG' : mime.includes('webp') ? 'WEBP' : 'PNG'
    return { dataUrl: `data:${mime};base64,${b64}`, format }
  } catch {
    return null
  }
}

// ── Renderbare items (fields → PDF) ────────────────────────────────────

export type PdfItem =
  | { kind: 'row'; cells: [string, string]; stijl?: 'heading' | 'rijkop'; callout?: CalloutVariant }
  | { kind: 'pagebreak' }
  | { kind: 'image'; url: string; breedte: number; uitlijning?: 'links' | 'midden' | 'rechts' }

type RowMeta = { stijl?: 'heading' | 'rijkop'; callout?: CalloutVariant }

const PX_NAAR_MM = 25.4 / 96

/**
 * Rendert een lijst PdfItems: tabelrijen worden in `autoTable`-segmenten gezet,
 * onderbroken door pagina-einden (nieuwe pagina) en afbeeldingen (los getekend).
 * Retourneert de eind-Y.
 */
export async function renderPdfItems(
  doc: jsPDF,
  items: PdfItem[],
  opts: { startY: number; margin: number; pageW: number; pageH: number; accentRgb?: [number, number, number] | null },
): Promise<number> {
  const { margin, pageW, pageH } = opts
  const headFill: [number, number, number] = opts.accentRgb ?? [0, 148, 57]
  const contentW = pageW - margin * 2
  let y = opts.startY
  let buffer: { cells: [string, string]; meta: RowMeta }[] = []

  const flush = () => {
    if (buffer.length === 0) return
    const meta = buffer.map(b => b.meta)
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Veld', 'Antwoord']],
      body: buffer.map(b => b.cells),
      styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 } },
      headStyles: { fillColor: headFill, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 65, fontStyle: 'bold', textColor: [45, 55, 72] },
        1: { cellWidth: 'auto' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const m = meta[data.row.index]
        if (!m) return
        if (m.callout) {
          const cfg = CALLOUT_VARIANTEN[m.callout]
          data.cell.styles.fillColor = cfg.pdfAchtergrond
          data.cell.styles.textColor = cfg.pdfTekst
          data.cell.styles.fontStyle = 'bold'
        } else if (m.stijl === 'heading') {
          data.cell.styles.fillColor = [240, 244, 255]
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = [0, 100, 200]
        } else if (m.stijl === 'rijkop') {
          data.cell.styles.fillColor = [243, 244, 246]
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = [90, 90, 90]
        }
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY
    buffer = []
  }

  for (const item of items) {
    if (item.kind === 'row') {
      buffer.push({ cells: item.cells, meta: { stijl: item.stijl, callout: item.callout } })
      continue
    }
    if (item.kind === 'pagebreak') {
      flush()
      doc.addPage()
      y = margin
      continue
    }
    if (item.kind === 'image') {
      flush()
      const img = await urlNaarBase64(item.url)
      if (!img) continue
      let w = Math.min(item.breedte * PX_NAAR_MM, contentW)
      let h = w * 0.6
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = (doc as any).getImageProperties(img.dataUrl)
        if (props?.width && props?.height) h = w * (props.height / props.width)
      } catch { /* val terug op schatting */ }
      // Nieuwe pagina als de afbeelding niet meer op de huidige past.
      if (y + h > pageH - margin) { doc.addPage(); y = margin }
      const x = item.uitlijning === 'midden' ? margin + (contentW - w) / 2
        : item.uitlijning === 'rechts' ? pageW - margin - w
        : margin
      try { doc.addImage(img.dataUrl, img.format, x, y, w, h); y += h + 5 } catch { /* skip */ }
    }
  }

  flush()
  return y
}

/**
 * Legt het briefpapier (PDF) als achtergrond onder elke pagina. Best-effort:
 * bij ontbrekend/onbereikbaar briefpapier of een merge-fout blijven de originele bytes.
 */
export async function pasBriefpapierToe(
  bytes: ArrayBuffer | Uint8Array,
  url: string | null,
): Promise<ArrayBuffer | Uint8Array> {
  if (!url) return bytes
  const brief = await fetchBriefpapier(url)
  if (!brief) return bytes
  try {
    return await mergeBriefpapierBackground(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), brief)
  } catch {
    return bytes
  }
}
