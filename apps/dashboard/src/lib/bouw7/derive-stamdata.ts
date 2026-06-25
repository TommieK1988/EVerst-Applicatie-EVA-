// Afleiden van gedeelde stamdata uit Bouw7-transacties (Bouw7 leidend, read-only in EVA):
//   - BTW-tarieven uit offerteregels (vatTariffObject) → tabel `btw_tarieven`
//   - Uursoorten uit uren-logs (hourType) → verrijking van `planning_uursoorten`
//
// Bouw7 biedt geen schone master-list-endpoints hiervoor; we dedupliceren daarom op Bouw7-id
// (en op label/naam als id ontbreekt). De functies liften mee op calls die de sync/uren-tab
// tóch al doet, zodat er geen dure extra API-sweeps nodig zijn.

import { createAdminClient } from '@everts/database/server'
import type {
  Bouw7QuotationDetail,
  Bouw7VatTariff,
  Bouw7EmployeeHourLog,
} from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''))
  return isNaN(n) ? 0 : n
}

/* ── BTW-tarieven ─────────────────────────────────────────────────── */

export type AfgeleidBtwTarief = {
  bouw7_id: number | null
  label: string
  percentage: number
  verlegd: boolean
}

/** Verzamel de unieke BTW-tarieven uit een set offerte-details (regels + AK/W&R-opslagen). */
export function collectVatTariffs(details: Bouw7QuotationDetail[]): AfgeleidBtwTarief[] {
  const map = new Map<string, AfgeleidBtwTarief>()
  const add = (t: Bouw7VatTariff | null | undefined, pctFallback?: unknown) => {
    if (!t && pctFallback == null) return
    const percentage = num(t?.percentage ?? pctFallback)
    const label = (t?.label ?? `${percentage}%`).trim()
    if (!label) return
    const verlegd = /verleg/i.test(label)
    const bouw7_id = t?.id ?? null
    const key = bouw7_id != null
      ? `id:${bouw7_id}`
      : `lbl:${label.toLowerCase()}|${percentage}|${verlegd}`
    if (!map.has(key)) map.set(key, { bouw7_id, label, percentage, verlegd })
  }
  for (const det of details) {
    for (const c of det.chapters ?? []) {
      for (const l of c.lines ?? []) add(l.vatTariffObject, l.vatTariffPercentage)
    }
    add(det.overheadsVatTariff)
    add(det.profitAndRisk != null ? det.profitAndRiskVatTariff : null)
  }
  return [...map.values()]
}

/**
 * Upsert afgeleide BTW-tarieven in `btw_tarieven`. Matcht bestaande rijen op Bouw7-id
 * (anders op label+percentage+verlegd) en werkt alleen de bron-velden bij — handmatige
 * 'eva'-rijen blijven ongemoeid behalve hun sync-timestamp.
 */
export async function upsertBtwTarieven(
  rows: AfgeleidBtwTarief[],
): Promise<{ nieuw: number; bijgewerkt: number }> {
  if (!rows.length) return { nieuw: 0, bijgewerkt: 0 }
  const supabase = db()
  const now = new Date().toISOString()

  const { data: bestaand } = await supabase
    .from('btw_tarieven')
    .select('id, bouw7_id, label, percentage, verlegd')
  const opId = new Map<number, string>()
  const opLabel = new Map<string, string>()
  for (const r of (bestaand ?? []) as Array<{ id: string; bouw7_id: number | null; label: string; percentage: number; verlegd: boolean }>) {
    if (r.bouw7_id != null) opId.set(r.bouw7_id, r.id)
    opLabel.set(`${r.label.toLowerCase()}|${Number(r.percentage)}|${r.verlegd}`, r.id)
  }

  let nieuw = 0
  let bijgewerkt = 0
  for (const r of rows) {
    const id = r.bouw7_id != null ? opId.get(r.bouw7_id) : undefined
    const idByLabel = opLabel.get(`${r.label.toLowerCase()}|${r.percentage}|${r.verlegd}`)
    const bestaandeId = id ?? idByLabel
    if (bestaandeId) {
      await supabase.from('btw_tarieven').update({
        label: r.label, percentage: r.percentage, verlegd: r.verlegd,
        bouw7_id: r.bouw7_id, actief: true, bron: 'bouw7',
        bouw7_laatst_sync: now, updated_at: now,
      }).eq('id', bestaandeId)
      bijgewerkt++
    } else {
      await supabase.from('btw_tarieven').insert({
        bouw7_id: r.bouw7_id, label: r.label, percentage: r.percentage, verlegd: r.verlegd,
        actief: true, bron: 'bouw7', bouw7_laatst_sync: now,
      })
      nieuw++
    }
  }
  return { nieuw, bijgewerkt }
}

