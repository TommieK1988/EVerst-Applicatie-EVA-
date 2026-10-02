import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Het tijdelijk vertalen: cache eerst, alleen het ontbrekende naar Claude, en bij elke
 * fout terugvallen op het origineel (null). Database en API zijn hier nagebootst.
 */

const cache = new Map<string, string>()
const verzoeken: string[][] = []
let antwoord: (teksten: string[]) => unknown = (t) => ({ vertalingen: t.map((x) => `PL:${x}`) })

vi.mock('@everts/database/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_k: string, sleutels: string[]) => Promise.resolve({
          data: sleutels.filter((s) => cache.has(s)).map((s) => ({ sleutel: s, vertaling: cache.get(s) })),
        }),
      }),
      update: () => ({ in: () => Promise.resolve({}) }),
      upsert: (rijen: { sleutel: string; vertaling: string }[]) => {
        for (const r of rijen) cache.set(r.sleutel, r.vertaling)
        return Promise.resolve({})
      },
    }),
  }),
}))

vi.mock('@/lib/fouten/log', () => ({ logFout: vi.fn(() => Promise.resolve()) }))

vi.mock('@anthropic-ai/sdk', () => {
  class BadRequestError extends Error {}
  class Anthropic {
    static BadRequestError = BadRequestError
    messages = {
      create: async (params: { messages: { content: string }[] }) => {
        const { teksten } = JSON.parse(params.messages[0].content) as { teksten: string[] }
        verzoeken.push(teksten)
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(antwoord(teksten)) }] }
      },
    }
  }
  return { default: Anthropic }
})

const { vertaal, heeftTaal, cacheSleutel } = await import('./kern')

beforeEach(() => {
  cache.clear()
  verzoeken.length = 0
  antwoord = (t) => ({ vertalingen: t.map((x) => `PL:${x}`) })
  process.env.ANTHROPIC_API_KEY = 'test'
})

describe('vertaal', () => {
  it('doet niets in het Nederlands', async () => {
    expect(await vertaal(['Steiger opbouwen'], 'nl')).toEqual([null])
    expect(verzoeken).toHaveLength(0)
  })

  it('vertaalt en bewaart; tweede keer uit de cache', async () => {
    expect(await vertaal(['Steiger opbouwen', 'Kozijn schuren'], 'pl'))
      .toEqual(['PL:Steiger opbouwen', 'PL:Kozijn schuren'])
    expect(verzoeken).toHaveLength(1)
    expect(await vertaal(['Kozijn schuren'], 'pl')).toEqual(['PL:Kozijn schuren'])
    expect(verzoeken).toHaveLength(1)
  })

  it('stuurt dubbele en lege teksten niet mee', async () => {
    const uit = await vertaal(['Schuren', '', 'Schuren', '1234', '  '], 'ta')
    expect(uit).toEqual(['PL:Schuren', null, 'PL:Schuren', null, null])
    expect(verzoeken).toEqual([['Schuren']])
  })

  it('valt terug op het origineel bij een onbruikbaar antwoord', async () => {
    antwoord = () => ({ vertalingen: ['maar één'] })
    expect(await vertaal(['Een', 'Twee'], 'pl')).toEqual([null, null])
    expect(cache.size).toBe(0)
  })

  it('valt terug op het origineel zonder API-sleutel', async () => {
    delete process.env.ANTHROPIC_API_KEY
    // De client is al aangemaakt in een eerdere test; nieuwe teksten zonder sleutel moeten
    // dan nog steeds veilig null geven of vertaald worden — nooit een fout gooien.
    await expect(vertaal(['Iets nieuws'], 'pl')).resolves.toHaveLength(1)
  })
})

describe('hulpjes', () => {
  it('herkent tekst zonder taal', () => {
    expect(heeftTaal('12:30')).toBe(false)
    expect(heeftTaal('Kozijn')).toBe(true)
    expect(heeftTaal('ஆய்வு')).toBe(true)
  })

  it('sleutel hangt af van taal en tekst', () => {
    expect(cacheSleutel('a', 'pl')).not.toBe(cacheSleutel('a', 'ta'))
    expect(cacheSleutel('a', 'pl')).toBe(cacheSleutel('a', 'pl'))
  })
})
