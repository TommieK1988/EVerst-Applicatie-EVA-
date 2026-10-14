import 'server-only'
import {
  opleverMomentStatusLabels, opleverMomentTypeLabels, opleverPuntStatusLabels, type OpleverPuntStatus,
} from '@everts/database'
import { getOplevermomentRapport, type OpleverPuntView } from './oplevering'
import { bewijsOntbreekt } from './oplever-fotos'
import { veilig, wikkel } from '@/lib/pdf/tekst'
import { haalAfbeelding } from '@/lib/pdf/afbeelding'
import { A4, MARGE, KOLOM, Canvas, tekenPunt, type FotoMaat } from './oplever-rapport-pdf-blok'

/**
 * Opleverrapportage als PDF, opgebouwd met pdf-lib (zelfde aanpak als de briefpapier-merge).
 * Bewust géén HTML→PDF: dat vraagt een headless browser die op Vercel serverless niet draait, en
 * de docx→PDF-route van de offerte vereist O365. Hier tekenen we direct, dus de bijlage werkt
 * overal en zonder externe afhankelijkheid.
 *
 * Opbouw (naar het Word-voorbeeld van het team): gegevens → opleverpunten → goed uitgevoerd →
 * aandachtspunten → algemene opmerkingen → afspraken → ondertekening. Het blok per punt staat in
 * `oplever-rapport-pdf-blok.ts`.
 */

/**
 * Standaard fotomaat. Een hoofdfoto beslaat een halve tekstkolom (~240pt); 800px is daar ruim
 * 200 dpi. De mail kapt de bijlage op 3 MB — `KLEINE_FOTOS` is de terugvaloptie daarvoor.
 */
