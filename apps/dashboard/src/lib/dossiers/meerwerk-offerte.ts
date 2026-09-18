/**
 * dossiers/meerwerk-offerte.ts
 *
 * Wat de offerte van één meerwerkregel zegt: het bedrag, de kostprijs, het btw-tarief en het
 * betalingsschema. Eén leesfunctie, twee aanroepers — het akkoord (dat het bedrag overneemt) en
 * de termijnstaat (die het schema volgt). Zouden die elk hun eigen som maken, dan kan het bedrag
 * op de meerwerkregel gaan afwijken van de termijnen die ervoor in Bouw7 staan, en dat merk je
 * pas bij de laatste factuur.
 *
 * WAAROM GEEN 'use server': elke export daarin is een aanroepbaar endpoint. Dit is een gewone
 * bibliotheekfunctie; de poort zit bij de aanroepers in `meerwerk.ts` en `meerwerk-termijn.ts`.
 * Zelfde afweging als in `termijnen-bron.ts`.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { leesTermijnen } from './termijnen-bron'
import type { TermijnschemaRegel } from './termijnen-schema'

const rond = (n: number): number => Math.round(n * 100) / 100
const getal = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

export type MeerwerkOfferte = {
  quoteId: string
  /** Verkoopbedrag excl. btw — wat de klant heeft geaccepteerd. */
  verkoopExclBtw: number
  /**
   * Kostprijs van de niet-optionele offerteregels. Dit — en nooit het verkoopbedrag — is wat als
   * verwachte kosten naar de Bouw7-bewakingscode gaat: het verkoopbedrag draagt AK en winst, en
   * als kostenprognose zou het de marge op het Financieel-tab vernielen. Zelfde regel als bij
   * stelposten (`opdracht_onderdelen.begroot_excl_btw`).
   */
  kostprijs: number
  /** Het btw-percentage van de offerte; null als de offerte er geen draagt. */
  btwPct: number | null
  /**
   * Het betalingsschema uit de betalingsconditie van déze offerte, leeg als er geen conditie aan
   * hangt. Leeg betekent: één termijn voor het hele bedrag (het oude gedrag).
   */
  termijnen: TermijnschemaRegel[]
}

/**
 * Leest de offerte van een meerwerkregel uit. `null` als de offerte niet (meer) bestaat.
 *
 * Secties en regels worden apart opgehaald en niet als ingebedde `select`: beide zijn begrensd op
 * één offerte, en zo is er geen twijfel of PostgREST een geneste verzameling stil afkapt. Een
 * ontbrekende regel verschuift hier ongemerkt de kostprijs.
 */
export async function leesMeerwerkOfferte(quoteId: string): Promise<MeerwerkOfferte | null> {
  const supabase = createAdminClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, subtotaal_ex_btw, btw_pct, betalingsconditie_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (!quote?.id) return null

  const [sectieRes, regelRes] = await Promise.all([
    supabase.from('quote_sections').select('id, is_optioneel').eq('quote_id', quote.id),
    supabase.from('quote_lines').select('section_id, kostprijs_pe, hoeveelheid').eq('quote_id', quote.id),
  ])

  // Optionele secties zitten niet in de opdracht en dus ook niet in de kostprijs.
  const optioneel = new Set(
    ((sectieRes?.data ?? []) as { id: string; is_optioneel: boolean | null }[])
      .filter(s => s.is_optioneel).map(s => s.id),
  )
  const kostprijs = rond(
    ((regelRes?.data ?? []) as { section_id: string | null; kostprijs_pe: unknown; hoeveelheid: unknown }[])
      .reduce((som, l) => {
        if (l.section_id && optioneel.has(l.section_id)) return som
        return som + getal(l.kostprijs_pe) * (l.hoeveelheid == null ? 1 : getal(l.hoeveelheid))
      }, 0),
  )

  let termijnen: TermijnschemaRegel[] = []
  if (quote.betalingsconditie_id) {
    const { data: conditie } = await supabase
      .from('betalingscondities').select('termijnen').eq('id', quote.betalingsconditie_id).maybeSingle()
    termijnen = leesTermijnen(conditie?.termijnen).filter(t => t.percentage > 0)
  }

  return {
    quoteId: quote.id as string,
    verkoopExclBtw: rond(getal(quote.subtotaal_ex_btw)),
    kostprijs,
    btwPct: quote.btw_pct == null ? null : getal(quote.btw_pct),
    termijnen,
  }
}
