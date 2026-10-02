import { describe, expect, it } from 'vitest'
import { bepaalAutoSoort, pasMetaToe, splitsLijst, type BestandSoortDef } from './bestand-soort'
import type { BestandRij } from './bestand-rijen'

function rij(over: Partial<BestandRij>): BestandRij {
  return {
    sleutel: 'sharepoint:1', bron: 'SharePoint', naam: 'bestand.pdf', omschrijving: null,
    extensie: 'pdf', grootte: null, categorie: null, datum: null, door: null, soort: 'document',
    bouw7Id: null, bronQuery: '', openUrl: null, thumbUrl: null, previewUrl: null,
    ...over,
  }
}

const SOORTEN: BestandSoortDef[] = [
  { id: 'o', naam: 'Offerte', trefwoorden: ['offerte'], extensies: [], volgorde: 10, actief: true },
  { id: 'ob', naam: 'Opdrachtbevestiging', trefwoorden: ['opdrachtbevestiging'], extensies: [], volgorde: 5, actief: true },
  { id: 'c', naam: 'Correspondentie', trefwoorden: [], extensies: ['msg', '.EML'], volgorde: 80, actief: true },
  { id: 'x', naam: 'Uit', trefwoorden: ['tekening'], extensies: [], volgorde: 1, actief: false },
]

describe('bepaalAutoSoort', () => {
  it('herkent een trefwoord in de naam, hoofdletterongevoelig', () => {
    expect(bepaalAutoSoort(rij({ naam: 'OFFERTE 2026-12.pdf' }), SOORTEN)?.id).toBe('o')
  })

  it('laat de volgorde beslissen als meerdere soorten passen', () => {
    expect(bepaalAutoSoort(rij({ naam: 'Opdrachtbevestiging offerte 12.pdf' }), SOORTEN)?.id).toBe('ob')
  })

  it('herkent op extensie, ook met punt of hoofdletters in de instelling', () => {
    expect(bepaalAutoSoort(rij({ naam: 'Re: planning', extensie: 'eml' }), SOORTEN)?.id).toBe('c')
  })

  it('kijkt ook naar de Bouw7-categorie', () => {
    expect(bepaalAutoSoort(rij({ naam: 'scan001.pdf', categorie: 'Offertes' }), SOORTEN)?.id).toBe('o')
  })

  it('slaat inactieve soorten over en geeft null als niets past', () => {
    expect(bepaalAutoSoort(rij({ naam: 'tekening.pdf' }), SOORTEN)).toBeNull()
  })
})

describe('pasMetaToe', () => {
  it('handmatig wint van automatisch', () => {
    const [r] = pasMetaToe([rij({ naam: 'offerte.pdf' })], [{ sleutel: 'sharepoint:1', soortId: 'c', weergavenaam: null }], SOORTEN)
    expect(r.soortNaam).toBe('Correspondentie')
    expect(r.soortHandmatig).toBe(true)
  })

  it('legt de weergavenaam alleen over Bouw7-bestanden', () => {
    const bouw7 = rij({ sleutel: 'bouw7:7', bron: 'Bouw7', naam: 'scan001' })
    const sp = rij({ sleutel: 'sharepoint:1', naam: 'echt.pdf' })
    const [a, b] = pasMetaToe([bouw7, sp], [
      { sleutel: 'bouw7:7', weergavenaam: 'Offerte dakwerk', soortId: null },
      { sleutel: 'sharepoint:1', weergavenaam: 'genegeerd', soortId: null },
    ], SOORTEN)
    expect(a.naam).toBe('Offerte dakwerk')
    expect(a.oorspronkelijkeNaam).toBe('scan001')
    // De eigen naam telt mee voor de herkenning.
    expect(a.soortNaam).toBe('Offerte')
    expect(b.naam).toBe('echt.pdf')
  })

  it('zonder meta: automatische soort, niet handmatig', () => {
    const [r] = pasMetaToe([rij({ naam: 'offerte.pdf' })], [], SOORTEN)
    expect(r.soortId).toBe('o')
    expect(r.soortHandmatig).toBe(false)
  })
})

describe('splitsLijst', () => {
  it('splitst, schoont en ontdubbelt', () => {
    expect(splitsLijst(' Offerte, .PDF;offerte,, quotation ')).toEqual(['offerte', 'pdf', 'quotation'])
  })
})
