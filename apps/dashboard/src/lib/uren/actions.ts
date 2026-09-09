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
import { leesGlobaleBron } from '@/lib/bouw7/snapshot'
import type { UrenVensterPayload } from '@/lib/bouw7/snapshot-bronnen'
import type { UrenRegel } from '@/lib/dossiers/actions'
import { dossierHref } from '@/lib/dossiers/href'
import { periodeBereik, type UrenPeriode, type UrenExtraVelden } from './types'

/** `id` is de Bouw7 hour-log-id als string — OverzichtTabel eist een stabiele stringsleutel. */
export type UrenOverzichtRegel = UrenRegel & UrenExtraVelden & { id: string }

export type UrenOverzichtData = {
  beschikbaar: boolean
  regels: UrenOverzichtRegel[]
  totalen: { uren: number; bedrag: number }
  van: string
  tot: string
  /** De periode valt (deels) vóór de bewaarde stand; het overzicht zou onvolledig zijn. */
  buitenVenster?: boolean
  /** Gevuld wanneer Bouw7 niet bereikbaar/geconfigureerd is — de pagina toont dit als lege staat. */
  fout: string | null
}

const num = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isNaN(n) ? 0 : n
}

type DossierRef = {
  id: string; dossiernummer: string | null; titel: string | null; hoofdstatus: string | null
  /** Projectrollen; bepalen wie de uren op dit dossier mag goedkeuren. */
  project_manager_id: string | null; teamleider_id: string | null
}

/**
 * Alle urenboekingen binnen een periode, verrijkt met het EVA-dossier achter het Bouw7-project.
 * Projecten zonder EVA-dossier vallen terug op het Bouw7-projectnummer + de projectnaam.
 */
export async function getAlleUren(periode: UrenPeriode): Promise<UrenOverzichtData> {
  const gevraagd = periodeBereik(periode)
  const leeg: UrenOverzichtData = {
    beschikbaar: false, regels: [], totalen: { uren: 0, bedrag: 0 },
    van: gevraagd.van, tot: gevraagd.tot, fout: null,
  }

  // Uit het bewaarde urenvenster; dat beslaat het lopende jaar (en minimaal dertien weken) en
  // wordt door de cron bijgehouden. Vroeger deed elk paginabezoek en elke periodewissel hier een
  // bedrijfsbrede Bouw7-call van enkele seconden.
  const venster = (await leesGlobaleBron<UrenVensterPayload>('uren_venster')).data
  if (!venster) {
    return { ...leeg, fout: 'De urenstand is nog niet opgehaald uit Bouw7.' }
  }

  // `te_keuren` vraagt niet om een periode maar om de hele stapel: neem het venster zoals het is.
  // De grenzen zelf uitrekenen zou hier misgaan -- `urenVenster()` rekent in UTC en deze functie
  // in lokale tijd, en één dag verschil zou de melding hieronder ten onrechte laten afgaan.
  const van = periode === 'te_keuren' ? venster.van : gevraagd.van
  const tot = periode === 'te_keuren' ? venster.tot : gevraagd.tot

  // Valt de gevraagde periode (deels) vóór het venster, dan zou filteren een te laag totaal geven.
  // Dat eerlijk melden is beter dan een onvolledig overzicht dat er compleet uitziet.
  if (van < venster.van) {
    return { ...leeg, buitenVenster: true, fout: `Deze periode valt vóór de bewaarde stand (vanaf ${venster.van}).` }
  }

  const items = venster.items.filter((h) => {
    const d = h.logDate ? h.logDate.slice(0, 10) : null
    return d != null && d >= van && d <= tot
  })
  if (items.length === 0) return { ...leeg, van, tot, beschikbaar: true }

  // Dossierkoppeling in één query: alleen de projecten die in deze periode voorkomen.
  const projectIds = [...new Set(items.map((h) => h.project?.id).filter((id): id is number => id != null))]
  const dossierPerProject = new Map<number, DossierRef>()
  if (projectIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, dossiernummer, titel, hoofdstatus, project_manager_id, teamleider_id')
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
      id: String(h.id),
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
      teamleiderId: dossier?.teamleider_id ?? null,
      projectleiderId: dossier?.project_manager_id ?? null,
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
    // Altijd zelf optellen: het venster beslaat meer dan de gevraagde periode, dus de totalen
    // die Bouw7 bij de respons meestuurt gaan over een andere set regels dan hier getoond wordt.
    totalen: {
      uren: regels.reduce((s, r) => s + r.uren, 0),
      bedrag: regels.reduce((s, r) => s + r.bedrag, 0),
    },
    van,
    tot,
    fout: null,
  }
}
