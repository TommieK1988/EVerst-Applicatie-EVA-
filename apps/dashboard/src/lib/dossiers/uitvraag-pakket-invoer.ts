/**
 * uitvraag-pakket-invoer.ts — Pure controles voor de uitvraag-acties (calculatie fase 6).
 *
 * Los van `uitvraag-pakketten.ts` omdat een `'use server'`-module alleen async functies mag
 * exporteren; zo zijn deze ook zonder database te testen.
 */

import type { NieuwUitvraagPakket, UitvraagPartijKeuze, UitvraagPost } from './uitvraag-pakket-types'

/** Bovengrens voor de offerte-pdf. */
// Net onder de 8 MB die server-acties in next.config mogen ontvangen (bodySizeLimit), zodat de
// gebruiker deze melding krijgt in plaats van een kale fout van Next.
export const MAX_OFFERTE_BYTES = 7.5 * 1024 * 1024

const DATUM = /^\d{4}-\d{2}-\d{2}$/

export type SchoonPakket = {
  naam: string
  soort: NieuwUitvraagPakket['soort']
  posten: UitvraagPost[]
  partijen: UitvraagPartijKeuze[]
  reactieUiterlijk: string | null
  projectbezoekOp: string | null
}

/**
 * Dezelfde partij twee keer aanvinken mag niet tot twee mails leiden. Een relatie is uniek op
 * id; een losse naam (zonder relatie) op de naam, hoofdletterongevoelig. De eerste wint, zodat de
 * volgorde van het scherm blijft staan.
 */
export function uniekePartijen(partijen: UitvraagPartijKeuze[]): UitvraagPartijKeuze[] {
  const gezien = new Set<string>()
  const uit: UitvraagPartijKeuze[] = []
  for (const p of partijen) {
    const naam = (p.naam ?? '').trim()
    if (!naam) continue
    const sleutel = p.relatie_id ? `r:${p.relatie_id}` : `n:${naam.toLowerCase()}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)
    uit.push({ relatie_id: p.relatie_id || null, naam })
  }
  return uit
}

/** Eén post per calculatieregel; de eerste wint. */
export function uniekePosten(posten: UitvraagPost[]): UitvraagPost[] {
  const gezien = new Set<string>()
  const uit: UitvraagPost[] = []
  for (const p of posten) {
    if (!p.calculatieregel_id || gezien.has(p.calculatieregel_id)) continue
    gezien.add(p.calculatieregel_id)
    const h = p.hoeveelheid
    uit.push({
      calculatieregel_id: p.calculatieregel_id,
      omschrijving: (p.omschrijving ?? '').trim() || '(zonder omschrijving)',
      hoeveelheid: typeof h === 'number' && Number.isFinite(h) ? h : null,
      eenheid: p.eenheid?.trim() || null,
    })
  }
  return uit
}

/** Controleert de invoer van "Uitvragen" en geeft een schone versie, of een Nederlandse fout. */
export function controleerPakket(input: NieuwUitvraagPakket): { ok: true; data: SchoonPakket } | { ok: false; error: string } {
  const naam = (input.naam ?? '').trim()
  if (!naam) return { ok: false, error: 'Geef de uitvraag een naam.' }
  if (input.soort !== 'onderaannemer' && input.soort !== 'leverancier') {
    return { ok: false, error: 'Kies onderaannemer of leverancier.' }
  }
  const partijen = uniekePartijen(input.partijen ?? [])
  if (partijen.length === 0) return { ok: false, error: 'Kies minimaal één partij.' }

  const reactie = input.reactieUiterlijk?.trim() || null
  if (reactie && !DATUM.test(reactie)) return { ok: false, error: 'Ongeldige reactiedatum.' }

  const bezoek = input.projectbezoekOp?.trim() || null
  if (bezoek && Number.isNaN(new Date(bezoek).getTime())) {
    return { ok: false, error: 'Ongeldig tijdstip voor het projectbezoek.' }
  }

  return {
    ok: true,
    data: {
      naam,
      soort: input.soort,
      posten: uniekePosten(input.posten ?? []),
      partijen,
      reactieUiterlijk: reactie,
      projectbezoekOp: bezoek ? new Date(bezoek).toISOString() : null,
    },
  }
}

/**
 * Controle van de geüploade offerte. Kijkt naar de eerste bytes (`%PDF-`) en niet alleen naar
 * type of extensie: een browser geeft soms een leeg type mee, en een hernoemd .docx is geen pdf.
 */
export function controleerOffertePdf(naam: string, grootte: number, kop: Uint8Array): string | null {
  if (grootte <= 0) return 'Het bestand is leeg.'
  if (grootte > MAX_OFFERTE_BYTES) return 'De pdf is groter dan 7,5 MB. Verklein hem of zet hem zelf in de dossiermap.'
  const isPdf = kop.length >= 5 && String.fromCharCode(...kop.slice(0, 5)) === '%PDF-'
  if (!isPdf || !/\.pdf$/i.test(naam)) return 'Alleen pdf-bestanden zijn toegestaan.'
  return null
}

/** "Offerte Voegbedrijf A - Voegwerk gevel achter 2026-10-16.pdf", veilig voor SharePoint. */
export function offerteBestandsnaam(partij: string, onderdeel: string, datum: string): string {
  const basis = `Offerte ${partij} - ${onderdeel} ${datum}`
    .replace(/[\\/:*?"<>|#%]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
    .trim()
  return `${basis}.pdf`
}
