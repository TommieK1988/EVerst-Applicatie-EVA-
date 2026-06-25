/** Gedeelde dimensies + kleuren voor alle planning-views.
 *  Aanpassingen aan de Gantt-look horen op deze plek te landen. */

export const LABEL_W            = 280
export const RIJ_HOOGTE         = 44
export const HEADER_SPAN_HOOGTE = 24
export const HEADER_COL_HOOGTE  = 28

/** Minimale dag-breedte (px) — fit-to-screen valt nooit onder dit getal.
 *  Alleen nog relevant voor de oude fit-to-screen-helpers; de planning-pagina's
 *  gebruiken nu een vaste dagbreedte (zie PPD_PER_VIEW). */
export const MIN_PPD = 2

/** Vaste dagbreedte (pixels per dag) per zoomniveau. De tijdlijn is een doorlopende,
 *  horizontaal-scrollbare strook — niet meer fit-to-screen. */
export const PPD_PER_VIEW: Record<string, number> = {
  dag:      900,   // ~37px per uur (uur-detail)
  week:     40,
  '2weken': 26,
  maand:    18,
  kwartaal: 8,
  jaar:     3,
}

/** Fractie van de zichtbare breedte waarop "Vandaag" landt bij openen/wisselen. */
export const VANDAAG_ANCHOR = 1 / 6

/** Weekenddagen (za/zo) worden in alle planningen smaller getekend dan werkdagen. */
export const WEEKEND_FACTOR = 0.5

/** Minimale balkbreedte (px) zodat korte taken (bv. 4 uur) ook in Maand/Kwartaal
 *  zichtbaar en klikbaar blijven, ongeacht het zoomniveau. */
export const MIN_BAR_W = 6

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
