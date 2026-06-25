// Pure stamdata-constanten (geen server-imports → bruikbaar in client- én server-components).

/**
 * Default hoog BTW-tarief (%) als fallback wanneer er geen specifiek tarief beschikbaar is.
 * De bron van waarheid is de `btw_tarieven`-tabel (afgeleid uit Bouw7); dit is alleen een
 * fallback voor plekken zonder regel-specifiek tarief (bijv. previews/placeholders).
 */
export const STANDAARD_BTW_HOOG_PCT = 21
