/**
 * Rechts naast het rekenblad staat maximaal één paneel open. Controle en Uitvraag zijn elk
 * ±384px breed; samen lieten ze op een laptop (1280px, zijbalk open) nog ±290px over voor de
 * calculatie, en met Structuur erbij niets. Openen van het ene paneel sluit dus het andere;
 * sluiten raakt alleen het paneel zelf.
 */
export type RechterPaneel = 'controle' | 'uitvraag'

export function volgendRechterPaneel(
  huidig: RechterPaneel | null, paneel: RechterPaneel, open: boolean,
): RechterPaneel | null {
  if (open) return paneel
  return huidig === paneel ? null : huidig
}
