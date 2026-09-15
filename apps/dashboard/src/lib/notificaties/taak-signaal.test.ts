import { describe, it, expect } from 'vitest'
import { bepaalTaakMelding, type TaakKort } from './taak-signaal'

/**
 * De eerste versie hiervan meldde elke ochtend opnieuw "44 over de datum" aan mensen
 * met een oude stapel. Die regressie is hier vastgelegd: een bekende achterstand mag
 * nooit meer op zichzelf een melding opleveren.
 */

const t = (id: string, titel = `Actie ${id}`): TaakKort => ({ id, titel })

describe('bepaalTaakMelding', () => {
  it('zwijgt bij een bekende achterstand zonder werk voor vandaag', () => {
    const stapel = [t('a'), t('b'), t('c')]
    expect(bepaalTaakMelding([], stapel, ['a', 'b', 'c'])).toBeNull()
  })

  it('zwijgt ook als die achterstand groot is', () => {
    const stapel = Array.from({ length: 44 }, (_, i) => t(`x${i}`))
    expect(bepaalTaakMelding([], stapel, stapel.map(s => s.id))).toBeNull()
  })

  it('zwijgt als de achterstand krimpt', () => {
    expect(bepaalTaakMelding([], [t('a')], ['a', 'b', 'c'])).toBeNull()
  })

  it('behandelt de eerste keer de bestaande achterstand als bekend', () => {
    // Anders krijgt iedereen bij de allereerste run zijn hele historie als "nieuw".
    expect(bepaalTaakMelding([], [t('a'), t('b')], null)).toBeNull()
  })

  it('meldt wél wat vandaag afmoet, ook bij een eerste run', () => {
    const uit = bepaalTaakMelding([t('vandaag')], [t('a'), t('b')], null)
    expect(uit).not.toBeNull()
    expect(uit!.body).toContain('1 actie met deadline vandaag')
    expect(uit!.body).toContain('nog 2 ouder openstaand')
  })

  it('meldt een actie die net over de deadline is gegaan', () => {
    const uit = bepaalTaakMelding([], [t('nieuw', 'Offerte nabellen')], [])
    expect(uit!.titel).toBe('Actie over de datum: Offerte nabellen')
    expect(uit!.body).toBeNull()
  })

  it('valt terug op de telling zodra er naast het nieuwe nog iets ouds ligt', () => {
    // Alleen de titel van de nieuwe noemen zou de bekende achterstand verstoppen.
    const uit = bepaalTaakMelding([], [t('oud'), t('nieuw')], ['oud'])
    expect(uit!.titel).toBe('Acties over de deadline')
    expect(uit!.body).toBe('1 actie is over de deadline · nog 1 ouder openstaand')
  })

  it('noemt de achterstand als staart zodra er tóch een melding uitgaat', () => {
    const oud = Array.from({ length: 10 }, (_, i) => t(`o${i}`))
    const uit = bepaalTaakMelding([], [...oud, t('nieuw')], oud.map(o => o.id))
    expect(uit!.body).toContain('1 actie is over de deadline')
    expect(uit!.body).toContain('nog 10 ouder openstaand')
  })

  it('gebruikt de titel van de actie alleen als er verder niets openstaat', () => {
    const alleen = bepaalTaakMelding([t('x', 'Offerte nabellen')], [], [])
    expect(alleen!.titel).toBe('Actie vandaag: Offerte nabellen')
    expect(alleen!.body).toBeNull()

    const metStapel = bepaalTaakMelding([t('x', 'Offerte nabellen')], [t('o')], ['o'])
    expect(metStapel!.titel).toBe('Je acties van vandaag')
    expect(metStapel!.body).toContain('nog 1 ouder openstaand')
  })

  it('kiest een passende kop als er niets voor vandaag is', () => {
    const uit = bepaalTaakMelding([], [t('a'), t('b')], [])
    expect(uit!.titel).toBe('Acties over de deadline')
    expect(uit!.body).toBe('2 acties zijn over de deadline')
  })

  it('geeft alles wat nu openstaat terug als nieuw geheugen', () => {
    // Ook de acties van vandaag: die mogen morgen niet als "nieuw over de deadline"
    // terugkomen — daar is vandaag al over gemeld.
    const uit = bepaalTaakMelding([t('v')], [t('a')], ['a'])
    expect(uit!.gemeldeIds.sort()).toEqual(['a', 'v'])
  })

  it('zwijgt als er helemaal niets is', () => {
    expect(bepaalTaakMelding([], [], [])).toBeNull()
    expect(bepaalTaakMelding([], [], null)).toBeNull()
  })
})
