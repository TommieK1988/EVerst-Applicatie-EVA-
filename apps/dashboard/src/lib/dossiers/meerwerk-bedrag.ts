/**
 * Wat een meerwerkregel waard is. Pure functies, geen 'use server': ook de meerwerk-tab (client)
 * gebruikt `heeftVariabelBedrag`, en een 'use server'-module mag geen sync exports hebben.
 */

import type { MeerwerkRegel } from '@everts/database'

const rond = (n: number): number => Math.round(n * 100) / 100

/** Regie of stelpost: het bedrag staat pas achteraf vast, dus hier kan een mandaat op. */
export function heeftVariabelBedrag(r: { afrekenwijze: MeerwerkRegel['afrekenwijze']; is_stelpost?: boolean | null }): boolean {
  return r.afrekenwijze === 'regie' || r.is_stelpost === true
}

/**
 * Het bedrag dat een regel in het contracttotaal zet. Bij regie en stelposten met een mandaat is
 * dat het hoogste van mandaat en geboekte verkoopwaarde: zolang er minder geboekt is, is het
 * toegezegde bedrag de beste schatting van de opdrachtwaarde; gaat het geboekte erboven, dan wordt
 * dát gefactureerd.
 */
export function metMandaat(r: MeerwerkRegel, werkelijk: number): number {
  if (!heeftVariabelBedrag(r) || r.mandaat_excl_btw == null) return werkelijk
  return rond(Math.max(Number(r.mandaat_excl_btw) || 0, werkelijk))
}

/**
 * Werkelijk bedrag (excl. btw) per regel, zonder mandaat. Bij regie en stelpost-op-geboekte-kosten
 * is dat de geboekte **verkoopwaarde** op de eigen bewakingscode (uren × tarief, kosten × opslag),
 * nooit de kostprijs.
 */
export function werkelijkExcl(regel: MeerwerkRegel, verkoopPerCode: Map<string, number>): number {
  if (regel.is_stelpost && regel.stelpost_grondslag === 'eenheidsprijzen') {
    return rond((Number(regel.eenheidsprijs) || 0) * (Number(regel.hoeveelheid_werkelijk) || 0))
  }
  const opGeboekteKosten = regel.afrekenwijze === 'regie'
    || (regel.is_stelpost && regel.stelpost_grondslag === 'geboekte_kosten')
  if (opGeboekteKosten) {
    if (!regel.bewakingscode) return 0
    return rond(verkoopPerCode.get(regel.bewakingscode) ?? 0)
  }
  // aangenomen / handmatig
  return rond(Number(regel.bedrag_excl_btw) || 0)
}
