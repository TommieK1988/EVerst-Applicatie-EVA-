/**
 * Draait deze build als Vercel-preview (een branch of PR), en dus niet live?
 *
 * Vercel zet VERCEL_ENV zelf: 'production' op de live site, 'preview' op elke
 * branch-deploy, en lokaal staat hij niet. Een preview praat met dezelfde database
 * als de live site, dus daar hoort een onmiskenbare waarschuwing bij: anders test
 * iemand "even" iets en past hij echte offertes aan.
 */
export function isPreviewOmgeving(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'preview'
}
