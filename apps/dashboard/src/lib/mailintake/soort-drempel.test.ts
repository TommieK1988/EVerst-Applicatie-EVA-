import { describe, expect, it } from 'vitest'
import { beslis, type BeslisInvoer } from './beslis'
import { soortDrempel, SOORT_ZEKER } from './types'

/**
 * De soortdrempel is per soort, omdat een verkeerd gekozen soort niet overal
 * evenveel kost. Een servicedeskbon te veel gooi je weg; een opdracht die ten
 * onrechte op een offerte wordt gelegd, schuift een dossier naar Opdracht en duwt
 * een aanneemsom naar Bouw7.
 *
 * Dit is precies het soort getal dat stil terugkruipt naar één waarde bij een
 * latere opruiming, en dan bleef de kamermutatiebon van Kessler (0,72) opnieuw
 * liggen zonder dat iemand zag waarom.
 */
function bon(velden: Partial<BeslisInvoer>): BeslisInvoer {
  return {
    automatischToegestaan: true,
    soort: 'servicedeskbon',
    soortVertrouwen: 0.72,
    afzenderScore: 1,
    aantalRelatieKandidaten: 1,
    veldenCompleet: true,
    adresBevestigd: true,
    adresCompleet: true,
    vertrouwen: { omschrijving: 0.9, werkadres_straat: 1, categorie_voorstel: 1 },
    duplicaatTopscore: 0,
    offerteMatchGevonden: false,
    regie: false,
    offerteMatchHard: false,
    meerdereWerkadressen: false,
    ongelezenBijlage: false,
    dagbudgetOp: false,
    bouw7Gereed: true,
    bouw7Ontbreekt: [],
    ...velden,
  }
}

describe('soortDrempel', () => {
  it('is soepeler voor de goedkoop te herstellen soorten', () => {
    expect(soortDrempel('servicedeskbon')).toBeLessThan(SOORT_ZEKER)
    expect(soortDrempel('offerteaanvraag')).toBeLessThan(SOORT_ZEKER)
  })

  it('houdt de dure soorten op de gewone drempel', () => {
    // Deze twee raken een dossier dat al loopt, tot in Bouw7 aan toe.
    expect(soortDrempel('opdracht_op_offerte')).toBe(SOORT_ZEKER)
    expect(soortDrempel('meerwerk')).toBe(SOORT_ZEKER)
  })
})

describe('beslis: de drempel in werking', () => {
  it('laat de Kessler-kamermutatiebon (0,72) door', () => {
    const b = beslis(bon({}))
    expect(b.redenen).not.toContainEqual(expect.stringContaining('niet zeker genoeg om zelf'))
    expect(b.automatisch).toBe(true)
  })

  it('houdt dezelfde score tegen bij een opdracht op een offerte', () => {
    const b = beslis(bon({
      soort: 'opdracht_op_offerte', offerteMatchGevonden: true, offerteMatchHard: true,
    }))
    expect(b.automatisch).toBe(false)
    expect(b.redenen).toContainEqual(expect.stringContaining('niet zeker genoeg om zelf'))
  })

  it('houdt een servicedeskbon onder de eigen drempel nog steeds tegen', () => {
    const b = beslis(bon({ soortVertrouwen: 0.65 }))
    expect(b.automatisch).toBe(false)
  })
})
