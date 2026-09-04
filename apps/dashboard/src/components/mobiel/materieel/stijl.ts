import type React from 'react'

/**
 * Gedeelde stijlwaarden voor de mobiele materieel-schermen.
 *
 * Zelfde aanpak als `components/mobiel/kwaliteit/stijl.ts`: de `/m`-schermen
 * gebruiken inline styles in plaats van Tailwind, en de herhaalde waarden staan
 * op één plek zodat scannen, toevoegen en het paspoort niet uit elkaar lopen.
 */

export const GRIJS = 'var(--fg-muted)'
export const RAND = 'var(--border)'
export const TEKST = 'var(--fg)'
export const OPPERVLAK = 'var(--bg-elev)'
export const VLAK = 'var(--bg)'

export const GROEN = '#009439'
export const ROOD = '#b42318'

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
