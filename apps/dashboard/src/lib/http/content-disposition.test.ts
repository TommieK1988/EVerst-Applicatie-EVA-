import { describe, expect, it } from 'vitest'
import { contentDisposition } from './content-disposition'

describe('contentDisposition', () => {
  it('geeft alleen Latin-1 in de header, ook bij een gedachtestreepje', () => {
    const h = contentDisposition('inline', 'Offerte – Voorburg — v2.pdf')
    expect([...h].every(t => t.charCodeAt(0) <= 255)).toBe(true)
    expect(h).toContain(`filename="Offerte - Voorburg - v2.pdf"`)
    expect(h).toContain(`filename*=UTF-8''Offerte%20%E2%80%93%20Voorburg`)
  })
  it('haalt aanhalingstekens en regeleinden weg', () => {
    expect(contentDisposition('attachment', 'a"b\r\nc.txt')).toMatch(/^attachment; filename="abc.txt"/)
  })
  it('valt terug op "bestand" bij een lege naam', () => {
    expect(contentDisposition('inline', '')).toContain('filename="bestand"')
  })
})
