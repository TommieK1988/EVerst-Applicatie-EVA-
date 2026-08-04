/**
 * Leest de groepen BP (Bouwplaatsvoorzieningen) en BB (Bereikbaarheids-
 * voorzieningen) uit het c4y-bestand.
 *
 * Deze twee wijken af van de rest van het bestand: het zijn geen genormeerde
 * m²-prijzen maar samengestelde posten. Een kopregel ("Inzet van hoogwerker")
 * heeft kindregels die elk hun eigen hoeveelheid en prijs dragen:
 *
 *     Inzet van hoogwerker                    week          <- het recept
 *       Aan- en afvoer hoogwerker   rit   2 × € 120,00 = € 240,00
 *       Huur hoogwerker             week  1 × € 975,00 = € 975,00
 *       Verbruik brandstof          week  1 ×  € 65,00 =  € 65,00
 *       Verzekering over huurprijs  %   0,1 × € 975,00 =  € 97,50
 *
 * Geverifieerd op alle 32 kindregels: `hvh × ond = aard`. Ook de percentage-
 * regel past in dat model (0,1 × 975 = 97,50), dus die heeft geen uitzondering
 * nodig. Arbeidsregels dragen `arb` (uren) in plaats van `ond`; ook daar klopt
 * `arb × hvh × uurloon = aard` (4 u × 2 × € 45 = € 360).
 *
 * Het recept is de diepste groep die zélf kindregels heeft — bij BP is dat
 * niveau 2, bij BB soms niveau 3 ("Inzet renovatiesteiger" is enkel een kopje
 * boven "Renovatiesteiger compleet").
 */

import { readFileSync } from 'node:fs'
import { leesGetal, mapEenheid } from './lees-c4y.mjs'

const STAARTGROEPEN = {
  BP: { naam: 'Bouwplaats',      behandelingCode: 'BP' },
  BB: { naam: 'Bereikbaarheid',  behandelingCode: 'BB' },
}

function leesRegels(xml) {
  const regels = []
  const blokPatroon = /<begroting>([\s\S]*?)<\/begroting>/g
  let blok
  while ((blok = blokPatroon.exec(xml)) !== null) {
    const velden = {}
    const veldPatroon = /<(\w+)(?:\s*\/>|>([\s\S]*?)<\/\1>)/g
    let veld
    while ((veld = veldPatroon.exec(blok[1])) !== null) velden[veld[1]] = (veld[2] ?? '').trim()
    regels.push(velden)
  }
  return regels
}

function ontsnapOngedaan(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/**
 * @returns {{recepten: Array<object>, meldingen: Array<string>}}
 */
export function leesStaartkosten(pad, standaardUurloon = 45) {
  const xml = readFileSync(pad, 'utf8')
  const regels = leesRegels(xml)

  const recepten = []
  const meldingen = []

  let groep = null          // 'BP' | 'BB' | null
  let open = null           // laatst geopende groep die kindregels kán krijgen

  for (const r of regels) {
    const s = r.s ?? ''
    const oms = ontsnapOngedaan(r.oms ?? '')

    if (s === '1') {
      groep = STAARTGROEPEN[ontsnapOngedaan(r.code ?? '')] ? ontsnapOngedaan(r.code) : null
      open = null
      continue
    }
    if (!groep) continue

    // Een groepsregel opent een mogelijk recept. Blijkt hij geen kindregels te
    // hebben (zoals "Inzet renovatiesteiger", enkel een kopje boven
    // "Renovatiesteiger compleet"), dan wordt hij nooit toegevoegd.
    if (s === '2' || s === '3') {
      open = {
        groep,
        naam: oms,
        eenheid: mapEenheid(r.enh ?? '') || 'post',
        normen: [],
      }
      continue
    }

    // Detailregel: leeg, of een stelpost ('S') / percentageregel ('?').
    if (s !== '' && s !== 'S' && s !== '?') continue
    if (!oms) continue                       // scheidingsregel
    if (!open) { meldingen.push(`staartkosten: regel zonder kopregel overgeslagen — "${oms}"`); continue }

    const hvh    = leesGetal(r.hvh) || 1
    const uren   = leesGetal(r.arb)
    const kosten = leesGetal(r.ond)
    const totaal = leesGetal(r.aard)
    const isStelpost = s === 'S'

    if (uren > 0 && kosten === 0) {
      // Arbeidsregel: uren per kindregel × aantal.
      const urenTotaal = uren * hvh
      open.normen.push({
        soort: 'arbeid',
        naam: oms,
        urenPerEenheid: urenTotaal,
        uurloon: leesGetal(r.uurloon) || standaardUurloon,
        kosten: totaal || urenTotaal * standaardUurloon,
      })
    } else {
      // Ingekochte post: onderaanneming, huur, transport, verzekering.
      // Een stelpost telt niet mee in het totaal (`aard` is leeg in de bron);
      // we nemen het bedrag wel over zodat het zichtbaar blijft.
      open.normen.push({
        soort: 'onderaanneming',
        naam: isStelpost ? `Stelpost — ${oms}` : oms,
        eenheid: mapEenheid(r.enh ?? ''),
        hoeveelheid: isStelpost ? 0 : hvh,
        prijs: kosten,
        kosten: isStelpost ? 0 : totaal,
      })
      if (isStelpost) meldingen.push(`staartkosten: stelpost "${oms}" (€ ${kosten}) telt niet mee in het recepttotaal`)
    }

    // Pas bij de eerste kindregel is duidelijk dat dit écht een recept is.
    if (open.normen.length === 1) recepten.push(open)
  }

  // Pas nu staat vast welke groepsregels daadwerkelijk recepten zijn, dus pas
  // nu kunnen we aaneengesloten nummeren. Groepsregels zonder kindregels zouden
  // anders gaten in de codes achterlaten (BB-01, BB-04, BB-07 ontbreken).
  const tellerPerGroep = {}
  for (const rec of recepten) {
    tellerPerGroep[rec.groep] = (tellerPerGroep[rec.groep] ?? 0) + 1
    rec.code = `${rec.groep}-${String(tellerPerGroep[rec.groep]).padStart(2, '0')}`
  }

  // Controle op de bronrelatie hvh × prijs = kosten; wijkt er iets af, dan
  // klopt onze aanname over het bestand niet en willen we dat weten.
  for (const rec of recepten) {
    for (const n of rec.normen) {
      if (n.soort !== 'onderaanneming' || n.hoeveelheid === 0) continue
      const verwacht = n.hoeveelheid * n.prijs
      if (Math.abs(verwacht - n.kosten) > 0.02) {
        meldingen.push(
          `staartkosten: bedrag wijkt af bij "${rec.naam} / ${n.naam}" — ` +
          `${n.hoeveelheid} × € ${n.prijs} = € ${verwacht.toFixed(2)}, bestand zegt € ${n.kosten}`
        )
      }
    }
  }

  return { recepten, meldingen }
}

export { STAARTGROEPEN }
