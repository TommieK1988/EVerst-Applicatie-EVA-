'use server'

/**
 * De opmaak van een inkooporder of onderaannemersopdracht.
 *
 * Het document dat de leverancier krijgt wordt gerenderd uit een Word-sjabloon
 * (documentsoort `inkooporder` of `oa_contract`), zodat de opmaak te beheren is via
 * /instellingen/document-sjablonen en er meerdere varianten naast elkaar kunnen
 * bestaan. Hier zitten alleen de acties om die keuze te tonen en vast te leggen —
 * het renderen en versturen zelf gebeurt in `verstuurBestelling` (bestellingen.ts),
 * zodat mailen, afroepen en archiveren één ononderbroken stap blijven.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { isInkoopSoort, heeftTemplate, type DocumentVeld, type InkoopDocumentsoort } from '@/lib/documenten/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient() as any
}

/** Minimale sjabloonvorm voor de keuzelijst in het bestellingenpaneel. */
export interface SjabloonKeuze {
  id: string
  naam: string
  beschrijving: string | null
  /** Zonder gekoppeld Word-template valt er niets te renderen — de UI toont dat. */
  heeftTemplate: boolean
  /** Eigen invoervelden van het sjabloon; die krijgen bij het versturen hun standaardwaarde. */
  velden: DocumentVeld[]
}

/**
 * Alle actieve sjablonen voor een inkoopsoort, gefilterd op de werkmaatschappij van
 * het dossier. Meerdere sjablonen naast elkaar is precies de bedoeling: dat zijn de
 * varianten waar de inkoper uit kiest.
 */
export async function getInkoopSjablonen(
  soort: InkoopDocumentsoort,
  dossierId: string | null,
): Promise<SjabloonKeuze[]> {
  await vereisRecht('dossiers', 'lezen')
  if (!isInkoopSoort(soort)) return []

  const supabase = db()
  const [{ data: rijen }, { data: dossier }] = await Promise.all([
    supabase.from('document_sjablonen').select('*').eq('actief', true).eq('documentsoort', soort)
      .order('volgorde', { ascending: true }).order('naam', { ascending: true }),
    dossierId
      ? supabase.from('dossiers').select('werkmaatschappij_id').eq('id', dossierId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((rijen ?? []) as any[])
    .filter(s => !s.werkmaatschappij_id || !dossier?.werkmaatschappij_id || s.werkmaatschappij_id === dossier.werkmaatschappij_id)
    .map(s => ({
      id: s.id,
      naam: s.naam,
      beschrijving: s.beschrijving ?? null,
      heeftTemplate: heeftTemplate(s),
      velden: Array.isArray(s.velden) ? s.velden : [],
    }))
}

/**
 * Legt de sjabloonkeuze vast op de bestelling. Server-side gevalideerd: de client
 * geeft alleen een id door, en een verkeerd sjabloon zou een order in de opmaak van
 * een bewonersbrief opleveren.
 */
export async function bewaarBestellingSjabloon(
  bestellingId: string,
  sjabloonId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('dossiers', 'schrijven')
  const supabase = db()

  if (sjabloonId) {
    const { data } = await supabase.from('document_sjablonen')
      .select('id, documentsoort, actief').eq('id', sjabloonId).maybeSingle()
    if (!data?.actief || !isInkoopSoort(data.documentsoort)) {
      return { ok: false, error: 'Dit sjabloon kan niet voor een inkoopdocument gebruikt worden.' }
    }
  }

  const { error } = await supabase
    .from('werkbegroting_bestellingen')
    .update({ sjabloon_id: sjabloonId })
    .eq('id', bestellingId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
