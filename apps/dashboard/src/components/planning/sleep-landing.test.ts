import { describe, expect, it } from 'vitest'
import type { ClientRect, CollisionDetection } from '@dnd-kit/core'
import { landingsPeriode, startdagOnderBalkrand } from './sleep-landing'

type Args = Parameters<CollisionDetection>[0]

/** Twee rijen (y 0–40 en 40–80) van vijf dagcellen van 20px, beginnend op x = 100. */
function raster() {
  const rects = new Map<string, ClientRect>()
  for (const [rij, top] of [['a', 0], ['b', 40]] as const) {
    for (let dag = 0; dag < 5; dag++) {
      const left = 100 + dag * 20
      rects.set(`${rij}${dag}`, { left, right: left + 20, top, bottom: top + 40, width: 20, height: 40 })
    }
  }
  return rects
}

function doel(balkLeft: number, balkBreedte: number, muisY: number) {
  const rects = raster()
  const args = {
    collisionRect: { left: balkLeft, right: balkLeft + balkBreedte, top: muisY - 14, bottom: muisY + 14, width: balkBreedte, height: 28 },
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map(id => ({ id })),
    pointerCoordinates: { x: balkLeft + balkBreedte / 2, y: muisY },
    active: { id: 'x' },
  } as unknown as Args
  return startdagOnderBalkrand(args)[0]?.id
}

describe('startdagOnderBalkrand', () => {
  it('kiest de cel onder de linkerrand van de balk, niet onder de muis', () => {
    // Balk van drie dagen breed, linkerrand in dag 1, muis midden in dag 2.
    expect(doel(121, 60, 20)).toBe('a1')
  })

  it('neemt de rij van de muis', () => {
    expect(doel(141, 20, 60)).toBe('b2')
  })

  it('valt terug op de dichtstbijzijnde cel als de rand naast de tijdlijn ligt', () => {
    expect(doel(40, 100, 60)).toBe('b0')
    expect(doel(400, 20, 20)).toBe('a4')
  })

  it('geeft niets buiten elke rij', () => {
    expect(doel(121, 20, 200)).toBeUndefined()
  })
})

describe('landingsPeriode', () => {
  it('één dag', () => {
    expect(landingsPeriode(new Date(2026, 9, 14, 7), new Date(2026, 9, 14, 16))).toBe('wo 14 okt.')
  })
  it('meerdere dagen in één maand', () => {
    expect(landingsPeriode(new Date(2026, 9, 14, 7), new Date(2026, 9, 16, 16))).toBe('wo 14 – vr 16 okt.')
  })
  it('over de maandgrens', () => {
    expect(landingsPeriode(new Date(2026, 9, 30, 7), new Date(2026, 10, 2, 16))).toBe('vr 30 okt. – ma 2 nov.')
  })
})
