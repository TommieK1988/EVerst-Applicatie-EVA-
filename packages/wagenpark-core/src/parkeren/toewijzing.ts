/**
 * Beoordeelt bij welk dossier een parkeerkost hoort.
 *
 * Pure functie: alle gegevens komen als context binnen, er is geen database en
 * geen netwerk. Zelfde opzet als de compliance-regels — daardoor is de
 * beslislogica los te draaien op verzonnen of historische data, zonder dat er
 * iets in de administratie verandert.
 *
 * De grondgedachte: een monteur parkeert bij het werkadres van het project waar
 * hij die dag staat. Twee soorten signaal zeggen wélk project dat is (planning
 * en geschreven uren), en één signaal bevestigt het (de afstand tussen het
 * eindpunt van de rit en het werkadres). Bevestigend alléén is nooit genoeg:
 * dat een auto vlak bij een project stond bewijst niet dat er gewerkt is.
 */

import { afstandMeter, type GeoPunt } from '../utils/distance'

export type ParkeerInstellingen = {
  straalDichtbijM: number
  straalNabijM: number
  straalRuimM: number
  minScoreZeker: number
  minMargeZeker: number
  minBedrag: number
}

export const STANDAARD_INSTELLINGEN: ParkeerInstellingen = {
  straalDichtbijM: 150,
  straalNabijM: 400,
  straalRuimM: 1000,
  minScoreZeker: 50,
  minMargeZeker: 25,
  minBedrag: 0.01,
}

/** Punten per signaal. Bij elkaar de hele weging — geen verborgen getallen elders. */
export const PUNTEN = {
  urenOpDossier: 50,
  urenWeekGoedgekeurd: 10,
  urenWeekIngediend: 5,
  planitemOverlapt: 45,
  planitemZelfdeDag: 25,
  geoDichtbij: 40,
  geoNabij: 25,
  geoRuim: 10,
  straatKomtOvereen: 10,
  stadKomtOvereen: 5,
} as const

export type ParkeerBestuurder = {
  medewerkerId: string | null
  uluUserId: number | null
  naam: string | null
  /** Uit een rit (betrouwbaar) of uit de vaste voertuigkoppeling (indicatief). */
  bron: 'rit' | 'voertuig_bestuurder'
  tripId: string | null
  ritTypeEffectief: 'zakelijk' | 'prive' | null
  ritStop: GeoPunt | null
  /** Minuten tussen het einde van de rit en de start van het parkeren. */
  minutenNaRit: number | null
}

export type UrenSignaal = {
  dossierId: string
  uren: number
  weekStatus: string | null
  bewakingscode: string | null
  pslId: number | null
}

export type PlanSignaal = {
  dossierId: string
  overlapt: boolean
  bewakingscode: string | null
}

export type DossierInfo = {
  id: string
  dossiernummer: string | null
  titel: string | null
  actief: boolean
  punt: GeoPunt | null
  werkadresStraat: string | null
  werkadresStad: string | null
}

export type ParkeerContext = {
  parking: {
    id: string
    kenteken: string
    startIso: string
    datum: string
    locatie: string | null
    kosten: number | null
  }
  bestuurder: ParkeerBestuurder | null
  /** Verlof op de matchdag — ook relevant als er geen rit gevonden is. */
  verlof: boolean
  uren: UrenSignaal[]
  planning: PlanSignaal[]
  dossiers: DossierInfo[]
  instellingen: ParkeerInstellingen
}

export type Reden = {
  bron: 'uren' | 'planning' | 'geo' | 'tekst'
  punten: number
  detail: string
}

