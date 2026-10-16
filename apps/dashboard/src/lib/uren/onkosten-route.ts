/**
 * Wie een kostenpost goedkeurt. Puur: geen database, geen sessie — de aanroeper levert de feiten.
 *
 * Eén functie voor het scherm én de server-action, zodat een kostenpost nooit bij de een op
 * jouw naam staat en bij de ander geweigerd wordt. Zelfde gedachte als `verdeelNaarRol` bij de
 * uren.
 *
 *   kosten voor een project          -> de projectleider van dat dossier: het is zijn budget
 *   geen project, overhead, geen PL  -> de eigen goedkeurder van de medewerker, en anders de
 *                                       standaardgoedkeurder uit de uren-instellingen
 *   niemand van hen                  -> niet toe te wijzen; dat hoort zichtbaar te zijn
 *
 * Je eigen kosten goedkeuren kan niet. Is de medewerker zelf de projectleider van het dossier,
 * dan gaat de post naar zijn eigen goedkeurder, net als kosten zonder project.
 */

export type KostenStatus = 'open' | 'goedgekeurd' | 'afgekeurd'

/** In welke hoedanigheid iemand de kostenpost beoordeelt; null = er is niemand. */
export type KostenRol = 'projectleider' | 'goedkeurder'

export type KostenRouteInvoer = {
  medewerkerId: string
  dossierId: string | null
  /** `dossiers.project_manager_id` van dat dossier. */
  projectleiderId: string | null
  /** Het dossier is een indirecte-urenproject: overhead, daar is geen projectbudget. */
  indirect: boolean
  /** `medewerkers.uren_goedkeurder_id`. */
  eigenGoedkeurderId: string | null
  /** `uren_instellingen.niet_gewerkt_goedkeurder_id`. */
  standaardGoedkeurderId: string | null
}

export function routeerKosten(r: KostenRouteInvoer): { goedkeurderId: string | null; rol: KostenRol | null } {
  const nietZelf = (id: string | null) => (id && id !== r.medewerkerId ? id : null)

  const projectleider = r.dossierId && !r.indirect ? nietZelf(r.projectleiderId) : null
  if (projectleider) return { goedkeurderId: projectleider, rol: 'projectleider' }

  const goedkeurder = nietZelf(r.eigenGoedkeurderId) ?? nietZelf(r.standaardGoedkeurderId)
  if (goedkeurder) return { goedkeurderId: goedkeurder, rol: 'goedkeurder' }

  return { goedkeurderId: null, rol: null }
}

/**
 * Staat een kostenpost bij iemand in de lijst? Alleen als hij open is én de week is ingediend:
 * daarvoor is het nog een concept van de medewerker zelf, die hem nog kan weghalen.
 */
export function wachtOpBeoordeling(status: KostenStatus, weekStatus: string | null): boolean {
  return status === 'open' && weekStatus != null && weekStatus !== 'concept' && weekStatus !== 'afgekeurd'
}
