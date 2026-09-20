/**
 * Waar de terugknop van een mobiel scherm heen moet.
 *
 * Een dossier is vanaf meerdere kanten te openen: vanuit de dossierlijst, vanuit het
 * klantbeeld van een opdrachtgever, of vanuit de kaart van een contactpersoon. De terugknop
 * hoorde je terug te brengen waar je vandaan kwam, maar wees altijd naar `/m/dossiers` — je
 * raakte je klant dus kwijt bij elke stap naar een dossier.
 *
 * Vandaar een expliciete `?terug=`-parameter in plaats van `router.back()`: de dossierpagina
 * heeft sub-tabs, en na een tabwissel zou de browserhistorie je naar de vorige tab sturen in
 * plaats van naar de klant. De parameter reist mee over die tabwissels.
 *
 * Client-veilig: geen `server-only`, geen imports. De server-pagina's en de tabstrip
 * gebruiken dezelfde regels.
 */

/**
 * Maakt een binnengekomen `terug`-waarde veilig bruikbaar als link.
 *
 * Alleen paden binnen de mobiele app komen er doorheen. Zonder die grens is dit een open
 * redirect: iemand plakt `?terug=https://…` achter een dossierlink, en de terugknop op een
 * vertrouwd scherm wijst dan naar buiten. De controles op `//`, `\` en `:` vangen de vormen
 * die een browser alsnog als absolute URL leest (`//kwaadaardig.nl` is protocol-relatief).
 *
 * Geeft `null` bij alles wat niet aan die eisen voldoet; de aanroeper valt dan terug op zijn
 * eigen standaard.
 */
export function veiligTerugPad(waarde: string | string[] | undefined): string | null {
  const pad = Array.isArray(waarde) ? waarde[0] : waarde
  if (!pad || typeof pad !== 'string') return null
  if (!pad.startsWith('/m/')) return null
  if (pad.includes('//') || pad.includes('\\') || pad.includes(':')) return null
  return pad
}

/** Plakt de terug-parameter aan een link, zodat hij een schermwissel overleeft. */
export function metTerug(href: string, terug: string | null): string {
  return terug ? `${href}?terug=${encodeURIComponent(terug)}` : href
}