export type Kandidaat = {
  dossierId: string
  dossiernummer: string | null
  score: number
  redenen: Reden[]
  urenOpDag: number | null
  afstandM: number | null
  bewakingscode: string | null
  pslId: number | null
  actief: boolean
  /**
   * Staat deze medewerker die dag op dit project (planning of geschreven uren)?
   *
   * Dit onderscheidt een écht kandidaat-project van een project dat alleen in
   * beeld komt doordat het toevallig in dezelfde straat of stad ligt. Zonder dat
   * onderscheid zou een kandidaat op louter locatie automatisch geboekt kunnen
   * worden, en zou elk buurproject de onderlinge marge verpesten.
   */
  dagsignaal: boolean
}

export type ParkeerOordeel = {
  uitkomst: 'zeker' | 'werkvoorraad' | 'prive' | 'geen_kandidaat' | 'negeer'
  zekerheid: 'zeker' | 'waarschijnlijk' | 'onzeker' | 'geen'
  kandidaten: Kandidaat[]
  signalen: Record<string, unknown>
}

/** "1946 3e Joan Maetsuyckerstraat, Den Haag" → straat zonder ULU-zonenummer. */
export function zoneStraat(locatie: string | null): string | null {
  if (!locatie) return null
  const zonder = locatie.includes(',')
    ? locatie.slice(0, locatie.lastIndexOf(','))
    : locatie
  const schoon = zonder.replace(/^\s*\d{3,5}\s+/, '').trim()
  return schoon || null
}

/** Alles na de laatste komma is bij ULU de gemeente. */
export function zoneStad(locatie: string | null): string | null {
  if (!locatie || !locatie.includes(',')) return null
  return locatie.slice(locatie.lastIndexOf(',') + 1).trim() || null
}

