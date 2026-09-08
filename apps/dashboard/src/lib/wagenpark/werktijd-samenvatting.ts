/**
 * Van losse dagregels naar één regel per medewerker.
 *
 * Gedeeld door het scherm (de tabel "Per medewerker") en de PDF-uitdraai, zodat
 * een gesprek over de uitdraai niet stukloopt op andere getallen dan op het
 * scherm. Geen `server-only`: beide kanten moeten hem kunnen aanroepen.
 */
import { teltMee } from '@/lib/wagenpark/werktijd'
import type { WerktijdRij } from '@/components/wagenpark/werktijden/WerktijdenTabel'

/** Eén regel per medewerker: de totalen over de gekozen periode. */
export type SamenvattingRij = {
  /** OverzichtTabel eist een id; de ULU-bestuurder-id is hier de sleutel. */
  id: string
  bestuurder: string
  dagenLaat: number
  minutenLaat: number
  dagenVroeg: number
  minutenVroeg: number
  totaalMinuten: number
  /** Minuten per kalendermaand, sleutel 1..12. Alleen gevulde maanden staan erin. */
  perMaand: Record<number, number>
  /** Weggestreepte minuten; blijven zichtbaar maar tellen nergens in mee. */
  verklaardMinuten: number
  verklaardDagen: number
}

/**
 * Bouw één regel per medewerker uit de detailregels.
 *
 * De detailregels bevatten alleen anker-bevindingen (zie lib/wagenpark/werktijd.ts),
 * dus optellen mag hier zonder verdere ontdubbeling.
 */
export function bouwSamenvatting(rijen: WerktijdRij[]): SamenvattingRij[] {
  const perMedewerker = new Map<string, SamenvattingRij>()

  for (const r of rijen) {
    let s = perMedewerker.get(r.user_id_ulu)
    if (!s) {
      s = {
        id: r.user_id_ulu,
        bestuurder: r.bestuurder,
        dagenLaat: 0,
        minutenLaat: 0,
        dagenVroeg: 0,
        minutenVroeg: 0,
        totaalMinuten: 0,
        perMaand: {},
        verklaardMinuten: 0,
        verklaardDagen: 0,
      }
      perMedewerker.set(r.user_id_ulu, s)
    }
    // Verklaarde dagen krijgen een eigen kolom en blijven daarmee zichtbaar,
    // maar ze tellen niet mee in het totaal of in de maandkolommen. Zo blijft
    // een medewerker die alles netjes verklaard heeft wél in de lijst staan.
    if (!teltMee(r.status)) {
      s.verklaardMinuten += r.minuten
      s.verklaardDagen += 1
      continue
    }
    if (r.soort === 'te_laat') {
      s.dagenLaat += 1
      s.minutenLaat += r.minuten
    } else {
      s.dagenVroeg += 1
      s.minutenVroeg += r.minuten
    }
    s.totaalMinuten += r.minuten
    const maand = Number(r.datum.slice(5, 7))
    s.perMaand[maand] = (s.perMaand[maand] ?? 0) + r.minuten
  }

  return [...perMedewerker.values()].sort((a, b) => b.totaalMinuten - a.totaalMinuten)
}
