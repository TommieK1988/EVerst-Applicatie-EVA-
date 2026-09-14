import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * De bonnetjes bij de onkosten van de weekstaat.
 *
 * De bucket is privé — een bon is een financieel stuk van een medewerker en hoort niet op een
 * raadbare publieke URL, anders dan de foto's van het werk zelf. We bewaren daarom het pad en
 * tekenen per weergave een kortstondige link; zelfde keuze als `lib/materieel/bestanden.ts`.
 */
export const ONKOSTEN_BUCKET = 'onkosten-bonnen'

/** Een uur is ruim genoeg voor één schermsessie en beperkt doorgeven van de link. */
const SIGNED_URL_TTL = 60 * 60

/** Zet storage-paden om naar signed URLs: één batch-call, geen rondje per bon. */
export async function signBonnen(paden: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniek = [...new Set(paden.filter((p): p is string => Boolean(p)))]
  const uit = new Map<string, string>()
  if (uniek.length === 0) return uit

  const { data, error } = await createAdminClient()
    .storage.from(ONKOSTEN_BUCKET)
    .createSignedUrls(uniek, SIGNED_URL_TTL)
  if (error || !data) return uit
  for (const d of data) {
    if (d.path && d.signedUrl) uit.set(d.path, d.signedUrl)
  }
  return uit
}

/** Eén pad ondertekenen (of null als er geen bon is). */
export async function signBon(pad: string | null): Promise<string | null> {
  if (!pad) return null
  return (await signBonnen([pad])).get(pad) ?? null
}

/** Bestandsnaam die veilig in een storage-pad past; telefoons leveren rare namen aan. */
export function bonExtensie(bestandsnaam: string): string {
  const ext = (bestandsnaam.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext || 'jpg'
}
