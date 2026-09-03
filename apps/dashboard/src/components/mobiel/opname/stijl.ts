import type React from 'react'

/**
 * Gedeelde stijlwaarden voor de mobiele opname.
 *
 * Zelfde aanpak als `components/mobiel/kwaliteit/stijl.ts` en `components/mobiel/oplevering/stijl.ts`:
 * de `/m`-schermen gebruiken inline styles in plaats van Tailwind, en de herhaalde waarden staan op
 * één plek zodat de stappen niet uit elkaar lopen.
 *
 * LET OP bij het toevoegen van kleuren: `--border`, `--fg` en `--bg-elev` zijn volledige kleuren en
 * mogen rechtstreeks in `var()`. De shadcn-tokens (`--primary`, `--secondary`, …) zijn HSL-kanalen
 * en hebben `hsl(var(--x))` nodig.
 */

export const GRIJS = 'var(--fg-muted)'
export const RAND = 'var(--border)'
export const TEKST = 'var(--fg)'
export const OPPERVLAK = 'var(--bg-elev)'
export const ZACHT = 'var(--neutral-400)'
export const VLAK = 'var(--bg)'

/** Accenten dragen betekenis en blijven daarom vaste waarden in elk thema. */
export const GROEN = '#009439'
export const AMBER = '#b98900'
export const ROOD = '#b42318'

export const veld: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: `1px solid ${RAND}`, background: OPPERVLAK,
  fontSize: 16, // onder de 16px zoomt iOS in bij focus — en dit veld wordt per opname tientallen keren gebruikt
  color: TEKST, fontFamily: 'inherit', boxSizing: 'border-box',
}

export const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 5, display: 'block',
}

export const primaireKnop: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 12, border: 'none',
  background: GROEN, color: '#fff', fontSize: 16, fontWeight: 700,
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}

export const secundaireKnop: React.CSSProperties = {
  padding: '13px 16px', borderRadius: 12, background: OPPERVLAK, color: GRIJS,
  border: `1px solid ${RAND}`, fontSize: 15, fontWeight: 600,
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}

export const kaart: React.CSSProperties = {
  background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
  padding: 14, marginBottom: 10,
}

/**
 * Chip in een horizontaal scrollende strook (ruimtes, hoofdgroepen).
 *
 * `flexShrink: 0` is niet optioneel: binnen een `overflow-x`-strook in de verticale flexkolom van
 * de /m-shell drukt de browser de chips anders plat tot een streepje. Dat is hier al twee keer
 * misgegaan.
 */
export const chip = (actief: boolean): React.CSSProperties => ({
  flexShrink: 0,
  padding: '9px 14px', borderRadius: 999,
  border: `1px solid ${actief ? GROEN : RAND}`,
  background: actief ? GROEN : OPPERVLAK,
  color: actief ? '#fff' : TEKST,
  fontSize: 14, fontWeight: 600,
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
})

export const euro = (bedrag: number | null | undefined): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag ?? 0)
