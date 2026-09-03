/**
 * Termijnstaten en verkooptermijnen aanmaken in Bouw7.
 *
 * Een project heeft één termijnstaat (`InvoiceTermStatement`) met daaronder de losse termijnen
 * (`ProjectInvoiceTerm`). EVA kan die aanmaken op basis van het termijnschema uit de offerte, zodat
 * de administratie ze niet meer met de hand hoeft over te typen.
 *
 * Drie harde regels, in volgorde van belang:
 *
 * 1. **Een termijn met een `invoiceLine` wordt nooit aangeraakt.** Daar hangt in Bouw7 al een
 *    factuur aan; hem wijzigen of overschrijven zou een fiscaal document onder handen nemen.
 * 2. **Termijnen die EVA niet kent blijven staan.** Wat de administratie zelf heeft toegevoegd is
 *    geen ruis maar een beslissing; EVA meldt ze terug in plaats van ze op te ruimen.
 * 3. **`DELETE /project/term-statement` wordt niet gebruikt.** Dat wist de hele staat in één keer,
 *    inclusief alles wat al gefactureerd is.
 *
 * Velden zijn afgeleid uit wat Bouw7 zelf teruggeeft (zie WRITE-ENDPOINTS.md §7b).
 * `vatTariffPercentage` is readOnly — stuur `vatTariffObject: { id }`.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7ListResponse, Bouw7ProjectInvoiceTerm } from '@/lib/bouw7/client'

/** Eén termijn zoals EVA hem wil vastleggen. */
export type TermijnInvoer = {
  /** Aanwezig = bijwerken, weg = nieuw. */
  bouw7TermId?: number | null
  omschrijving: string
  /** Percentage van de aanneemsom; alleen ter informatie in Bouw7, het bedrag is leidend. */
  percentage: number
  bedragExclBtw: number
  /** Bouw7-btw-tarief-id (`btw_tarieven.bouw7_id`). */
  vatTariffId: number
  /** Verwachte factuurdatum (YYYY-MM-DD), optioneel. */
  factureerbaarOp?: string | null
}

export type TermijnstaatInvoer = {
  projectId: number
  /** Debiteur; verplicht op de termijnstaat. */
  contactId: number
  /** Totale aanneemsom (`fixedPrice` op de staat). */
  aanneemsom: number
  termijnen: TermijnInvoer[]
}

export type TermijnstaatResultaat =
  | {
      ok: true
      statementId: number
      aangemaakt: number
      bijgewerkt: number
      /** Termijnen die zijn overgeslagen omdat er al een factuur aan hangt. */
      overgeslagen: string[]
      /** Termijnen die in Bouw7 staan maar niet in het EVA-schema — met rust gelaten. */
      onbekendInEva: string[]
    }
  | { ok: false; error: string }

type StatementListItem = { id: number; fixedPrice?: string | number; contact?: { id: number } | null }

/** Leest de termijnstaat van een project met zijn termijnen. */
export async function leesBouw7Termijnstaat(projectId: number): Promise<{
  statementId: number | null
  termijnen: Bouw7ProjectInvoiceTerm[]
}> {
  const client = await getBouw7Client()
  const stmts = await client.get<Bouw7ListResponse<StatementListItem>>(
    '/list/project-invoice-term-statements', { q: `project.id = ${projectId} LIMIT 200` },
  )
  const statement = (stmts.items ?? [])[0]
  if (!statement) return { statementId: null, termijnen: [] }

  const res = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
    '/list/project-invoice-terms', { q: `statement.id = ${statement.id} LIMIT 500` },
  )
  return { statementId: statement.id, termijnen: res.items ?? [] }
}

const bedrag = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

/**
 * Schrijft het termijnschema naar Bouw7. Idempotent: een bestaande staat wordt hergebruikt en
 * termijnen worden bijgewerkt op hun `bouw7TermId` in plaats van gedupliceerd.
 */
