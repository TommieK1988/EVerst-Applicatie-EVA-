import { describe, expect, it } from 'vitest'
import {
  berekenContracttotaalVerkoop, overzichtRegels, splitsMeerwerk, type MeerwerkSplitsing,
} from './contractwaarde'

const geenSplitsing: MeerwerkSplitsing = {
  regiewerk: 0, minderwerkAangenomen: 0, meerwerkAangenomen: 0, minderwerkRegie: 0, meerwerkRegie: 0,
}

describe('overzichtRegels', () => {
  it('toont op een aangenomen opdracht zonder meerwerk alleen de aanneemsom', () => {
    const regels = overzichtRegels({
      opRegie: false, aanneemsom: 50_000, splitsing: geenSplitsing, evaBron: true, bouw7Meerwerk: 0,
    })
    expect(regels.map(r => r.label)).toEqual(['Aanneemsom'])
  })

  it('laat meer- en minderwerk alleen zien als er een bedrag staat', () => {
    const regels = overzichtRegels({
      opRegie: false, aanneemsom: 50_000,
      splitsing: { ...geenSplitsing, meerwerkAangenomen: 1200, minderwerkRegie: -300 },
      evaBron: true, bouw7Meerwerk: 0,
    })
    expect(regels.map(r => r.sleutel)).toEqual(['aanneemsom', 'meerwerkAangenomen', 'minderwerkRegie'])
  })

  it('vervangt op regie de aanneemsom door Regiewerkzaamheden, ook op nul', () => {
    const regels = overzichtRegels({
      opRegie: true, aanneemsom: 0, splitsing: geenSplitsing, evaBron: true, bouw7Meerwerk: 0,
    })
    expect(regels).toEqual([
      { sleutel: 'regiewerk', label: 'Regiewerkzaamheden', route: 'via nacalculatie', bedrag: 0 },
    ])
  })

  it('toont nooit een aanneemsom op regie, ook als er (nog) een bedrag binnenkomt', () => {
    const regels = overzichtRegels({
      opRegie: true, aanneemsom: 12_000, splitsing: { ...geenSplitsing, regiewerk: 800 },
      evaBron: true, bouw7Meerwerk: 0,
    })
    expect(regels.map(r => r.sleutel)).toEqual(['regiewerk'])
  })

  it('valt zonder EVA-regels terug op het Bouw7-aggregaat', () => {
    const regels = overzichtRegels({
      opRegie: false, aanneemsom: 10_000, splitsing: geenSplitsing, evaBron: false, bouw7Meerwerk: 750,
    })
    expect(regels.map(r => r.sleutel)).toEqual(['aanneemsom', 'bouw7Meerwerk'])
  })
})

describe('splitsMeerwerk', () => {
  it('haalt de regiewerkzaamheden uit het regiemeerwerk', () => {
    const s = splitsMeerwerk([], { nacalculatie: 1500, regiewerk: 1000 })
    expect(s.regiewerk).toBe(1000)
    expect(s.meerwerkRegie).toBe(500)
  })

  it('telt zonder regiewerk het hele blok als regiemeerwerk, zoals voorheen', () => {
    const s = splitsMeerwerk([], { nacalculatie: 400 })
    expect(s.regiewerk).toBe(0)
    expect(s.meerwerkRegie).toBe(400)
  })
})

describe('berekenContracttotaalVerkoop', () => {
  const basis = { aanneemsom: 20_000, meerwerk: 0, contractTotaal: 20_000 }
  const nacalculatie = { totaal: 3_000, alGefactureerdBedrag: 1_000, waardePerBron: { regie: 4_000 } }

  it('telt op regie geen aanneemsom mee, ook als Bouw7 er nog een levert', () => {
    const ct = berekenContracttotaalVerkoop({
      basis, goedgekeurdAantal: 0, meerwerk: null, nacalculatie, opRegie: true,
    })
    expect(ct.aanneemsom).toBe(0)
    expect(ct.contractTotaal).toBe(4_000)
    expect(ct.waarde.regiewerk).toBe(4_000)
  })

  it('laat een aangenomen opdracht ongemoeid', () => {
    const ct = berekenContracttotaalVerkoop({ basis, goedgekeurdAantal: 0, meerwerk: null, nacalculatie: null })
    expect(ct.contractTotaal).toBe(20_000)
  })
})
