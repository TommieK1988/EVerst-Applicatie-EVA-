/**
 * Zoeken in het handboek — puur, client-veilig, geen dependency.
 *
 * Waarom client-side en niet Postgres full-text search:
 *
 *  • Veiligheid. De index wordt op de server gebouwd uit wat RLS al heeft
 *    teruggegeven. Wat niet in de index zit, staat ook niet in de HTML. Een
 *    zoek-RPC zou de zichtbaarheidsregel een tweede keer moeten uitvoeren —
 *    één plek meer waar hij fout kan staan.
 *  • Omvang. Het hele handboek is ~160 blokken van gemiddeld 250 tekens, en ná
 *    filtering ziet een flexkracht er nog minder. Dat is minder dan één foto.
 *  • Waar het gebruikt wordt. Op een steiger of in een kruipruimte wil je geen
 *    round-trip per toetsaanslag.
 *  • Nederlandse samenstellingen. Substring vindt "werkbus" in "werkbussen" en
 *    "kleding" in "kledingpakket"; `to_tsvector('dutch', …)` splitst
 *    samenstellingen niet en zou die treffers juist missen.
 */
import type { ZoekRegel, ZoekTreffer } from './types'

const FRAGMENT_LENGTE = 130

/**
 * Genormaliseerde tekst plús, per genormaliseerd teken, de positie in het
 * origineel.
 *
 * Die tweede lijst is niet optioneel. Normaliseren verandert de lengte: "é"
 * wordt één teken korter, "collega's" verliest zijn apostrof, dubbele spaties
 * worden er één. Zonder de terugvertaling zou de markering in het fragment een
 * paar tekens verschuiven — precies in de alinea's met accenten, en dus net
 * niet in de tekst waarmee je het toevallig test.
 */
function normaliseerMetMap(s: string): { tekst: string; naarOrigineel: number[] } {
  let uit = ''
  const map: number[] = []
  let vorigeWasSpatie = false

  for (let i = 0; i < s.length; i++) {
    const teken = s[i]

    if (/\s/.test(teken)) {
      if (!vorigeWasSpatie && uit.length) {
        uit += ' '
        map.push(i)
      }
      vorigeWasSpatie = true
      continue
    }
    vorigeWasSpatie = false

    if (/['‘’]/.test(teken)) continue

    // Accent eraf: "é" → "e", "ï" → "i". Levert soms nul tekens op (een los
    // combinerend accent) en soms één; beide gevallen kloppen met de map.
    const kaal = teken
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
    for (const k of kaal) {
      uit += k
      map.push(i)
    }
  }

  // Eindigde de tekst op witruimte, dan staat er nu een spatie te veel.
  if (uit.endsWith(' ')) {
    uit = uit.slice(0, -1)
    map.pop()
  }
  return { tekst: uit, naarOrigineel: map }
}

/** Kleine letters, accenten eraf, apostroffen weg, spaties genormaliseerd. */
export function normaliseer(s: string): string {
  return normaliseerMetMap(s).tekst
}

/** Splitst de zoekopdracht in losse termen; termen van één letter negeren we. */
function termen(vraag: string): string[] {
  return normaliseer(vraag)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

/**
 * Score van één term in één tekst. Een treffer op een woordgrens telt zwaarder
 * dan ergens midden in een woord: wie "bus" zoekt bedoelt de werkbus, niet
 * "misbruik".
 */
function scoorTerm(genormaliseerd: string, term: string): { score: number; index: number } {
  const index = genormaliseerd.indexOf(term)
  if (index === -1) return { score: 0, index: -1 }
  const opWoordgrens = index === 0 || !/[a-z0-9]/.test(genormaliseerd[index - 1])
  return { score: opWoordgrens ? 3 : 1, index }
}

/**
 * Fragment rond de treffer, opgeknipt in stukken zodat de UI de term kan
 * markeren zonder zelf te zoeken (en zonder `dangerouslySetInnerHTML`).
 *
 * `start` en `lengte` zijn posities in de GENORMALISEERDE tekst; via de map
 * worden ze teruggerekend naar het origineel, dat we tonen.
 */
function maakFragment(
  origineel: string,
  naarOrigineel: number[],
  index: number,
  lengte: number,
): ZoekTreffer['delen'] {
  const raakStart = naarOrigineel[index]
  const raakEind = naarOrigineel[Math.min(index + lengte, naarOrigineel.length) - 1] + 1

  const marge = Math.max(0, Math.floor((FRAGMENT_LENGTE - (raakEind - raakStart)) / 2))
  let start = Math.max(0, raakStart - marge)
  let eind = Math.min(origineel.length, raakEind + marge)

  // Niet midden in een woord beginnen of eindigen.
  if (start > 0) {
    const spatie = origineel.indexOf(' ', start)
    if (spatie !== -1 && spatie < raakStart) start = spatie + 1
  }
  if (eind < origineel.length) {
    const spatie = origineel.lastIndexOf(' ', eind)
    if (spatie > raakEind) eind = spatie
  }

  const delen: ZoekTreffer['delen'] = []
  if (start > 0) delen.push({ tekst: '… ', raak: false })
  if (raakStart > start) delen.push({ tekst: origineel.slice(start, raakStart), raak: false })
  delen.push({ tekst: origineel.slice(raakStart, raakEind), raak: true })
  if (raakEind < eind) delen.push({ tekst: origineel.slice(raakEind, eind), raak: false })
  if (eind < origineel.length) delen.push({ tekst: ' …', raak: false })
  return delen
}

/**
 * Zoek in de index. Alle termen moeten voorkomen (AND) — bij "kleding
 * vergoeding" wil je de alinea die over allebei gaat, niet elke alinea over
 * kleding.
 */
export function zoek(index: ZoekRegel[], vraag: string, max = 20): ZoekTreffer[] {
  const woorden = termen(vraag)
  if (!woorden.length) return []

  const treffers: ZoekTreffer[] = []
  for (const regel of index) {
    const { tekst: genormaliseerd, naarOrigineel } = normaliseerMetMap(regel.tekst)
    const titel = normaliseer(regel.sectieTitel)

    let score = 0
    let besteIndex = -1
    let besteLengte = 0
    let compleet = true

    for (const term of woorden) {
      const inTekst = scoorTerm(genormaliseerd, term)
      const inTitel = scoorTerm(titel, term)
      if (!inTekst.score && !inTitel.score) {
        compleet = false
        break
      }
      // Een treffer in de hoofdstuktitel weegt het zwaarst: wie "verlof" typt
      // wil het hoofdstuk Verlof bovenaan, niet een zin waarin het woord valt.
      score += inTitel.score * 4 + inTekst.score * regel.gewicht
      if (inTekst.index !== -1 && (besteIndex === -1 || inTekst.index < besteIndex)) {
        besteIndex = inTekst.index
        besteLengte = term.length
      }
    }
    if (!compleet) continue

    treffers.push({
      sectieSlug: regel.sectieSlug,
      sectieTitel: regel.sectieTitel,
      sectieSoort: regel.sectieSoort,
      blokId: regel.blokId,
      // Zit de treffer alleen in de titel, toon dan het begin van de tekst.
      delen:
        besteIndex === -1
          ? [{ tekst: regel.tekst.slice(0, FRAGMENT_LENGTE), raak: false }]
          : maakFragment(regel.tekst, naarOrigineel, besteIndex, besteLengte),
      score,
    })
  }

  return treffers.sort((a, b) => b.score - a.score).slice(0, max)
}
