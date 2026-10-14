/**
 * `Content-Disposition`-header die met elke bestandsnaam werkt.
 *
 * Een HTTP-header mag alleen Latin-1 bevatten. Een bestandsnaam met een gedachtestreepje
 * (–), een emoji of een Pools teken liet `new Response()` daarom crashen ("Cannot convert
 * argument to a ByteString") en de gebruiker kreeg een kapotte download. Daarom twee delen:
 * `filename` met een veilige ASCII-versie voor oude clients, en `filename*` (RFC 6266) met
 * de echte naam in UTF-8 — die gebruiken alle huidige browsers.
 */
export function contentDisposition(soort: 'inline' | 'attachment', naam: string): string {
  const schoon = naam.replace(/[\r\n"\\]/g, '').trim() || 'bestand'
  const ascii = schoon
    .normalize('NFKD')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7e]/g, '')
    .trim() || 'bestand'
  return `${soort}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(schoon)}`
}
