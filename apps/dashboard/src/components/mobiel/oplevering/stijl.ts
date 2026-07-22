import type React from 'react'
import type { OpleverPuntStatus } from '@everts/database'

/**
 * Gedeelde stijlwaarden voor de mobiele oplever-schermen.
 *
 * De `/m`-schermen gebruiken bewust inline styles in plaats van Tailwind (zie HoutrotView,
 * VoortgangView): ze staan los van het desktop-DS en blijven zo één bestand om te lezen. Deze
 * module houdt de herhaalde waarden op één plek, zodat het overzicht en het uitvoerscherm niet
 * uit elkaar lopen.
 */

/**
 * Neutralen komen uit de DS-tokens, zodat deze schermen meebewegen met het thema (o.a. donkere
 * modus). LET OP: `--border`, `--fg` en `--bg-elev` zijn volledige kleuren en mogen dus rechtstreeks
 * in `var()`. Dat geldt níét voor alles — de shadcn-tokens (`--primary`, `--secondary`, …) zijn
 * HSL-kanalen en hebben `hsl(var(--x))` nodig. Verwissel die twee niet.
 */
export const GRIJS = 'var(--fg-muted)'
export const RAND = 'var(--border)'
export const TEKST = 'var(--fg)'
export const OPPERVLAK = 'var(--bg-elev)'
/** Nog lichter dan GRIJS: bijschriften en kolomkoppen die niet mogen concurreren met de inhoud. */
export const ZACHT = 'var(--neutral-400)'
/** Ingezonken vlak — spoor van een voortgangsbalk, achtergrond van een reactie. */
export const VLAK = 'var(--bg)'

/** Accenten blijven vaste waarden: ze dragen betekenis en moeten in elk thema hetzelfde lezen. */
export const GROEN = '#009439'
export const AMBER = '#b98900'
export const ROOD = '#b42318'

export const veld: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: `1px solid ${RAND}`, background: OPPERVLAK,
  fontSize: 16, // onder de 16px zoomt iOS het scherm in bij focus
  color: TEKST, fontFamily: 'inherit',
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

/** Kleur per opleverpunt-status. Exhaustive Record: een nieuwe status dwingt een keuze af. */
export const PUNT_KLEUR: Record<OpleverPuntStatus, string> = {
  nieuw: AMBER,
  open: GRIJS,
  in_behandeling: '#1d4e89',
  opgelost: AMBER,
  geaccepteerd: GROEN,
  geweigerd: ROOD,
  afgewezen: '#9aa4ab',
}
