import type jsPDF from 'jspdf'
import type { CalloutVariant, FormPdfConfig, VeldOpmaak, FormField } from './types'
import { CALLOUT_VARIANTEN } from './types'
import { formatVeldwaardeTekst } from './format'
import { fetchBriefpapier, mergeBriefpapierBackground } from '@/lib/everts-calc/briefpapier'

// ── Per-sjabloon PDF-config over de globale singleton leggen ───────────

export type GlobalePdfConfig = {
  toon_logo: boolean
  toon_invuller: boolean
  toon_project_ref: boolean
  koptekst: string | null
  voettekst: string | null
  briefpapier_marge_boven_mm?: number | null
  briefpapier_marge_onder_mm?: number | null
} | null

export type EffectievePdfConfig = {
  toonLogo: boolean
  toonInvuller: boolean
  toonProjectRef: boolean
  koptekst: string | null
  voettekst: string | null
  briefpapierUrl: string | null
  briefpapierMargeBoven: number
  briefpapierMargeOnder: number
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
    briefpapierMargeBoven: globaal?.briefpapier_marge_boven_mm ?? 42,
    briefpapierMargeOnder: globaal?.briefpapier_marge_onder_mm ?? 26,
  }
}

// ── Hulp ───────────────────────────────────────────────────────────────

export type Rgb = [number, number, number]
export type Marge = { boven: number; onder: number; links: number; rechts: number }
export type Afbeelding = { dataUrl: string; format: 'PNG' | 'JPEG' | 'WEBP' }

const PX_NAAR_MM = 25.4 / 96

// Kleurenpalet (documentstijl)
const KLEUR_LABEL: Rgb  = [90, 95, 105]
const KLEUR_WAARDE: Rgb = [30, 35, 42]
const KLEUR_MUTED: Rgb  = [130, 135, 142]
const KLEUR_LIJN: Rgb   = [232, 234, 238]
const KLEUR_ACCENT_STD: Rgb = [0, 148, 57]

/** Hex (#rrggbb) → [r,g,b]; ongeldige of niet-hex waarden → null (val terug op standaard). */
export function hexNaarRgb(hex?: string | null): Rgb | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function dataUrlFormat(u: string): 'PNG' | 'JPEG' | 'WEBP' {
  const m = /^data:image\/(png|jpe?g|webp)/i.exec(u)
  if (!m) return 'PNG'
  const t = m[1].toLowerCase()
  return t.startsWith('jp') ? 'JPEG' : t === 'webp' ? 'WEBP' : 'PNG'
}

