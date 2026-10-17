import { describe, expect, it } from 'vitest'
import { allePaden, bouwBoom, mapLabel, sorteerFotos, vlakAf, type BoomRegel } from './bestand-boom'
import type { BestandRij } from './bestand-rijen'

function rij(naam: string, over: Partial<BestandRij> = {}): BestandRij {
  return {
    sleutel: `sharepoint:${naam}`, bron: 'SharePoint', naam, omschrijving: null,
    extensie: 'pdf', grootte: null, categorie: null, datum: null, door: null, soort: 'document',
    bouw7Id: null, bronQuery: '', openUrl: null, thumbUrl: null, previewUrl: null,
    ...over,
  }
}

/** Compacte weergave van de regels: inspringing + soort + naam. */
function alsTekst(regels: BoomRegel[]): string[] {
  return regels.map(r => {
    const inspring = '  '.repeat(r.diepte)
    switch (r.soort) {
      case 'map': return `${inspring}${r.open ? 'v' : '>'} ${r.map.naam}`
      case 'bestand': return `${inspring}${r.rij.naam}`
      case 'fotos': return `${inspring}[${r.map.fotosHier} foto's]`
      case 'leeg': return `${inspring}[leeg]`
    }
  })
}

describe('bouwBoom + vlakAf', () => {
  const documenten = [
    rij('offerte.pdf'),
    rij('tekening A.pdf', { map: 'Tekeningen' }),
    rij('tekening B.pdf', { map: 'Tekeningen/Revisie 2' }),
    rij('bouw7.pdf', { bron: 'Bouw7', sleutel: 'bouw7:1' }),
  ]
  const fotos = [rij('IMG_1.jpg', { soort: 'afbeelding', map: "Foto's" })]
  const mappen = [
    { pad: 'Tekeningen', webUrl: 'https://sp/Tekeningen' },
    { pad: 'Tekeningen/Revisie 2', webUrl: null },
    { pad: "Foto's", webUrl: null },
    { pad: 'Leeg', webUrl: null },
  ]

  it('toont dichtgeklapt wat er bovenaan staat, met de mappen daaronder', () => {
    const boom = bouwBoom(documenten, fotos, mappen)
    expect(alsTekst(vlakAf(boom, new Set()))).toEqual([
      'offerte.pdf',
      'bouw7.pdf',
      "> Foto's",
      '> Leeg',
      '> Tekeningen',
    ])
  })

  it('zet onder een map eerst zijn eigen bestanden, dan pas de submappen', () => {
    const boom = bouwBoom(documenten, fotos, mappen)
    const open = new Set(['Tekeningen', 'Tekeningen/Revisie 2', "Foto's", 'Leeg'])
    expect(alsTekst(vlakAf(boom, open))).toEqual([
      'offerte.pdf',
      'bouw7.pdf',
      "v Foto's",
      "  [1 foto's]",
      'v Leeg',
      '  [leeg]',
      'v Tekeningen',
      '  tekening A.pdf',
      '  v Revisie 2',
      '    tekening B.pdf',
    ])
  })

  it('telt bestanden en foto\'s inclusief submappen', () => {
    const boom = bouwBoom(documenten, fotos, mappen)
    const tekeningen = boom.mappen.find(m => m.pad === 'Tekeningen')!
    expect(tekeningen.aantalBestanden).toBe(2)
    expect(tekeningen.webUrl).toBe('https://sp/Tekeningen')
    expect(boom.aantalBestanden).toBe(4)
    expect(boom.aantalFotos).toBe(1)
  })

  it('laat geen bestand wegvallen als zijn map niet in de mappenlijst staat', () => {
    const boom = bouwBoom([rij('los.pdf', { map: 'Onbekend/Diep' })], [], [])
    expect(alsTekst(vlakAf(boom, new Set(['Onbekend', 'Onbekend/Diep'])))).toEqual([
      'v Onbekend',
      '  v Diep',
      '    los.pdf',
    ])
  })

  it('sorteert mapnamen op hun nummer', () => {
    const boom = bouwBoom([], [], [{ pad: '10 Oplevering', webUrl: null }, { pad: '2 Offerte', webUrl: null }])
    expect(boom.mappen.map(m => m.naam)).toEqual(['2 Offerte', '10 Oplevering'])
  })

  it('geeft alle mappaden voor alles uitklappen', () => {
    expect(allePaden(bouwBoom(documenten, fotos, mappen)).sort())
      .toEqual(["Foto's", 'Leeg', 'Tekeningen', 'Tekeningen/Revisie 2'])
  })
})

describe('sorteerFotos', () => {
  it('zet losse foto\'s eerst, daarna per map, binnen een map de nieuwste bovenaan', () => {
    const uit = sorteerFotos([
      rij('b-oud.jpg', { map: 'B', datum: '2026-01-01' }),
      rij('a-sub.jpg', { map: 'A/Sub', datum: '2026-05-01' }),
      rij('los.jpg', { datum: '2026-02-01' }),
      rij('b-nieuw.jpg', { map: 'B', datum: '2026-03-01' }),
      rij('a.jpg', { map: 'A', datum: '2026-01-01' }),
      rij('a2.jpg', { map: 'A 2', datum: '2026-01-01' }),
    ])
    expect(uit.map(f => f.naam)).toEqual(['los.jpg', 'a.jpg', 'a-sub.jpg', 'a2.jpg', 'b-nieuw.jpg', 'b-oud.jpg'])
  })
})

describe('mapLabel', () => {
  it('toont een pad met pijltjes', () => {
    expect(mapLabel('Tekeningen/Revisie 2')).toBe('Tekeningen › Revisie 2')
  })
})
