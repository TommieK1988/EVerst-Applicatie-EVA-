/** Gedeelde dimensies + kleuren voor alle planning-views.
 *  Aanpassingen aan de Gantt-look horen op deze plek te landen. */

export const LABEL_W            = 280
export const RIJ_HOOGTE         = 44
export const HEADER_SPAN_HOOGTE = 24
export const HEADER_COL_HOOGTE  = 28

/** Minimale dag-breedte (px) — fit-to-screen valt nooit onder dit getal. */
export const MIN_PPD = 2

export const KLEUR = {
  weekend:          'rgba(0,0,0,0.04)',
  /** Body-kolom tint: color-mix koppelt aan --accent; fallback voor browsers zonder support. */
  vandaagBg:        'color-mix(in srgb, var(--accent) 7%, transparent)',
  /** Header-kolom tint iets zwaarder dan body, conform DS spec (9 vs 7%). */
  vandaagHeaderBg:  'color-mix(in srgb, var(--accent) 9%, transparent)',
  vandaagLijn:      'var(--accent)',
  border:           'var(--border)',
  bgElev:           'var(--bg-elev)',
  bg:               'var(--bg)',
  fg:               'var(--fg)',
  fgMuted:          'var(--fg-muted)',
  fgSoft:           'var(--fg-soft)',
  accent:           'var(--accent)',
} as const