/** URL → base64 data-URL (server-side fetch). Null bij fout. */
export async function urlNaarBase64(url: string): Promise<Afbeelding | null> {
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

// ── Renderbare blokken (fields → PDF) ──────────────────────────────────

export type PdfBlok =
  | { kind: 'sectie'; label: string }
  | { kind: 'veld'; label: string; waarde: string }
  | { kind: 'langeTekst'; label: string; waarde: string }
  | { kind: 'jaNee'; label: string; waarde: 'ja' | 'nee' | 'leeg' }
  | { kind: 'callout'; variant: CalloutVariant; tekst: string }
  | { kind: 'afbeeldingen'; label?: string; beelden: Afbeelding[]; breedteMm?: number; uitlijning?: 'links' | 'midden' | 'rechts' }
  | { kind: 'handtekening'; label: string; dataUrl: string }
  | { kind: 'herhaling'; label: string; rijen: { label: string; waarde: string }[][] }
  | { kind: 'paragraaf'; tekst: string; opmaak?: VeldOpmaak }
  | { kind: 'pagina-einde' }

/** Voorbeeld-waarde per veldtype (typed, in de opslag-vorm) voor de sjabloon-preview. */
export function dummyWaarde(field: FormField): unknown {
  switch (field.type) {
    case 'text':
    case 'barcode':    return 'Voorbeeld tekst'
    case 'textarea':   return 'Langere voorbeeldtekst met meerdere woorden om te tonen hoe lopende tekst in de PDF wordt weergegeven.'
    case 'number':     return 42
    case 'rating':     return Math.min(field.validation?.max ?? 5, 4)
    case 'date':       return new Date().toISOString().slice(0, 10)
    case 'time':       return '09:30'
    case 'dropdown':
    case 'radio':      return field.options?.[0]?.value ?? ''
    case 'checkbox':   return (field.options ?? []).slice(0, 2).map(o => o.value)
    case 'boolean':    return true
    case 'medewerker': return [{ id: '1', naam: 'Jan Jansen' }, { id: '2', naam: 'Piet Peters' }]
    case 'location':   return { lat: 52.3676, lng: 4.9041, adres: 'Voorbeeldstraat 1, Amsterdam' }
    case 'dossier':    return 'Automatisch uit dossier'
    case 'file':       return { name: 'document.pdf', size: 12345 }
    case 'photo':      return []   // placeholder-blok via preview-vlag
    case 'signature':  return ''   // placeholder-blok via preview-vlag
    case 'repeatable': return [Object.fromEntries((field.children ?? []).map(c => [c.id, dummyWaarde(c)]))]
    default:           return ''
  }
}

/** Bouwt de renderbare blokken uit de velddefinities + waarden. */
export async function buildBlokken(
  fields: FormField[],
  waardeVoor: (f: FormField) => unknown,
  opts: { preview?: boolean } = {},
): Promise<PdfBlok[]> {
  const preview = !!opts.preview
  const blokken: PdfBlok[] = []

  for (const field of fields) {
    switch (field.type) {
      case 'divider':
        continue
      case 'pagebreak':
        blokken.push({ kind: 'pagina-einde' })
        continue
      case 'heading':
        blokken.push({ kind: 'sectie', label: field.label })
        continue
      case 'paragraph':
        blokken.push({ kind: 'paragraaf', tekst: field.label, opmaak: field.opmaak })
        continue
      case 'callout':
        blokken.push({ kind: 'callout', variant: field.opmaak?.variant ?? 'info', tekst: field.label })
        continue
      case 'image': {
        if (field.afbeeldingUrl) {
          const img = await urlNaarBase64(field.afbeeldingUrl)
          if (img) blokken.push({ kind: 'afbeeldingen', beelden: [img], breedteMm: (field.afbeeldingBreedte ?? 200) * PX_NAAR_MM, uitlijning: field.opmaak?.uitlijning })
        }
        continue
      }
      case 'photo': {
        const v = waardeVoor(field)
        const urls = Array.isArray(v) ? (v as string[]).filter(u => typeof u === 'string' && u.startsWith('data:')) : []
        if (urls.length) blokken.push({ kind: 'afbeeldingen', label: field.label, beelden: urls.map(u => ({ dataUrl: u, format: dataUrlFormat(u) })) })
        else if (preview)  blokken.push({ kind: 'afbeeldingen', label: field.label, beelden: [] })
        else               blokken.push({ kind: 'veld', label: field.label, waarde: '—' })
        continue
      }
      case 'signature': {
        const v = waardeVoor(field)
        if (typeof v === 'string' && v.startsWith('data:')) blokken.push({ kind: 'handtekening', label: field.label, dataUrl: v })
        else if (preview)  blokken.push({ kind: 'handtekening', label: field.label, dataUrl: '' })
        else               blokken.push({ kind: 'veld', label: field.label, waarde: '—' })
        continue
      }
      case 'textarea':
        blokken.push({ kind: 'langeTekst', label: field.label, waarde: formatVeldwaardeTekst(field, waardeVoor(field)) })
        continue
      case 'boolean': {
        const v = waardeVoor(field)
        blokken.push({ kind: 'jaNee', label: field.label, waarde: v === true ? 'ja' : v === false ? 'nee' : 'leeg' })
        continue
      }
      case 'repeatable': {
        const raw = waardeVoor(field)
        const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
        const kinderen = (field.children ?? []).filter(c => c.type !== 'divider' && c.type !== 'pagebreak')
        const rijen = rows.map(row => kinderen.map(c => {
          const structureel = c.type === 'heading' || c.type === 'paragraph' || c.type === 'callout'
          const waarde = structureel ? c.label
            : c.type === 'photo' ? '[Foto]'
            : c.type === 'signature' ? '[Handtekening]'
            : formatVeldwaardeTekst(c, row[c.id])
          return { label: structureel ? '' : c.label, waarde }
        }))
        blokken.push({ kind: 'herhaling', label: field.label, rijen })
        continue
      }
      default:
        blokken.push({ kind: 'veld', label: field.label, waarde: formatVeldwaardeTekst(field, waardeVoor(field)) })
    }
  }

  return blokken
}

// ── Kop / voettekst ────────────────────────────────────────────────────

type Layout = { pageW: number; pageH: number; marge: Marge; accentRgb?: Rgb | null }

export function tekenKop(
  doc: jsPDF,
  opts: Layout & { titel: string; subtitel?: string; metaDelen?: string[]; logo?: Afbeelding | null; briefpapier?: boolean },
): number {
  const { pageW, marge, titel, subtitel, metaDelen, logo, briefpapier } = opts
  const accent = opts.accentRgb ?? KLEUR_ACCENT_STD
  const contentW = pageW - marge.links - marge.rechts
  let y = marge.boven

  if (logo && !briefpapier) {
    try { doc.addImage(logo.dataUrl, logo.format, marge.links, y, 36, 12); y += 15 } catch { /* logo niet bruikbaar */ }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...KLEUR_WAARDE)
  doc.text(titel, marge.links, y + 5)
  y += 8

  if (subtitel) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...KLEUR_MUTED)
    doc.text(subtitel, marge.links, y + 3); y += 6
  }
  if (metaDelen && metaDelen.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...KLEUR_MUTED)
    doc.text(metaDelen.join('   |   '), marge.links, y + 3); y += 6
  }

  y += 2
  doc.setDrawColor(...accent); doc.setLineWidth(0.5)
  doc.line(marge.links, y, marge.links + contentW, y)
  return y + 6
}

