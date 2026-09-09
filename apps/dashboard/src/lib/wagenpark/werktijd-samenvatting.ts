/**
 * Van losse dagregels naar één regel per medewerker.
 *
 * Gedeeld door het scherm (de tabel "Per medewerker") en de PDF-uitdraai, zodat
 * een gesprek over de uitdraai niet stukloopt op andere getallen dan op het
 * scherm. Geen `server-only`: beide kanten moeten hem kunnen aanroepen.
 */
import { teltMee, minutenNaarUren } from '@/lib/wagenpark/werktijd'
import {
  afwijkingenVanDag, dagVerklaard, type WerktijdRij,
} from '@/lib/wagenpark/werktijd-dag'


/** Eén regel per medewerker: de totalen over de gekozen periode. */
export type SamenvattingRij = {
  /** OverzichtTabel eist een id; de ULU-bestuurder-id is hier de sleutel. */
  id: string
  bestuurder: string
  /** Aantal roosterwerkdagen van deze medewerker in de periode. */
  werkdagen: number
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
        werkdagen: 0,
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
    s.werkdagen += 1
    if (dagVerklaard(r)) s.verklaardDagen += 1

    // Per afwijking, niet per dag: een dag kan een verklaarde late aankomst en
    // een openstaand vroeg vertrek dragen, en die horen elk in hun eigen teller.
    for (const a of afwijkingenVanDag(r)) {
      // Verklaarde afwijkingen krijgen een eigen kolom en blijven daarmee
      // zichtbaar, maar ze tellen niet mee in het totaal of in de maandkolommen.
      // Zo blijft een medewerker die alles netjes verklaard heeft wél in de
      // lijst staan.
      if (!teltMee(a.status)) {
        s.verklaardMinuten += a.minuten
        continue
      }
      if (a.soort === 'te_laat') {
        s.dagenLaat += 1
        s.minutenLaat += a.minuten
      } else {
        s.dagenVroeg += 1
        s.minutenVroeg += a.minuten
      }
      s.totaalMinuten += a.minuten
      const maand = Number(r.datum.slice(5, 7))
      s.perMaand[maand] = (s.perMaand[maand] ?? 0) + a.minuten
    }
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
  /** Dagen die buiten het saldo vielen omdat de afwijking verklaard is. */
  verklaard: number
  /**
   * Dagen waarvan het saldo als tijd voor tijd is gereserveerd, en de som van
   * die uren. Die dagen tellen niet meer in het openstaande saldo — het verschil
   * is bekend en belegd — maar het bedrag moet wel apart zichtbaar blijven,
   * anders verdwijnt het uit beeld zodra het is afgesproken.
   */
  tvtDagen: number
  tvtUren: number
}

/**
 * Tel aanwezigheid en arbeidsuren op, ONTDUBBELD per bestuurder-dag.
 *
 * De regels zijn inmiddels per dag, dus de ontdubbeling zou overbodig moeten
 * zijn. Hij blijft staan als vangnet: dezelfde bestuurderdag mag nooit twee keer
 * in een saldo belanden, en dat is precies het soort fout dat je pas ziet als de
 * cijfers al in een gesprek liggen.
 *
 * EEN GERESERVEERDE OF VERKLAARDE DAG TELT NIET MEE. Afvinken als "verklaard" betekent dat er
 * naar die dag gekeken is en dat het verschil een bekende reden heeft; hem dan
 * toch in het saldo laten staan zou betekenen dat het totaal nooit opschoont,
 * hoeveel je ook uitzoekt. Zit er op één dag een verklaarde én een openstaande
 * afwijking, dan valt de hele dag eruit — het saldo is een dag-grootheid, dus
 * half meetellen kan niet. Zie `dagVerklaard`.
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
  let verklaard = 0
  let tvtDagen = 0
  let tvtUren = 0

  for (const r of rijen) {
    const sleutel = dagSleutel(r)
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)

    // Gereserveerd als tijd voor tijd gaat vóór verklaard: het verschil is dan
    // niet alleen bekend maar ook belegd, en dat bedrag hoort in zijn eigen
    // totaal terug te komen.
    if (r.tvtUren != null) {
      tvtDagen += 1
      tvtUren += r.tvtUren
      continue
    }
    if (dagVerklaard(r)) {
      verklaard += 1
      continue
    }
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
    verklaard,
    tvtDagen,
    tvtUren: afgerond(tvtUren),
  }
}

const dagSleutel = (r: WerktijdRij) => `${r.user_id_ulu}|${r.datum}`
