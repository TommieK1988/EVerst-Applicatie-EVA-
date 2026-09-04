'use server'

// Goedkeuren van uren die in Bouw7 zijn ingevoerd.
//
// De EVA-weekstaat heeft zijn eigen keten (lib/uren/goedkeuring.ts), maar die werkt alleen op weken
// die via EVA zijn ingediend. Alle uren die er nu zijn komen uit Bouw7 zelf. Dit bestand maakt die
// alsnog te accorderen, zodat er steeds minder in Bouw7 hoeft te gebeuren.
//
// WIE MAG WAT. Bouw7 legt niet vast wie moet goedkeuren -- het kent alleen de vlag `isApproved`, en
// achteraf wie hem omzette. Er zijn ook geen goedkeuring-endpoints voor uren (/list/approvals geeft
// 404; die bestaan alleen voor contracten en inkoopfacturen). EVA bepaalt de routering dus zelf,
// en wel uit de PROJECTROLLEN OP HET DOSSIER waarop de uren geboekt zijn -- `dossiers.teamleider_id`
// en `dossiers.project_manager_id`. Dus niet uit de ploeg van de medewerker: wie de uren kan
// beoordelen hangt af van het werk, niet van waar iemand organisatorisch hangt.
//
//   dossier heeft een teamleider    -> eerst hij, daarna de projectleider
//   dossier heeft geen teamleider   -> meteen naar de projectleider, zonder tussenstop
//   teamleider akkoord + geen projectleider -> approved = true (hij is dan eindstation)
//   projectleider akkoord           -> approved = true, ook zonder teamleider
//   projectleider trekt in          -> approved = false
//
// De projectleider overruled de teamleider dus altijd, in beide richtingen. Er is bewust GEEN
// terugval op een ploegteamleider of op Directie: staat er niemand op het dossier, dan is het de
// projectleider, en staat ook die er niet dan hoort de regel bij "niet toe te wijzen" in plaats van
// op het bureau van iemand die er niets mee te maken heeft.
//
// VOLLEDIGE BODY BIJ ELKE SCHRIJFACTIE. `POST /project/hour-log` is een upsert, en het is niet
// gedocumenteerd of niet-meegestuurde velden blijven staan of leeggemaakt worden. De bestaande
// `updateUurlogBewakingscode` stuurt alleen een handvol velden mee en is daarmee een open risico
// (in productie nooit gebruikt, dus ook nooit gebleken). Hier lezen we daarom eerst de hele regel
// en sturen die compleet terug. Dat is veilig ongeacht hoe Bouw7 het bedoelt, en kost één extra
// GET per regel -- verwaarloosbaar tegenover een leeggemaakte medewerker of een verdwenen tarief.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Client, Bouw7EmployeeHourLog, Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'

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

/* ── Ophalen ──────────────────────────────────────────────────────── */

/**
 * Alle niet-goedgekeurde uren uit Bouw7 in een periode, verrijkt met de EVA-medewerker, het
 * EVA-dossier en de tussenstand van de goedkeuring.
 *
 * Pagineren met OFFSET, niet met PAGE: dat laatste geeft op dit endpoint een 400, en een genegeerde
 * 400 leverde hier eerder stilletjes nul rijen op.
 */
