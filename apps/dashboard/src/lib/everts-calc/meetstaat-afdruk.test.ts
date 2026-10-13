import { describe, it, expect } from 'vitest'
import { bouwMeetstaatAfdruk } from './meetstaat-afdruk'
import { bouwMeetstaatPdf } from './meetstaat-pdf'
import type { Groep, Meetregel, Meetstaat } from './types'

/**
 * De afgedrukte meetstaat: alle groepen in outline-volgorde, per groep de regels en
 * de totalen per onderdeel/type/bestekscode.
 */

const groep = (id: string, naam: string, parent_id: string | null, volgorde: number): Groep =>
  ({ id, scenario_id: 's', parent_id, naam, niveau: parent_id ? 2 : 1, volgorde })

let n = 0
const regel = (groep_id: string, x: Partial<Meetregel>): Meetregel => ({
  id: `r${++n}`, meetstaat_id: 'ms', groep_id, volgorde: n, aantal: 1, eenheid: 'm²',
  is_leeg: false, aangepast_op: '', ...x,
})

const groepen = [
  groep('g1', 'Voorgevel', null, 1),
  groep('g11', 'Begane grond', 'g1', 1),
  groep('g2', 'Achtergevel', null, 2),
  groep('g3', 'Zijgevel', null, 3),
]

describe('bouwMeetstaatAfdruk', () => {
  const regels = [
    regel('g11', { onderdeel: 'Kozijn', type: 'Omtrek', bestekcode: 's-01', eenheid: 'm¹', breedte: 1.2, breedte_aantal: 2, hoogte: 2.1, hoogte_aantal: 2, aantal: 4 }),
    regel('g11', { onderdeel: 'Kozijn', type: 'Omtrek', bestekcode: 'S-01', eenheid: 'm¹', breedte: 1, hoogte: 1 }),
    regel('g11', { onderdeel: 'Deur', type: 'Vlak', breedte: 0.93, hoogte: 2.3, hoeveelheid_override: 2.5 }),
    regel('g2', { onderdeel: 'Boeidelen', type: 'Vlak', breedte: 12.4, hoogte: 0.3 }),
    regel('g11', { onderdeel: '', breedte: 1, hoogte: 1 }),          // niet actief
    regel('g2', { onderdeel: 'Ramen', is_leeg: true }),              // lege invoerregel
    regel('weg', { onderdeel: 'Hekwerk', eenheid: 'st', aantal: 3 }), // groep bestaat niet meer
  ]
  const afdruk = bouwMeetstaatAfdruk(regels, groepen)

  it('zet groepen in outline-volgorde en slaat groepen zonder regels over', () => {
    expect(afdruk.blokken.map(b => [b.naam, b.diepte])).toEqual([
      ['Voorgevel', 0],      // zelf leeg, maar een subgroep heeft regels
      ['Begane grond', 1],
      ['Achtergevel', 0],
      ['Zonder groep', 0],   // Zijgevel heeft niets en ontbreekt
    ])
  })

  it('laat lege en onvolledige regels weg en nummert per groep', () => {
    const bg = afdruk.blokken[1]
    expect(bg.regels.map(r => r.nr)).toEqual([1, 2, 3])
    expect(afdruk.blokken[2].regels).toHaveLength(1)
  })

  it('telt per onderdeel/type/bestekscode, ongeacht de schrijfwijze van de code', () => {
    expect(afdruk.blokken[1].totalen).toEqual([
      { omschrijving: 'Kozijn - Omtrek [S-01]', hoeveelheid: '28,4 m¹' }, // 26,4 + 2
      { omschrijving: 'Deur - Vlak', hoeveelheid: '2,5 m²' },
    ])
  })

  it('markeert een handmatige hoeveelheid', () => {
    const deur = afdruk.blokken[1].regels[2]
    expect(deur.handmatig).toBe(true)
    expect(deur.hoeveelheid).toBe('2,5 m²')
    expect(afdruk.heeftHandmatig).toBe(true)
  })

  it('toont bij m¹ de aantallen per maat', () => {
    const kozijn = afdruk.blokken[1].regels[0]
    expect([kozijn.breedte, kozijn.hoogte, kozijn.code]).toEqual(['2 × 1,2', '2 × 2,1', 'S-01'])
  })
})

describe('bouwMeetstaatPdf', () => {
  const meetstaat: Meetstaat = {
    id: 'ms', project_id: 'p', scenario_id: 's', naam: 'Schilderwerk', code: 'MS-2026-014',
    status: 'concept', aangemaakt_op: '', aangepast_op: '',
  }

  it('maakt een liggende A4 die over pagina’s doorloopt', () => {
    const veel = Array.from({ length: 80 }, () =>
      regel('g2', { onderdeel: 'Kozijn', type: 'Vlak', breedte: 1, hoogte: 2, opmerking: 'RAL 9010' }))
    const pdf = bouwMeetstaatPdf({ meetstaat, afdruk: bouwMeetstaatAfdruk(veel, groepen), projectNaam: 'VvE Test' })
    const tekst = new TextDecoder('latin1').decode(pdf)
    expect(tekst.startsWith('%PDF-')).toBe(true)
    // A4 liggend: 841,89 × 595,28 pt
    const [, b, h] = tekst.match(/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/) ?? []
    expect([Math.round(Number(b)), Math.round(Number(h))]).toEqual([842, 595])
    expect((tekst.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  })
})
