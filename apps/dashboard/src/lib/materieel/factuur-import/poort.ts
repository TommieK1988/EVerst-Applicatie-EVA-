/**
 * factuur-import/poort.ts
 *
 * De deterministische poort tussen het model en het register.
 *
 * Het model levert namen en categorieën als tékst. Hier wordt daar pas een
 * beslissing van: bestaat die categorie, is die naam precies één medewerker, en
 * hebben we deze factuur niet allang ingelezen. Wat de poort niet haalt, wordt
 * niet stilletjes gerepareerd maar zichtbaar leeggelaten met een reden erbij —
 * de gebruiker moet kunnen zien wat de machine níét wist.
 */

import { MATERIEEL_CATEGORIEEN, type MaterieelCategorie } from '../types'
import type { FactuurExtractie, NaamSoort, Regel } from './schema'

export interface MedewerkerKandidaat {
  id: string
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
  actief: boolean
}

/**
 * Namen die de leverancier anders spelt dan onze eigen administratie.
 *
 * Deze lijst is klein en met de hand bijgehouden, en dat is een keuze: fuzzy
 * matchen op achternaam koppelde in eerdere rondes de verkeerde persoon zonder
 * dat iemand het merkte. Liever vier bekende uitzonderingen dan een algoritme
 * dat er soms naast zit. Sleutel is genormaliseerd.
 */
const ALIASSEN: Record<string, string> = {
  rien: 'marinus van kooten',
  'jasper middeldorp': 'jasper middelburg',
  'john couvereur': 'john couvreur',
  'danny hermaling': 'danny hermeling',
}

