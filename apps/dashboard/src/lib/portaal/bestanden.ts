import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalOnderdeelWeergave } from './auth'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { PortaalBestandSoort } from '@everts/database/platform-types'

/**
 * bestanden.ts — de documenten en foto's die met de klant gedeeld zijn.
 *
 * Leest UITSLUITEND uit portaal_bestanden. Er wordt hier dus niet live in Bouw7
 * of SharePoint gebladerd, ook niet "om even de naam op te halen". Dat is
 * bewust: de vrijgave is een momentopname die een collega expliciet heeft
 * aangevinkt, en een bestand dat in de projectmap verschijnt hoort niet vanzelf
 * bij de klant terecht te komen.
 *
 * De link naar de inhoud gaat altijd via /api/dossier-bestand?portaal=1, dat de
 * bron uit deze tabel haalt in plaats van uit de querystring. Zie de route.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type PortaalBestandRij = {
  sleutel: string
  naam: string
  extensie: string | null
  grootte: number | null
  datum: string | null
  /** Kant-en-klare URL naar de proxy. */
  url: string
  /** Verkleinde variant, alleen voor afbeeldingen. */
  thumbUrl: string | null
}

function bestandUrl(dossierId: string, sleutel: string, opties: { breedte?: number; download?: boolean } = {}): string {
  const q = new URLSearchParams({ portaal: '1', dossier: dossierId, sleutel })
  if (opties.breedte) q.set('w', String(opties.breedte))
  if (opties.download) q.set('download', '1')
  return `/api/dossier-bestand?${q.toString()}`
}

async function haalVrijgegeven(dossierId: string, soort: PortaalBestandSoort): Promise<PortaalBestandRij[]> {
  const rijen = await haalAlleRijen<Record<string, unknown>>((van, tot) =>
    db()
      .from('portaal_bestanden')
      .select('sleutel, naam, extensie, grootte, datum, soort')
      .eq('dossier_id', dossierId)
      .eq('zichtbaar', true)
      .eq('soort', soort)
      .order('sleutel')
      .range(van, tot),
  )

  return rijen
    .map(r => ({
      sleutel: String(r.sleutel),
      naam: (r.naam as string | null) || 'Bestand',
      extensie: (r.extensie as string | null) ?? null,
      grootte: (r.grootte as number | null) ?? null,
      datum: (r.datum as string | null) ?? null,
      url: bestandUrl(dossierId, String(r.sleutel), soort === 'document' ? { download: true } : {}),
      thumbUrl: soort === 'afbeelding' ? bestandUrl(dossierId, String(r.sleutel), { breedte: 400 }) : null,
    }))
    .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? '') || a.naam.localeCompare(b.naam))
}

export async function getPortaalDocumenten(dossierId: string): Promise<PortaalBestandRij[]> {
  await vereisPortaalOnderdeelWeergave(dossierId, 'bestanden')
  return haalVrijgegeven(dossierId, 'document')
}

export async function getPortaalFotos(dossierId: string): Promise<PortaalBestandRij[]> {
  await vereisPortaalOnderdeelWeergave(dossierId, 'fotos')
  return haalVrijgegeven(dossierId, 'afbeelding')
}

/** Aantallen voor de overzichtspagina, zonder de hele lijst op te halen. */
export async function telPortaalBestanden(dossierId: string): Promise<{ documenten: number; fotos: number }> {
  const tel = async (soort: PortaalBestandSoort) => {
    const { count } = await db()
      .from('portaal_bestanden')
      .select('sleutel', { count: 'exact', head: true })
      .eq('dossier_id', dossierId)
      .eq('zichtbaar', true)
      .eq('soort', soort)
    return count ?? 0
  }
  const [documenten, fotos] = await Promise.all([tel('document'), tel('afbeelding')])
  return { documenten, fotos }
}
