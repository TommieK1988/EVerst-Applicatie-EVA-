/**
 * Two-way offerte: schrijft een verzonden EVA-offerte als **offerte in Bouw7** (`POST /quotation`).
 *
 * Bewust een **lichte** variant: alleen de kopgegevens + één samenvattingsregel met het totaal
 * excl. BTW (Bouw7 leidt het offertetotaal zelf af uit de regels; er is geen los totaalveld). De
 * volledige regel-voor-regel calculatie is expliciet buiten scope (zie WRITE-ENDPOINTS.md §4, fase 6).
 *
 * Veldmapping (zie ook het plan):
 *  - `subject`          ← dossier.titel                       (Betreft / Dossiertitel)
 *  - `quotationNumber`  ← quotes.quote_nummer                 (EVA-offertenummer → Bouw7-offertenummerveld)
 *  - `reference`        ← quotes.referentie                   (klantreferentie, indien aanwezig)
 *  - `employee{id}`     ← dossier.calculator_id → medewerkers.bouw7_id   (Adviseur = calculator)
 *  - `contact{id}`      ← dossier.klant_id → relaties.bouw7_id           (verplicht door Bouw7)
 *  - `project{id}`      ← dossier.bouw7_id                    (koppelt aan bestaand Bouw7-project;
 *                                                              Filiaal/Werkmaatschappij volgt hieruit)
 *  - `quotationStatus`  ← quotes.status (concept|verzonden)   → Bouw7-status via naam-match/override
 *  - `quotationDate`    ← quotes.datum (of verzonden_at)      (Offertedatum)
 *  - `chapters[0].lines[0].price` ← quotes.subtotaal_ex_btw   (Totaal excl. BTW als samenvattingsregel)
 *
 * Upsert: staat er al een `bouw7_quotation_id` op de quote, dan gaat die als `id` mee (update) i.p.v.
 * een dubbele Bouw7-offerte. Na afloop schrijven we `bouw7_quotation_id`, `bouw7_quotation_nummer`
 * en `bouw7_synced_at` terug op de quote.
 *
 * Faalt nooit hard richting de aanroeper (verzendflow): retourneert `{ ok:false, error }` zodat de UI
 * een toast kan tonen zonder de EVA-verzending terug te draaien.
 *
 * Discovery/config-overrides (integraties.config bij naam='bouw7'), gebruikt zodra de exacte id's bekend
 * zijn — anders worden ze op runtime uit de Bouw7-API afgeleid:
 *  - `quotation_layout_id`            (verplicht veld bij create; anders runtime-probe)
 *  - `quotation_status_verzonden_id`  / `quotation_status_concept_id`
 *  - `quotation_vat_tariff_id`        (BTW-tarief op de samenvattingsregel; optioneel)
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import { createAdminClient } from '@everts/database/server'
import type {
  Bouw7Quotation,
  Bouw7QuotationCreate,
  Bouw7QuotationStatus,
  Bouw7QuotationDetail,
  Bouw7VatTariff,
} from '@/lib/bouw7/client'
import type { Bouw7WriteResult } from './bouw7-status'

type Client = Awaited<ReturnType<typeof getBouw7Client>>

/** Normaliseer een Bouw7-respons naar een array (envelope `{items}` of kale array). */
function toItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const items = (res as { items?: unknown })?.items
  return Array.isArray(items) ? (items as T[]) : []
}

/** Config-overrides uit `integraties.config` (naam='bouw7'). Leeg object als niet gezet. */
async function getBouw7Config(): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data } = await admin.from('integraties').select('config').eq('naam', 'bouw7').maybeSingle()
  return (data?.config ?? {}) as Record<string, unknown>
}

