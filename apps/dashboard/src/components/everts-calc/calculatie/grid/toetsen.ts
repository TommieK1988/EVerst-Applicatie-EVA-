/**
 * ↑/↓ in het rekenblad: naar hetzelfde veld in de vorige of volgende regel. Normen-
 * en omschrijvingsrijen ertussen worden overgeslagen; wat open staat blijft open.
 * Alleen vanuit een gewoon invoerveld: in een keuzelijst of tekstvak horen de pijlen
 * bij dat veld zelf.
 *
 * @returns true als er een buurveld was en de focus is verplaatst.
 */
export function naarBuurRegel(doel: HTMLElement, richting: -1 | 1): boolean {
  if (!(doel instanceof HTMLInputElement)) return false
  if (doel.type === 'checkbox' || doel.list) return false
  const cel = doel.closest<HTMLElement>('td[data-col]')
  const rij = doel.closest<HTMLElement>('tr[data-regel-id]')
  const tabel = rij?.closest('table')
  if (!cel || !rij || !tabel) return false
  const kolom = cel.dataset.col
  const rijen = Array.from(tabel.querySelectorAll<HTMLElement>('tr[data-regel-id]'))
  for (let i = rijen.indexOf(rij) + richting; i >= 0 && i < rijen.length; i += richting) {
    const veld = rijen[i].querySelector<HTMLInputElement>(`td[data-col="${kolom}"] input:not([type="checkbox"])`)
    if (veld && !veld.disabled) {
      veld.focus()
      veld.select()
      return true
    }
  }
  return false
}
