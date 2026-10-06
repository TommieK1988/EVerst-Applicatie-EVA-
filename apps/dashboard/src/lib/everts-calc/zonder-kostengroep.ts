import type { WerkbegrotingComponent, WerkbegrotingRegel } from './types'

/** Eén werkbegroting-component die geen kostengroep (bewakingscode) heeft. */
export type RegelZonderKostengroep = { componentId: string; omschrijving: string; bedrag: number }

/**
 * Componenten met een bedrag op een regel zonder kostengroep. Zo'n regel kan in Bouw7 nergens
 * landen: geen bestelregel, geen prognose, en dus ook niet bestelbaar. "Naar Bouw7" sloeg hem
 * stil over, waardoor het leek alsof de push niets deed (20261.00449, Koneksiezz € 3.300).
 * Daarom blokkeert versturen zolang deze lijst niet leeg is. Gedeeld door server en venster.
 */
export function regelsZonderKostengroep(
  regels: Pick<WerkbegrotingRegel, 'id' | 'kostengroep' | 'hoeveelheid' | 'omschrijving' | 'is_verwijderd'>[],
  componenten: Pick<WerkbegrotingComponent, 'id' | 'werkbegroting_regel_id' | 'norm_hoeveelheid' | 'tarief' | 'omschrijving' | 'is_verwijderd'>[],
): RegelZonderKostengroep[] {
  const regelById = new Map(regels.map(r => [r.id, r]))
  const uit: RegelZonderKostengroep[] = []
  for (const c of componenten) {
    const r = regelById.get(c.werkbegroting_regel_id)
    if (!r || c.is_verwijderd || r.is_verwijderd) continue
    if ((r.kostengroep ?? '').split(/\s[—-]\s/)[0].trim()) continue
    const bedrag = Math.round(r.hoeveelheid * c.norm_hoeveelheid * c.tarief * 100) / 100
    if (bedrag === 0) continue
    uit.push({ componentId: c.id, omschrijving: (c.omschrijving?.trim() || r.omschrijving || '').trim() || 'Naamloze regel', bedrag })
  }
  return uit
}

/** Leesbare melding voor toast en venster. */
export function meldingZonderKostengroep(lijst: RegelZonderKostengroep[]): string {
  const namen = lijst.slice(0, 3).map(r => `"${r.omschrijving}"`).join(', ')
  const meer = lijst.length > 3 ? ` en ${lijst.length - 3} meer` : ''
  return `Niet verstuurd: ${lijst.length === 1 ? 'een regel heeft' : `${lijst.length} regels hebben`} geen kostengroep (${namen}${meer}). Kies eerst een kostengroep; zonder bewakingscode kan Bouw7 de kosten nergens boeken.`
}
