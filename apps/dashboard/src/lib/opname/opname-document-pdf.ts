import 'server-only'
import { OPNAME_SOORT_LABELS, OPNAME_FOTO_SOORT_LABELS } from '@everts/database/opname-types'
import { veilig, wikkel } from '@/lib/pdf/tekst'
import type { PdfLogo } from '@/lib/pdf/logo'
import type { DocumentFoto, DocumentRegel, OpnameDocumentGegevens } from './opname-document-gegevens'

/**
 * Het opnamedocument als PDF: per ruimte wat er is opgenomen, met de foto's — en géén prijzen.
 *
 * Getekend met pdf-lib, net als het opleverrapport: geen Word-sjabloon en geen O365-conversie, zodat
 * het document ook ontstaat als Graph hapert. Puur (geen DB, geen sessie, geen netwerk): de foto's
 * komen als bytes binnen, zodat een scratch-script deze functie los kan renderen.
 */

const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 48
const KOLOM = A4.breedte - MARGE * 2
/** Onderkant van het schrijfvlak: daaronder staat de voettekst. */
const ONDERGRENS = MARGE + 28

/**
 * Foto's bij een regel: één rij thumbnails naast de codekolom. Vier van 98pt plus de tussenruimte
 * laten nog plek voor een "+n" als er meer zijn.
 */
export const REGEL_FOTO_MAX_PX = 700
const REGEL_FOTO_MAAT = 98
const REGEL_FOTO_GAT = 8
const MAX_FOTOS_PER_REGEL = 4

/** Algemene foto's: een raster van twee kolommen, groter dan de thumbnails. */
export const ALGEMEEN_FOTO_MAX_PX = 1000
const RASTER_GAT = 16
const RASTER_BREEDTE = (KOLOM - RASTER_GAT) / 2
const RASTER_HOOGTE = 180

const CODE_BREEDTE = 58
const AANTAL_BREEDTE = 90

function datumNL(iso: string | null | undefined): string {
  if (!iso) return '-'
  // `datum` is een kale date ('2026-10-01'); los parsen voorkomt een dag verschuiving door UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function aantalNL(n: number): string {
  return Number(n ?? 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })
}

