import type { Facade, FacadeElement, FacadeElementKind } from './types'

/**
 * Afgeleide gevelcode voor nummering en titelblok.
 * Gebaseerd op label (voor/achter/zij) of oriëntatie-kompas.
 */
export function facadeToGevelCode(facade: Facade): string {
  const l = facade.label.toLowerCase()
  if (l.includes('voor')) return 'VG'
  if (l.includes('achter')) return 'AG'
  if (l.includes('linker') || l.includes('links')) return 'LG'
  if (l.includes('rechter') || l.includes('rechts')) return 'RG'
  // Fallback op kompas
  switch (facade.orientation.compass) {
    case 'N': return 'NG'
    case 'NE': return 'NOG'
    case 'E': return 'OG'
    case 'SE': return 'ZOG'
    case 'S': return 'ZG'
    case 'SW': return 'ZWG'
    case 'W': return 'WG'
    case 'NW': return 'NWG'
  }
}

/**
 * Slimme defaults per element-kind bij toevoegen.
 * Ramen = draai-kiep links, deuren = draai-rechts naar binnen, etc.
 */
export function defaultsForKind(kind: FacadeElementKind): Partial<FacadeElement> {
  switch (kind) {
    case 'window':
      return { openingType: 'draai-kiep-links', opensOutward: false, paneelverdelingH: 1, paneelverdelingV: 1 }
    case 'door':
      return { openingType: 'draai-rechts', opensOutward: false }
    case 'frame':
      return { openingType: 'vast' }
    case 'fence':
      return { railingSpacing: 110 }
    case 'masonry':
      return { masonryPattern: 'halfsteens' }
    default:
      return {}
  }
}