export async function schrijfBouw7Termijnstaat(
  invoer: TermijnstaatInvoer,
): Promise<TermijnstaatResultaat> {
  if (invoer.termijnen.length === 0) return { ok: false, error: 'Geen termijnen om weg te schrijven.' }

  const client = await getBouw7Client()

  let bestaand: { statementId: number | null; termijnen: Bouw7ProjectInvoiceTerm[] }
  try {
    bestaand = await leesBouw7Termijnstaat(invoer.projectId)
  } catch (e) {
    return { ok: false, error: `De huidige termijnstaat is niet op te halen: ${foutTekst(e)}. Er is niets geschreven.` }
  }

  // Regel 1: alles wat al een factuur draagt blijft ongemoeid.
  const gefactureerd = new Set(
    bestaand.termijnen.filter(t => t.invoiceLine != null).map(t => t.id),
  )
  const overgeslagen = invoer.termijnen
    .filter(t => t.bouw7TermId != null && gefactureerd.has(t.bouw7TermId))
    .map(t => t.omschrijving)
  const teSchrijven = invoer.termijnen.filter(t => t.bouw7TermId == null || !gefactureerd.has(t.bouw7TermId))

  // Regel 2: wat EVA niet kent blijft staan, maar wordt wel gemeld.
  const evaIds = new Set(invoer.termijnen.map(t => t.bouw7TermId).filter((v): v is number => v != null))
  const onbekendInEva = bestaand.termijnen
    .filter(t => !evaIds.has(t.id))
    .map(t => t.description ?? String(t.id))

  // Termijnstaat aanmaken of bijwerken.
  let statementId = bestaand.statementId
  try {
    const body: Record<string, unknown> = {
      ...(statementId != null ? { id: statementId } : { id: null }),
      contact: { id: invoer.contactId },
      fixedPrice: bedrag(invoer.aanneemsom),
    }
    const res = await client.post<{ id?: number }>(
      `/project/${invoer.projectId}/invoice-term-statement`, body,
    )
    statementId = res?.id ?? statementId
  } catch (e) {
    return { ok: false, error: `Bouw7 weigerde de termijnstaat: ${foutTekst(e)}` }
  }
  if (statementId == null) return { ok: false, error: 'Bouw7 gaf geen termijnstaat-id terug.' }

  let aangemaakt = 0
  let bijgewerkt = 0
  const mislukt: string[] = []
  for (const t of teSchrijven) {
    try {
      await client.post(`/project/${statementId}/invoice-term`, {
        id: t.bouw7TermId ?? null,
        description: t.omschrijving,
        percentage: String(t.percentage),
        subtotal: bedrag(t.bedragExclBtw),
        vatTariffObject: { id: t.vatTariffId },
        ...(t.factureerbaarOp ? { invoiceableAt: t.factureerbaarOp } : {}),
      })
      if (t.bouw7TermId == null) aangemaakt++; else bijgewerkt++
    } catch (e) {
      mislukt.push(`${t.omschrijving} (${foutTekst(e)})`)
    }
  }

  if (mislukt.length > 0) {
    return {
      ok: false,
      error: `De termijnstaat staat in Bouw7, maar ${mislukt.length} termijn(en) zijn niet geschreven: `
        + `${mislukt.join('; ')}. Controleer de staat in Bouw7 voordat je het opnieuw probeert.`,
    }
  }

  // Terugleescontrole: staat er nu wat we bedoelden?
  try {
    const na = await leesBouw7Termijnstaat(invoer.projectId)
    const somNa = na.termijnen.reduce((s, t) => s + Math.round(Number(t.subtotal ?? 0) * 100), 0)
    const somBedoeld = invoer.termijnen.reduce((s, t) => s + Math.round(t.bedragExclBtw * 100), 0)
    if (na.termijnen.length < invoer.termijnen.length || somNa !== somBedoeld) {
      return {
        ok: false,
        error: `Bouw7 geeft na het schrijven ${na.termijnen.length} termijnen van samen `
          + `€ ${(somNa / 100).toFixed(2)} terug, terwijl EVA ${invoer.termijnen.length} termijnen van `
          + `€ ${(somBedoeld / 100).toFixed(2)} stuurde. Controleer de termijnstaat in Bouw7.`,
      }
    }
  } catch {
    // Niet kunnen teruglezen is geen bewijs van falen; het schrijven zelf gaf geen fout.
  }

  return { ok: true, statementId, aangemaakt, bijgewerkt, overgeslagen, onbekendInEva }
}

function foutTekst(e: unknown): string {
  return e instanceof Error ? e.message : 'onbekende fout'
}
