/**
 * bestekcode.ts — De bestekscode van meetstaatregels, los van de rest zodat ook de
 * local-store hem kan gebruiken zonder kringverwijzing met meetstaat-utils.
 */

/**
 * Eén schrijfwijze per code: ' s-01 ' en 'S-01' horen bij hetzelfde cumulatief.
 * Hoofdletters, spaties aan de randen weg en dubbele spaties samengevoegd. Een
 * dubbele punt mag niet, want die scheidt de delen van de aggregatiesleutel.
 */
export function normaliseerBestekcode(code: string | null | undefined): string {
  return (code ?? '').replace(/:/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * Haalt ' [CODE]' uit de omschrijving van een calculatieregel. De code stond tot
 * oktober 2026 in de omschrijving; nu heeft hij een eigen kolom. Alleen precies de
 * eigen code van de regel tussen blokhaken gaat eruit, zodat andere tekst tussen
 * blokhaken die iemand zelf typte blijft staan.
 */
export function zonderCodeInOmschrijving<T extends { omschrijving: string; bestekcode?: string }>(regel: T): T {
  const code = normaliseerBestekcode(regel.bestekcode)
  if (!code) return regel
  const merk = ` [${code}]`
  if (!regel.omschrijving.includes(merk)) return regel
  return { ...regel, omschrijving: regel.omschrijving.replace(merk, '') }
}
