import { describe, it, expect } from 'vitest'
import { bellenBanner } from './bellen-banner'
import type { BewakingKaart, BewakingStatus } from '@/lib/commercie/types'

const SANNE = 'sanne-id'
const BAS = 'bas-id'

function kaart(over: Partial<BewakingKaart>): BewakingKaart {
  return {
    id: 'k', dossier_id: 'd', soort: 'offerte', titel: null,
    eigenaar_id: BAS, actiehouder_id: SANNE,
    stap_soort: 'actie', stap_tekst: 'Opnieuw bellen', stap_datum: '2026-10-20', wacht_op: null,
    kans_pct: null, verwachte_opdracht: null, getrieerd_op: '2026-10-01', stap_bron: 'handmatig', taak_id: null,
    ...over,
  }
}

const bewaking = (k: BewakingKaart | null, status: BewakingStatus, naam = 'Sanne') =>
  ({ kaart: k, status, actiehouderNaam: naam, afgerond: false })

const contact = [{ soort: 'contact' as const, op: '2026-10-05T10:00:00Z', door: 'Sanne', tekst: 'Stuurt akkoord voor 20 okt', kop: 'Klant komt erop terug' }]

describe('bellenBanner', () => {
  it('waarschuwt een collega als we op de klant wachten, met wat er besproken is', () => {
    const b = bellenBanner({
      bewaking: bewaking(kaart({ stap_soort: 'wachten', wacht_op: 'klant' }), 'wacht_klant'),
      tijdlijn: contact, mijnId: BAS, vandaag: '2026-10-16',
    })!
    expect(b.toon).toBe('stop')
    expect(b.kop).toContain('Niet bellen')
    expect(b.regels[0]).toContain('Stuurt akkoord voor 20 okt')
  })

  it('zegt het tegen jezelf als jij aan zet bent en het vandaag moet', () => {
    const b = bellenBanner({
      bewaking: bewaking(kaart({ actiehouder_id: BAS, stap_datum: '2026-10-16' }), 'nu'),
      tijdlijn: [], mijnId: BAS, vandaag: '2026-10-16',
    })!
    expect(b.toon).toBe('go')
    expect(b.kop).toBe('Jij bent aan zet: Opnieuw bellen')
  })

  it('een verlopen actie van een collega vraagt eerst om afstemming', () => {
    const b = bellenBanner({
      bewaking: bewaking(kaart({ stap_datum: '2026-10-10' }), 'verlopen'),
      tijdlijn: [], mijnId: BAS, vandaag: '2026-10-16',
    })!
    expect(b.toon).toBe('stop')
    expect(b.regels.join(' ')).toContain('Stem even af met Sanne')
  })

  it('zonder stap is het een offerte die nog niemand oppakte', () => {
    const b = bellenBanner({
      bewaking: bewaking(null, 'ongetrieerd'), tijdlijn: [], mijnId: BAS, vandaag: '2026-10-16',
    })!
    expect(b.toon).toBe('info')
  })

  it('niets tonen bij een afgesloten offerte', () => {
    expect(bellenBanner({
      bewaking: { ...bewaking(kaart({}), 'afgerond'), afgerond: true }, tijdlijn: [], mijnId: BAS, vandaag: '2026-10-16',
    })).toBeNull()
  })
})
