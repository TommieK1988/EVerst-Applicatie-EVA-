import type { FotoType } from './types'

/**
 * Publieke URL van een houtrotfoto. De bucket `repair-photos` is publiek, dus er
 * is geen signed URL nodig. Eén plek, gedeeld door de desktoptab, de mobiele
 * weergave en de rapportage — anders loopt de padopbouw uit elkaar.
 */
export function fotoPubliekeUrl(pad: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/repair-photos/${pad}`
}

/** Weergavevolgorde van de fototypes: voor → tijdens → na. */
export const FOTO_VOLGORDE: Record<string, number> = { voor: 0, tijdens: 1, na: 2 }

/** Nederlandse labels per fototype. */
export const FOTO_LABELS: Record<FotoType, string> = { voor: 'Voor', tijdens: 'Tijdens', na: 'Na' }
