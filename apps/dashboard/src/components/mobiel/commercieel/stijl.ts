import type React from 'react'

/**
 * Gedeelde stijlwaarden voor de mobiele module Commercieel.
 *
 * Zelfde aanpak als `components/mobiel/materieel/stijl.ts`: de `/m`-schermen gebruiken inline
 * styles in plaats van Tailwind, en de herhaalde waarden staan op één plek zodat het
 * zoekscherm, het klantbeeld en de vastleg-sheet niet uit elkaar lopen.
 *
 * De kleuren zijn DS-tokens, geen vaste waarden — behalve de merkkleuren hieronder, die ook
 * in de materieel-module hardgecodeerd staan. Let op de valkuil met `--primary` en andere
 * shadcn-tokens: dat zijn HSL-kánalen, geen kleuren, en die horen in `hsl(var(--…))`. De
 * tokens hier (`--fg`, `--border`, `--bg-elev`) zijn wél volledige kleuren.
 */

export const GRIJS = 'var(--fg-muted)'
export const RAND = 'var(--border)'
export const TEKST = 'var(--fg)'
export const OPPERVLAK = 'var(--bg-elev)'
export const VLAK = 'var(--bg)'

export const GROEN = '#009439'
export const ROOD = '#b42318'
export const ORANJE = '#b54708'

export const veld: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: `1px solid ${RAND}`, background: OPPERVLAK,
  fontSize: 16, // onder de 16px zoomt iOS in bij focus
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

/** Rij in een lijst die naar een detailscherm linkt; ruim genoeg voor een duim. */
export const lijstRij: React.CSSProperties = {
  display: 'block', padding: '13px 14px', borderRadius: 12,
  background: OPPERVLAK, border: `1px solid ${RAND}`,
  textDecoration: 'none', color: TEKST, marginBottom: 8,
  WebkitTapHighlightColor: 'transparent',
}
