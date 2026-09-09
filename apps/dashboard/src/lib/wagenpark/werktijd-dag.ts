/**
 * De vorm van één werkdag in de werktijdenlijst, plus de vragen die je erover
 * stelt.
 *
 * Staat los van het tabelcomponent en niet erin. Dat scheelt niet alleen
 * netheid: `werktijd-samenvatting.ts` en de PDF-uitdraai gebruiken deze
 * helpers, en die draaien op de server. Zaten ze in het `'use client'`-component,
 * dan sleepte elke import het hele zijpaneel mét zijn server-actions mee — en
 * dan klapt de PDF-route op een `server-only` dat daar niets te zoeken heeft.
 */
import { teltMee, type WerktijdSoort } from '@/lib/wagenpark/werktijd'

/**
 * Eén regel = één medewerker op één werkdag.
 *
 * De lijst bevat ELKE roosterwerkdag in de periode, niet alleen de gemarkeerde:
 * een dag zonder afwijking kan nog steeds een saldo hebben tussen wat de auto
 * deed en wat er geschreven is, en die dag moet je dus kunnen zien.
 *
 * De dag is de eenheid, niet de bevinding. Eerder stond elke bevinding op een
 * eigen regel, en dan kwam een dag waarop iemand én te laat kwam én te vroeg
 * wegging twee keer in de lijst — met beide keren dezelfde aanwezigheid en
 * dezelfde uren ernaast. Dat las als twee dagen en telde in elke som dubbel.
 * Nu hangen de afwijkingen ONDER de dag, in `teLaat` en `teVroeg`.
 */
export type WerktijdRij = {
  /** `<bestuurder>|<datum>` — de dag is de sleutel, niet de bevinding. */
  id: string
  datum: string
  user_id_ulu: string
  bestuurder: string
  /** ISO-week als "2026-W29"; komt uit Postgres, niet uit de browser. */
  week: string
  /** Maandag van die week (YYYY-MM-DD). */
  week_start: string
  /** Bouw7-medewerkersnummer; de server koppelt hiermee de urenboekingen. */
  bouw7_id: string | null
  /**
   * De roostertijden van die dag ("07:30" / "16:15"). Komen uit het rooster
   * zelf en niet uit een bevinding: ook een dag zonder afwijking heeft een
   * roosterdag, en zonder die tijden zou de kolom daar leeg blijven terwijl er
   * wel degelijk een norm gold.
   */
  roosterStart: string | null
  roosterEind: string | null

  /* ── Afwijkingen op de roostertijden (R9/R10) ────────────────────────── */

  /** Te laat op het werk aangekomen, of null als dat niet zo was. */
  teLaat: WerktijdAfwijking | null
  /** Te vroeg van het werk vertrokken, of null. */
  teVroeg: WerktijdAfwijking | null

  /* ── Geboekte uren ───────────────────────────────────────────────────── */

  /**
   * Uren die deze medewerker die dag in Bouw7 schreef, om het signaal mee te
   * controleren. `null` = niet op te halen (Bouw7 onbereikbaar of medewerker
   * zonder Bouw7-koppeling); `0` = wél gekeken, niets geboekt. Dat onderscheid
   * moet zichtbaar blijven: een storing mag er niet uitzien als een lege dag.
   */
  geboekt: number | null
  /**
   * Alleen de ARBEIDSUREN van die dag: uursoorten met categorie `werk`. Verlof,
   * ziek, feestdag en opgenomen tijd voor tijd tellen niet mee — die uren zijn
   * geen aanwezigheid en zouden het saldo hieronder onbruikbaar maken. `null` =
   * niet te bepalen (Bouw7 onbereikbaar, of geen enkele geboekte uursoort is
   * ingedeeld).
   */
  arbeidsuren: number | null
  /** "6,0 normaal · 2,0 verlof", of null als er niets geboekt is. */
  uursoorten: string | null

  /* ── Aanwezigheid volgens de auto (zie lib/wagenpark/werktijd-aanwezigheid.ts) ── */

  /** Aankomst op het werk, "07:32"; null als die dag niet te bepalen is. */
  aankomst: string | null
  /** Vertrek van het werk, "16:04"; null als dat niet te bepalen is. */
  vertrek: string | null
  /** Netto aanwezig in minuten: vertrek − aankomst − pauze. Null = niet te bepalen. */
  aanwezigMinuten: number | null
  /** Afgetrokken pauzeminuten uit het rooster. */
  pauzeMinuten: number
  /** Staat er überhaupt een pauze in het rooster? Bij false is er niets afgetrokken. */
  pauzeInRooster: boolean
  /** Waarom er geen aanwezigheid is, in gewone taal. Null als die er wel is. */
  aanwezigReden: string | null

  /* ── Tijd voor tijd ──────────────────────────────────────────────────── */

  /**
   * Het saldo van deze dag is gereserveerd als tijd voor tijd: zoveel uur,
   * ondertekend zoals het saldo zelf. `null` = niets gereserveerd.
   *
   * Een reservering raakt géén urenboeking in Bouw7 — het is een afspraak die
   * in EVA staat. De dag valt er wel mee uit het openstaande saldo, want het
   * verschil is dan bekend en belegd.
   */
  tvtUren: number | null
  /** Toelichting bij de reservering. */
  tvtToelichting: string | null
}

