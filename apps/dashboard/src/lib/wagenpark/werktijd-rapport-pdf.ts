import 'server-only'
import type { DagResultaat } from './werktijd-analyse'
import { leesMaandrapporten, MAAND_NAMEN } from './maandrapport'

/**
 * Maandelijkse werktijd-analyse als PDF, opgebouwd met pdf-lib — zelfde aanpak
 * als het opleverrapport (geen HTML→PDF, dat vereist een headless browser die
 * op Vercel serverless niet draait). Per bestuurder een sectie met een tabel
 * per werkdag (aankomst/vertrek werk + thuis, netto uren, te laat / te vroeg)
 * en maand-totalen.
 */

const A4 = { breedte: 595.28, hoogte: 841.89 }
const MARGE = 40
const KOLOM = A4.breedte - MARGE * 2

/** pdf-lib StandardFonts coderen alleen WinAnsi; vervang gangbare tekens. */
function veilig(tekst: unknown): string {
  return String(tekst ?? '')
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '-')
    .replace(/−/g, '-') // minus-teken → koppelteken
    .replace(/ /g, ' ')
    .replace(/[^\x20-\xFF]/g, '')
}

function minutenNaarUren(min: number | null): string {
  if (min == null) return '-'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}u${String(m).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  te_laat: 'Te laat',
  te_vroeg: 'Te vroeg',
  te_laat_en_vroeg: 'Te laat + vroeg',
  niet_op_locatie: 'Niet op locatie',
  geen_ritten: 'Geen ritten',
  afwezig: 'Afwezig',
  geen_werkdag: '-',
}

/**
 * Bouwt de PDF voor de opgeslagen maandanalyse van (jaar, maand).
 * @returns PDF-bytes, of null als er geen rapporten voor die maand zijn.
 */
