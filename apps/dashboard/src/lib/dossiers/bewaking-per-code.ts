/**
 * Bewakingsregels per bewakingscode samenvoegen — pure rekenregels, geen 'use server'.
 *
 * Dezelfde codetekst kan in meerdere Bouw7-hoofdstukken staan (bv. `.A`). Wie per code wil rekenen,
 * moet die regels optellen: een `Map.set` per regel laat de laatste winnen en gooit de rest weg.
 *
 * Bedragen en uren tellen op. Het % gereed wordt prognose-gewogen gemiddeld, dezelfde regel als
 * de projectrollup in `getDossierBewaking`; zonder prognose het ongewogen gemiddelde van de regels
 * die een % hebben.
 */

/** De velden van een `BewakingRegel` die per code samengevoegd worden. */
export type BewakingRegelPerCode = {
  code: string | null
  naam: string | null
  begroot: number
  prognose: number
  prognoseUren: number
  geboekteUren: number
  arbeidPrognose: number
  arbeidskosten: number
  geboekteKosten: number
  progress: number | null
}

export type CodeTotaal = Omit<BewakingRegelPerCode, 'code'> & { code: string }

export function bewakingPerCode(
  regels: BewakingRegelPerCode[],
  filter: (r: BewakingRegelPerCode) => boolean = () => true,
): Map<string, CodeTotaal> {
  const totalen = new Map<string, CodeTotaal>()
  const weging = new Map<string, { som: number; gewicht: number; simpelSom: number; simpelN: number }>()

  for (const r of regels) {
    if (!r.code || !filter(r)) continue
    const t = totalen.get(r.code) ?? {
      code: r.code, naam: r.naam, begroot: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0,
      arbeidPrognose: 0, arbeidskosten: 0, geboekteKosten: 0, progress: null,
    }
    t.begroot += r.begroot
    t.prognose += r.prognose
    t.prognoseUren += r.prognoseUren
    t.geboekteUren += r.geboekteUren
    t.arbeidPrognose += r.arbeidPrognose
    t.arbeidskosten += r.arbeidskosten
    t.geboekteKosten += r.geboekteKosten
    totalen.set(r.code, t)

    if (r.progress != null) {
      const w = weging.get(r.code) ?? { som: 0, gewicht: 0, simpelSom: 0, simpelN: 0 }
      w.simpelSom += r.progress
      w.simpelN += 1
      if (r.prognose > 0) { w.som += r.progress * r.prognose; w.gewicht += r.prognose }
      weging.set(r.code, w)
    }
  }

  for (const [code, t] of totalen) {
    const w = weging.get(code)
    if (!w) continue
    const pct = w.gewicht > 0 ? w.som / w.gewicht : w.simpelSom / w.simpelN
    t.progress = Math.round(pct * 100) / 100
  }
  return totalen
}
