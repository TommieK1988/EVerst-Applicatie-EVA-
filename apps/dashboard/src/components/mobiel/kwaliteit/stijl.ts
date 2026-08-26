import type React from 'react'
import type { KwaliteitErnst, KwaliteitResultaatStatus } from '@everts/database/kwaliteit-types'

/**
 * Gedeelde stijlwaarden voor de mobiele kwaliteitsronde.
 *
 * Zelfde aanpak als `components/mobiel/oplevering/stijl.ts`: de `/m`-schermen gebruiken inline
 * styles in plaats van Tailwind, en de herhaalde waarden staan op één plek zodat de vier stappen
 * van de ronde niet uit elkaar lopen.
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
export const BLAUW = '#1d4e89'

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

/**
 * Kleur per resultaatstatus. Groen = voldoet, rood = voldoet niet, oranje = aandacht,
 * grijs = geen oordeel. Exhaustive Record: een nieuwe status dwingt hier een keuze af.
 */
export const STATUS_KLEUR: Record<KwaliteitResultaatStatus, string> = {
  voldoet:         GROEN,
  voldoet_niet:    ROOD,
  nader_onderzoek: AMBER,
  niet_beoordeeld: GRIJS,
  nvt:             ZACHT,
}

/** Korte knoplabels; de volledige labels staan in kwaliteitResultaatStatusLabels. */
export const STATUS_KORT: Record<KwaliteitResultaatStatus, string> = {
  voldoet:         'Voldoet',
  voldoet_niet:    'Voldoet niet',
  niet_beoordeeld: 'Niet beoordeeld',
  nvt:             'N.v.t.',
  nader_onderzoek: 'Nader onderzoek',
}

export const ERNST_KLEUR: Record<KwaliteitErnst, string> = {
  kritiek:    ROOD,
  technisch:  AMBER,
  esthetisch: BLAUW,
  observatie: GRIJS,
}