/** Config-override → getal, of null als niet/ongeldig gezet. */
function overrideId(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Probeer kandidaat-lijst-endpoints tot er een lijst met items terugkomt. */
async function probeList<T>(client: Client, paths: string[]): Promise<T[]> {
  for (const p of paths) {
    try {
      const items = toItems<T>(await client.get<unknown>(p, { q: 'LIMIT 200' }))
      if (items.length) return items
    } catch {
      // volgende kandidaat
    }
  }
  return []
}

/**
 * Bepaal de Bouw7-offertestatus-id voor een EVA-status. Volgorde: config-override → statuslijst-endpoint
 * (naam-match) → afgeleid uit de statussen op bestaande offertes.
 */
async function resolveQuotationStatusId(
  client: Client,
  status: string,
  cfg: Record<string, unknown>,
): Promise<number | null> {
  const isVerzonden = status === 'verzonden'
  const override = overrideId(isVerzonden ? cfg.quotation_status_verzonden_id : cfg.quotation_status_concept_id)
  if (override != null) return override

  const keywords = isVerzonden
    ? ['verstuur', 'verzond', 'aangebod', 'definit']
    : ['concept', 'opgesteld', 'nieuw']
  const match = (arr: Bouw7QuotationStatus[]): Bouw7QuotationStatus | undefined =>
    arr.find((s) => keywords.some((k) => (s.name ?? '').toLowerCase().includes(k)))

  const lijst = await probeList<Bouw7QuotationStatus>(client, ['/list/quotation-statuses', '/organization/quotation-statuses'])
  const hit = match(lijst)
  if (hit?.id != null) return hit.id

  // Fallback: leid de statussen af uit bestaande offertes.
  try {
    const quotations = toItems<Bouw7Quotation>(await client.get('/list/quotations', { q: 'LIMIT 200' }))
    const statuses = quotations
      .map((q) => q.quotationStatus)
      .filter((s): s is Bouw7QuotationStatus => !!s)
    const hit2 = match(statuses)
    if (hit2?.id != null) return hit2.id
  } catch {
    // geen fallback beschikbaar
  }
  return null
}

/**
 * Bepaal de Bouw7-offertelayout (verplicht bij create). Dit is een **string**-identifier (bv. "default"),
 * geen id — Bouw7 heeft geen layout-lijst-endpoint. Config-override `quotation_layout`, anders "default".
 */
function resolveQuotationLayout(cfg: Record<string, unknown>): string {
  const v = cfg.quotation_layout
  return typeof v === 'string' && v.trim() ? v.trim() : 'default'
}

/**
 * Bepaal een BTW-tarief-id voor de samenvattingsregel (optioneel — het bedrag is expliciet excl. BTW,
 * dus `price` is leidend). Volgorde: config-override → tarief-lijst (21%) → tarief-id van een bestaande
 * offerteregel. `null` = geen tarief meesturen.
 */
async function resolveVatTariffId(client: Client, cfg: Record<string, unknown>): Promise<number | null> {
  const override = overrideId(cfg.quotation_vat_tariff_id)
  if (override != null) return override

  const tariffs = await probeList<Bouw7VatTariff>(client, ['/list/vat-tariffs', '/organization/vat-tariffs'])
  const pick = tariffs.find((t) => String(t.percentage ?? '').startsWith('21')) ?? tariffs[0]
  if (pick?.id != null) return pick.id

  try {
    const quotations = toItems<Bouw7Quotation>(await client.get('/list/quotations', { q: 'LIMIT 1' }))
    const first = quotations[0]
    if (first?.id) {
      const det = await client.get<Bouw7QuotationDetail>(`/quotation/${first.id}`)
      for (const ch of det.chapters ?? []) {
        for (const l of ch.lines ?? []) {
          if (l.vatTariffObject?.id != null) return l.vatTariffObject.id
        }
      }
    }
  } catch {
    // geen fallback beschikbaar
  }
  return null
}

/**
 * Schrijf een EVA-offerte als Bouw7-offerte weg (upsert). Bedoeld om best-effort aangeroepen te worden
 * vanuit de verzendflow (na status → verzonden). Interne calculaties worden overgeslagen.
 */
export async function stuurOfferteNaarBouw7(quoteId: string): Promise<Bouw7WriteResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any

    // 1. EVA-offerte lezen.
    const { data: q } = await admin
      .from('quotes')
      .select('id, quote_nummer, status, type, datum, verzonden_at, subtotaal_ex_btw, referentie, dossier_id, project_id, bouw7_quotation_id')
      .eq('id', quoteId)
      .maybeSingle()
    if (!q) return { ok: false, error: 'Offerte niet gevonden.' }
    if (q.type === 'interne_calculatie') {
      return { ok: false, error: 'Interne calculatie wordt niet naar Bouw7 geschreven.' }
    }

    // 2. Dossier bepalen (directe koppeling of via het calc-project).
    const dossierVelden = 'id, titel, bouw7_id, calculator_id, klant_id'
    let dossier: {
      id: string; titel: string | null; bouw7_id: string | null
      calculator_id: string | null; klant_id: string | null
    } | null = null
    if (q.dossier_id) {
      const { data } = await admin.from('dossiers').select(dossierVelden).eq('id', q.dossier_id).maybeSingle()
      dossier = data ?? null
    }
    if (!dossier && q.project_id) {
      const { data } = await admin.from('dossiers').select(dossierVelden).eq('everts_calc_project_id', q.project_id).maybeSingle()
      dossier = data ?? null
    }
    if (!dossier) return { ok: false, error: 'Offerte is niet aan een dossier gekoppeld.' }

    const projectBouw7Id = dossier.bouw7_id ? Number(dossier.bouw7_id) : null
    if (projectBouw7Id == null || !Number.isFinite(projectBouw7Id)) {
      return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.' }
    }

    // 3. Verplichte referenties resolven: klant-contact + calculator (employee).
    const [klantRow, mwRow] = await Promise.all([
      dossier.klant_id
        ? admin.from('relaties').select('bouw7_id').eq('id', dossier.klant_id).maybeSingle()
        : Promise.resolve({ data: null }),
      dossier.calculator_id
        ? admin.from('medewerkers').select('bouw7_id').eq('id', dossier.calculator_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const contactBouw7Id = klantRow?.data?.bouw7_id ? Number(klantRow.data.bouw7_id) : null
    const employeeBouw7Id = mwRow?.data?.bouw7_id ? Number(mwRow.data.bouw7_id) : null
    if (contactBouw7Id == null || !Number.isFinite(contactBouw7Id)) {
      return { ok: false, error: 'Klant heeft geen Bouw7-koppeling; offerte niet naar Bouw7 geschreven.' }
    }
    if (employeeBouw7Id == null || !Number.isFinite(employeeBouw7Id)) {
      return { ok: false, error: 'Calculator (Adviseur) heeft geen Bouw7-koppeling; offerte niet naar Bouw7 geschreven.' }
    }

    // 4. Bouw7-stamwaarden resolven (status, layout, BTW-tarief).
    const client = await getBouw7Client()
    const cfg = await getBouw7Config()

    const statusId = await resolveQuotationStatusId(client, q.status, cfg)
    if (statusId == null) {
      return { ok: false, error: 'Bouw7-offertestatus niet gevonden; stel quotation_status_verzonden_id in bij Integraties.' }
    }
    const layout = resolveQuotationLayout(cfg)
    const vatTariffId = await resolveVatTariffId(client, cfg)

    // 5. Body samenstellen + upsert.
    const subject = (dossier.titel || q.quote_nummer || 'Offerte').toString()
    const subtotaal = Number(q.subtotaal_ex_btw ?? 0)
    const datumBron: string | null = q.datum ?? (q.verzonden_at ? String(q.verzonden_at).slice(0, 10) : null)
    const quotationDate = datumBron ? new Date(datumBron).toISOString() : undefined

    const body: Bouw7QuotationCreate = {
      subject,
      quotationNumber: q.quote_nummer ?? undefined,
      language: 'nl-NL',
      layout,
      employee: { id: employeeBouw7Id },
      contact: { id: contactBouw7Id },
      project: { id: projectBouw7Id },
      quotationStatus: { id: statusId },
      chapters: [
        {
          name: 'Aanneemsom',
          hasPrice: true,
          lines: [
            {
              description: subject,
              quantity: 1,
              price: subtotaal,
              unit: 'post',
              ...(vatTariffId != null ? { vatTariffObject: { id: vatTariffId } } : {}),
            },
          ],
        },
      ],
    }
    if (quotationDate) body.quotationDate = quotationDate
    if (q.referentie) body.reference = q.referentie
    if (q.bouw7_quotation_id) body.id = Number(q.bouw7_quotation_id)

    const created = await client.post<Bouw7Quotation & { id?: number; quotationNumber?: string }>('/quotation', body)
    const bouw7Id = created?.id ?? (q.bouw7_quotation_id ? Number(q.bouw7_quotation_id) : null)

    // 6. Terugschrijven op de quote (upsert-sleutel + terugleesbaar nummer).
    await admin
      .from('quotes')
      .update({
        bouw7_quotation_id: bouw7Id != null ? String(bouw7Id) : (q.bouw7_quotation_id ?? null),
        bouw7_quotation_nummer: created?.quotationNumber ?? q.quote_nummer ?? null,
        bouw7_synced_at: new Date().toISOString(),
      })
      .eq('id', quoteId)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij offerte naar Bouw7.' }
  }
}
