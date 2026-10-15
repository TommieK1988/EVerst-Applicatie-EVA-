import 'server-only'
import { opleverPuntStatusLabels, type OpleverPuntStatus } from '@everts/database'
import { getOplevermomentRapport, type OpleverPuntView } from './oplevering'
import { bewijsOntbreekt } from './oplever-fotos'
import { veilig } from '@/lib/pdf/tekst'
import { haalAfbeelding } from '@/lib/pdf/afbeelding'
import { mergeBriefpapierBackground } from '@/lib/everts-calc/briefpapier'
import { haalKlantBriefpapier } from '@/lib/pdf/klant-briefpapier'
import {
  A4, MARGE, KOLOM, Canvas, tekenSectie, type FotoMaat, type PuntWeergave,
} from './oplever-rapport-pdf-blok'
import { haalVoorbladGegevens, tekenVoorblad } from './oplever-rapport-voorblad'

/**
 * Opleverrapportage als PDF, opgebouwd met pdf-lib en daarna op het briefpapier gezet (zelfde
 * aanpak als het meerwerkoverzicht). Bewust géén HTML→PDF: dat vraagt een headless browser die op
 * Vercel serverless niet draait, en de docx→PDF-route van de offerte vereist O365.
 *
 * Opbouw, elk onderdeel op een eigen pagina:
 *   1. voorblad met de opdrachtinformatie
 *   2. opleverpunten — drie per pagina
 *   3. goed uitgevoerd — drie per pagina
 *   4. aandachtspunten — drie per pagina
 *   5. algemene opmerkingen, afspraken en ondertekening
 * De kaart per punt staat in `oplever-rapport-pdf-blok.ts`, het voorblad in
 * `oplever-rapport-voorblad.ts`.
 */

/**
 * Fotomaat (langste zijde). Een fotovak is ca. 257 × 150pt; 700px is daar ruim 200 dpi. De mail
 * kapt de bijlage op 3 MB — `KLEINE_FOTOS` is de terugvaloptie daarvoor.
 */