export async function getOpenstaandeUren(van: string, tot: string): Promise<OpenUrenResultaat> {
  await vereisSessie()
  const leeg: OpenUrenResultaat = { regels: [], totaalUren: 0, van, tot, fout: null }

  let logs: Bouw7EmployeeHourLog[] = []
  try {
    const client = await getBouw7Client()
    logs = await haalAlleOpenUren(client, van, tot)
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

/**
 * Wat er voor mij te doen is, bepaald door de projectrollen op het dossier: de regels waarop ik
 * teamleider ben en waar de teamleider nog niet naar gekeken heeft, plus alle regels op dossiers
 * waar ik projectleider van ben.
 *
 * Staat er geen teamleider op het dossier, dan slaat de regel die stap gewoon over en wacht hij
 * meteen op de projectleider -- er is bewust geen terugval naar een ploegteamleider of Directie.
 */
export async function getMijnTeKeurenUren(van: string, tot: string): Promise<{
  alsTeamleider: OpenUurRegel[]
  alsProjectleider: OpenUurRegel[]
  nietToeTeWijzen: OpenUurRegel[]
  fout: string | null
}> {
  const ik = await vereisSessie()
  const res = await getOpenstaandeUren(van, tot)
  if (res.fout) return { alsTeamleider: [], alsProjectleider: [], nietToeTeWijzen: [], fout: res.fout }

  const alsTeamleider: OpenUurRegel[] = []
  const alsProjectleider: OpenUurRegel[] = []
  const nietToeTeWijzen: OpenUurRegel[] = []

  for (const r of res.regels) {
    if (r.status === 'niet_toe_te_wijzen') { nietToeTeWijzen.push(r); continue }
    // De projectleider mag altijd, ook voordat de teamleider heeft gekeken -- hij overruled.
    if (r.projectleiderId === ik.id && !r.plAkkoord) alsProjectleider.push(r)
    if (r.teamleiderId === ik.id && !r.tlAkkoord && !r.plAkkoord) alsTeamleider.push(r)
  }
  return { alsTeamleider, alsProjectleider, nietToeTeWijzen, fout: null }
}

/* ── Schrijven ────────────────────────────────────────────────────── */

/**
 * Leest de uurregel opnieuw uit Bouw7 en stuurt hem compleet terug met de gevraagde wijzigingen.
 *
 * Read-modify-write met de volledige veldenset, omdat niet vaststaat of Bouw7 een upsert als
 * gedeeltelijke wijziging of als volledige vervanging behandelt. Zo maakt het niet uit.
 */
async function schrijfHourLog(
  client: Bouw7Client,
  hourLogId: number,
  wijziging: {
    approved?: boolean
    logHours?: string
    hourTypeId?: number
    pslId?: number | null
    comments?: string
  },
): Promise<{ ok: true; voor: Bouw7EmployeeHourLog } | { ok: false; error: string }> {
  const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `id = ${hourLogId} LIMIT 1`,
  })
  const voor = (res?.items ?? [])[0]
  if (!voor) return { ok: false, error: 'Deze uurregel bestaat niet meer in Bouw7.' }
  if (voor.isMutable === false) return { ok: false, error: 'Deze uurregel is in Bouw7 vergrendeld.' }
  if (!voor.project?.id || !voor.employee?.id || !voor.type?.id || !voor.logDate) {
    return { ok: false, error: 'De uurregel in Bouw7 mist gegevens die nodig zijn om hem bij te werken.' }
  }

  const pslId = wijziging.pslId !== undefined ? wijziging.pslId : (voor.projectSecurityLink?.id ?? null)
  const opmerking = wijziging.comments !== undefined ? wijziging.comments : (voor.comment ?? '')

  await client.post('/project/hour-log', {
    id: hourLogId,
    project: { id: voor.project.id },
    employee: { id: voor.employee.id },
    hourType: { id: wijziging.hourTypeId ?? voor.type.id },
    logDate: voor.logDate.slice(0, 10),
    logHours: wijziging.logHours ?? String(voor.hours ?? '0'),
    ...(pslId ? { projectSecurityLink: { id: pslId } } : {}),
    ...(opmerking ? { comments: opmerking } : {}),
    ...(voor.hourlyRate != null ? { hourlyRate: String(voor.hourlyRate) } : {}),
    approved: wijziging.approved ?? voor.isApproved === true,
  })
  return { ok: true, voor }
}

/** Zorgt dat de tussenstand-rij bestaat en werkt hem bij. */
async function bewaarBeoordeling(
  hourLogId: number,
  regel: Pick<OpenUurRegel, 'medewerkerId' | 'dossierId' | 'datum'>,
  patch: Record<string, unknown>,
) {
  await db().from('uren_bouw7_beoordeling').upsert({
    bouw7_hour_log_id: hourLogId,
    medewerker_id: regel.medewerkerId,
    dossier_id: regel.dossierId,
    log_datum: regel.datum || null,
    ...patch,
  }, { onConflict: 'bouw7_hour_log_id' })
}

export type KeurResultaat =
  | { ok: true; verwerkt: number; naarBouw7: number; wachtOpProjectleider: number; mislukt: number; fouten: string[] }
  | { ok: false; error: string }