function normaliseer(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function beoordeelParkeerRij(ctx: ParkeerContext): ParkeerOordeel {
  const { parking, bestuurder, instellingen: inst } = ctx

  // Stap 0 — nulbedragen leveren niets op om te verdelen.
  if ((parking.kosten ?? 0) < inst.minBedrag) {
    return { uitkomst: 'negeer', zekerheid: 'geen', kandidaten: [], signalen: { reden: 'geen bedrag' } }
  }

  // Stap 1 — privé is een harde stop, vóór alle scoring. Een privérit of een
  // verlofdag hoort nooit op een project, ook niet als de plek zou kloppen.
  if (bestuurder?.ritTypeEffectief === 'prive' || ctx.verlof) {
    return {
      uitkomst: 'prive',
      zekerheid: 'geen',
      kandidaten: [],
      signalen: {
        reden: ctx.verlof ? 'verlof op deze dag' : 'rit is effectief privé',
        bestuurder: bestuurder?.naam ?? null,
      },
    }
  }

  const dossierPer = new Map(ctx.dossiers.map((d) => [d.id, d]))
  const kandidaten = new Map<string, Kandidaat>()

  const zorgVoor = (dossierId: string): Kandidaat | null => {
    const info = dossierPer.get(dossierId)
    if (!info) return null
    let k = kandidaten.get(dossierId)
    if (!k) {
      k = {
        dossierId,
        dossiernummer: info.dossiernummer,
        score: 0,
        redenen: [],
        urenOpDag: null,
        afstandM: null,
        bewakingscode: null,
        pslId: null,
        actief: info.actief,
        dagsignaal: false,
      }
      kandidaten.set(dossierId, k)
    }
    return k
  }

  // Stap 2 — geschreven uren. Het sterkste signaal: waar iemand zijn uren op
  // schrijft, is waar hij die dag was.
  for (const u of ctx.uren) {
    if (u.weekStatus === 'afgekeurd') continue
    const k = zorgVoor(u.dossierId)
    if (!k) continue

    k.score += PUNTEN.urenOpDossier
    k.dagsignaal = true
    k.urenOpDag = (k.urenOpDag ?? 0) + u.uren
    k.redenen.push({
      bron: 'uren',
      punten: PUNTEN.urenOpDossier,
      detail: `${u.uren.toFixed(1).replace('.', ',')} uur geschreven op deze dag`,
    })

    if (u.weekStatus === 'goedgekeurd' || u.weekStatus === 'teamleider_akkoord') {
      k.score += PUNTEN.urenWeekGoedgekeurd
      k.redenen.push({ bron: 'uren', punten: PUNTEN.urenWeekGoedgekeurd, detail: 'week is goedgekeurd' })
    } else if (u.weekStatus === 'ingediend') {
      k.score += PUNTEN.urenWeekIngediend
      k.redenen.push({ bron: 'uren', punten: PUNTEN.urenWeekIngediend, detail: 'week is ingediend' })
    }

    // De codering van de urenregel is meteen het voorstel voor de boeking.
    k.bewakingscode = k.bewakingscode ?? u.bewakingscode
    k.pslId = k.pslId ?? u.pslId
  }

  // Stap 3 — planning. Beschikbaar vóórdat er uren geschreven zijn, en in de
  // praktijk vaak het enige signaal.
  for (const p of ctx.planning) {
    const k = zorgVoor(p.dossierId)
    if (!k) continue
    const punten = p.overlapt ? PUNTEN.planitemOverlapt : PUNTEN.planitemZelfdeDag
    k.score += punten
    k.dagsignaal = true
    k.redenen.push({
      bron: 'planning',
      punten,
      detail: p.overlapt ? 'ingepland op dit tijdstip' : 'ingepland op deze dag',
    })
    k.bewakingscode = k.bewakingscode ?? p.bewakingscode
  }

  // Stap 4 — afstand en tekst. Bevestigend: het verschil tussen twee kandidaten
  // op dezelfde dag, maar op zichzelf nooit genoeg voor een automatische boeking.
  const straat = normaliseer(zoneStraat(parking.locatie))
  const stad = normaliseer(zoneStad(parking.locatie))

  for (const d of ctx.dossiers) {
    const heeftDagsignaal = kandidaten.has(d.id)

    let afstand: number | null = null
    if (bestuurder?.ritStop && d.punt) {
      afstand = Math.round(afstandMeter(bestuurder.ritStop, d.punt))
    }

    const straatMatch =
      straat.length > 4 &&
      normaliseer(d.werkadresStraat).length > 4 &&
      (normaliseer(d.werkadresStraat).includes(straat) || straat.includes(normaliseer(d.werkadresStraat)))
    const stadMatch = stad.length > 2 && normaliseer(d.werkadresStad) === stad

    const binnenBereik = afstand != null && afstand <= inst.straalRuimM
    // Dossiers zonder dagsignaal komen alleen in beeld als ze echt dichtbij
    // liggen of het adres letterlijk overeenkomt. Anders zou elk project in
    // dezelfde stad kandidaat worden.
    if (!heeftDagsignaal && !binnenBereik && !straatMatch) continue

    const k = zorgVoor(d.id)
    if (!k) continue
    k.afstandM = afstand

    if (afstand != null) {
      if (afstand <= inst.straalDichtbijM) {
        k.score += PUNTEN.geoDichtbij
        k.redenen.push({ bron: 'geo', punten: PUNTEN.geoDichtbij, detail: `${afstand} m van het werkadres` })
      } else if (afstand <= inst.straalNabijM) {
        k.score += PUNTEN.geoNabij
        k.redenen.push({ bron: 'geo', punten: PUNTEN.geoNabij, detail: `${afstand} m van het werkadres` })
      } else if (afstand <= inst.straalRuimM) {
        k.score += PUNTEN.geoRuim
        k.redenen.push({ bron: 'geo', punten: PUNTEN.geoRuim, detail: `${afstand} m van het werkadres` })
      }
    }
    if (straatMatch) {
      k.score += PUNTEN.straatKomtOvereen
      k.redenen.push({ bron: 'tekst', punten: PUNTEN.straatKomtOvereen, detail: 'straat komt overeen' })
    }
    if (stadMatch) {
      k.score += PUNTEN.stadKomtOvereen
      k.redenen.push({ bron: 'tekst', punten: PUNTEN.stadKomtOvereen, detail: 'plaats komt overeen' })
    }
  }

  // Inactieve dossiers vallen af, tenzij er uren op geschreven zijn — dan is het
  // een gegeven, geen gok, en hoort een mens ernaar te kijken.
  const urenDossiers = new Set(ctx.uren.map((u) => u.dossierId))
  const lijst = [...kandidaten.values()]
    .filter((k) => k.actief || urenDossiers.has(k.dossierId))
    .filter((k) => k.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.dossiernummer ?? '').localeCompare(b.dossiernummer ?? '') ||
        a.dossierId.localeCompare(b.dossierId),
    )

  const signalen: Record<string, unknown> = {
    bestuurder: bestuurder?.naam ?? null,
    bestuurder_bron: bestuurder?.bron ?? null,
    minuten_na_rit: bestuurder?.minutenNaRit ?? null,
    rit_type: bestuurder?.ritTypeEffectief ?? null,
    parkeerlocatie: parking.locatie,
    kandidaten: lijst.slice(0, 5).map((k) => ({
      dossier_id: k.dossierId,
      dossiernummer: k.dossiernummer,
      score: k.score,
      afstand_m: k.afstandM,
      uren: k.urenOpDag,
      redenen: k.redenen.map((r) => r.detail),
    })),
  }

  if (lijst.length === 0) {
    return { uitkomst: 'geen_kandidaat', zekerheid: 'geen', kandidaten: [], signalen }
  }

  const eerste = lijst[0]
  // De marge telt alleen tegen projecten waar deze medewerker die dag óók stond.
  // Een project dat enkel in dezelfde stad ligt is geen concurrent; dat mee laten
  // wegen zou vrijwel elke stedelijke parkeerkost handmatig maken.
  const echteConcurrent = lijst.slice(1).find((k) => k.dagsignaal)
  const marge = eerste.score - (echteConcurrent?.score ?? 0)

  // De harde eisen voor automatisch boeken. Elke ontbrekende eis maakt het een
  // voorstel in plaats van een boeking — liever een regel in de werkvoorraad dan
  // een kost op het verkeerde project.
  const uitRit = bestuurder?.bron === 'rit'
  const zakelijk = bestuurder?.ritTypeEffectief === 'zakelijk'
  const scoreHoog = eerste.score >= inst.minScoreZeker
  const margeGroot = marge >= inst.minMargeZeker
  // Dat een auto vlak bij een project stond bewijst niet dat er gewerkt is.
  // Zonder planning of uren op dat project blijft het dus een voorstel.
  const heeftDagsignaal = eerste.dagsignaal

  if (uitRit && zakelijk && scoreHoog && margeGroot && heeftDagsignaal && eerste.actief) {
    return { uitkomst: 'zeker', zekerheid: 'zeker', kandidaten: lijst, signalen: { ...signalen, marge } }
  }

  const zekerheid: ParkeerOordeel['zekerheid'] = scoreHoog
    ? 'waarschijnlijk'
    : eerste.score >= PUNTEN.geoRuim
      ? 'onzeker'
      : 'geen'

  return {
    uitkomst: 'werkvoorraad',
    zekerheid,
    kandidaten: lijst,
    signalen: {
      ...signalen,
      marge,
      // Waaróm het geen automatische boeking werd; dit staat straks in de uitleg.
      ontbreekt: [
        !uitRit && 'bestuurder niet uit een rit afgeleid',
        !zakelijk && 'rit niet als zakelijk herkend',
        !scoreHoog && 'te weinig aanwijzingen',
        !margeGroot && 'meerdere projecten van deze dag liggen te dicht bij elkaar',
        !heeftDagsignaal && 'geen planning of uren op dit project voor deze dag',
        !eerste.actief && 'dossier is niet meer actief',
      ].filter(Boolean),
    },
  }
}
