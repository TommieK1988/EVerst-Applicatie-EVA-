import { describe, expect, it } from 'vitest'
import nl from './berichten/nl'
import pl from './berichten/pl'
import ta from './berichten/ta'

/**
 * Pools en Tamil moeten exact dezelfde sleutels hebben als Nederlands (de bron).
 * Een ontbrekende sleutel toont in de app de kale sleutelnaam aan een monteur die
 * geen Nederlands leest — dat moet hier rood worden, niet op de bouwplaats.
 */

type Boom = { [k: string]: string | Boom }

function sleutels(boom: Boom, pad = ''): string[] {
  return Object.entries(boom).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${pad}${k}`] : sleutels(v, `${pad}${k}.`),
  )
}

function waarden(boom: Boom, pad = ''): [string, string][] {
  return Object.entries(boom).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${pad}${k}`, v] as [string, string]] : waarden(v, `${pad}${k}.`),
  )
}

/**
 * Namen van ICU-variabelen in een bericht: `{naam}`, `{aantal, plural, …}`. De takken van
 * een meervoud (`one {taak}`, `other {taken}`) zijn tekst, geen variabele — die slaan we over.
 */
function variabelen(tekst: string): string[] {
  const namen = new Set<string>()
  const patroon = /(?<!(?:zero|one|two|few|many|other|=\d+)\s*)\{\s*([A-Za-z_]\w*)\s*[,}]/g
  for (const m of tekst.matchAll(patroon)) namen.add(m[1])
  return [...namen].sort()
}

const bron = nl as unknown as Boom
const doelen: Record<string, Boom> = { pl: pl as unknown as Boom, ta: ta as unknown as Boom }

describe('vertalingen', () => {
  const nlSleutels = sleutels(bron).sort()

  for (const [taal, berichten] of Object.entries(doelen)) {
    it(`${taal} heeft dezelfde sleutels als nl`, () => {
      const eigen = sleutels(berichten).sort()
      const ontbreekt = nlSleutels.filter((s) => !eigen.includes(s))
      const overbodig = eigen.filter((s) => !nlSleutels.includes(s))
      expect({ ontbreekt, overbodig }).toEqual({ ontbreekt: [], overbodig: [] })
    })

    it(`${taal} gebruikt dezelfde variabelen als nl`, () => {
      const nlWaarden = new Map(waarden(bron))
      const afwijkend = waarden(berichten)
        .filter(([s, v]) => nlWaarden.has(s) && variabelen(v).join() !== variabelen(nlWaarden.get(s)!).join())
        .map(([s]) => s)
      expect(afwijkend).toEqual([])
    })

    it(`${taal} heeft geen lege vertalingen`, () => {
      const leeg = waarden(berichten).filter(([, v]) => v.trim() === '').map(([s]) => s)
      expect(leeg).toEqual([])
    })
  }
})
