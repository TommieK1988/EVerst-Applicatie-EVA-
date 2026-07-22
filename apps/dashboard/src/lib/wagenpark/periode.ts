/**
 * Afgebakende periodes voor de Werktijden-pagina.
 *
 * Bewust géén voortschrijdend venster ("laatste N weken"): om een gesprek te
 * voeren over vorig kwartaal moet dat kwartaal ook precies afgebakend zijn,
 * anders loopt het lopende kwartaal er half doorheen.
 *
 * TIJDZONE-VALKUIL: op Vercel draait de server in UTC. Op 1 januari 00:30
 * Nederlandse tijd is het daar nog 31 december, en dan zou "dit jaar" het
 * vorige jaar opleveren. Vandaag wordt daarom als kalenderdatum in
 * Europe/Amsterdam opgehaald (`en-CA` geeft YYYY-MM-DD) en verder puur als
 * string en getal gerekend — er komt geen Date-object met een tijdstip aan te
 * pas.
 */

export type PeriodePreset =
  | 'dit-kwartaal'
  | 'vorig-kwartaal'
  | 'dit-jaar'
  | 'vorig-jaar'
  | 'aangepast'

export type Periode = {
  preset: PeriodePreset
  /** Eerste dag, YYYY-MM-DD (inclusief). */
  van: string
  /** Laatste dag, YYYY-MM-DD (inclusief). */
  tot: string
  /** "Vorig kwartaal · Q2 2026 (apr t/m jun)" — voor in de paginakop. */
  label: string
}

export const PRESET_LABELS: Record<Exclude<PeriodePreset, 'aangepast'>, string> = {
  'dit-kwartaal': 'Dit kwartaal',
  'vorig-kwartaal': 'Vorig kwartaal',
  'dit-jaar': 'Dit jaar',
  'vorig-jaar': 'Vorig jaar',
}

const MAAND_KORT = [
  '', 'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function vandaagNL(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

/** Laatste dag van een maand, zonder Date-rekenwerk over tijdzones heen. */
function laatsteDag(jaar: number, maand: number): number {
  const schrikkel = (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0
  return [0, 31, schrikkel ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][maand]
}

function dag(jaar: number, maand: number, d: number): string {
  return `${jaar}-${String(maand).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function kwartaalPeriode(jaar: number, kwartaal: number, preset: PeriodePreset): Periode {
  const eersteMaand = (kwartaal - 1) * 3 + 1
  const laatsteMaand = eersteMaand + 2
  return {
    preset,
    van: dag(jaar, eersteMaand, 1),
    tot: dag(jaar, laatsteMaand, laatsteDag(jaar, laatsteMaand)),
    label:
      `${PRESET_LABELS[preset as Exclude<PeriodePreset, 'aangepast'>]} · ` +
      `Q${kwartaal} ${jaar} (${MAAND_KORT[eersteMaand]} t/m ${MAAND_KORT[laatsteMaand]})`,
  }
}

function jaarPeriode(jaar: number, preset: PeriodePreset): Periode {
  return {
    preset,
    van: dag(jaar, 1, 1),
    tot: dag(jaar, 12, 31),
    label: `${PRESET_LABELS[preset as Exclude<PeriodePreset, 'aangepast'>]} · ${jaar}`,
  }
}

const DATUM_PATROON = /^\d{4}-\d{2}-\d{2}$/

/**
 * Zet de query-parameters om in een afgebakende periode.
 *
 * `van`/`tot` winnen van `periode`: heeft de gebruiker zelf datums gekozen, dan
 * is dat wat hij bedoelt. Onbruikbare of ontbrekende invoer valt terug op het
 * lopende kwartaal — nooit op een lege of omgekeerde periode, want dan zou de
 * pagina "geen afwijkingen" tonen terwijl er niets mis is.
 */
export function bepaalPeriode(params: {
  periode?: string
  van?: string
  tot?: string
}): Periode {
  const vandaag = vandaagNL()
  const jaarNu = Number(vandaag.slice(0, 4))
  const maandNu = Number(vandaag.slice(5, 7))
  const kwartaalNu = Math.floor((maandNu - 1) / 3) + 1

  if (params.van && params.tot && DATUM_PATROON.test(params.van) && DATUM_PATROON.test(params.tot)) {
    // Omgekeerd ingevoerd? Draai om in plaats van een lege lijst tonen.
    const [van, tot] =
      params.van <= params.tot ? [params.van, params.tot] : [params.tot, params.van]
    return { preset: 'aangepast', van, tot, label: `${datumKort(van)} t/m ${datumKort(tot)}` }
  }

  switch (params.periode) {
    case 'vorig-kwartaal':
      return kwartaalNu === 1
        ? kwartaalPeriode(jaarNu - 1, 4, 'vorig-kwartaal')
        : kwartaalPeriode(jaarNu, kwartaalNu - 1, 'vorig-kwartaal')
    case 'dit-jaar':
      return jaarPeriode(jaarNu, 'dit-jaar')
    case 'vorig-jaar':
      return jaarPeriode(jaarNu - 1, 'vorig-jaar')
    case 'dit-kwartaal':
    default:
      return kwartaalPeriode(jaarNu, kwartaalNu, 'dit-kwartaal')
  }
}

/** "13 jul 2026" */
export function datumKort(datum: string): string {
  const [j, m, d] = datum.split('-').map(Number)
  return `${d} ${MAAND_KORT[m]} ${j}`
}

/** De maandnummers die binnen de periode vallen, bv. [4, 5, 6]. */
export function maandenInPeriode(periode: Periode): number[] {
  const vanJaar = Number(periode.van.slice(0, 4))
  const vanMaand = Number(periode.van.slice(5, 7))
  const totJaar = Number(periode.tot.slice(0, 4))
  const totMaand = Number(periode.tot.slice(5, 7))

  // Loopt de periode over een jaargrens, dan is een maandkolom niet eenduidig
  // (maart 2025 en maart 2026 zouden op dezelfde kolom vallen). Dan tonen we
  // alle twaalf, en telt de samenvatting de jaren bij elkaar op — de kop van de
  // pagina vermeldt de periode, dus dat is af te lezen.
  if (vanJaar !== totJaar) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  const uit: number[] = []
  for (let m = vanMaand; m <= totMaand; m++) uit.push(m)
  return uit
}

export const MAAND_LABEL = MAAND_KORT
