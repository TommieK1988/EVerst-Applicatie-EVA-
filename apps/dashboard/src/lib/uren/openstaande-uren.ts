import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Client, Bouw7EmployeeHourLog, Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'

/**
 * De openstaande (niet-goedgekeurde) uren uit Bouw7 ophalen, verrijkt met de
 * EVA-medewerker, het EVA-dossier en de tussenstand van de goedkeuring.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS. Dit hoorde eerst in `bouw7-goedkeuring.ts`, en
 * dat is een `'use server'`-module: élke geëxporteerde functie daarin is een server
 * action en dus vanuit de browser aan te roepen door iedereen die het action-id
 * kent. Deze functie leest met de service-role en eist zelf geen sessie — daar
 * hoort ze dus niet, en de schuldteller wees daar terecht op.
 *
 * Wie hem aanroept is verantwoordelijk voor de afscherming:
 *   * `getOpenstaandeUren` (de action) eist een sessie en delegeert hierheen;
 *   * `getMijnTeKeurenUren` snijdt het resultaat daarna op de projectrollen van de
 *     ingelogde gebruiker;
 *   * de dagsignalen-cron draait namens niemand en verdeelt zelf per medewerker.
 *
 * Voeg hier dus geen importen naar `revalidatePath` of sessie-helpers toe: dit is
 * een leeslaag, geen actie.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }

export type OpenUurRegel = {
  /** Bouw7 hour-log-id; tevens de sleutel in uren_bouw7_beoordeling. */
  id: number
  datum: string
  uren: number
  uurtarief: number | null
  bedrag: number
  uursoort: string | null
  uursoortId: number | null
  opmerking: string | null
  extern: boolean

  medewerkerNaam: string
  /** Null als deze Bouw7-medewerker geen tegenhanger in EVA heeft. */
  medewerkerId: string | null

  projectNummer: string | null
  projectNaam: string | null
  bouw7ProjectId: number | null
  /** Null als EVA dit Bouw7-project niet kent. */
  dossierId: string | null
  /** Projectrol op het dossier -- niet de teamleider van de ploeg van de medewerker. */
  teamleiderId: string | null
  teamleiderNaam: string | null
  projectleiderId: string | null
  projectleiderNaam: string | null
  bewakingscode: string | null
  bouw7PslId: number | null

  /** Wat er in EVA al mee gebeurd is. */
  tlAkkoord: boolean
  plAkkoord: boolean
  gecorrigeerd: boolean
  /** Wachtwoord voor de UI: waar deze regel op wacht. */
  status: 'wacht_op_teamleider' | 'wacht_op_projectleider' | 'niet_toe_te_wijzen'
}

export type OpenUrenResultaat = {
  regels: OpenUurRegel[]
  totaalUren: number
  van: string
  tot: string
  /** Fail-soft: Bouw7 onbereikbaar mag het scherm niet slopen. */
  fout: string | null
}


/**
 * Alle niet-goedgekeurde uren in een periode.
 *
 * Pagineren met OFFSET, niet met PAGE: dat laatste geeft op dit endpoint een 400, en een genegeerde
 * 400 leverde hier eerder stilletjes nul rijen op.
 *
 * Fail-soft: is Bouw7 niet bereikbaar, dan komt dat als `fout` terug en niet als exception —
 * de schermen hieromheen mogen daar niet op omvallen.
 */
