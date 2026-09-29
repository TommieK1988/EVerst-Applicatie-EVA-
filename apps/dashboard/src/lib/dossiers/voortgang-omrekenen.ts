import type { BewakingRegel } from './actions'

/**
 * Reken een arbeid-% (ingevoerd op het mobiele Voortgang-tab) om naar het totale % gereed van de
 * bewakingscode — het getal dat de Financieel-tab en Management tonen.
 *
 * Zelfde weging als `getDossierBewaking` voor `progress`: prognose-gewogen over de kostensoorten
 * met een %, waarbij de overige kostensoorten (materiaal, onderaanneming, …) hun huidige % houden
 * en alleen het arbeidsdeel verschuift. Voorbeeld: arbeid € 6.000, materiaal € 3.000 en
 * onderaanneming € 1.000, alles op 40% → arbeid naar 70% geeft (70·6 + 40·3 + 40·1) / 10 = 58%.
 */
export function totaalMetArbeid(
  regel: Pick<BewakingRegel, 'arbeidPrognose' | 'progressOverig'>,
  arbeidPct: number,
): number {
  const o = regel.progressOverig
  const pa = regel.arbeidPrognose > 0 ? regel.arbeidPrognose : 0
  const gewicht = o.gewicht + pa
  const totaal = gewicht > 0
    ? (o.som + arbeidPct * pa) / gewicht
    : (o.simpelSom + arbeidPct) / (o.simpelN + 1) // geen prognose: ongewogen, net als de lees-kant
  return Math.round(Math.max(0, Math.min(100, totaal)) * 100) / 100
}
