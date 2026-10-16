import { describe, expect, it } from 'vitest'
import { IDS_PER_BLOK, haalAlleRijen, haalAlleRijenVoorIds, inBlokken } from './paginate'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)

describe('haalAlleRijen', () => {
  it('haalt door tot een pagina niet meer vol is', async () => {
    const tabel = ids(2500)
    const rijen = await haalAlleRijen<string>(async (van, tot) => ({ data: tabel.slice(van, tot + 1), error: null }))
    expect(rijen).toEqual(tabel)
  })
})

describe('inBlokken', () => {
  it('knipt op IDS_PER_BLOK en ontdubbelt', () => {
    const blokken = inBlokken([...ids(IDS_PER_BLOK + 1), 'id-0'])
    expect(blokken.map(b => b.length)).toEqual([IDS_PER_BLOK, 1])
  })

  it('geeft geen blokken voor een lege lijst', () => {
    expect(inBlokken([])).toEqual([])
  })
})

describe('haalAlleRijenVoorIds', () => {
  it('vraagt nooit meer dan IDS_PER_BLOK id\'s tegelijk en pagineert elk blok', async () => {
    // Elk id levert 10 rijen op: één blok van 150 id's is dus 1500 rijen, meer dan één pagina.
    const grootsteBlok: number[] = []
    const rijen = await haalAlleRijenVoorIds<string>(ids(400), async (blok, van, tot) => {
      grootsteBlok.push(blok.length)
      const alles = blok.flatMap(id => Array.from({ length: 10 }, (_, i) => `${id}:${i}`))
      return { data: alles.slice(van, tot + 1), error: null }
    })
    expect(Math.max(...grootsteBlok)).toBe(IDS_PER_BLOK)
    expect(rijen).toHaveLength(4000)
    expect(new Set(rijen).size).toBe(4000)
  })

  it('gooit bij een fout in plaats van een halve lijst te geven', async () => {
    await expect(haalAlleRijenVoorIds(ids(200), async (blok) =>
      blok[0] === 'id-0'
        ? { data: [], error: null }
        : { data: null, error: { message: 'URI too long' } },
    )).rejects.toThrow('URI too long')
  })
})
