/**
 * Plek voor een zwevende keuzelijst (position: fixed) onder of boven een knop of cel.
 *
 * Zonder dit opent zo'n lijst altijd naar beneden. In een tabelrij onderaan het scherm valt
 * het onderste deel dan buiten beeld, en de laatste opties zijn ook met scrollen niet te
 * bereiken: het lijstvak zelf steekt onder de rand uit. Daarom: past hij eronder, dan
 * eronder; anders aan de kant met de meeste ruimte, en nooit hoger dan die ruimte.
 *
 * Bij `bottom` groeit het paneel vanaf de knop naar boven, dus de werkelijke hoogte van de
 * inhoud hoeft niet bekend te zijn. Een paneel met een vaste kop (zoekveld) boven een
 * scrollende lijst: geef het `flex flex-col` en de lijst `min-h-0`, dan krimpt de lijst mee.
 */
export interface PaneelPlek {
  top?: number
  bottom?: number
  maxHeight: number
}

export function plaatsZwevendPaneel(
  anker: { top: number; bottom: number },
  {
    hoogte,
    afstand = 2,
    marge = 8,
    schermHoogte = typeof window === 'undefined' ? 0 : window.innerHeight,
  }: {
    /** Hoogte die het paneel maximaal inneemt als er ruimte genoeg is. */
    hoogte: number
    /** Ruimte tussen knop en paneel. */
    afstand?: number
    /** Minimale ruimte tussen paneel en schermrand. */
    marge?: number
    schermHoogte?: number
  },
): PaneelPlek {
  const onder = Math.max(0, schermHoogte - anker.bottom - afstand - marge)
  const boven = Math.max(0, anker.top - afstand - marge)

  if (onder >= hoogte || onder >= boven) {
    return { top: anker.bottom + afstand, maxHeight: Math.min(hoogte, onder) }
  }
  return { bottom: schermHoogte - anker.top + afstand, maxHeight: Math.min(hoogte, boven) }
}
