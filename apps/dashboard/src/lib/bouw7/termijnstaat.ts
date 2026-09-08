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
      /** Bij een deelschrijving: de id's van de termijnen die deze call heeft aangemaakt. */
      nieuweTermIds?: number[]
    }
  | { ok: false; error: string }

type StatementListItem = { id: number; fixedPrice?: string | number; contact?: { id: number } | null }

/** Leest de termijnstaat van een project met zijn termijnen. */
export async function leesBouw7Termijnstaat(projectId: number): Promise<{
  statementId: number | null
  /** Aanneemsom zoals die op de staat staat; null zonder staat. */
  fixedPrice: number | null
  contactId: number | null
  termijnen: Bouw7ProjectInvoiceTerm[]
}> {
  const client = await getBouw7Client()
  const stmts = await client.get<Bouw7ListResponse<StatementListItem>>(
    '/list/project-invoice-term-statements', { q: `project.id = ${projectId} LIMIT 200` },
  )
  const statement = (stmts.items ?? [])[0]
  if (!statement) return { statementId: null, fixedPrice: null, contactId: null, termijnen: [] }

  const res = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
    '/list/project-invoice-terms', { q: `statement.id = ${statement.id} LIMIT 500` },
  )
  const fp = statement.fixedPrice != null ? Number(statement.fixedPrice) : NaN
  return {
    statementId: statement.id,
    fixedPrice: Number.isFinite(fp) ? fp : null,
    contactId: statement.contact?.id ?? null,
    termijnen: res.items ?? [],
  }
}

const bedrag = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

/**
 * Schrijft het termijnschema naar Bouw7. Idempotent: een bestaande staat wordt hergebruikt en
 * termijnen worden bijgewerkt op hun `bouw7TermId` in plaats van gedupliceerd.
 */
export async function schrijfBouw7Termijnstaat(
  invoer: TermijnstaatInvoer,
  opts?: {
    /**
     * `invoer.termijnen` is niet het hele schema maar een aanvulling (bv. één meerwerktermijn).
     * De terugleescontrole vergelijkt dan niet de totalen maar alleen of de aangeleverde
     * termijnen er staan, en geeft de id's van de nieuw aangemaakte termijnen terug.
     */
    deelschrijving?: boolean
  },
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

  // De termijnen gaan INLINE mee in de statement-POST. Bouw7 weigert een statement zonder
  // termijnen ("This collection should contain 1 element or more", geverifieerd sep 2026), en het
  // losse `/project/{stmt}/invoice-term`-endpoint is dus geen route om ze toe te voegen.
  //
  // Omdat de POST de hele collectie zet, moet élke termijn mee — ook de termijnen die EVA niet
  // wijzigt. Laat je er een weg, dan verdwijnt hij. Termijnen mét een factuur worden daarom
  // teruggestuurd zoals ze uit Bouw7 kwamen, niet zoals EVA ze zou willen hebben.
  const perId = new Map(bestaand.termijnen.map(t => [t.id, t]))
  const gewijzigd = new Map(teSchrijven.filter(t => t.bouw7TermId != null).map(t => [t.bouw7TermId!, t]))

  const alsBody = (t: TermijnInvoer, id?: number | null) => ({
    ...(id != null ? { id } : {}),
    description: t.omschrijving,
    percentage: String(t.percentage),
    subtotal: bedrag(t.bedragExclBtw),
    vatTariffObject: { id: t.vatTariffId },
    ...(t.factureerbaarOp ? { invoiceableAt: t.factureerbaarOp } : {}),
  })

  const invoiceTerms: Record<string, unknown>[] = []
  let aangemaakt = 0
  let bijgewerkt = 0

  // 1. Bestaande termijnen, in hun eigen volgorde.
  for (const oud of bestaand.termijnen) {
    const nieuw = gewijzigd.get(oud.id)
    if (nieuw && !gefactureerd.has(oud.id)) {
      invoiceTerms.push(alsBody(nieuw, oud.id))
      bijgewerkt++
    } else {
      // Ongemoeid laten: terugsturen zoals Bouw7 hem gaf.
      invoiceTerms.push({
        id: oud.id,
        description: oud.description ?? '',
        percentage: String(oud.percentage ?? '0'),
        subtotal: String(oud.subtotal ?? '0'),
        ...(oud.vatTariff?.id != null ? { vatTariffObject: { id: oud.vatTariff.id } } : {}),
        ...(oud.invoiceableAt ? { invoiceableAt: oud.invoiceableAt } : {}),
      })
    }
  }

  // 2. Nieuwe termijnen erachteraan.
  for (const t of teSchrijven) {
    if (t.bouw7TermId != null && perId.has(t.bouw7TermId)) continue
    invoiceTerms.push(alsBody(t))
    aangemaakt++
  }

  if (invoiceTerms.length === 0) {
    return { ok: false, error: 'Er blijft geen enkele termijn over om weg te schrijven.' }
  }

  let statementId = bestaand.statementId
  try {
    const res = await client.post<{ id?: number }>(
      `/project/${invoer.projectId}/invoice-term-statement`,
      {
        ...(statementId != null ? { id: statementId } : {}),
        contact: { id: invoer.contactId },
        fixedPrice: bedrag(invoer.aanneemsom),
        invoiceTerms,
      },
    )
    statementId = res?.id ?? statementId
  } catch (e) {
    return { ok: false, error: `Bouw7 weigerde de termijnstaat: ${foutTekst(e)}` }
  }
  if (statementId == null) return { ok: false, error: 'Bouw7 gaf geen termijnstaat-id terug.' }

  // Terugleescontrole: staat er nu wat we bedoelden?
  try {
    const na = await leesBouw7Termijnstaat(invoer.projectId)
    if (opts?.deelschrijving) {
      // Alleen de aangeleverde termijnen toetsen; de rest van de staat is niet van ons.
      const bestaandeIds = new Set(bestaand.termijnen.map(t => t.id))
      const nieuweTermIds = na.termijnen.filter(t => !bestaandeIds.has(t.id)).map(t => t.id)
      for (const t of teSchrijven) {
        const cent = Math.round(t.bedragExclBtw * 100)
        const gevonden = na.termijnen.some(x =>
          (t.bouw7TermId != null ? x.id === t.bouw7TermId : nieuweTermIds.includes(x.id))
          && Math.round(Number(x.subtotal ?? 0) * 100) === cent)
        if (!gevonden) {
          return { ok: false, error: `Bouw7 geeft de termijn "${t.omschrijving}" na het schrijven niet met het juiste bedrag terug. Controleer de termijnstaat in Bouw7.` }
        }
      }
      return { ok: true, statementId, aangemaakt, bijgewerkt, overgeslagen, onbekendInEva, nieuweTermIds }
    }
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
