import { cache } from 'react'
import type { Metadata } from 'next'
import { createAdminClient } from '@everts/database/server'

/**
 * Titel van het browsertabblad voor een dossier. Dossiers openen standaard in een
 * eigen tabblad, dus de tabtitel moet vertellen wélk dossier daar openstaat —
 * "Offerte | EVA" is dan onbruikbaar.
 *
 * Bewust een aparte, minimale query (geen `getDossierById`): dit draait naast het
 * renderen van de pagina en mag niets extra's ophalen. `cache` voorkomt dat twee
 * tabs van hetzelfde dossier binnen één render dubbel bevragen.
 */
const haalTitel = cache(async (id: string): Promise<{ titel: string | null; dossiernummer: string | null } | null> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('dossiers')
      .select('titel, dossiernummer')
      .eq('id', id)
      .single()
    return data ?? null
  } catch {
    return null
  }
})

/**
 * Metadata voor een dossier-detailpagina: dossiernaam (met nummer) in de tabtitel.
 * Valt terug op het sectielabel als het dossier niet gevonden wordt.
 */
export async function dossierMetadata(id: string, fallback: string): Promise<Metadata> {
  const rij = await haalTitel(id)
  const naam = rij?.titel?.trim()
  if (!naam) return { title: fallback }
  // Naam eerst: in een smal tabblad is dat het stuk dat leesbaar blijft.
  return { title: rij?.dossiernummer ? `${naam} · ${rij.dossiernummer}` : naam }
}
