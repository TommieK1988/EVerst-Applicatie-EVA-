import { describe, it, expect } from 'vitest'
import {
  bouwPostenTabelHtml, bouwUitvraagPostenHtml, escHtml, formatHoeveelheid, formatProjectbezoek,
} from './uitvraag-posten-mail'
import { bouwUitvraagMailHtml } from './uitvraag-mail'

const post = (omschrijving: string, hoeveelheid: number | null = 1, eenheid: string | null = 'st') =>
  ({ omschrijving, hoeveelheid, eenheid })

describe('bouwPostenTabelHtml', () => {
  it('toont omschrijving, hoeveelheid en eenheid, en geen prijzen', () => {
    const html = bouwPostenTabelHtml([post('Voegwerk uithakken', 12.5, 'm2')])
    expect(html).toContain('>Omschrijving<')
    expect(html).toContain('>Hoeveelheid<')
    expect(html).toContain('>Eenheid<')
    expect(html).toContain('Voegwerk uithakken')
    expect(html).toContain('12,5')
    expect(html).toContain('>m2<')
    expect(html).not.toMatch(/prijs|€|bedrag/i)
  })

  it('escapet HTML in omschrijving en eenheid', () => {
    const html = bouwPostenTabelHtml([post('<script>alert("x")</script> & <b>vet</b>', 1, '<i>m</i>')])
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>vet</b>')
    expect(html).not.toContain('<i>m</i>')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;vet&lt;/b&gt;')
    expect(html).toContain('&lt;i&gt;m&lt;/i&gt;')
  })

  it('geeft niets terug zonder posten', () => {
    expect(bouwPostenTabelHtml([])).toBe('')
  })

  it('toont een streepje bij een lege hoeveelheid of eenheid', () => {
    const html = bouwPostenTabelHtml([post('Inmeten', null, null)])
    expect(html.match(/>—</g)?.length).toBe(2)
  })

  it('houdt de volgorde van de posten aan', () => {
    const html = bouwPostenTabelHtml([post('Eerste'), post('Tweede')])
    expect(html.indexOf('Eerste')).toBeLessThan(html.indexOf('Tweede'))
  })
})

describe('bouwUitvraagPostenHtml', () => {
  it('voegt projectbezoek (NL-tijd) en reactiedatum toe als ze gezet zijn', () => {
    const html = bouwUitvraagPostenHtml({
      posten: [post('Gevel')],
      projectbezoekOp: '2026-10-21T07:30:00Z', // zomertijd: 09:30 in Nederland
      reactieUiterlijk: '2026-10-30',
    })
    expect(html).toContain('Projectbezoek')
    expect(html).toContain('21-10-2026, 09:30')
    expect(html).toContain('Reactie uiterlijk')
    expect(html).toContain('30-10-2026')
  })

  it('laat projectbezoek weg als het niet gezet is', () => {
    const html = bouwUitvraagPostenHtml({ posten: [post('Gevel')], projectbezoekOp: null, reactieUiterlijk: null })
    expect(html).not.toContain('Projectbezoek')
    expect(html).not.toContain('Reactie uiterlijk')
  })

  it('komt in de mail onder de werktabel en vóór de groet', () => {
    const extra = bouwUitvraagPostenHtml({ posten: [post('Postregel')] })
    const mail = bouwUitvraagMailHtml({
      soort: 'uitvraag',
      bericht: 'Goedemiddag,\n\nGraag een prijs.\n\nMet vriendelijke groet,',
      regels: [{ project: '2026.001 — Test', discipline: 'Voegwerk' }],
      extraHtml: extra,
    })
    expect(mail.indexOf('Voegwerk')).toBeLessThan(mail.indexOf('Postregel'))
    expect(mail.indexOf('Postregel')).toBeLessThan(mail.indexOf('Met vriendelijke groet'))
  })

  it('verandert de mail niet zonder pakket', () => {
    const basis = {
      soort: 'uitvraag' as const,
      bericht: 'Hallo\n\nMet vriendelijke groet,',
      regels: [{ project: 'P', discipline: 'D' }],
    }
    expect(bouwUitvraagMailHtml({ ...basis, extraHtml: null })).toBe(bouwUitvraagMailHtml(basis))
  })
})

describe('formatters', () => {
  it('escHtml escapet ook aanhalingstekens', () => {
    expect(escHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;')
    expect(escHtml(null)).toBe('')
  })

  it('formatHoeveelheid gebruikt de Nederlandse notatie', () => {
    expect(formatHoeveelheid(1234.5)).toBe('1.234,5')
    expect(formatHoeveelheid(null)).toBe('')
    expect(formatHoeveelheid(Number.NaN)).toBe('')
  })

  it('formatProjectbezoek rekent in winter- en zomertijd', () => {
    expect(formatProjectbezoek('2026-12-01T08:00:00Z')).toBe('01-12-2026, 09:00')
    expect(formatProjectbezoek('2026-07-01T08:00:00Z')).toBe('01-07-2026, 10:00')
    expect(formatProjectbezoek('geen datum')).toBe('')
    expect(formatProjectbezoek(null)).toBe('')
  })
})
