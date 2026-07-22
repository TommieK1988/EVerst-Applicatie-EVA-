import 'server-only'
import { opleverPuntStatusLabels, type OpleverPuntStatus } from '@everts/database'
import { getOplevermomentRapport, type OpleverPuntView } from './oplevering'
import { splitsFotos, bewijsOntbreekt } from './oplever-fotos'

/**
 * Opleverrapportage als PDF, opgebouwd met pdf-lib (zelfde aanpak als de briefpapier-merge).
 * Bewust géén HTML→PDF: dat vraagt een headless browser die op Vercel serverless niet draait, en
 * de docx→PDF-route van de offerte vereist O365. Hier tekenen we direct, dus de bijlage werkt
 * overal en zonder externe afhankelijkheid.
 */

const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 48
const KOLOM = A4.breedte - MARGE * 2

/**
 * Max. aantal foto's per kolom (voor/na) in de bijlage — houdt het rapport en de mail hanteerbaar.
 * Drie thumbnails van 68pt passen naast elkaar in een halve tekstkolom.
 */
const MAX_FOTOS_PER_KOLOM = 3
/** Ruimhartig: de bron mag groot zijn, we verkleinen hem hierna zelf. */
const MAX_FOTO_BYTES = 25 * 1024 * 1024
/**
 * Foto's worden vóór het insluiten teruggeschaald. pdf-lib sluit afbeeldingsbytes ongewijzigd in,
 * dus zonder deze stap levert één telefoonfoto al megabytes op en overschrijdt de mailbijlage de
 * limiet van Graph sendMail (~4 MB per bericht).
 */
const FOTO_MAX_PX = 900
const HANDTEKENING_MAX_PX = 600
const JPEG_KWALITEIT = 72

/**
 * De standaardfonts van pdf-lib kunnen alleen WinAnsi coderen; een em-dash of krul-apostrof laat
 * het tekenen crashen. Vervang de gangbare tekens en gooi de rest eruit.
 */
function veilig(tekst: unknown): string {
  return String(tekst ?? '')
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/\u00A0/g, ' ')
    // Alles buiten WinAnsi (en stuurtekens) eruit; anders klapt drawText.
    .replace(/[^\x20-\xFF]/g, '')
}

type Font = Awaited<ReturnType<Awaited<ReturnType<typeof import('pdf-lib')['PDFDocument']['create']>>['embedFont']>>

/** Breekt tekst af op woordgrenzen binnen `maxBreedte`. */
function wikkel(tekst: string, font: Font, grootte: number, maxBreedte: number): string[] {
  const woorden = veilig(tekst).split(/\s+/).filter(Boolean)
  if (woorden.length === 0) return ['']
  const regels: string[] = []
  let regel = ''
  for (const w of woorden) {
    const kandidaat = regel ? `${regel} ${w}` : w
    if (font.widthOfTextAtSize(kandidaat, grootte) <= maxBreedte) {
      regel = kandidaat
    } else {
      if (regel) regels.push(regel)
      // Losse woorden die zelf te breed zijn hard afkappen.
      let rest = w
      while (font.widthOfTextAtSize(rest, grootte) > maxBreedte && rest.length > 1) {
        let n = rest.length
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), grootte) > maxBreedte) n--
        regels.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      regel = rest
    }
  }
  if (regel) regels.push(regel)
  return regels
}

/**
 * Haalt een afbeelding op en maakt er een compacte JPEG van op maat.
 *
 * Alles gaat door sharp: dat verkleint (scheelt megabytes per foto), respecteert de EXIF-oriëntatie
 * (telefoonfoto's staan anders op hun kant), en accepteert ook webp/tiff die pdf-lib zelf niet kan
 * insluiten. `flatten` zet transparantie op wit — zonder dat wordt de achtergrond van een
 * handtekening-PNG zwart in JPEG.
 */
async function haalAfbeelding(url: string, maxPx: number): Promise<{ bytes: Uint8Array } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_FOTO_BYTES) return null

    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_KWALITEIT, mozjpeg: true })
      .toBuffer()
    return { bytes: new Uint8Array(jpeg) }
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → punt zonder foto tonen.
    return null
  }
}