export function tekenPaginavoettekst(
  doc: jsPDF,
  opts: Layout & { voettekst?: string; briefpapier?: boolean },
): void {
  const { pageW, pageH, marge, voettekst, briefpapier } = opts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totaal: number = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totaal; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(160, 160, 160)
    if (briefpapier) {
      // Alleen paginanummer, nét binnen de veilige ondermarge (briefpapier heeft eigen voet).
      doc.text(`Pagina ${i} van ${totaal}`, pageW - marge.rechts, pageH - marge.onder + 4, { align: 'right' })
    } else {
      if (voettekst) doc.text(voettekst, marge.links, pageH - 10)
      doc.text(`Pagina ${i} van ${totaal}`, pageW - marge.rechts, pageH - 10, { align: 'right' })
    }
  }
}

// ── Rapport-renderer ───────────────────────────────────────────────────

/** Tekent de blokken als vloeiend document met automatische paginabreuk. */
export async function renderReport(
  doc: jsPDF,
  blokken: PdfBlok[],
  opts: Layout & { startY: number; opNieuwePagina?: (doc: jsPDF) => void },
): Promise<void> {
  const { pageW, pageH, marge } = opts
  const accent = opts.accentRgb ?? KLEUR_ACCENT_STD
  const contentW = pageW - marge.links - marge.rechts
  let y = opts.startY

  const nieuwePagina = () => { doc.addPage(); y = marge.boven; opts.opNieuwePagina?.(doc) }
  const ensure = (h: number) => { if (y + h > pageH - marge.onder) nieuwePagina() }
  const scheiding = () => {
    doc.setDrawColor(...KLEUR_LIJN); doc.setLineWidth(0.2)
    doc.line(marge.links, y, marge.links + contentW, y)
    y += 1
  }
  const beeldHoogte = (b: Afbeelding, w: number): number => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (doc as any).getImageProperties(b.dataUrl)
      if (p?.width && p?.height) return w * (p.height / p.width)
    } catch { /* val terug op schatting */ }
    return w * 0.7
  }
  const miniLabel = (label: string) => {
    ensure(6)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KLEUR_LABEL)
    doc.text(label, marge.links, y + 3); y += 5
  }

  for (const blok of blokken) {
    switch (blok.kind) {
      case 'pagina-einde': {
        nieuwePagina()
        break
      }

      case 'sectie': {
        y += 3
        ensure(9)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...accent)
        doc.text(blok.label.toUpperCase(), marge.links, y + 3, { charSpace: 0.4 })
        y += 5
        doc.setDrawColor(...accent); doc.setLineWidth(0.4)
        doc.line(marge.links, y, marge.links + contentW, y)
        y += 4
        break
      }

      case 'veld': {
        const labelW = 48, gap = 4
        const valW = contentW - labelW - gap
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        const labelLines = doc.splitTextToSize(blok.label || '', labelW) as string[]
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        const valLines = doc.splitTextToSize(blok.waarde || '—', valW) as string[]
        const h = Math.max(labelLines.length * 4.2, valLines.length * 4.6) + 3.5
        ensure(h)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KLEUR_LABEL)
        labelLines.forEach((ln, i) => doc.text(ln, marge.links, y + 3.1 + i * 4.2))
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...KLEUR_WAARDE)
        valLines.forEach((ln, i) => doc.text(ln, marge.links + labelW + gap, y + 3.4 + i * 4.6))
        y += h
        scheiding()
        break
      }

      case 'langeTekst': {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
        const labelLines = doc.splitTextToSize(blok.label || '', contentW) as string[]
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        const valLines = doc.splitTextToSize(blok.waarde || '—', contentW - 3) as string[]
        const h = labelLines.length * 4.2 + 1.5 + valLines.length * 4.6 + 3.5
        ensure(h)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KLEUR_LABEL)
        labelLines.forEach((ln, i) => doc.text(ln, marge.links, y + 3.1 + i * 4.2))
        y += labelLines.length * 4.2 + 1.5
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...KLEUR_WAARDE)
        valLines.forEach((ln, i) => doc.text(ln, marge.links + 3, y + 3.4 + i * 4.6))
        y += valLines.length * 4.6 + 3.5
        scheiding()
        break
      }

      case 'jaNee': {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        const labelLines = doc.splitTextToSize(blok.label || '', contentW - 22) as string[]
        const h = Math.max(6.5, labelLines.length * 4.4 + 2.5)
        ensure(h)
        doc.setTextColor(...KLEUR_WAARDE)
        labelLines.forEach((ln, i) => doc.text(ln, marge.links, y + 3.4 + i * 4.4))
        const tekst = blok.waarde === 'ja' ? 'Ja' : blok.waarde === 'nee' ? 'Nee' : '—'
        const kleur: Rgb = blok.waarde === 'ja' ? [22, 163, 74] : blok.waarde === 'nee' ? [220, 38, 38] : [160, 160, 160]
        doc.setFont('helvetica', 'bold')
        const tw = doc.getTextWidth(tekst)
        const rx = marge.links + contentW
        if (blok.waarde !== 'leeg') { doc.setFillColor(...kleur); doc.circle(rx - tw - 3, y + 2.6, 1.1, 'F') }
        doc.setTextColor(...kleur)
        doc.text(tekst, rx - tw, y + 3.4)
        y += h
        scheiding()
        break
      }

      case 'callout': {
        const cfg = CALLOUT_VARIANTEN[blok.variant]
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
        const lines = doc.splitTextToSize(blok.tekst || '', contentW - 12) as string[]
        const h = lines.length * 4.4 + 6
        y += 1
        ensure(h + 2)
        doc.setFillColor(...cfg.pdfAchtergrond)
        doc.roundedRect(marge.links, y, contentW, h, 1.5, 1.5, 'F')
        doc.setFillColor(...cfg.pdfTekst)
        doc.rect(marge.links, y, 1.4, h, 'F')
        doc.setTextColor(...cfg.pdfTekst)
        lines.forEach((ln, i) => doc.text(ln, marge.links + 6, y + 4.2 + i * 4.4))
        y += h + 3
        break
      }

      case 'afbeeldingen': {
        if (blok.label) miniLabel(blok.label)
        if (blok.beelden.length === 0) {
          ensure(28)
          doc.setDrawColor(...KLEUR_LIJN); doc.setFillColor(248, 249, 251)
          doc.roundedRect(marge.links, y, 42, 26, 1.5, 1.5, 'FD')
          doc.setTextColor(...KLEUR_MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
          doc.text('Foto', marge.links + 21, y + 14, { align: 'center' })
          y += 30
          break
        }
        const gap = 4
        const baseW = blok.breedteMm ? Math.min(blok.breedteMm, contentW) : 42
        let x = marge.links
        let rowH = 0
        for (const b of blok.beelden) {
          const w = Math.min(baseW, contentW)
          const h = beeldHoogte(b, w)
          if (x > marge.links && x + w > marge.links + contentW + 0.1) { y += rowH + gap; x = marge.links; rowH = 0 }
          if (y + h > pageH - marge.onder) { nieuwePagina(); x = marge.links; rowH = 0 }
          try {
            doc.addImage(b.dataUrl, b.format, x, y, w, h)
            doc.setDrawColor(...KLEUR_LIJN); doc.setLineWidth(0.2); doc.rect(x, y, w, h)
          } catch { /* skip onbruikbaar beeld */ }
          x += w + gap
          rowH = Math.max(rowH, h)
        }
        y += rowH + 4
        break
      }

      case 'handtekening': {
        miniLabel(blok.label)
        if (!blok.dataUrl) {
          ensure(20)
          doc.setDrawColor(...KLEUR_LIJN); doc.setFillColor(248, 249, 251)
          doc.roundedRect(marge.links, y, 60, 18, 1.5, 1.5, 'FD')
          doc.setTextColor(...KLEUR_MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
          doc.text('Handtekening', marge.links + 30, y + 10, { align: 'center' })
          y += 22
          break
        }
        const w = 60
        const h = beeldHoogte({ dataUrl: blok.dataUrl, format: 'PNG' }, w)
        ensure(h + 4)
        try { doc.addImage(blok.dataUrl, 'PNG', marge.links, y, w, h) } catch { /* skip */ }
        doc.setDrawColor(...KLEUR_LIJN); doc.setLineWidth(0.2)
        doc.line(marge.links, y + h + 1, marge.links + w, y + h + 1)
        y += h + 5
        break
      }

      case 'herhaling': {
        ensure(8)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...KLEUR_WAARDE)
        doc.text(blok.label, marge.links, y + 4); y += 7
        if (blok.rijen.length === 0) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...KLEUR_MUTED)
          doc.text('(geen rijen)', marge.links + 2, y + 3); y += 6
          break
        }
        blok.rijen.forEach((rij, i) => {
          const innerX = marge.links + 5
          const innerW = contentW - 8
          // Meet de kaarthoogte
          const gemeten = rij.map(c => {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
            const labW = c.label ? doc.getTextWidth(c.label + ':  ') : 0
            doc.setFont('helvetica', 'normal')
            const lines = doc.splitTextToSize(c.waarde || '—', innerW - labW) as string[]
            return { c, labW, lines }
          })
          const cardH = 6 + gemeten.reduce((s, g) => s + g.lines.length * 4.2, 0) + 1.5
          ensure(cardH + 2)
          doc.setFillColor(...accent); doc.rect(marge.links, y, 1.2, cardH, 'F')
          doc.setFillColor(249, 250, 251); doc.rect(marge.links + 1.2, y, contentW - 1.2, cardH, 'F')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...KLEUR_MUTED)
          doc.text(`#${i + 1}`, innerX, y + 4)
          let cy = y + 6
          gemeten.forEach(({ c, labW, lines }) => {
            if (c.label) {
              doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...KLEUR_LABEL)
              doc.text(c.label + ':', innerX, cy + 2.2)
            }
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...KLEUR_WAARDE)
            lines.forEach((ln, li) => doc.text(ln, innerX + labW, cy + 2.2 + li * 4.2))
            cy += lines.length * 4.2
          })
          y += cardH + 2.5
        })
        break
      }

      case 'paragraaf': {
        const o = blok.opmaak
        const style = o?.vet && o?.cursief ? 'bolditalic' : o?.vet ? 'bold' : o?.cursief ? 'italic' : 'normal'
        doc.setFont('helvetica', style); doc.setFontSize(10)
        doc.setTextColor(...(o?.kleur ? (hexNaarRgb(o.kleur) ?? KLEUR_MUTED) : KLEUR_MUTED))
        const lines = doc.splitTextToSize(blok.tekst || '', contentW) as string[]
        const align = o?.uitlijning === 'midden' ? 'center' : o?.uitlijning === 'rechts' ? 'right' : 'left'
        const x = align === 'center' ? marge.links + contentW / 2 : align === 'right' ? marge.links + contentW : marge.links
        const h = lines.length * 4.6 + 3
        ensure(h)
        lines.forEach((ln, i) => doc.text(ln, x, y + 3.4 + i * 4.6, { align }))
        y += h
        break
      }
    }
  }
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