export async function bouwOpnameDocumentPdf(
  g: OpnameDocumentGegevens,
  fotoBytes: Map<string, Uint8Array>,
  logo: PdfLogo | null,
  opgesteldOp: Date = new Date(),
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(veilig(`Opname ${g.opname.opnamenummer}${g.opname.adres ? ` - ${g.opname.adres}` : ''}`))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const schuin = await doc.embedFont(StandardFonts.HelveticaOblique)
  const GROEN = rgb(0, 0.58, 0.22)
  const GRIJS = rgb(0.42, 0.46, 0.49)
  const LICHTGRIJS = rgb(0.89, 0.91, 0.91)
  const TINT = rgb(0.925, 0.98, 0.94)
  const ZWART = rgb(0.1, 0.12, 0.14)
  type Font = typeof normaal
  type Kleur = ReturnType<typeof rgb>

  let pagina = doc.addPage([A4.breedte, A4.hoogte])
  let y = A4.hoogte - MARGE

  const nieuwePagina = () => {
    pagina = doc.addPage([A4.breedte, A4.hoogte])
    y = A4.hoogte - MARGE
  }
  /** Zorgt dat er nog `nodig` punten verticale ruimte is; zo niet: nieuwe pagina. */
  const ruimte = (nodig: number) => {
    if (y - nodig < ONDERGRENS) nieuwePagina()
  }
  const tekst = (s: string, opts: { x?: number; grootte?: number; font?: Font; kleur?: Kleur } = {}) => {
    pagina.drawText(veilig(s), {
      x: opts.x ?? MARGE,
      y,
      size: opts.grootte ?? 10,
      font: opts.font ?? normaal,
      color: opts.kleur ?? ZWART,
    })
  }
  const rechts = (s: string, opts: { grootte?: number; font?: Font; kleur?: Kleur; rand?: number } = {}) => {
    const font = opts.font ?? normaal
    const grootte = opts.grootte ?? 10
    const w = font.widthOfTextAtSize(veilig(s), grootte)
    tekst(s, { ...opts, x: (opts.rand ?? A4.breedte - MARGE) - w })
  }

  /** Eén keer insluiten per foto: elke `embedJpg` zet de bytes opnieuw in het bestand. */
  const ingesloten = new Map<string, Awaited<ReturnType<typeof doc.embedJpg>>>()

  /** Tekent een foto passend (niet vervormd) in een kader; false als hij niet in te sluiten is. */
  async function tekenFoto(url: string, x: number, boven: number, breedte: number, hoogte: number) {
    const bytes = fotoBytes.get(url)
    if (!bytes) return false
    try {
      let img = ingesloten.get(url)
      if (!img) {
        img = await doc.embedJpg(bytes)
        ingesloten.set(url, img)
      }
      const schaal = Math.min(breedte / img.width, hoogte / img.height)
      const w = img.width * schaal
      const h = img.height * schaal
      pagina.drawImage(img, { x: x + (breedte - w) / 2, y: boven - hoogte + (hoogte - h) / 2, width: w, height: h })
      pagina.drawRectangle({ x, y: boven - hoogte, width: breedte, height: hoogte, borderColor: LICHTGRIJS, borderWidth: 0.6 })
      return true
    } catch {
      return false
    }
  }

  /* ── Kop ── */
  const kopY = y
  if (logo) {
    try {
      const png = await doc.embedPng(Buffer.from(logo.dataUrl.split(',')[1] ?? '', 'base64'))
      const h = 34
      const w = (logo.breedte / logo.hoogte) * h
      pagina.drawImage(png, { x: A4.breedte - MARGE - w, y: kopY - h + 10, width: w, height: h })
    } catch {
      rechts('EVERTS.', { grootte: 14, font: vet })
    }
  } else {
    y = kopY - 4
    rechts('EVERTS.', { grootte: 14, font: vet })
    y = kopY
  }
  tekst('Opname', { grootte: 20, font: vet })
  y -= 18
  tekst(`${g.opname.opnamenummer}  -  ${OPNAME_SOORT_LABELS[g.opname.soort] ?? g.opname.soort}`, {
    grootte: 9.5,
    kleur: GRIJS,
  })
  y -= 10
  pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 1.6, color: GROEN })
  y -= 22

  /* ── Gegevens ── */
  const dossierTekst = [g.dossier.nummer, g.dossier.titel].filter(Boolean).join(' - ') || '-'
  const info: [string, string | null][] = [
    ['Adres', g.opname.adres],
    ['VHE', g.opname.vhe],
    ['Opdrachtgever', g.opdrachtgever],
    ['Dossier', dossierTekst],
    ['Datum opname', datumNL(g.opname.datum)],
    ['Opnemer', g.opname.opnemer],
  ]
  for (const [label, waarde] of info) {
    if (!waarde) continue
    ruimte(16)
    tekst(label, { grootte: 9, kleur: GRIJS })
    for (const regel of wikkel(waarde, normaal, 10, KOLOM - 110)) {
      tekst(regel, { x: MARGE + 110, grootte: 10 })
      y -= 13
    }
    y -= 2
  }
  if (g.opname.opmerking?.trim()) {
    y -= 6
    const regels = wikkel(g.opname.opmerking.trim(), normaal, 9.5, KOLOM - 20)
    const hoogte = regels.length * 12 + 26
    ruimte(hoogte)
    pagina.drawRectangle({ x: MARGE, y: y - hoogte + 12, width: KOLOM, height: hoogte, color: TINT })
    y -= 4
    tekst('Opmerking', { x: MARGE + 10, grootte: 8.5, font: vet, kleur: GRIJS })
    y -= 13
    for (const r of regels) {
      tekst(r, { x: MARGE + 10, grootte: 9.5 })
      y -= 12
    }
    y -= 10
  }

  /* ── Opgenomen werkzaamheden, per ruimte ── */
  const aantalRegels = g.ruimtes.reduce((s, r) => s + r.regels.length, 0)
  y -= 14
  ruimte(30)
  tekst(`Opgenomen werkzaamheden (${aantalRegels})`, { grootte: 11, font: vet })
  y -= 18

  if (aantalRegels === 0) {
    tekst('Er zijn bij deze opname geen werkzaamheden vastgelegd.', { grootte: 10, kleur: GRIJS })
    y -= 14
  }

  const OMSCHRIJVING_BREEDTE = KOLOM - CODE_BREEDTE - AANTAL_BREEDTE - 8

  /** Hoogte van één regel, vooraf berekend zodat een regel nooit over een paginagrens breekt. */
  function regelMaat(regel: DocumentRegel) {
    const omschrijving = wikkel(regel.omschrijving, vet, 10, OMSCHRIJVING_BREEDTE)
    const toelichting = regel.toelichting_opnemer?.trim()
      ? wikkel(regel.toelichting_opnemer.trim(), schuin, 9, OMSCHRIJVING_BREEDTE)
      : []
    const fotos = g.fotosPerRegel.get(regel.id) ?? []
    const tekenbaar = fotos.filter(f => fotoBytes.has(f.url))
    const hoogte =
      omschrijving.length * 13 +
      toelichting.length * 11 +
      (tekenbaar.length ? REGEL_FOTO_MAAT + 10 : 0) +
      14
    return { omschrijving, toelichting, fotos: tekenbaar, hoogte }
  }

  async function tekenRegel(regel: DocumentRegel) {
    const maat = regelMaat(regel)
    ruimte(maat.hoogte)
    const startY = y

    tekst(regel.onderdeel_code ?? '', { grootte: 8.5, kleur: GRIJS })
    rechts(`${aantalNL(regel.aantal)} ${regel.eenheid ?? ''}`.trim(), { grootte: 10, font: vet })
    for (const r of maat.omschrijving) {
      tekst(r, { x: MARGE + CODE_BREEDTE, grootte: 10, font: vet })
      y -= 13
    }
    for (const r of maat.toelichting) {
      tekst(r, { x: MARGE + CODE_BREEDTE, grootte: 9, font: schuin, kleur: GRIJS })
      y -= 11
    }

    if (maat.fotos.length) {
      y -= 2
      const boven = y
      let x = MARGE + CODE_BREEDTE
      for (const f of maat.fotos.slice(0, MAX_FOTOS_PER_REGEL)) {
        if (await tekenFoto(f.url, x, boven, REGEL_FOTO_MAAT, REGEL_FOTO_MAAT)) x += REGEL_FOTO_MAAT + REGEL_FOTO_GAT
      }
      // Meer foto's dan er passen: tellen, niet stilletjes weglaten. Ze staan in de app/het dossier.
      const meer = maat.fotos.length - MAX_FOTOS_PER_REGEL
      if (meer > 0) {
        pagina.drawText(`+${meer}`, {
          x: x + 2,
          y: boven - REGEL_FOTO_MAAT / 2 - 3,
          size: 9,
          font: vet,
          color: GRIJS,
        })
      }
      y = boven - REGEL_FOTO_MAAT - 8
    }

    y = Math.min(y, startY - 13) - 4
    pagina.drawRectangle({ x: MARGE, y: y + 2, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    y -= 10
  }

  for (const groep of g.ruimtes) {
    // Kop + eerste regel samen: een ruimtekop die alleen onderaan een pagina staat, helpt niemand.
    const eerste = groep.regels[0] ? regelMaat(groep.regels[0]).hoogte : 0
    ruimte(28 + eerste)
    y -= 4
    pagina.drawRectangle({ x: MARGE, y: y - 6, width: KOLOM, height: 20, color: TINT })
    tekst(groep.ruimte, { x: MARGE + 8, grootte: 10.5, font: vet })
    rechts(`${groep.regels.length} ${groep.regels.length === 1 ? 'punt' : 'punten'}`, {
      grootte: 8.5,
      kleur: GRIJS,
      rand: A4.breedte - MARGE - 8,
    })
    y -= 24
    for (const regel of groep.regels) await tekenRegel(regel)
    y -= 6
  }

  /* ── Algemene foto's ── */
  const algemeen = g.algemeneFotos.filter(f => fotoBytes.has(f.url))
  if (algemeen.length) {
    y -= 10
    ruimte(40 + RASTER_HOOGTE + 30)
    tekst(`Algemene foto's (${algemeen.length})`, { grootte: 11, font: vet })
    y -= 6
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.8, color: LICHTGRIJS })
    y -= 14

    const onderschrift = (f: DocumentFoto) =>
      [OPNAME_FOTO_SOORT_LABELS[f.soort], f.omschrijving?.trim()].filter(Boolean).join(' - ')

    for (let i = 0; i < algemeen.length; i += 2) {
      const paar = algemeen.slice(i, i + 2)
      const bijschriften = paar.map(f => wikkel(onderschrift(f), normaal, 8.5, RASTER_BREEDTE).slice(0, 2))
      const tekstHoogte = Math.max(...bijschriften.map(b => b.length)) * 11
      ruimte(RASTER_HOOGTE + tekstHoogte + 18)
      const boven = y
      for (let k = 0; k < paar.length; k++) {
        const x = MARGE + k * (RASTER_BREEDTE + RASTER_GAT)
        await tekenFoto(paar[k].url, x, boven, RASTER_BREEDTE, RASTER_HOOGTE)
        let ty = boven - RASTER_HOOGTE - 12
        for (const r of bijschriften[k]) {
          pagina.drawText(veilig(r), { x, y: ty, size: 8.5, font: normaal, color: GRIJS })
          ty -= 11
        }
      }
      y = boven - RASTER_HOOGTE - tekstHoogte - 18
    }
  }

  /* ── Voettekst + paginanummers ── */
  const opgesteld = opgesteldOp.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })
  const voet = veilig(`Opname ${g.opname.opnamenummer} - opgesteld via EVA op ${opgesteld}`)
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: MARGE, y: MARGE + 14, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    p.drawText(voet, { x: MARGE, y: MARGE, size: 8, font: normaal, color: GRIJS })
    const nr = `Pagina ${i + 1} van ${paginas.length}`
    p.drawText(nr, { x: A4.breedte - MARGE - normaal.widthOfTextAtSize(nr, 8), y: MARGE, size: 8, font: normaal, color: GRIJS })
  })

  return doc.save()
}

/**
 * Stabiele bestandsnaam per opname. Bij opnieuw maken overschrijft SharePoint daardoor hetzelfde
 * bestand en blijft het item-id gelijk — en daarmee ook de "In app"-sleutel `sharepoint:<itemId>`.
 */
export function opnameDocumentBestandsnaam(opnamenummer: string, adres: string | null): string {
  const kern = [opnamenummer, adres].filter(Boolean).join(' - ')
  const schoon = veilig(kern).replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim() || 'opname'
  return `Opname ${schoon}`.slice(0, 110) + '.pdf'
}
