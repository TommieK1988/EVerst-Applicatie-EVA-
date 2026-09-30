import { describe, expect, it } from 'vitest'
import { bouwProjectLijsten, leesMax, STANDAARD_MAX_TAKEN, type TaakBron, type NotitieBron } from './dossier-lijsten'

const taak = (titel: string, status = 'open', deadline: string | null = null): TaakBron =>
  ({ titel, status, deadline, assignee_naam: null })
const notitie = (inhoud: string, created_at = '2026-09-29T10:00:00Z'): NotitieBron =>
  ({ inhoud, created_at, auteur_naam: 'Jan' })

describe('bouwProjectLijsten', () => {
  it('lege dossiers geven lege lijsten zonder meer-regel', () => {
    const b = bouwProjectLijsten([], [], {})
    expect(b.projecttaken).toEqual([])
    expect(b.projectnotities).toEqual([])
    expect(b.projecttaken_meer).toBe('')
    expect(b.projectnotities_meer).toBe('')
    expect(b.projecttaken_heeft_meer).toBe(false)
  })

  it('zet open taken vóór afgevinkte en laat vervallen weg', () => {
    const b = bouwProjectLijsten([taak('a', 'gereed'), taak('b', 'vervallen'), taak('c')], [], {})
    expect(b.projecttaken.map(t => t.titel)).toEqual(['c', 'a'])
    expect(b.projecttaken.map(t => t.afgevinkt)).toEqual(['☐', '☒'])
    expect(b.projecttaken_open.map(t => t.titel)).toEqual(['c'])
    expect(b.projecttaken_totaal).toBe(2)
  })

  it('kapt af op de standaardgrens en meldt de rest', () => {
    const taken = Array.from({ length: STANDAARD_MAX_TAKEN + 3 }, (_, i) => taak(`t${i}`))
    const b = bouwProjectLijsten(taken, [], {})
    expect(b.projecttaken).toHaveLength(STANDAARD_MAX_TAKEN)
    expect(b.projecttaken_totaal).toBe(STANDAARD_MAX_TAKEN + 3)
    expect(b.projecttaken_meer).toBe('En nog 3 taken in EVA.')
    expect(b.projecttaken_heeft_meer).toBe(true)
  })

  it('volgt de grens uit de invoer, ook enkelvoud', () => {
    const b = bouwProjectLijsten([], [notitie('een'), notitie('twee')], { max_notities: '1' })
    expect(b.projectnotities.map(n => n.tekst)).toEqual(['een'])
    expect(b.projectnotities_meer).toBe('En nog 1 notitie in EVA.')
  })

  it('dateert een notitie op de Nederlandse kalenderdag', () => {
    // 22:30 UTC op 29 september = 00:30 op 30 september in Nederland.
    const b = bouwProjectLijsten([], [notitie('laat', '2026-09-29T22:30:00Z')], {})
    expect(b.projectnotities[0].datum_iso).toBe('2026-09-30')
  })

  it('laat de auteur leeg bij een notitie zonder medewerker, en kort lange tekst in', () => {
    const lang = 'woord '.repeat(100)
    const b = bouwProjectLijsten([], [{ inhoud: lang, created_at: '2026-09-29T10:00:00Z', auteur_naam: 'Onbekend', medewerker_id: null }], {})
    expect(b.projectnotities[0].auteur).toBe('')
    expect(b.projectnotities[0].tekst_kort.length).toBeLessThanOrEqual(221)
    expect(b.projectnotities[0].tekst_kort.endsWith('…')).toBe(true)
  })

  it('slaat lege notities over', () => {
    const b = bouwProjectLijsten([], [notitie('  '), notitie('echt')], {})
    expect(b.projectnotities.map(n => n.tekst)).toEqual(['echt'])
    expect(b.projectnotities_totaal).toBe(1)
  })
})

describe('leesMax', () => {
  it('valt terug op de standaard bij leeg of onzin, en staat 0 toe', () => {
    expect(leesMax('', 5)).toBe(5)
    expect(leesMax('abc', 5)).toBe(5)
    expect(leesMax('-2', 5)).toBe(5)
    expect(leesMax('0', 5)).toBe(0)
    expect(leesMax('8', 5)).toBe(8)
  })
})
