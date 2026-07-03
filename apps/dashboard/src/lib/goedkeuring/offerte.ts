import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { hashOfferte, type HashbareOfferteRegel } from '@/lib/everts-calc/goedkeuring-hash'

/**
 * Offerte-gate: bepaalt of een offerte controller-goedkeuring nodig heeft en of
 * hij verzendbaar is. Regels (bevestigd met gebruiker):
 * - Dossiers met Bouw7-categorie 'Dagelijks onderhoud' of 'Mutatie' → goedkeuring
 *   alleen vereist vanaf het instelbare drempelbedrag (default € 1.000 excl. btw).
 * - Alle overige categorieën (of onbekende categorie): goedkeuring altijd vereist.
 * - Interne calculaties: nooit.
 * - Meerwerk-offertes vallen via quotes.meerwerk_regel_id onder dezelfde gate.
 */

const DREMPEL_DEFAULT = 1000

/** Categorieën waarvoor de drempel geldt (zelfde regel als de servicedesk-detectie). */
const DREMPEL_CATEGORIEEN = ['dagelijks onderhoud', 'mutatie']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Instelbaar drempelbedrag uit bedrijfsinstellingen.overige.goedkeuring_drempel_offerte. */
export async function getGoedkeuringDrempel(): Promise<number> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const waarde = (data?.overige as Record<string, unknown> | null)?.goedkeuring_drempel_offerte
  const n = typeof waarde === 'number' ? waarde : typeof waarde === 'string' ? parseFloat(waarde) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DREMPEL_DEFAULT
}

export type OfferteGoedkeuringVereist = {
  vereist: boolean
  reden: 'categorie' | 'drempel' | 'onder_drempel' | 'interne_calculatie' | 'geen_quote'
  dossierId: string | null
  categorie: string | null
  drempel: number
  subtotaalExBtw: number
}

type QuoteRij = {
  id: string
  type: string
  status: string
  project_id: string | null
  dossier_id: string | null
  meerwerk_regel_id: string | null
  subtotaal_ex_btw: number
}

async function getQuote(quoteId: string): Promise<QuoteRij | null> {
  const { data } = await db()
    .from('quotes')
    .select('id, type, status, project_id, dossier_id, meerwerk_regel_id, subtotaal_ex_btw')
    .eq('id', quoteId)
    .maybeSingle()
  return (data as QuoteRij | null) ?? null
}

/** Dossier bij een offerte zoeken: direct, via meerwerk, of via everts_calc_project_id. */
async function resolveDossier(quote: QuoteRij): Promise<{ id: string; categorie: string | null } | null> {
  const d = db()

  if (quote.dossier_id) {
    const { data } = await d
      .from('dossiers')
      .select('id, bouw7_categorie_naam, categorie')
      .eq('id', quote.dossier_id)
      .maybeSingle()
    if (data) return { id: data.id, categorie: data.bouw7_categorie_naam ?? data.categorie ?? null }
  }

  if (quote.meerwerk_regel_id) {
    const { data: mw } = await d
      .from('meerwerk_regels')
      .select('dossier_id')
      .eq('id', quote.meerwerk_regel_id)
      .maybeSingle()
    if (mw?.dossier_id) {
      const { data } = await d
        .from('dossiers')
        .select('id, bouw7_categorie_naam, categorie')
        .eq('id', mw.dossier_id)
        .maybeSingle()
      if (data) return { id: data.id, categorie: data.bouw7_categorie_naam ?? data.categorie ?? null }
    }
  }

  if (quote.project_id) {
    const { data } = await d
      .from('dossiers')
      .select('id, bouw7_categorie_naam, categorie')
      .eq('everts_calc_project_id', quote.project_id)
      .maybeSingle()
    if (data) return { id: data.id, categorie: data.bouw7_categorie_naam ?? data.categorie ?? null }
  }

  return null
}

export async function offerteGoedkeuringVereist(quoteId: string): Promise<OfferteGoedkeuringVereist> {
  const drempel = await getGoedkeuringDrempel()
  const quote = await getQuote(quoteId)
  if (!quote) return { vereist: false, reden: 'geen_quote', dossierId: null, categorie: null, drempel, subtotaalExBtw: 0 }

  const subtotaal = Number(quote.subtotaal_ex_btw) || 0

  if (quote.type === 'interne_calculatie') {
    return { vereist: false, reden: 'interne_calculatie', dossierId: null, categorie: null, drempel, subtotaalExBtw: subtotaal }
  }

  const dossier = await resolveDossier(quote)
  const categorie = dossier?.categorie ?? null
  const onderDrempelRegime = categorie != null && DREMPEL_CATEGORIEEN.includes(categorie.trim().toLowerCase())

  if (onderDrempelRegime) {
    const vereist = subtotaal >= drempel
    return {
      vereist,
      reden: vereist ? 'drempel' : 'onder_drempel',
      dossierId: dossier?.id ?? null,
      categorie,
      drempel,
      subtotaalExBtw: subtotaal,
    }
  }

  // Alle overige categorieën (of geen dossier/categorie bekend): altijd goedkeuring.
  return { vereist: true, reden: 'categorie', dossierId: dossier?.id ?? null, categorie, drempel, subtotaalExBtw: subtotaal }
}

/** Actuele inhouds-hash van een offerte (regels + subtotaal). */
export async function berekenOfferteHash(quoteId: string): Promise<string> {
  const d = db()
  const [{ data: quote }, { data: lines }] = await Promise.all([
    d.from('quotes').select('subtotaal_ex_btw').eq('id', quoteId).maybeSingle(),
    d.from('quote_lines').select('id, omschrijving, hoeveelheid, eenheidsprijs, btw_pct').eq('quote_id', quoteId),
  ])
  return hashOfferte(
    ((lines ?? []) as HashbareOfferteRegel[]),
    Number(quote?.subtotaal_ex_btw) || 0,
  )
}

export type OfferteVerzendbaar =
  | { ok: true }
  | { ok: false; reden: 'geen_goedkeuring' | 'gewijzigd_na_goedkeuring'; error: string }

/**
 * Gate: mag deze offerte verzonden (of gedownload) worden? Vereist — wanneer de
 * goedkeuringsregels dat zeggen — een goedgekeurde aanvraag waarvan de object_hash
 * nog matcht met de actuele inhoud (offerte gewijzigd na goedkeuring = opnieuw indienen).
 */
export async function assertOfferteVerzendbaar(quoteId: string): Promise<OfferteVerzendbaar> {
  const vereist = await offerteGoedkeuringVereist(quoteId)
  if (!vereist.vereist) return { ok: true }

  const { data: goedkeuring } = await db()
    .from('goedkeuringen')
    .select('id, status, object_hash')
    .eq('object_type', 'offerte')
    .eq('object_id', quoteId)
    .eq('status', 'goedgekeurd')
    .order('ronde', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!goedkeuring) {
    return {
      ok: false,
      reden: 'geen_goedkeuring',
      error: 'Deze offerte is nog niet goedgekeurd door de controller. Vraag eerst goedkeuring aan.',
    }
  }

  const actueleHash = await berekenOfferteHash(quoteId)
  if (goedkeuring.object_hash !== actueleHash) {
    return {
      ok: false,
      reden: 'gewijzigd_na_goedkeuring',
      error: 'De offerte is gewijzigd na de goedkeuring. Vraag opnieuw goedkeuring aan voordat je verzendt.',
    }
  }

  return { ok: true }
}