function normaliseer(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function volledig(m: MedewerkerKandidaat): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

export type NaamKoppeling =
  | { soort: 'gekoppeld'; id: string; naam: string }
  | { soort: 'meerdere'; namen: string[] }
  | { soort: 'uit_dienst'; naam: string }
  | { soort: 'onbekend' }

/**
 * Zoekt de medewerker achter een naam van een factuur. Koppelt alleen bij
 * precies één treffer; bij twee Chrissen blijft het object bewust van niemand.
 */
export function koppelNaam(ruw: string | null, medewerkers: MedewerkerKandidaat[]): NaamKoppeling {
  if (!ruw) return { soort: 'onbekend' }
  const gezocht = ALIASSEN[normaliseer(ruw)] ?? normaliseer(ruw)
  if (!gezocht) return { soort: 'onbekend' }

  const treffers = medewerkers.filter((m) => {
    const heel = normaliseer(volledig(m))
    const voor = normaliseer(m.voornaam ?? '')
    // Volledige naam, of alleen de voornaam als de factuur niet meer geeft.
    return heel === gezocht || (voor.length > 1 && voor === gezocht)
  })

  const actief = treffers.filter((m) => m.actief)
  if (actief.length === 1) return { soort: 'gekoppeld', id: actief[0].id, naam: volledig(actief[0]) }
  if (actief.length > 1) return { soort: 'meerdere', namen: actief.map(volledig) }
  if (treffers.length > 0) return { soort: 'uit_dienst', naam: volledig(treffers[0]) }
  return { soort: 'onbekend' }
}

/**
 * Mag een naam in deze hoedanigheid de houder worden?
 *
 * Alleen wie het opgehaald heeft. Een inkoper op de factuur is niet de
 * gebruiker: kantoor bestelt hier accu's voor de hele ploeg, en die als houder
 * invullen maakt het register onbetrouwbaar op precies het punt waarvoor het
 * bestaat.
 */
export function magToewijzen(soort: NaamSoort): boolean {
  return soort === 'afgehaald_door'
}

export interface VoorstelRegel extends Regel {
  /** Stabiele sleutel binnen dit voorstel, voor de checkbox-lijst in het scherm. */
  regelId: string
  /** Categorie na controle tegen de enum; valt terug op gereedschap. */
  categorie: MaterieelCategorie | null
  /** Staat het vinkje aan bij het openen van het scherm? */
  standaardAan: boolean
}

export interface Voorstel {
  leverancier: string | null
  factuurnummer: string | null
  factuurdatum: string | null
  leverdatum: string | null
  bonnummer: string | null
  administratie: string | null
  naamOpFactuur: string | null
  naamSoort: NaamSoort
  /** De gekoppelde houder, of waarom er geen is. */
  koppeling: NaamKoppeling
  toewijzenToegestaan: boolean
  regels: VoorstelRegel[]
  /** Dingen die de gebruiker moet weten vóór hij opslaat. */
  waarschuwingen: string[]
}

export interface BouwInvoer {
  extractie: FactuurExtractie
  medewerkers: MedewerkerKandidaat[]
  /** Hoeveel objecten al onder dit factuurnummer in het register staan. */
  alIngelezen: number
}

export function bouwVoorstel({ extractie, medewerkers, alIngelezen }: BouwInvoer): Voorstel {
  const koppeling = koppelNaam(extractie.naam_op_factuur, medewerkers)
  const toewijzenToegestaan = magToewijzen(extractie.naam_soort) && koppeling.soort === 'gekoppeld'

  const regels: VoorstelRegel[] = extractie.regels.map((r, i) => ({
    ...r,
    regelId: `r${i}`,
    categorie: r.categorie && (MATERIEEL_CATEGORIEEN as readonly string[]).includes(r.categorie)
      ? r.categorie
      : r.is_materieel ? 'gereedschap' : null,
    standaardAan: r.is_materieel,
  }))

  const waarschuwingen: string[] = []

  if (alIngelezen > 0) {
    waarschuwingen.push(
      `Factuur ${extractie.factuurnummer ?? '(zonder nummer)'} is eerder ingelezen: er staan al ` +
      `${alIngelezen} object${alIngelezen === 1 ? '' : 'en'} met dit factuurnummer in het register.`,
    )
  }
  if (!extractie.leverdatum && !extractie.factuurdatum) {
    waarschuwingen.push('Er is geen datum van de factuur te halen; vul de aankoopdatum zelf in.')
  }
  if (koppeling.soort === 'meerdere') {
    waarschuwingen.push(
      `"${extractie.naam_op_factuur}" past op meerdere medewerkers (${koppeling.namen.join(', ')}). ` +
      `Kies zelf wie het krijgt, of laat het op algemeen gebruik staan.`,
    )
  }
  if (koppeling.soort === 'uit_dienst') {
    waarschuwingen.push(`"${koppeling.naam}" staat als uit dienst; het materieel blijft op algemeen gebruik staan.`)
  }
  if (extractie.naam_soort === 'besteld_door' && koppeling.soort === 'gekoppeld') {
    waarschuwingen.push(
      `${koppeling.naam} heeft dit besteld, niet opgehaald — daarom niet als houder ingevuld. ` +
      `Weet je wie het gebruikt, kies die dan zelf.`,
    )
  }
  if (extractie.naam_soort === 'referentie' && extractie.naam_op_factuur) {
    waarschuwingen.push(
      `"${extractie.naam_op_factuur}" staat als referentie op de factuur; onduidelijk of dat de gebruiker is.`,
    )
  }
  if (regels.length === 0) waarschuwingen.push('Er zijn geen artikelregels uit deze factuur gekomen.')

  return {
    leverancier: extractie.leverancier,
    factuurnummer: extractie.factuurnummer,
    factuurdatum: extractie.factuurdatum,
    leverdatum: extractie.leverdatum,
    bonnummer: extractie.bonnummer,
    administratie: extractie.administratie,
    naamOpFactuur: extractie.naam_op_factuur,
    naamSoort: extractie.naam_soort,
    koppeling,
    toewijzenToegestaan,
    regels,
    waarschuwingen,
  }
}
