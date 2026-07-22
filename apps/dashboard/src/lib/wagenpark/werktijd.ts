/**
 * Gedeelde weergave-logica voor de werktijd-signalen R9 (te laat op het werk) en
 * R10 (te vroeg van het werk weg).
 *
 * De regels zelf staan in `packages/wagenpark-core/src/compliance/rules/`; hier
 * staat alleen hoe je de bevindingen leest en toont. Zowel de signaalkolom op
 * /wagenpark/ritten als de pagina /wagenpark/werktijden gebruikt dit bestand,
 * zodat een minuut op beide plekken hetzelfde heet en hetzelfde optelt.
 *
 * DE VALKUIL: één te late aankomst levert net zoveel bevindingen op als de
 * heenreis ritten heeft. De rit die de tijd bepaalt is het ANKER en draagt het
 * echte aantal minuten; de andere delen van de ritketen dragen datzelfde getal
 * mee als verwijzing. Tel je die mee, dan telt een opgesplitste rit dubbel of
 * driedubbel. Alles hier filtert daarom op `keten_rol === 'anker'`.
 */

/** De twee werktijd-regels. Andere regels hebben geen minuten-afwijking. */
export const WERKTIJD_REGELS = ['R9', 'R10'] as const

export type WerktijdSoort = 'te_laat' | 'te_vroeg'

/** Het deel van `compliance_bevindingen.data` dat R9/R10 vullen. */
export type WerktijdData = {
  soort?: WerktijdSoort
  datum?: string
  dag?: string
  verschil_minuten?: number
  verwacht_start?: string | null
  verwacht_eind?: string | null
  aankomst_werk?: string | null
  vertrek_werk?: string | null
  rooster_benadering?: boolean
  keten_rol?: 'anker' | 'deel'
  keten_trip_ids?: string[]
}

/** Minimale vorm van een bevinding die we hier nodig hebben. */
type BevindingAchtig = { regel_code: string; ernst?: string; data?: unknown }

export const SOORT_LABEL: Record<WerktijdSoort, string> = {
  te_laat: 'Te laat',
  te_vroeg: 'Te vroeg',
}

/**
 * `74` → `1u14`, `12` → `12 min`.
 *
 * Zelfde vorm als `duurLabel` in wagenpark-core, bewust gedupliceerd: die zit in
 * de compliance-engine en die wil je niet in een client component importeren.
 */
export function minutenLabel(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = Math.round(minuten % 60)
  return u > 0 ? `${u}u${String(m).padStart(2, '0')}` : `${m} min`
}

/** De werktijd-data van een bevinding, of null als het er geen is. */
export function werktijdData(b: BevindingAchtig): WerktijdData | null {
  if (!(WERKTIJD_REGELS as readonly string[]).includes(b.regel_code)) return null
  const d = b.data as WerktijdData | null | undefined
  if (!d || typeof d !== 'object') return null
  // Handmatig toegekende R9/R10-signalen hebben geen keten en geen minuten —
  // die kun je niet optellen, dus ze tellen nergens mee.
  if (d.keten_rol !== 'anker') return null
  if (typeof d.verschil_minuten !== 'number') return null
  return d
}

export type Afwijking = {
  soort: WerktijdSoort
  minuten: number
  /** Roostertijd waar tegenaan gemeten is ("07:00"). */
  verwacht: string | null
  /** Werkelijke aankomst (R9) of vertrek (R10). */
  werkelijk: string | null
  /**
   * De ernst zoals de regel hem bepaalde: t/m `overtreding_vanaf_min` een
   * waarschuwing, daarboven een overtreding. Bewust niet hier herrekend — de
   * drempel staat in de regelconfiguratie en kan per regel verschillen.
   */
  ernst: string
}

/**
 * De afwijkingen die aan één rit hangen: 0, 1 of 2 stuks — een dag kan zowel te
 * laat begonnen als te vroeg geëindigd zijn, en bij een dag zonder tussenstops
 * is de heenreis ook de terugreis.
 */
export function afwijkingenVanRit(bevindingen: BevindingAchtig[] | null | undefined): Afwijking[] {
  const uit: Afwijking[] = []
  for (const b of bevindingen ?? []) {
    const d = werktijdData(b)
    if (!d) continue
    const soort: WerktijdSoort = d.soort ?? (b.regel_code === 'R9' ? 'te_laat' : 'te_vroeg')
    uit.push({
      soort,
      minuten: d.verschil_minuten as number,
      verwacht: (soort === 'te_laat' ? d.verwacht_start : d.verwacht_eind) ?? null,
      werkelijk: (soort === 'te_laat' ? d.aankomst_werk : d.vertrek_werk) ?? null,
      ernst: b.ernst ?? 'waarschuwing',
    })
  }
  return uit
}

/** Totaal aantal minuten afwijking; 0 als de rit geen werktijd-signaal draagt. */
export function totaalMinuten(afwijkingen: Afwijking[]): number {
  return afwijkingen.reduce((som, a) => som + a.minuten, 0)
}

/** "12 min te laat" / "1u05 te laat · 20 min te vroeg" — voor in een cel. */
export function afwijkingLabel(afwijkingen: Afwijking[]): string {
  return afwijkingen
    .map((a) => `${minutenLabel(a.minuten)} ${a.soort === 'te_laat' ? 'te laat' : 'te vroeg'}`)
    .join(' · ')
}
