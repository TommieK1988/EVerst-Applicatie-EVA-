/**
 * rapport-paginas.ts — items in pagina's knippen voor een Word-rapportage.
 *
 * Pure functie, géén `server-only`: ook de demo-context en toekomstige client-previews
 * mogen hem gebruiken.
 *
 * De paginabreuk zelf hoort in het Word-sjabloon te staan, binnen een
 * `{#niet_laatste}`-conditie met een echte Ctrl+Enter-breuk erin. Er is namelijk **geen
 * rawxml-module geregistreerd** in `render-docx.ts`, dus een XML-string in een gewone tag
 * wordt als zichtbare tekst weggeschreven. Daarom staat `paginabreukXml` standaard leeg;
 * houtrot vult hem nog wel omdat het sjabloon daar de tag aanbiedt.
 *
 * Dit knipwerk is maar de helft van de garantie "een blok nooit over twee pagina's". De
 * andere helft zit in het sjabloon: exacte rijhoogte, begrensd fotokader en `cantSplit`.
 */

export interface PaginaGroep<T> {
  naam: string
  items: T[]
}

export interface PaginaOpties<T> {
  /** Aantal items per pagina; wordt hoe dan ook op minimaal 1 gehouden. */
  perPagina: number
  /**
   * Veldnaam waaronder de items van een pagina in de context komen. Dit verschilt per
   * sjabloon — houtrot gebruikt `registraties`, kwaliteit `regels`, het bezoekrapport
   * `bevindingen` — en hoort daarom niet vastgezet te worden.
   */
  itemVeld: string
  /** Waarde van `{@paginabreuk}` op niet-laatste pagina's. Leeg = de tag niet gebruiken. */
  paginabreukXml?: string
  /** Per groep opnieuw beginnen (bv. een pagina per gevelzijde). Weglaten = doorlopend. */
  groepen?: PaginaGroep<T>[]
}

/**
 * Knipt `items` in pagina-objecten. Elke pagina krijgt naast de items:
 * `pagina_nummer`, `aantal_paginas`, `eerste`, `laatste`, `niet_laatste`, `paginabreuk`,
 * en bij groepering ook `groep_naam` en `eerste_van_groep`.
 */
export function knipInPaginas<T>(
  items: T[],
  opties: PaginaOpties<T>,
): Record<string, unknown>[] {
  const n = Math.max(1, Math.round(opties.perPagina) || 1)
  const breuk = opties.paginabreukXml ?? ''

  const brokken: { items: T[]; groep_naam: string; eerste_van_groep: boolean }[] = []

  if (opties.groepen) {
    for (const g of opties.groepen) {
      const lijst = g.items ?? []
      for (let i = 0; i < lijst.length; i += n) {
        brokken.push({
          items: lijst.slice(i, i + n),
          groep_naam: String(g.naam ?? ''),
          eerste_van_groep: i === 0,
        })
      }
    }
  } else {
    for (let i = 0; i < items.length; i += n) {
      brokken.push({ items: items.slice(i, i + n), groep_naam: '', eerste_van_groep: false })
    }
  }

  return brokken.map((brok, i) => {
    const laatste = i === brokken.length - 1
    return {
      [opties.itemVeld]: brok.items,
      groep_naam: brok.groep_naam,
      eerste_van_groep: brok.eerste_van_groep,
      pagina_nummer: i + 1,
      aantal_paginas: brokken.length,
      eerste: i === 0,
      laatste,
      niet_laatste: !laatste,
      paginabreuk: laatste ? '' : breuk,
    }
  })
}