const STATUS_RGB: Record<OpleverPuntStatus, [number, number, number]> = {
  nieuw:          [0.48, 0.35, 0.09],
  open:           [0.42, 0.46, 0.49],
  in_behandeling: [0.11, 0.31, 0.54],
  opgelost:       [0.48, 0.35, 0.09],
  geaccepteerd:   [0.11, 0.48, 0.25],
  geweigerd:      [0.63, 0.13, 0.13],
  afgewezen:      [0.42, 0.46, 0.49],
}

/**
 * Bouwt de opleverrapportage-PDF voor één oplevermoment.
 * @returns PDF-bytes, of null als het moment niet bestaat.
 */
export async function genereerOpleverRapportPdf(momentId: string): Promise<Uint8Array | null> {
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return null
  const { dossier, moment, punten, aandachtspunten, handtekeningen } = rapport

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(veilig(`Opleverrapport ${dossier.nummer ?? ''} ${moment.titel}`))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const GROEN = rgb(0, 0.58, 0.22)
  const GRIJS = rgb(0.42, 0.46, 0.49)
  const LICHTGRIJS = rgb(0.89, 0.91, 0.91)
  const ZWART = rgb(0.1, 0.12, 0.14)

  let pagina = doc.addPage([A4.breedte, A4.hoogte])
  let y = A4.hoogte - MARGE

  const nieuwePagina = () => {
    pagina = doc.addPage([A4.breedte, A4.hoogte])
    y = A4.hoogte - MARGE
  }
  /** Zorgt dat er nog `nodig` punten verticale ruimte is; zo niet: nieuwe pagina. */
  const ruimte = (nodig: number) => {
    if (y - nodig < MARGE + 28) nieuwePagina()
  }
  const tekst = (s: string, opts: { x?: number; grootte?: number; font?: Font; kleur?: ReturnType<typeof rgb> }) => {
    pagina.drawText(veilig(s), {
      x: opts.x ?? MARGE, y, size: opts.grootte ?? 10,
      font: opts.font ?? normaal, color: opts.kleur ?? ZWART,
    })
  }

  /* ── Kop ── */
  pagina.drawText('EVERTS.', { x: A4.breedte - MARGE - vet.widthOfTextAtSize('EVERTS.', 14), y: y - 4, size: 14, font: vet, color: ZWART })
  tekst('Opleverrapport', { grootte: 20, font: vet })
  y -= 18
  tekst(`${moment.type} - ${moment.status.replace(/_/g, ' ')}`, { grootte: 9.5, kleur: GRIJS })
  y -= 10
  pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 1.6, color: GROEN })
  y -= 22

  /* ── Projectgegevens ── */
  const datum = moment.opgeleverd_op
    ? new Date(moment.opgeleverd_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(moment.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const info: [string, string][] = [
    ['Project', dossier.titel ?? '-'],
    ['Projectnummer', dossier.nummer ?? '-'],
    ['Opdrachtgever', dossier.klant ?? '-'],
    ['Werkadres', dossier.werkadres ?? '-'],
    ['Oplevering', moment.titel],
    ['Datum', datum],
  ]
  for (const [label, waarde] of info) {
    ruimte(16)
    tekst(label, { grootte: 9, kleur: GRIJS })
    for (const regel of wikkel(waarde, normaal, 10, KOLOM - 110)) {
      tekst(regel, { x: MARGE + 110, grootte: 10 })
      y -= 13
    }
    y -= 2
  }

  /* ── Opleverpunten ── */
  y -= 12
  ruimte(30)
  const aantalGeaccepteerd = punten.filter(p => p.status === 'geaccepteerd').length
  tekst(`Opleverpunten (${punten.length}) - ${aantalGeaccepteerd} geaccepteerd`, { grootte: 11, font: vet })
  y -= 6
  pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.8, color: LICHTGRIJS })
  y -= 16

  if (punten.length === 0) {
    tekst('Geen opleverpunten geregistreerd.', { grootte: 10, kleur: GRIJS })
    y -= 14
  }

  /**
   * Eén kolom voor/na-bewijs. Tekent vanaf `topY` naar beneden en laat `y` ongemoeid — de aanroeper
   * verschuift `y` één keer voor beide kolommen, anders zakt de tweede kolom onder de eerste.
   */
  const FOTO_MAAT = 68
  const KOL_BREEDTE = (KOLOM - 16) / 2
  async function tekenFotoKolom(kop: string, urls: string[], x0: number, topY: number) {
    pagina.drawText(veilig(kop), { x: x0, y: topY - 8, size: 7.5, font: vet, color: GRIJS })
    const rijY = topY - 14
    if (urls.length === 0) {
      // Gestippeld leeg vak: ontbrekend bewijs moet opvallen, niet stilletjes wegvallen.
      pagina.drawRectangle({
        x: x0, y: rijY - FOTO_MAAT, width: KOL_BREEDTE, height: FOTO_MAAT,
        borderColor: LICHTGRIJS, borderWidth: 0.8, borderDashArray: [3, 3],
      })
      const t = 'geen foto'
      pagina.drawText(t, {
        x: x0 + (KOL_BREEDTE - normaal.widthOfTextAtSize(t, 8)) / 2,
        y: rijY - FOTO_MAAT / 2 - 3, size: 8, font: normaal, color: GRIJS,
      })
      return
    }
    let x = x0
    for (const url of urls.slice(0, MAX_FOTOS_PER_KOLOM)) {
      const img = await haalAfbeelding(url, FOTO_MAX_PX)
      if (!img) continue
      try {
        const embedded = await doc.embedJpg(img.bytes)
        // Vierkant uitsnijden zou vervormen; schaal binnen het vierkant.
        const schaal = Math.min(FOTO_MAAT / embedded.width, FOTO_MAAT / embedded.height)
        const w = embedded.width * schaal
        const h = embedded.height * schaal
        pagina.drawImage(embedded, {
          x: x + (FOTO_MAAT - w) / 2, y: rijY - FOTO_MAAT + (FOTO_MAAT - h) / 2, width: w, height: h,
        })
        pagina.drawRectangle({
          x, y: rijY - FOTO_MAAT, width: FOTO_MAAT, height: FOTO_MAAT,
          borderColor: LICHTGRIJS, borderWidth: 0.6,
        })
        x += FOTO_MAAT + 6
      } catch {
        // Onbruikbare afbeelding overslaan; het rapport moet altijd opleveren.
      }
    }
  }

  async function tekenPunt(p: OpleverPuntView, prefix: 'OP' | 'AP') {
    ruimte(60)
    const nr = `${prefix}${String(p.volgnummer).padStart(2, '0')}`
    const statusLabel = opleverPuntStatusLabels[p.status] ?? p.status
    const statusKleur = STATUS_RGB[p.status] ?? [0.42, 0.46, 0.49]

    tekst(nr, { grootte: 8.5, font: vet, kleur: GRIJS })
    // Status rechts uitlijnen op dezelfde regel.
    const sw = vet.widthOfTextAtSize(veilig(statusLabel), 8.5)
    pagina.drawText(veilig(statusLabel), {
      x: A4.breedte - MARGE - sw, y, size: 8.5, font: vet,
      color: rgb(statusKleur[0], statusKleur[1], statusKleur[2]),
    })
    y -= 13

    for (const regel of wikkel(p.omschrijving, vet, 10.5, KOLOM - 70)) {
      ruimte(14); tekst(regel, { grootte: 10.5, font: vet }); y -= 13
    }
    const sub = [
      p.ruimte,
      p.deadline ? `deadline ${p.deadline}` : null,
      p.is_extra_werk ? 'Extra werk' : null,
      bewijsOntbreekt(p.status, p.fotos) ? 'Geen foto na herstel' : null,
    ].filter(Boolean).join('  -  ')
    if (sub) { ruimte(12); tekst(sub, { grootte: 8.5, kleur: GRIJS }); y -= 12 }
    if (p.status === 'geweigerd' && p.geweigerd_reden) {
      for (const regel of wikkel(`Afgewezen: ${p.geweigerd_reden}`, normaal, 8.5, KOLOM)) {
        ruimte(11); tekst(regel, { grootte: 8.5, kleur: rgb(0.63, 0.13, 0.13) }); y -= 11
      }
    }

    // Reacties (afmelding/beoordeling)
    for (const r of p.reacties) {
      const wie = r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Everts')
      const regels = wikkel(`${wie}: ${r.opmerking ?? '-'}`, normaal, 8.5, KOLOM - 12)
      for (const regel of regels) {
        ruimte(11); tekst(regel, { x: MARGE + 12, grootte: 8.5, kleur: GRIJS }); y -= 11
      }
    }

    // Voor/na naast elkaar. Punten die nooit een foto kregen en nog niet zijn afgemeld slaan we
    // over — anders staat het halve rapport vol lege vakken.
    const { voor, na } = splitsFotos(p.fotos)
    if (p.fotos.length > 0 || bewijsOntbreekt(p.status, p.fotos)) {
      // Label + thumbnail + witruimte in één keer reserveren: `ruimte()` mag niet tússen de twee
      // kolommen een pagina omslaan, dan komt de Na-kolom op de volgende bladzijde terecht.
      ruimte(FOTO_MAAT + 24)
      const topY = y
      await tekenFotoKolom('VOOR', voor.map(f => f.url), MARGE, topY)
      await tekenFotoKolom('NA', na.map(f => f.url), MARGE + KOL_BREEDTE + 16, topY)
      y = topY - 14 - FOTO_MAAT - 8
    }

    y -= 4
    ruimte(8)
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    y -= 12
  }

  for (const p of punten) await tekenPunt(p, 'OP')

  /* ── Aandachtspunten (losse punten van het dossier, eigen nummerreeks) ── */
  if (aandachtspunten.length > 0) {
    y -= 12
    ruimte(44)
    tekst(`Aandachtspunten (${aandachtspunten.length})`, { grootte: 11, font: vet })
    y -= 6
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.8, color: LICHTGRIJS })
    y -= 14
    tekst('Gemelde punten bij dit project die niet aan dit oplevermoment gekoppeld zijn.', { grootte: 8.5, kleur: GRIJS })
    y -= 16

    for (const p of aandachtspunten) await tekenPunt(p, 'AP')
  }

  /* ── Ondertekening ── */
  if (handtekeningen.length > 0) {
    y -= 8
    ruimte(120)
    tekst('Ondertekening', { grootte: 11, font: vet })
    y -= 6
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.8, color: LICHTGRIJS })
    y -= 20

    for (const h of handtekeningen) {
      ruimte(76)
      const startY = y
      if (h.handtekening_url) {
        const img = await haalAfbeelding(h.handtekening_url, HANDTEKENING_MAX_PX)
        if (img) {
          try {
            const embedded = await doc.embedJpg(img.bytes)
            const schaal = Math.min(150 / embedded.width, 46 / embedded.height)
            pagina.drawImage(embedded, { x: MARGE, y: startY - 46, width: embedded.width * schaal, height: embedded.height * schaal })
          } catch { /* handtekening overslaan */ }
        }
      } else {
        pagina.drawText('Akkoord op afstand', { x: MARGE, y: startY - 28, size: 10, font: vet, color: rgb(0.11, 0.48, 0.25) })
      }
      pagina.drawRectangle({ x: MARGE, y: startY - 52, width: 190, height: 0.6, color: LICHTGRIJS })
      const rol = h.rol.charAt(0).toUpperCase() + h.rol.slice(1)
      pagina.drawText(veilig(rol), { x: MARGE, y: startY - 64, size: 9, font: vet, color: ZWART })
      const bijschrift = [h.naam, new Date(h.akkoord_op).toLocaleDateString('nl-NL')].filter(Boolean).join(' - ')
      pagina.drawText(veilig(bijschrift), { x: MARGE, y: startY - 75, size: 8.5, font: normaal, color: GRIJS })
      y = startY - 92
    }
  }

  /* ── Voettekst + paginanummers ── */
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: MARGE, y: MARGE + 14, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    p.drawText('Opgesteld via EVA - Everts', { x: MARGE, y: MARGE, size: 8, font: normaal, color: GRIJS })
    const nr = `${i + 1} / ${paginas.length}`
    p.drawText(nr, { x: A4.breedte - MARGE - normaal.widthOfTextAtSize(nr, 8), y: MARGE, size: 8, font: normaal, color: GRIJS })
  })

  return doc.save()
}

/** Nette bestandsnaam voor de bijlage. */
export function opleverRapportBestandsnaam(nummer: string | null, titel: string): string {
  const kern = [nummer, titel].filter(Boolean).join(' - ')
  const schoon = veilig(kern).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'oplevering'
  return `Opleverrapport ${schoon}.pdf`.slice(0, 120)
}
