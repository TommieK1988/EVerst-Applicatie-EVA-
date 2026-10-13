// Waar het kantoorwerk van een medewerker heen kan. Los van instellingen.ts zodat de regel zonder
// database te testen is.

export type KantoorOptie = {
  /** Het gewerkte indirecte-urenproject van die werkmaatschappij. */
  dossierId: string
  /** De naam van de werkmaatschappij, zoals de medewerker hem in de app ziet. */
  label: string
}

export type WerkmaatschappijRij = {
  id: string
  naam: string
  indirect_gewerkt_dossier_id: string | null
}

/**
 * De projecten waar kantoorwerk op mag landen.
 *
 * Staat er op de medewerker niets (`gekozenIds` leeg), dan is het één vaste plek: het
 * `standaardDossierId` van vandaag (eigen werkmaatschappij, of de instelling voor externen). Zijn
 * er werkmaatschappijen aangevinkt, dan zijn het die -- in de volgorde waarin ze zijn aangevinkt.
 * Een werkmaatschappij zonder gewerkt-project valt weg: daar valt niets op te boeken. Blijft er
 * zo niets over, dan geldt alsnog de standaardplek.
 *
 * Eén optie = geen keuze in de app. Meer dan één = de medewerker kiest per regel.
 */
export function bepaalKantoorOpties(
  gekozenIds: string[],
  werkmaatschappijen: WerkmaatschappijRij[],
  standaardDossierId: string | null,
): KantoorOptie[] {
  const standaard = standaardDossierId ? [{ dossierId: standaardDossierId, label: '' }] : []
  if (gekozenIds.length === 0) return standaard
  const perId = new Map(werkmaatschappijen.map(w => [w.id, w]))
  const opties: KantoorOptie[] = []
  for (const id of gekozenIds) {
    const wm = perId.get(id)
    if (!wm?.indirect_gewerkt_dossier_id) continue
    if (opties.some(o => o.dossierId === wm.indirect_gewerkt_dossier_id)) continue
    opties.push({ dossierId: wm.indirect_gewerkt_dossier_id, label: wm.naam })
  }
  // Alles aangevinkt zonder project is een instelfout; dan liever de oude plek dan geen.
  return opties.length ? opties : standaard
}
