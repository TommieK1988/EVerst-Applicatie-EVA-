/**
 * Bedrijfsbreed urenoverzicht (/uren onder Financieel).
 *
 * Live uit Bouw7 — `GET /list/hour-logs/employee` zónder projectfilter. Bewust geen sync naar
 * Supabase: accorderen gebeurt dagelijks in Bouw7 en een gesynchroniseerde kopie zou daar altijd
 * op achterlopen. Eén periode-call is klein genoeg (een maand ≈ 600 regels / 0,4 s; een heel jaar
 * ≈ 5.200 regels / 3 s, gemeten jul 2026).
 *
 * Let op: `?limit`/`?offset` worden door dit endpoint genegeerd (zie de toelichting bij
 * `Bouw7EmployeeHourLog`). Begrenzen gebeurt daarom via het `logDate`-filter.
 *
 * De bedragregel is bewust identiek aan `getDossierUren` in lib/dossiers/actions.ts, zodat het
 * overzicht en de dossier-Urentab nooit uit elkaar lopen.
 */
import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'
import type { UrenRegel } from '@/lib/dossiers/actions'
import { dossierHref } from '@/lib/dossiers/href'
import { periodeBereik, type UrenPeriode, type UrenExtraVelden } from './types'

export type UrenOverzichtRegel = UrenRegel & UrenExtraVelden

export type UrenOverzichtData = {
  beschikbaar: boolean
  regels: UrenOverzichtRegel[]
  totalen: { uren: number; bedrag: number }
  van: string
  tot: string
  /** Gevuld wanneer Bouw7 niet bereikbaar/geconfigureerd is — de pagina toont dit als lege staat. */
  fout: string | null
}

const num = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isNaN(n) ? 0 : n
}

type DossierRef = { id: string; dossiernummer: string | null; titel: string | null; hoofdstatus: string | null }

/**
 * Alle urenboekingen binnen een periode, verrijkt met het EVA-dossier achter het Bouw7-project.
 * Projecten zonder EVA-dossier vallen terug op het Bouw7-projectnummer + de projectnaam.
 */
export async function getAlleUren(periode: UrenPeriode): Promise<UrenOverzichtData> {
  const { van, tot } = periodeBereik(periode)
  const leeg: UrenOverzichtData = {
    beschikbaar: false, regels: [], totalen: { uren: 0, bedrag: 0 }, van, tot, fout: null,
  }

  let resp: Bouw7EmployeeHourLogResponse
  try {
    const client = await getBouw7Client()
    resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
      q: `logDate >= "${van}" AND logDate <= "${tot}" SORT(logDate, DESC)`,
    })
  } catch (e: unknown) {
    return { ...leeg, fout: e instanceof Error ? e.message : 'Bouw7 niet bereikbaar' }
  }

  const items = resp.items ?? []
  if (items.length === 0) return { ...leeg, beschikbaar: true }

  // Dossierkoppeling in één query: alleen de projecten die in deze periode voorkomen.
  const projectIds = [...new Set(items.map((h) => h.project?.id).filter((id): id is number => id != null))]
  const dossierPerProject = new Map<number, DossierRef>()
  if (projectIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, dossiernummer, titel, hoofdstatus')
      .in('bouw7_id', projectIds.map(String))
    for (const d of (data ?? []) as (DossierRef & { bouw7_id: string })[]) {
      const pid = Number(d.bouw7_id)
      if (!Number.isNaN(pid)) dossierPerProject.set(pid, d)
    }
  }

  const regels: UrenOverzichtRegel[] = items.map((h) => {
    const uren = num(h.hours)
    const tarief = h.hourlyRate != null ? num(h.hourlyRate) : null
    const bedrag = h.invoicedAmount != null && num(h.invoicedAmount) > 0
      ? num(h.invoicedAmount)
      : uren * (tarief ?? 0)
    const medewerker = [h.employee?.firstName, h.employee?.lastName].filter(Boolean).join(' ') || null
    const dossier = h.project?.id != null ? dossierPerProject.get(h.project.id) : undefined

    return {
      medewerker,
      datum: h.logDate ? h.logDate.slice(0, 10) : null,
      uren,
      uurtarief: tarief,
      uursoort: h.type?.name ?? null,
      code: h.projectSecurityLink?.code ?? null,
      codeNaam: h.projectSecurityLink?.name ?? h.projectSecurityLink?.parentName ?? null,
      bedrag,
      bouw7Id: h.id,
      bouw7ProjectId: h.project?.id ?? null,
      hourTypeId: h.type?.id ?? null,

      dossierId: dossier?.id ?? null,
      dossierNummer: dossier?.dossiernummer ?? h.project?.number ?? null,
      dossierTitel: dossier?.titel ?? h.project?.name ?? null,
      dossierHref: dossier ? dossierHref(dossier.id, dossier.hoofdstatus) : null,
      projectNummer: h.project?.number ?? null,
      projectNaam: h.project?.name ?? null,
      projectleider: h.project?.projectLeaderName ?? null,
      geaccordeerd: h.isApproved === true,
      geaccordeerdDoor: h.approvedBy?.username ?? null,
      geaccordeerdOp: h.approvedAt ? h.approvedAt.slice(0, 10) : null,
      extern: h.isExternal === true,
      opmerking: h.comment?.trim() ? h.comment.trim() : null,
    }
  })

  return {
    beschikbaar: true,
    regels,
    totalen: {
      uren: resp.totalHours != null ? num(resp.totalHours) : regels.reduce((s, r) => s + r.uren, 0),
      bedrag: resp.totalCost != null ? num(resp.totalCost) : regels.reduce((s, r) => s + r.bedrag, 0),
    },
    van,
    tot,
    fout: null,
  }
}
