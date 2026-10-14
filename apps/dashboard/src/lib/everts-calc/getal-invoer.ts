// ─── GETALLEN INTYPEN MET EEN KOMMA ─────────────────────────────────────────
// De maatvelden waren `<input type="number">`: die tonen 2.4 met een punt en
// weigeren in een Nederlandse browser soms juist de komma. Nu tekstvelden die
// allebei aannemen en met een komma tonen, zoals op de papieren opmeetstaat.

/** Alleen cijfers, één komma of punt: wat je mag typen terwijl je een getal invoert. */
export function isGetalInTyping(tekst: string): boolean {
  return /^\d*([.,]\d*)?$/.test(tekst.trim())
}

/**
 * '2,40' en '2.40' worden 2.4. Leeg of iets dat geen getal is: undefined.
 * Een punt telt als decimaalteken, niet als duizendtal: maten van 1.200 meter
 * typt niemand, 1.2 bedoelt 1,2.
 */
export function leesGetal(tekst: string): number | undefined {
  const t = tekst.trim().replace(',', '.')
  if (t === '' || t === '.' || !/^\d*\.?\d*$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** 2.4 → '2,4'. Leeg en 0 tonen niets: een lege cel betekent 'niet ingevuld'. */
export function toonGetal(n: number | undefined | null): string {
  if (n === undefined || n === null || n === 0 || !Number.isFinite(n)) return ''
  return String(+n.toFixed(4)).replace('.', ',')
}
