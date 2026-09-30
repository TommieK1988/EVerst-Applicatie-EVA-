/**
 * Een ChunkLoadError betekent: de browser draait een pagina waarvan een los JS-bestand
 * niet (meer) binnenkwam — meestal een tabblad dat openstond terwijl er een nieuwe
 * versie live ging, soms een netwerkhik. Daar valt niets te "proberen opnieuw" met
 * reset(): de ontbrekende chunk komt niet vanzelf terug. Eén keer de pagina hard
 * herladen haalt de actuele versie op en lost het in vrijwel alle gevallen op.
 *
 * De sessionStorage-grens voorkomt een herlaadlus als de chunk écht stuk is: binnen
 * HERLAAD_VENSTER_MS wordt niet nog eens herladen en krijgt de gebruiker gewoon het
 * foutscherm.
 *
 * Dezelfde regels staan als inline script in app/layout.tsx (CHUNK_HERLAAD_BOOTSTRAP),
 * voor fouten die geen error-boundary bereiken. Pas ze samen aan.
 */
const SLEUTEL = 'eva-chunk-herladen'
const HERLAAD_VENSTER_MS = 30_000

export function isChunkFout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'ChunkLoadError') return true
  const tekst = typeof message === 'string' ? message : ''
  return (
    /Loading (CSS )?chunk [\w-]+ failed/i.test(tekst) ||
    /Failed to fetch dynamically imported module/i.test(tekst) ||
    /Importing a module script failed/i.test(tekst)
  )
}

/** Herlaadt de pagina bij een chunk-fout. Geeft true terug als er herladen wordt. */
export function herlaadBijChunkFout(error: unknown): boolean {
  if (typeof window === 'undefined' || !isChunkFout(error)) return false
  try {
    const vorige = Number(sessionStorage.getItem(SLEUTEL) || 0)
    if (Date.now() - vorige < HERLAAD_VENSTER_MS) return false
    sessionStorage.setItem(SLEUTEL, String(Date.now()))
  } catch {
    // Geen sessionStorage (privévenster, geblokkeerd): zonder lusbeveiliging niet herladen.
    return false
  }
  window.location.reload()
  return true
}