export async function genereerWerktijdRapportPdf(
  jaar: number,
  maand: number,
): Promise<Uint8Array | null> {
  const bestuurders = await leesMaandrapporten(jaar, maand)
  if (bestuurders.length === 0) return null

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const maandLabel = `${MAAND_NAMEN[maand - 1]} ${jaar}`
  doc.setTitle(veilig(`Werktijd-analyse ${maandLabel}`))
  doc.setCreator('EVA - Everts')

  const normaal = await doc.embedFont(StandardFonts.Helvetica)
  const vet = await doc.embedFont(StandardFonts.HelveticaBold)
  const GROEN = rgb(0, 0.58, 0.22)
  const GRIJS = rgb(0.42, 0.46, 0.49)
  const LICHTGRIJS = rgb(0.89, 0.91, 0.91)
  const ZWART = rgb(0.1, 0.12, 0.14)
  const ROOD = rgb(0.63, 0.13, 0.13)

  let pagina = doc.addPage([A4.breedte, A4.hoogte])
  let y = A4.hoogte - MARGE

  const nieuwePagina = () => {
    pagina = doc.addPage([A4.breedte, A4.hoogte])
    y = A4.hoogte - MARGE
  }
  const ruimte = (nodig: number) => {
    if (y - nodig < MARGE + 24) nieuwePagina()
  }
  const tekst = (
    s: string,
    x: number,
    opts: { grootte?: number; font?: typeof normaal; kleur?: ReturnType<typeof rgb> } = {},
  ) => {
    pagina.drawText(veilig(s), {
      x,
      y,
      size: opts.grootte ?? 9,
      font: opts.font ?? normaal,
      color: opts.kleur ?? ZWART,
    })
  }

  /* ── Kop ── */
  pagina.drawText('EVERTS.', {
    x: A4.breedte - MARGE - vet.widthOfTextAtSize('EVERTS.', 14),
    y: y - 4,
    size: 14,
    font: vet,
    color: ZWART,
  })
  tekst('Werktijd-analyse', MARGE, { grootte: 20, font: vet })
  y -= 18
  tekst(`Periode: ${maandLabel} - ${bestuurders.length} bestuurders`, MARGE, {
    grootte: 9.5,
    kleur: GRIJS,
  })
  y -= 10
  pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 1.6, color: GROEN })
  y -= 20

  // Kolomposities voor de dagtabel.
  const kol = {
    datum: MARGE,
    verwacht: MARGE + 96,
    aankomst: MARGE + 168,
    vertrek: MARGE + 240,
    netto: MARGE + 312,
    status: MARGE + 372,
  }

  const dagRegel = (d: DagResultaat) => {
    ruimte(12)
    const dow = new Date(d.datum + 'T12:00:00Z').toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    const teLaat = (d.te_laat_minuten ?? 0) > 0
    const teVroeg = (d.te_vroeg_minuten ?? 0) > 0
    const kleur = teLaat || teVroeg ? ROOD : ZWART

    tekst(dow, kol.datum, { grootte: 8.5, kleur })
    tekst(
      d.verwacht_start && d.verwacht_eind ? `${d.verwacht_start}-${d.verwacht_eind}` : '-',
      kol.verwacht,
      { grootte: 8.5, kleur: GRIJS },
    )
    tekst(d.aankomst_werk ?? '-', kol.aankomst, { grootte: 8.5, kleur })
    tekst(d.vertrek_werk ?? '-', kol.vertrek, { grootte: 8.5, kleur })
    tekst(minutenNaarUren(d.netto_minuten), kol.netto, { grootte: 8.5 })
    let statusTxt = STATUS_LABEL[d.status] ?? d.status
    if (teLaat) statusTxt = `Te laat +${d.te_laat_minuten}m`
    else if (teVroeg) statusTxt = `Te vroeg -${d.te_vroeg_minuten}m`
    tekst(statusTxt, kol.status, { grootte: 8.5, kleur })
    y -= 11
  }

  for (const b of bestuurders) {
    ruimte(54)
    // Sectiekop per bestuurder.
    tekst(b.volledige_naam ?? `Bestuurder #${b.user_id_ulu}`, MARGE, {
      grootte: 12,
      font: vet,
    })
    y -= 13
    const waarschuwingen: string[] = []
    if (!b.heeft_werk_coord) waarschuwingen.push('geen werkadres-coordinaat')
    if (!b.heeft_woon_coord) waarschuwingen.push('geen woonadres-coordinaat')
    const samenvatting =
      `${b.gewerkte_dagen} gewerkte dagen - ` +
      `${b.dagen_te_laat}x te laat (${b.totaal_te_laat_minuten} min) - ` +
      `${b.dagen_te_vroeg}x te vroeg (${b.totaal_te_vroeg_minuten} min) - ` +
      `gem. ${minutenNaarUren(b.gemiddelde_netto_minuten)}/dag`
    tekst(samenvatting, MARGE, { grootte: 8.5, kleur: GRIJS })
    y -= 11
    if (waarschuwingen.length) {
      tekst(`Let op: ${waarschuwingen.join(', ')} - locatie onzeker`, MARGE, {
        grootte: 8,
        kleur: ROOD,
      })
      y -= 10
    }
    y -= 2

    // Tabelkop.
    ruimte(14)
    tekst('Dag', kol.datum, { grootte: 8, font: vet, kleur: GRIJS })
    tekst('Rooster', kol.verwacht, { grootte: 8, font: vet, kleur: GRIJS })
    tekst('Aankomst', kol.aankomst, { grootte: 8, font: vet, kleur: GRIJS })
    tekst('Vertrek', kol.vertrek, { grootte: 8, font: vet, kleur: GRIJS })
    tekst('Netto', kol.netto, { grootte: 8, font: vet, kleur: GRIJS })
    tekst('Status', kol.status, { grootte: 8, font: vet, kleur: GRIJS })
    y -= 4
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.6, color: LICHTGRIJS })
    y -= 10

    // Alleen werkdagen met relevante info tonen (geen "geen werkdag"-ruis).
    const relevanteDagen = b.dagen.filter((d) => d.is_werkdag)
    if (relevanteDagen.length === 0) {
      tekst('Geen werkdagen in deze periode.', MARGE, { grootte: 8.5, kleur: GRIJS })
      y -= 11
    }
    for (const d of relevanteDagen) dagRegel(d)

    y -= 10
    ruimte(8)
    pagina.drawRectangle({ x: MARGE, y, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    y -= 16
  }

  /* ── Voettekst + paginanummers ── */
  const paginas = doc.getPages()
  paginas.forEach((p, i) => {
    p.drawRectangle({ x: MARGE, y: MARGE + 14, width: KOLOM, height: 0.5, color: LICHTGRIJS })
    p.drawText('Opgesteld via EVA - Everts - vertrouwelijk', {
      x: MARGE,
      y: MARGE,
      size: 8,
      font: normaal,
      color: GRIJS,
    })
    const nr = `${i + 1} / ${paginas.length}`
    p.drawText(nr, {
      x: A4.breedte - MARGE - normaal.widthOfTextAtSize(nr, 8),
      y: MARGE,
      size: 8,
      font: normaal,
      color: GRIJS,
    })
  })

  return doc.save()
}

/** Nette bestandsnaam voor de download. */
export function werktijdRapportBestandsnaam(jaar: number, maand: number): string {
  return `Werktijd-analyse ${MAAND_NAMEN[maand - 1]} ${jaar}.pdf`
}
