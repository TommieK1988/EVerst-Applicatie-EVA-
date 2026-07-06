/**
 * werkmaatschappij.ts
 *
 * Leidt de werkmaatschappij van een dossier af. Gedeeld tussen de Informatie-tab
 * (default in de dropdown) en de offerte-render (bedrijfsgegevens voor de offerte).
 *
 * Herkenning van een Bouw7-dossier:
 *  - het **5e teken** van het dossiernummer is de branch-code-cijfer, dat overeenkomt
 *    met het laatste cijfer van `bedrijfsgegevens.code` (bv. 20267 → 7 → 007 = Morgenstond,
 *    20261 → 1 → 001 = Onderhoudsschilders, 20264 → 4 → 004 = Dakplan);
 *  - als alternatief matcht `dossiers.bouw7_filiaal` exact op `bedrijfsgegevens.naam`.
 */

export interface WerkmaatschappijOptie {
  id: string
  naam: string
  code: string | null
}

/**
 * Geeft het bedrijfsgegevens-id van de afgeleide werkmaatschappij, of '' als niets matcht.
 * Volgorde: Bouw7-filiaal (naam-match) → branch-code uit het dossiernummer.
 */
export function leidWerkmaatschappijAf(
  dossiernummer: string | null | undefined,
  bouw7Filiaal: string | null | undefined,
  werkmaatschappijen: WerkmaatschappijOptie[],
): string {
  // 1. Exacte match op het Bouw7-filiaal (branchnaam).
  if (bouw7Filiaal) {
    const m = werkmaatschappijen.find(w => w.naam === bouw7Filiaal)
    if (m) return m.id
  }
  // 2. Branch-code uit het dossiernummer: 5e cijfer → code "00X".
  const cijfers = (dossiernummer ?? '').replace(/\D/g, '')
  const digit = cijfers.charAt(4)
  if (digit) {
    const code = `00${digit}`
    const m = werkmaatschappijen.find(w => w.code === code)
    if (m) return m.id
  }
  return ''
}
