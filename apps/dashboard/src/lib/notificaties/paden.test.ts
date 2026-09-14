import { describe, it, expect } from 'vitest'
import { naarMobielPad } from './paden'

/**
 * Deze vertaling bepaalt waar een aangetikte melding op een telefoon uitkomt. Gaat
 * hij mis, dan werkt de melding nog steeds — hij brengt je alleen naar het
 * startscherm, en dat merk je pas op een echt toestel. Vandaar tests.
 */
describe('naarMobielPad', () => {
  it('laat een pad dat al mobiel is met rust', () => {
    expect(naarMobielPad('/m/toolbox/abc')).toBe('/m/toolbox/abc')
    expect(naarMobielPad('/m')).toBe('/m')
  })

  it('brengt elk dossier naar het ene mobiele dossierscherm', () => {
    expect(naarMobielPad('/opdrachten/123/informatie')).toBe('/m/dossiers/123')
    expect(naarMobielPad('/aanvragen/123/meerwerk')).toBe('/m/dossiers/123')
    expect(naarMobielPad('/servicedesk/123')).toBe('/m/dossiers/123')
  })

  it('brengt beide taakschermen naar /m/taken', () => {
    expect(naarMobielPad('/mijn-taken')).toBe('/m/taken')
    expect(naarMobielPad('/taken/lijsten/9')).toBe('/m/taken')
  })

  it('scheidt de eigen weekstaat van het fiatteerscherm', () => {
    // Op de desktop is fiatteren een periodekeuze binnen hetzelfde overzicht, op
    // mobiel een eigen pagina. Zonder dit onderscheid komt een fiatteer-herinnering
    // uit op je eigen uren — het verkeerde scherm.
    expect(naarMobielPad('/uren')).toBe('/m/uren')
    expect(naarMobielPad('/uren?periode=te_keuren')).toBe('/m/uren/keuren')
    expect(naarMobielPad('/uren?periode=deze_maand')).toBe('/m/uren')
  })

  it('valt terug op het meldingenscherm als er geen mobiel scherm is', () => {
    expect(naarMobielPad('/facturen')).toBe('/m/notificaties')
    expect(naarMobielPad('/wagenpark/ritten')).toBe('/m/notificaties')
  })

  it('overleeft een leeg pad', () => {
    expect(naarMobielPad('')).toBe('/m')
  })
})