export const STANDAARD_FOTOS: FotoMaat = { px: 700 }
export const KLEINE_FOTOS: FotoMaat = { px: 460 }
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
  const { dossier, moment, aandachtspunten, handtekeningen } = rapport
  const punten = rapport.punten.filter(p => !p.is_goed)
  const goed = rapport.punten.filter(p => p.is_goed)

  const extra = await haalVoorbladGegevens(moment.dossier_id)
  const briefpapier = await haalKlantBriefpapier(extra.werkmaatschappijId)

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(veilig(`Opleverrapport ${dossier.nummer ?? ''} ${moment.titel}`))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const kleur = {
    groen: rgb(0, 0.58, 0.22), grijs: rgb(0.42, 0.46, 0.49), lichtgrijs: rgb(0.89, 0.91, 0.91),
    zwart: rgb(0.1, 0.12, 0.14), rood: rgb(0.63, 0.13, 0.13), vlak: rgb(0.96, 0.97, 0.97), wit: rgb(1, 1, 1),
  }
  const c = new Canvas(doc, normaal, vet, kleur, fotoMaat)

  /* ── 1. Voorblad ── */
  await tekenVoorblad(c, rapport, extra, {
    punten: punten.length,
    geaccepteerd: punten.filter(p => p.status === 'geaccepteerd').length,
    goed: goed.length,
    aandachtspunten: aandachtspunten.length,
  })

  const weergave = (prefix: 'OP' | 'AP') => (p: OpleverPuntView): PuntWeergave => {
    const k = STATUS_RGB[p.status] ?? STATUS_RGB.open
    return {
      nummer: `${prefix}${String(p.volgnummer).padStart(2, '0')}`,
      statusLabel: opleverPuntStatusLabels[p.status] ?? p.status,
      statusKleur: rgb(k[0], k[1], k[2]),
      meta: [
        p.deadline ? `Deadline ${new Date(p.deadline).toLocaleDateString('nl-NL')}` : '',
        p.is_extra_werk ? 'Extra werk' : '',
        bewijsOntbreekt(p.status, p.fotos, p.is_goed) ? 'Geen foto na herstel' : '',
        p.status === 'geweigerd' && p.geweigerd_reden ? `Afgewezen: ${p.geweigerd_reden}` : '',
      ].filter(Boolean),
    }
  }

  /* ── 2. Opleverpunten ── */
  const geaccepteerd = punten.filter(p => p.status === 'geaccepteerd').length
  await tekenSectie(c, `Opleverpunten (${punten.length})`,
    `${geaccepteerd} van ${punten.length} geaccepteerd.`, punten, weergave('OP'),
    goed.length ? 'Geen opleverpunten: de werkzaamheden zijn akkoord bevonden.' : 'Geen opleverpunten geregistreerd.')

  /* ── 3. Goed uitgevoerd ── */
  if (goed.length > 0) {
    await tekenSectie(c, `Goed uitgevoerd (${goed.length})`,
      'Werkzaamheden die bij de oplevering akkoord zijn bevonden.', goed, (_p, i) => ({
        nummer: `G${String(i + 1).padStart(2, '0')}`, statusLabel: 'Goed uitgevoerd', statusKleur: kleur.groen, meta: [],
      }))
  }

  /* ── 4. Aandachtspunten (losse punten van het dossier, eigen nummerreeks) ── */
  if (aandachtspunten.length > 0) {
    await tekenSectie(c, `Aandachtspunten (${aandachtspunten.length})`,
      'Gemelde punten bij dit project die niet aan dit oplevermoment gekoppeld zijn.', aandachtspunten, weergave('AP'))
  }

  /* ── 5. Opmerkingen, afspraken en ondertekening ── */
  const teksten = ([['Algemene opmerkingen', moment.opmerking], ['Afspraken', moment.afspraken]] as const)
    .filter(([, t]) => t?.trim())
  if (teksten.length > 0 || handtekeningen.length > 0) {
    c.nieuwePagina()
    for (const [titel, tekst] of teksten) {
      c.ruimte(80)
      c.kop(titel)
      c.alinea(tekst!)
      c.y -= 14
    }

    if (handtekeningen.length > 0) {
      c.ruimte(150)
      c.kop('Ondertekening')
      // Naast elkaar, zoals op een papieren opleverformulier.
      const breedte = (KOLOM - 20) / 2
      for (const [i, h] of handtekeningen.entries()) {
        if (i > 0 && i % 2 === 0) { c.y -= 100; c.ruimte(100) }
        const x = MARGE + (i % 2) * (breedte + 20)
        const startY = c.y
        if (h.handtekening_url) {
          const img = await haalAfbeelding(h.handtekening_url, HANDTEKENING_MAX_PX)
          if (img) {
            try {
              const embedded = await doc.embedJpg(img.bytes)
              const schaal = Math.min(160 / embedded.width, 50 / embedded.height)
              c.pagina.drawImage(embedded, { x, y: startY - 54, width: embedded.width * schaal, height: embedded.height * schaal })
            } catch { /* handtekening overslaan */ }
          }
        } else {
          c.tekst('Akkoord op afstand', { x, y: startY - 32, font: vet, kleur: kleur.groen })
        }
        c.pagina.drawRectangle({ x, y: startY - 60, width: breedte, height: 0.6, color: kleur.lichtgrijs })
        c.tekst(h.rol.charAt(0).toUpperCase() + h.rol.slice(1), { x, y: startY - 72, grootte: 9, font: vet })
        const bijschrift = [h.naam, new Date(h.akkoord_op).toLocaleDateString('nl-NL')].filter(Boolean).join(' - ')
        c.tekst(bijschrift, { x, y: startY - 83, grootte: 8.5, kleur: kleur.grijs })
      }
      c.y -= 100
    }
  }

  /* ── Zonder briefpapier een eigen woordmerk bovenaan (geen voettekst: die wilde het team niet) ── */
  if (!briefpapier) {
    for (const p of doc.getPages()) {
      p.drawText('EVERTS.', { x: A4.breedte - MARGE - vet.widthOfTextAtSize('EVERTS.', 14), y: A4.hoogte - 40, size: 14, font: vet, color: kleur.zwart })
    }
  }

  const inhoud = await doc.save()
  if (!briefpapier) return inhoud
  try {
    return await mergeBriefpapierBackground(inhoud, briefpapier)
  } catch (err) {
    // Een onleesbaar briefpapier mag het rapport niet tegenhouden; dan maar zonder achtergrond.
    console.warn('Briefpapier-merge mislukt, opleverrapport zonder briefpapier:', err)
    return inhoud
  }
}

/** Nette bestandsnaam voor de bijlage. */
export function opleverRapportBestandsnaam(nummer: string | null, titel: string): string {
  const kern = [nummer, titel].filter(Boolean).join(' - ')
  const schoon = veilig(kern).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'oplevering'
  return `Opleverrapport ${schoon}.pdf`.slice(0, 120)
}