/**
 * Eén afwijking op een dag: een R9- of R10-bevinding.
 *
 * Het `id` is het bevinding-id — daarop wordt afgehandeld en daarop wordt de
 * bepalende rit verzet. Een dag zonder afwijkingen heeft er geen, en is daarmee
 * ook niet af te handelen.
 */
export type WerktijdAfwijking = {
  id: string
  soort: WerktijdSoort
  minuten: number
  /** Roostertijd waartegen gemeten is. */
  verwacht: string | null
  /** Werkelijke aankomst (te laat) of vertrek (te vroeg). */
  werkelijk: string | null
  /** De roostertijd komt uit een rooster dat op die datum formeel nog niet gold. */
  benadering: boolean
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  status: string
}

/** Status van een werkdag waar geen R9/R10-signaal op zit. */
export const GEEN_SIGNAAL = 'geen_signaal'

/** De afwijkingen van een dag, in vaste volgorde: eerst de aankomst. */
export function afwijkingenVanDag(r: WerktijdRij): WerktijdAfwijking[] {
  return [r.teLaat, r.teVroeg].filter((a): a is WerktijdAfwijking => a != null)
}

/** Draagt deze dag een afwijking, of ging alles binnen de roostertijden? */
export function heeftSignaal(r: WerktijdRij): boolean {
  return r.teLaat != null || r.teVroeg != null
}

/**
 * Is (een deel van) deze dag afgevinkt als verklaard?
 *
 * Eén verklaarde afwijking haalt de hele dag uit het saldo. Het saldo is een
 * dag-grootheid — je kunt er niet een halve dag uit halen — en wie de reden van
 * het verschil heeft uitgezocht wil dat verschil ook niet meer in zijn totaal
 * terugzien.
 */
export function dagVerklaard(r: WerktijdRij): boolean {
  return afwijkingenVanDag(r).some((a) => !teltMee(a.status))
}

/**
 * Is deze dag afgedaan — verklaard, of als tijd voor tijd gereserveerd?
 *
 * Beide betekenen dat er naar het verschil gekeken is en dat het niet meer in
 * het openstaande saldo hoort. Het verschil tussen de twee: verklaard zegt
 * "hier was een reden voor", gereserveerd zegt "dit wordt verrekend".
 */
export function dagAfgedaan(r: WerktijdRij): boolean {
  return dagVerklaard(r) || r.tvtUren != null
}

/**
 * De status van de dag als geheel, voor de kolom en het filter.
 *
 * Zolang er nog iets openstaat is de dag "te controleren" — anders zou een dag
 * met een afgehandelde late aankomst en een openstaand vroeg vertrek uit je
 * werklijst verdwijnen.
 */
export function dagStatus(r: WerktijdRij): string {
  const lijst = afwijkingenVanDag(r)
  if (lijst.length === 0) return GEEN_SIGNAAL
  const open = lijst.find((a) => a.status === 'open')
  if (open) return open.status
  return lijst[0].status
}

/** De rij zoals hij uit de database komt, nog zonder de uren en de aanwezigheid. */
export type WerktijdBevindingRij = Omit<
  WerktijdRij,
  | 'tvtUren'
  | 'tvtToelichting'
  | 'geboekt'
  | 'arbeidsuren'
  | 'uursoorten'
  | 'aankomst'
  | 'vertrek'
  | 'aanwezigMinuten'
  | 'pauzeMinuten'
  | 'pauzeInRooster'
  | 'aanwezigReden'
>