export const STANDAARD_FOTOS: FotoMaat = { hoofdPx: 800, duimPx: 320 }
export const KLEINE_FOTOS: FotoMaat = { hoofdPx: 520, duimPx: 220 }
const HANDTEKENING_MAX_PX = 600

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
export async function genereerOpleverRapportPdf(
  momentId: string,
  fotoMaat: FotoMaat = STANDAARD_FOTOS,
): Promise<Uint8Array | null> {
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return null
  const { dossier, moment, punten: allePunten, aandachtspunten, handtekeningen } = rapport
  const punten = allePunten.filter(p => !p.is_goed)
  const goed = allePunten.filter(p => p.is_goed)

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(veilig(`Opleverrapport ${dossier.nummer ?? ''} ${moment.titel}`))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const kleur = {
    groen: rgb(0, 0.58, 0.22), grijs: rgb(0.42, 0.46, 0.49), lichtgrijs: rgb(0.89, 0.91, 0.91),
    zwart: rgb(0.1, 0.12, 0.14), rood: rgb(0.63, 0.13, 0.13),
  }
  const c = new Canvas(doc, normaal, vet, kleur, fotoMaat)

  /* ── Kop ── */
  c.pagina.drawText('EVERTS.', { x: A4.breedte - MARGE - vet.widthOfTextAtSize('EVERTS.', 14), y: c.y - 4, size: 14, font: vet, color: kleur.zwart })
  c.tekst('Opleverrapport', { grootte: 20, font: vet })
  c.y -= 18
  c.tekst(`${opleverMomentTypeLabels[moment.type] ?? moment.type} - ${opleverMomentStatusLabels[moment.status] ?? moment.status}`,
    { grootte: 9.5, kleur: kleur.grijs })
  c.y -= 10
  c.lijn(1.6, kleur.groen)
  c.y -= 22

  /* ── Projectgegevens ── */
  const datum = new Date(moment.opgeleverd_op ?? moment.created_at)
    .toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  const info: [string, string][] = [
    ['Project', dossier.titel ?? '-'],
    ['Projectnummer', dossier.nummer ?? '-'],
    ['Opdrachtgever', dossier.klant ?? '-'],
    ['Werkadres', dossier.werkadres ?? '-'],
    ['Oplevering', moment.titel],
    ['Datum', datum],
  ]
  for (const [label, waarde] of info) {
    c.ruimte(16)
    c.tekst(label, { grootte: 9, kleur: kleur.grijs })
    for (const regel of wikkel(waarde, normaal, 10, KOLOM - 110)) {
      c.tekst(regel, { x: MARGE + 110, grootte: 10 })
      c.y -= 13
    }
    c.y -= 2
  }

  const weergave = (p: OpleverPuntView, prefix: 'OP' | 'AP') => {
    const k = STATUS_RGB[p.status] ?? STATUS_RGB.open
    return {
      nummer: `${prefix}${String(p.volgnummer).padStart(2, '0')}`,
      statusLabel: opleverPuntStatusLabels[p.status] ?? p.status,
      statusKleur: rgb(k[0], k[1], k[2]),
      meta: [
        [
          p.deadline ? `deadline ${p.deadline}` : null,
          p.is_extra_werk ? 'Extra werk' : null,
          bewijsOntbreekt(p.status, p.fotos, p.is_goed) ? 'Geen foto na herstel' : null,
        ].filter(Boolean).join('  -  '),
        p.status === 'geweigerd' && p.geweigerd_reden ? `Afgewezen: ${p.geweigerd_reden}` : '',
      ].filter(Boolean),
    }
  }

  /* ── Opleverpunten ── */
  const aantalGeaccepteerd = punten.filter(p => p.status === 'geaccepteerd').length
  c.kop(`Opleverpunten (${punten.length}) - ${aantalGeaccepteerd} geaccepteerd`)
  if (punten.length === 0) {
    c.tekst(goed.length ? 'Geen opleverpunten: de werkzaamheden zijn akkoord bevonden.' : 'Geen opleverpunten geregistreerd.',
      { grootte: 10, kleur: kleur.grijs })
    c.y -= 14
  }
  for (const p of punten) await tekenPunt(c, p, weergave(p, 'OP'))

  /* ── Goed uitgevoerd ── */
  if (goed.length > 0) {
    c.kop(`Goed uitgevoerd (${goed.length})`, 'Werkzaamheden die bij de oplevering akkoord zijn bevonden.')
    for (const [i, p] of goed.entries()) {
      await tekenPunt(c, p, {
        nummer: `G${String(i + 1).padStart(2, '0')}`, statusLabel: 'Goed uitgevoerd', statusKleur: kleur.groen, meta: [],
      })
    }
  }

  /* ── Aandachtspunten (losse punten van het dossier, eigen nummerreeks) ── */
  if (aandachtspunten.length > 0) {
    c.kop(`Aandachtspunten (${aandachtspunten.length})`, 'Gemelde punten bij dit project die niet aan dit oplevermoment gekoppeld zijn.')
    for (const p of aandachtspunten) await tekenPunt(c, p, weergave(p, 'AP'))
  }

  /* ── Opmerkingen en afspraken ── */
  for (const [titel, tekst] of [['Algemene opmerkingen', moment.opmerking], ['Afspraken', moment.afspraken]] as const) {
    if (!tekst?.trim()) continue
    c.kop(titel)
    c.alinea(tekst)
    c.y -= 6
  }

  /* ── Ondertekening ── */
  if (handtekeningen.length > 0) {
    c.y -= 8
    c.ruimte(120)
    c.tekst('Ondertekening', { grootte: 11, font: vet })
    c.y -= 6
    c.lijn(0.8)
    c.y -= 20

    for (const h of handtekeningen) {
      c.ruimte(76)
      const startY = c.y
      if (h.handtekening_url) {
        const img = await haalAfbeelding(h.handtekening_url, HANDTEKENING_MAX_PX)
        if (img) {
          try {
            const embedded = await doc.embedJpg(img.bytes)
            const schaal = Math.min(150 / embedded.width, 46 / embedded.height)
            c.pagina.drawImage(embedded, { x: MARGE, y: startY - 46, width: embedded.width * schaal, height: embedded.height * schaal })
          } catch { /* handtekening overslaan */ }
        }
      } else {
        c.tekst('Akkoord op afstand', { y: startY - 28, font: vet, kleur: kleur.groen })
      }
      c.pagina.drawRectangle({ x: MARGE, y: startY - 52, width: 190, height: 0.6, color: kleur.lichtgrijs })
      c.tekst(h.rol.charAt(0).toUpperCase() + h.rol.slice(1), { y: startY - 64, grootte: 9, font: vet })
      const bijschrift = [h.naam, new Date(h.akkoord_op).toLocaleDateString('nl-NL')].filter(Boolean).join(' - ')
      c.tekst(bijschrift, { y: startY - 75, grootte: 8.5, kleur: kleur.grijs })
      c.y = startY - 92
    }
  }

  /* ── Voettekst + paginanummers ── */
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: MARGE, y: MARGE + 14, width: KOLOM, height: 0.5, color: kleur.lichtgrijs })
    p.drawText('Opgesteld via EVA - Everts', { x: MARGE, y: MARGE, size: 8, font: normaal, color: kleur.grijs })
    const nr = `${i + 1} / ${paginas.length}`
    p.drawText(nr, { x: A4.breedte - MARGE - normaal.widthOfTextAtSize(nr, 8), y: MARGE, size: 8, font: normaal, color: kleur.grijs })
  })

  return doc.save()
}

/** Nette bestandsnaam voor de bijlage. */
export function opleverRapportBestandsnaam(nummer: string | null, titel: string): string {
  const kern = [nummer, titel].filter(Boolean).join(' - ')
  const schoon = veilig(kern).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'oplevering'
  return `Opleverrapport ${schoon}.pdf`.slice(0, 120)
}
