/**
 * Gedeeld kleur-patroon voor crew-leden (projectleiders, medewerkers).
 * Wordt gebruikt in DossierKaart, DossierLijst en DossierViewSwitcher.
 */
export const CREW_PALETTE = [
  '#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b',
  '#f59e0b', '#3b82f6', '#e11d48', '#0891b2',
  '#65a30d', '#9333ea',
]

/** Geeft een consistente kleur terug voor een naam of set initialen. */
export function crewKleur(naam: string): string {
  let hash = 0
  for (let i = 0; i < naam.length; i++) hash = naam.charCodeAt(i) + ((hash << 5) - hash)
  return CREW_PALETTE[Math.abs(hash) % CREW_PALETTE.length]
}

/** Zet een volledige naam om naar maximaal 2 initialen. */
export function crewInitialen(naam: string): string {
  const delen = naam.trim().split(/\s+/)
  return ((delen[0]?.[0] ?? '') + (delen[delen.length - 1]?.[0] ?? '')).toUpperCase()
}
