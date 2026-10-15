import type { CollisionDetection } from '@dnd-kit/core'
import { format, isSameDay, isSameMonth } from 'date-fns'
import { nl } from 'date-fns/locale'

/**
 * Doelcel bij het slepen van een planitem in de Medewerkerplanning.
 *
 * De standaard (rectIntersection) koos de cel met de grootste overlap met de
 * sleepbalk. Bij een balk van meerdere dagen, of in Maand-zoom waar een dag 18px
 * breed is, overlapt die met tientallen cellen tegelijk en was niet te voorspellen
 * welke won — de balk landde "ergens". Nu telt één punt: de linkerrand van de
 * gesleepte balk (= de nieuwe startdag) op de hoogte van de muis (= de rij).
 * Ligt die rand buiten elke cel (naast de tijdlijn), dan de dichtstbijzijnde cel
 * in die rij.
 */
export const startdagOnderBalkrand: CollisionDetection = ({
  collisionRect, droppableRects, droppableContainers, pointerCoordinates,
}) => {
  const x = collisionRect.left + 1
  const y = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2

  let beste: { id: (typeof droppableContainers)[number]['id']; afstand: number } | null = null
  for (const container of droppableContainers) {
    const r = droppableRects.get(container.id)
    if (!r || y < r.top || y > r.bottom) continue
    const afstand = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    if (!beste || afstand < beste.afstand) beste = { id: container.id, afstand }
    if (afstand === 0) break
  }
  if (!beste) return []
  const { id, afstand } = beste
  const container = droppableContainers.find(c => c.id === id)
  return [{ id, data: { droppableContainer: container, value: afstand } }]
}

/** "di 14 okt" of "di 14 – vr 17 okt" — de periode waarop de balk landt. */
export function landingsPeriode(start: Date, eind: Date): string {
  const dag = (d: Date, metMaand: boolean) => format(d, metMaand ? 'EEEEEE d MMM' : 'EEEEEE d', { locale: nl })
  if (isSameDay(start, eind)) return dag(start, true)
  return `${dag(start, !isSameMonth(start, eind))} – ${dag(eind, true)}`
}
