/**
 * Van losse dagregels naar één regel per medewerker.
 *
 * Gedeeld door het scherm (de tabel "Per medewerker") en de PDF-uitdraai, zodat
 * een gesprek over de uitdraai niet stukloopt op andere getallen dan op het
 * scherm. Geen `server-only`: beide kanten moeten hem kunnen aanroepen.
 */
import { teltMee, minutenNaarUren } from '@/lib/wagenpark/werktijd'
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
  /**
   * Aanwezig volgens de auto tegenover de geboekte arbeidsuren, over precies de
   * dagen waarvan beide kanten bekend zijn. Zie `telSaldo` — de dagen worden
   * ontdubbeld, want een dag met zowel een late aankomst als een vroeg vertrek
   * levert twee regels op en zou anders dubbel meetellen.
   */
  saldo: SaldoTotaal
}

/**
 * Bouw één regel per medewerker uit de detailregels.
 *
 * De detailregels bevatten alleen anker-bevindingen (zie lib/wagenpark/werktijd.ts),
 * dus optellen mag hier zonder verdere ontdubbeling.
 */
export function bouwSamenvatting(rijen: WerktijdRij[]): SamenvattingRij[] {
  const perMedewerker = new Map<string, SamenvattingRij>()
  // Het saldo is per definitie een dag-grootheid en moet dus over de dagen van
  // één medewerker worden opgeteld, niet over zijn regels. `telSaldo` doet dat
  // ontdubbelen; hier verzamelen we eerst de regels per medewerker.
  const regelsPerMedewerker = new Map<string, WerktijdRij[]>()

  for (const r of rijen) {
    const bestaand = regelsPerMedewerker.get(r.user_id_ulu)
    if (bestaand) bestaand.push(r)
    else regelsPerMedewerker.set(r.user_id_ulu, [r])
  }

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
        saldo: telSaldo(regelsPerMedewerker.get(r.user_id_ulu) ?? []),
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

/** Het opgetelde aanwezigheidssaldo over een set regels. */
export type SaldoTotaal = {
  /** Aantal dagen dat aan beide kanten een getal had; de noemer van het saldo. */
  dagen: number
  /** Netto aanwezig volgens de auto, in uren. */
  aanwezigUren: number
  /** Geboekte arbeidsuren over precies diezelfde dagen. */
  arbeidsuren: number
  /** aanwezigUren − arbeidsuren. */
  saldoUren: number
  /**
   * Dagen die buiten het saldo vielen omdat een van beide kanten ontbrak —
   * geen bruikbaar ritvenster, of geen te bepalen arbeidsuren. Hoort erbij:
   * zonder dit getal lijkt een saldo over drie dagen op een saldo over dertig.
   */
  overgeslagen: number
}

/**
 * Tel aanwezigheid en arbeidsuren op, ONTDUBBELD per bestuurder-dag.
 *
 * Dit is de reden dat deze functie bestaat en niet elke afnemer zelf optelt:
 * een dag met zowel een te late aankomst als een vroeg vertrek staat als TWEE
 * regels in de lijst, en die dragen allebei dezelfde acht uur aanwezigheid.
 * Een kale som telt zo'n dag dubbel en verdubbelt daarmee het saldo van precies
 * de dagen die het meest opvallen.
 *
 * Verklaarde dagen tellen hier wél mee, anders dan bij de minuten: een
 * weggestreepte afwijking betekent dat de reden bekend is, niet dat de
 * medewerker er die dag niet was.
 *
 * Alleen dagen waarvan BEIDE kanten bekend zijn doen mee; de rest wordt geteld
 * in `overgeslagen`. Een dag half meetellen zou het saldo systematisch de ene
 * kant op trekken.
 */
export function telSaldo(rijen: WerktijdRij[]): SaldoTotaal {
  const gezien = new Set<string>()
  let dagen = 0
  let aanwezigMinuten = 0
  let arbeidsuren = 0
  let overgeslagen = 0

  for (const r of rijen) {
    const sleutel = `${r.user_id_ulu}|${r.datum}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)

    if (r.aanwezigMinuten == null || r.arbeidsuren == null) {
      overgeslagen += 1
      continue
    }
    dagen += 1
    aanwezigMinuten += r.aanwezigMinuten
    arbeidsuren += r.arbeidsuren
  }

  const aanwezigUren = minutenNaarUren(aanwezigMinuten)
  const afgerond = (n: number) => Math.round(n * 100) / 100
  return {
    dagen,
    aanwezigUren,
    arbeidsuren: afgerond(arbeidsuren),
    saldoUren: afgerond(aanwezigUren - arbeidsuren),
    overgeslagen,
  }
}