export async function haalOpenstaandeUren(
  van: string,
  tot: string,
  ids?: number[],
): Promise<OpenUrenResultaat> {
  const leeg: OpenUrenResultaat = { regels: [], totaalUren: 0, van, tot, fout: null }

  let logs: Bouw7EmployeeHourLog[] = []
  try {
    const client = await getBouw7Client()
    if (ids && ids.length > 0) {
      const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
        q: `isApproved = false AND id IN (${ids.join(',')}) LIMIT ${Math.max(ids.length, 1)}`,
      })
      logs = res?.items ?? []
    } else {
      logs = await haalAlleOpenUren(client, van, tot)
    }
  } catch (e) {
    return { ...leeg, fout: e instanceof Error ? e.message : 'Bouw7 is niet bereikbaar.' }
  }
  if (!logs.length) return leeg

  const supabase = db()
  const employeeIds = [...new Set(logs.map(l => l.employee?.id).filter(Boolean))].map(String)
  const projectIds = [...new Set(logs.map(l => l.project?.id).filter(Boolean))].map(String)

  const [{ data: medewerkers }, { data: dossiers }, { data: beoordelingen }] = await Promise.all([
    supabase.from('medewerkers').select('id, bouw7_id').in('bouw7_id', employeeIds),
    supabase
      .from('dossiers')
      .select('id, bouw7_id, dossiernummer, titel, project_manager_id, teamleider_id, projectleider:medewerkers!dossiers_project_manager_id_fkey(voornaam, tussenvoegsel, achternaam), teamleider:medewerkers!dossiers_teamleider_id_fkey(voornaam, tussenvoegsel, achternaam)')
      .in('bouw7_id', projectIds),
    supabase
      .from('uren_bouw7_beoordeling')
      .select('bouw7_hour_log_id, tl_akkoord_op, pl_akkoord_op, gecorrigeerd_op')
      .in('bouw7_hour_log_id', logs.map(l => l.id)),
  ])

  const medMap = new Map<string, string>(
    ((medewerkers ?? []) as Array<{ id: string; bouw7_id: string }>).map(m => [m.bouw7_id, m.id]),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dosMap = new Map<string, any>(((dossiers ?? []) as any[]).map(d => [String(d.bouw7_id), d]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beoMap = new Map<number, any>(((beoordelingen ?? []) as any[]).map(b => [Number(b.bouw7_hour_log_id), b]))

  const regels: OpenUurRegel[] = logs.map(l => {
    const dossier = l.project?.id != null ? dosMap.get(String(l.project.id)) : undefined
    const medewerkerId = l.employee?.id != null ? (medMap.get(String(l.employee.id)) ?? null) : null
    const b = beoMap.get(l.id)
    const uren = num(l.hours)
    const tarief = l.hourlyRate != null ? num(l.hourlyRate) : null
    const pl = dossier?.projectleider
    const tl = dossier?.teamleider
    const teamleiderId = dossier?.teamleider_id ?? null
    const projectleiderId = dossier?.project_manager_id ?? null

    const tlAkkoord = !!b?.tl_akkoord_op
    const plAkkoord = !!b?.pl_akkoord_op
    // Staat er niemand op het dossier, dan kan EVA de regel nergens heen sturen. Die verdwijnt niet
    // stilletijk maar komt apart in beeld, zodat iemand de rollen kan invullen of hem alsnog in
    // Bouw7 kan afhandelen.
    const status: OpenUurRegel['status'] =
      !teamleiderId && !projectleiderId ? 'niet_toe_te_wijzen'
      : teamleiderId && !tlAkkoord ? 'wacht_op_teamleider'
      : 'wacht_op_projectleider'

    return {
      id: l.id,
      datum: l.logDate?.slice(0, 10) ?? '',
      uren,
      uurtarief: tarief,
      bedrag: l.invoicedAmount != null && num(l.invoicedAmount) > 0 ? num(l.invoicedAmount) : uren * (tarief ?? 0),
      uursoort: l.type?.name ?? null,
      uursoortId: l.type?.id ?? null,
      opmerking: l.comment?.trim() || null,
      extern: l.isExternal === true,
      medewerkerNaam: [l.employee?.firstName, l.employee?.lastName].filter(Boolean).join(' ') || '—',
      medewerkerId,
      projectNummer: l.project?.number ?? null,
      projectNaam: l.project?.name ?? null,
      bouw7ProjectId: l.project?.id ?? null,
      dossierId: dossier?.id ?? null,
      teamleiderId,
      teamleiderNaam: tl ? [tl.voornaam, tl.tussenvoegsel, tl.achternaam].filter(Boolean).join(' ') : null,
      projectleiderId,
      projectleiderNaam: pl
        ? [pl.voornaam, pl.tussenvoegsel, pl.achternaam].filter(Boolean).join(' ')
        : (l.project?.projectLeaderName ?? null),
      bewakingscode: l.projectSecurityLink?.code ?? null,
      bouw7PslId: l.projectSecurityLink?.id ?? null,
      tlAkkoord,
      plAkkoord,
      gecorrigeerd: !!b?.gecorrigeerd_op,
      status,
    }
  })

  return {
    regels,
    totaalUren: Math.round(regels.reduce((s, r) => s + r.uren, 0) * 100) / 100,
    van, tot, fout: null,
  }
}

/** Pagineert met OFFSET; PAGE bestaat niet op dit endpoint. */
async function haalAlleOpenUren(
  client: Bouw7Client, van: string, tot: string,
): Promise<Bouw7EmployeeHourLog[]> {
  const PER_KEER = 500
  const alles: Bouw7EmployeeHourLog[] = []
  for (let offset = 0; offset < 20_000; offset += PER_KEER) {
    const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
      q: `isApproved = false AND logDate >= "${van}" AND logDate <= "${tot}" SORT(logDate, DESC) OFFSET ${offset} LIMIT ${PER_KEER}`,
    })
    const items = res?.items ?? []
    alles.push(...items)
    if (items.length < PER_KEER) break
  }
  return alles
}