/** Convenience: afleiden + upserten in één stap (gebruikt vanuit de project-sync). */
export async function deriveBtwTarieven(
  details: Bouw7QuotationDetail[],
): Promise<{ nieuw: number; bijgewerkt: number; gevonden: number }> {
  const rows = collectVatTariffs(details)
  const res = await upsertBtwTarieven(rows)
  return { ...res, gevonden: rows.length }
}

/* ── Uursoorten ───────────────────────────────────────────────────── */

export type AfgeleideUursoort = { bouw7_id: number; naam: string }

/** Verzamel de unieke uursoorten (hourType) uit een set uren-logs. */
export function collectHourTypes(logs: Bouw7EmployeeHourLog[]): AfgeleideUursoort[] {
  const map = new Map<number, AfgeleideUursoort>()
  for (const h of logs) {
    const t = h.type
    if (!t?.id) continue
    if (!map.has(t.id)) map.set(t.id, { bouw7_id: t.id, naam: (t.name ?? `Uursoort ${t.id}`).trim() })
  }
  return [...map.values()]
}

/**
 * Verrijk `planning_uursoorten` met uit Bouw7 afgeleide uursoorten. Volgorde:
 *  1. bestaat al op bouw7_id → bouw7_naam bijwerken;
 *  2. een handmatige EVA-uursoort met dezelfde naam (nog zonder bouw7_id) → koppelen;
 *  3. anders een nieuwe read-only uursoort (bron='bouw7') aanmaken.
 */
export async function upsertUursoortenVanBouw7(
  rows: AfgeleideUursoort[],
): Promise<{ nieuw: number; bijgewerkt: number; gekoppeld: number }> {
  if (!rows.length) return { nieuw: 0, bijgewerkt: 0, gekoppeld: 0 }
  const supabase = db()

  const { data: bestaand } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, code, bouw7_id, volgorde')
  type Row = { id: string; naam: string; code: string; bouw7_id: string | null; volgorde: number }
  const lijst = (bestaand ?? []) as Row[]
  const opBouw7 = new Map<string, Row>()
  const opNaam = new Map<string, Row>()
  let maxVolgorde = 0
  for (const r of lijst) {
    if (r.bouw7_id) opBouw7.set(r.bouw7_id, r)
    if (!r.bouw7_id) opNaam.set(r.naam.trim().toLowerCase(), r)
    if (r.volgorde > maxVolgorde) maxVolgorde = r.volgorde
  }
  const codes = new Set(lijst.map(r => r.code))

  let nieuw = 0, bijgewerkt = 0, gekoppeld = 0
  for (const r of rows) {
    const idKey = String(r.bouw7_id)
    const reeds = opBouw7.get(idKey)
    if (reeds) {
      if (reeds.naam !== r.naam) {
        await supabase.from('planning_uursoorten').update({ bouw7_naam: r.naam }).eq('id', reeds.id)
        bijgewerkt++
      }
      continue
    }
    const match = opNaam.get(r.naam.trim().toLowerCase())
    if (match) {
      await supabase.from('planning_uursoorten')
        .update({ bouw7_id: idKey, bouw7_naam: r.naam })
        .eq('id', match.id)
      opBouw7.set(idKey, { ...match, bouw7_id: idKey })
      gekoppeld++
      continue
    }
    let code = `B7-${r.bouw7_id}`
    while (codes.has(code)) code = `${code}_`
    codes.add(code)
    maxVolgorde += 1
    await supabase.from('planning_uursoorten').insert({
      naam: r.naam, code, bron: 'bouw7', bouw7_id: idKey, bouw7_naam: r.naam,
      volgorde: maxVolgorde,
    })
    nieuw++
  }
  return { nieuw, bijgewerkt, gekoppeld }
}

/** Convenience: afleiden + upserten van uursoorten uit een set uren-logs. */
export async function deriveUursoorten(
  logs: Bouw7EmployeeHourLog[],
): Promise<{ nieuw: number; bijgewerkt: number; gekoppeld: number }> {
  return upsertUursoortenVanBouw7(collectHourTypes(logs))
}