/**
 * Keurt uren goed in de rol die je op het betreffende dossier hebt.
 *
 * Bewust geen rolkeuze in de interface: welke pet je op hebt volgt uit het dossier, niet uit iets
 * wat de gebruiker moet aanvinken. Per regel:
 *
 *   ik ben teamleider  -> akkoord; naar Bouw7 alleen als er geen projectleider is
 *   ik ben projectleider -> akkoord en naar Bouw7, ook zonder teamleider (hij overruled)
 *
 * Regels waar ik geen van beide ben worden overgeslagen -- de autorisatie zit hier, niet in het
 * scherm, want een meegestuurde lijst id's zegt niets over wie ze mag beoordelen.
 */
export async function keurUrenGoed(hourLogIds: number[]): Promise<KeurResultaat> {
  const ik = await vereisSessie()
  if (!hourLogIds.length) return { ok: false, error: 'Geen uren geselecteerd.' }

  const jaar = new Date().getFullYear()
  const mijn = await getMijnTeKeurenUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`)
  if (mijn.fout) return { ok: false, error: mijn.fout }

  const gevraagd = new Set(hourLogIds)
  const alsPl = mijn.alsProjectleider.filter(r => gevraagd.has(r.id))
  const plIds = new Set(alsPl.map(r => r.id))
  // Ben ik toevallig allebei, dan telt de projectleider-rol: die is beslissend.
  const alsTl = mijn.alsTeamleider.filter(r => gevraagd.has(r.id) && !plIds.has(r.id))
  if (!alsPl.length && !alsTl.length) {
    return { ok: false, error: 'Geen van deze uren staat op jouw akkoord.' }
  }

  const client = await getBouw7Client()
  const nu = new Date().toISOString()
  let naarBouw7 = 0, wachtOpProjectleider = 0, mislukt = 0
  const fouten: string[] = []

  const stuur = async (r: OpenUurRegel) => {
    const res = await schrijfHourLog(client, r.id, { approved: true }).catch(e => ({
      ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.',
    }))
    if (!res.ok) {
      mislukt++
      fouten.push(`${r.datum} ${r.medewerkerNaam}: ${res.error}`)
    } else naarBouw7++
    return res.ok
  }

  for (const r of alsPl) {
    const gelukt = await stuur(r)
    await bewaarBeoordeling(r.id, r, gelukt ? {
      pl_akkoord_op: nu, pl_akkoord_door: ik.id,
      ingetrokken_op: null, ingetrokken_door: null, ingetrokken_reden: null,
      bouw7_status: 'verzonden', bouw7_fout: null,
    } : { bouw7_status: 'fout', bouw7_fout: fouten[fouten.length - 1] ?? null })
  }

  for (const r of alsTl) {
    // Zonder projectleider is de teamleider het eindstation; anders wacht de regel nog op hem.
    const eindstation = !r.projectleiderId
    const gelukt = eindstation ? await stuur(r) : true
    if (!eindstation) wachtOpProjectleider++
    await bewaarBeoordeling(r.id, r, {
      tl_akkoord_op: nu, tl_akkoord_door: ik.id,
      bouw7_status: eindstation ? (gelukt ? 'verzonden' : 'fout') : 'niet_verzonden',
      bouw7_fout: eindstation && !gelukt ? (fouten[fouten.length - 1] ?? null) : null,
    })
  }

  revalidatePath('/uren')
  return { ok: true, verwerkt: alsPl.length + alsTl.length, naarBouw7, wachtOpProjectleider, mislukt, fouten }
}

/**
 * De projectleider trekt een goedkeuring in. Ook een akkoord van de teamleider vervalt daarmee --
 * de projectleider overruled in beide richtingen.
 */
export async function trekGoedkeuringIn(
  hourLogId: number, reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ik = await vereisSessie()
  if (!reden.trim()) return { ok: false, error: 'Geef aan waarom je de goedkeuring intrekt.' }

  // De regel staat op goedgekeurd en valt dus buiten de openstaande lijst; los ophalen dus.
  const client = await getBouw7Client()
  const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `id = ${hourLogId} LIMIT 1`,
  })
  const log = (res?.items ?? [])[0]
  if (!log) return { ok: false, error: 'Deze uurregel bestaat niet meer in Bouw7.' }

  const supabase = db()
  const { data: dossier } = await supabase
    .from('dossiers').select('id, project_manager_id').eq('bouw7_id', String(log.project?.id)).maybeSingle()
  if (!dossier || dossier.project_manager_id !== ik.id) {
    return { ok: false, error: 'Alleen de projectleider van dit project kan een goedkeuring intrekken.' }
  }

  const schrijf = await schrijfHourLog(client, hourLogId, { approved: false }).catch(e => ({
    ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.',
  }))
  if (!schrijf.ok) return { ok: false, error: schrijf.error }

  const { data: mw } = await supabase
    .from('medewerkers').select('id, auth_user_id').eq('bouw7_id', String(log.employee?.id)).maybeSingle()

  await bewaarBeoordeling(hourLogId, {
    medewerkerId: mw?.id ?? null,
    dossierId: dossier.id,
    datum: log.logDate?.slice(0, 10) ?? '',
  }, {
    tl_akkoord_op: null, tl_akkoord_door: null,
    pl_akkoord_op: null, pl_akkoord_door: null,
    ingetrokken_op: new Date().toISOString(), ingetrokken_door: ik.id, ingetrokken_reden: reden.trim(),
    bouw7_status: 'verzonden', bouw7_fout: null,
  })

  if (mw?.auth_user_id) {
    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'uren',
      titel: 'Goedkeuring van je uren ingetrokken',
      body: `${log.logDate?.slice(0, 10)} · ${log.hours} uur — ${reden.trim()}`,
      url: '/m/uren',
    }).catch(() => { /* melding is bijzaak */ })
  }

  return { ok: true }
}

/**
 * De goedkeurder past de regel zelf aan in plaats van hem af te keuren -- Bouw7 kent geen
 * afgekeurd-status, en heen-en-weer sturen kost alleen tijd. De medewerker krijgt bericht van wat
 * er is gewijzigd en door wie; de oude waarden blijven bewaard, want Bouw7 houdt alleen de nieuwe
 * stand bij.
 */
export async function corrigeerUurregel(
  hourLogId: number,
  wijziging: { uren?: number; bewakingscodePslId?: number | null; opmerking?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ik = await vereisSessie()
  const jaar = new Date().getFullYear()
  const mijn = await getMijnTeKeurenUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`)
  if (mijn.fout) return { ok: false, error: mijn.fout }

  const regel = [...mijn.alsTeamleider, ...mijn.alsProjectleider].find(r => r.id === hourLogId)
  if (!regel) return { ok: false, error: 'Deze uurregel staat niet op jouw akkoord.' }
  if (wijziging.uren !== undefined && !(wijziging.uren > 0 && wijziging.uren <= 24)) {
    return { ok: false, error: 'Vul een aantal uren tussen 0 en 24 in.' }
  }

  const client = await getBouw7Client()
  const res = await schrijfHourLog(client, hourLogId, {
    ...(wijziging.uren !== undefined ? { logHours: String(wijziging.uren) } : {}),
    ...(wijziging.bewakingscodePslId !== undefined ? { pslId: wijziging.bewakingscodePslId } : {}),
    ...(wijziging.opmerking !== undefined ? { comments: wijziging.opmerking } : {}),
  }).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.' }))
  if (!res.ok) return { ok: false, error: res.error }

  await bewaarBeoordeling(hourLogId, regel, {
    gecorrigeerd_op: new Date().toISOString(),
    gecorrigeerd_door: ik.id,
    oorspronkelijke_waarden: {
      uren: num(res.voor.hours),
      bewakingscode: res.voor.projectSecurityLink?.code ?? null,
      opmerking: res.voor.comment ?? null,
    },
    bouw7_status: 'verzonden', bouw7_fout: null,
  })

  if (regel.medewerkerId) {
    const { data: mw } = await db()
      .from('medewerkers').select('auth_user_id').eq('id', regel.medewerkerId).maybeSingle()
    if (mw?.auth_user_id) {
      const wat: string[] = []
      if (wijziging.uren !== undefined && wijziging.uren !== num(res.voor.hours)) {
        wat.push(`uren ${num(res.voor.hours)} → ${wijziging.uren}`)
      }
      if (wijziging.bewakingscodePslId !== undefined) wat.push('bewakingscode aangepast')
      if (wijziging.opmerking !== undefined) wat.push('opmerking aangepast')
      await maakNotificatie({
        user_id: mw.auth_user_id,
        type: 'uren',
        titel: 'Je uren zijn aangepast',
        body: `${regel.datum} · ${regel.projectNummer ?? regel.projectNaam ?? ''} — ${wat.join(', ') || 'gecorrigeerd'}`,
        url: '/m/uren',
      }).catch(() => { /* melding is bijzaak */ })
    }
  }

  return { ok: true }
}
