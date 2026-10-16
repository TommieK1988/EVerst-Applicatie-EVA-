import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Database } from '@everts/database'
import type { Bouw7Client, Bouw7EmployeeHourLog, Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'
import { haalOpenstaandeUren, type OpenUurRegel } from './openstaande-uren'
import { bewerkrecht, bewerkrechtUitleg } from './bewerkrecht'

/**
 * Schrijven naar de Bouw7-urenadministratie vanuit de goedkeuring: een bestaande regel bijwerken,
 * een nieuwe aanmaken, en de tussenstand in `uren_bouw7_beoordeling` bijhouden.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS. Dit stond in `bouw7-goedkeuring.ts`, en dat is een
 * `'use server'`-module: alles wat daar geëxporteerd wordt is een server action, vanuit de
 * browser aan te roepen. Deze functies eisen zelf geen sessie en schrijven rechtstreeks naar
 * Bouw7 -- die horen dus niet aan de buitenkant. Zowel het corrigeren als het splitsen gebruikt
 * ze, en elk van die acties doet eerst zijn eigen sessie- en rechtentoets.
 */

const db = () => createAdminClient()

/** Wat er op een tussenstand-rij gezet kan worden; de sleutelvelden vult `bewaarBeoordeling` zelf. */
export type BeoordelingPatch = Omit<
  Database['public']['Tables']['uren_bouw7_beoordeling']['Update'],
  'bouw7_hour_log_id' | 'medewerker_id' | 'dossier_id' | 'log_datum'
>

async function leesHourLog(client: Bouw7Client, hourLogId: number): Promise<Bouw7EmployeeHourLog | null> {
  const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `id = ${hourLogId} LIMIT 1`,
  })
  return (res?.items ?? [])[0] ?? null
}

/**
 * Leest de uurregel opnieuw uit Bouw7 en stuurt hem compleet terug met de gevraagde wijzigingen.
 *
 * Read-modify-write met de volledige veldenset, omdat niet vaststaat of Bouw7 een upsert als
 * gedeeltelijke wijziging of als volledige vervanging behandelt. Zo maakt het niet uit.
 */
export async function schrijfHourLog(
  client: Bouw7Client,
  hourLogId: number,
  wijziging: {
    approved?: boolean
    logHours?: string
    hourTypeId?: number
    /** Bouw7-project waar de regel naartoe moet. Weglaten = laten staan waar hij staat. */
    projectId?: number
    pslId?: number | null
    comments?: string
  },
): Promise<{ ok: true; voor: Bouw7EmployeeHourLog } | { ok: false; error: string }> {
  const voor = await leesHourLog(client, hourLogId)
  if (!voor) return { ok: false, error: 'Deze uurregel bestaat niet meer in Bouw7.' }
  if (voor.isMutable === false) return { ok: false, error: 'Deze uurregel is in Bouw7 vergrendeld.' }
  if (!voor.project?.id || !voor.employee?.id || !voor.type?.id || !voor.logDate) {
    return { ok: false, error: 'De uurregel in Bouw7 mist gegevens die nodig zijn om hem bij te werken.' }
  }

  const projectId = wijziging.projectId ?? voor.project.id
  const hourTypeId = wijziging.hourTypeId ?? voor.type.id
  const naarAnderProject = projectId !== voor.project.id
  const andereUursoort = hourTypeId !== voor.type.id

  // Een bewakingscode hoort bij één project. Verhuist de regel, dan mag de oude code niet mee:
  // wie een code op het nieuwe dossier wil, stuurt die expliciet mee.
  const pslId = wijziging.pslId !== undefined ? wijziging.pslId
    : naarAnderProject ? null
    : (voor.projectSecurityLink?.id ?? null)
  const opmerking = wijziging.comments !== undefined ? wijziging.comments : (voor.comment ?? '')

  await client.post('/project/hour-log', {
    id: hourLogId,
    project: { id: projectId },
    employee: { id: voor.employee.id },
    hourType: { id: hourTypeId },
    logDate: voor.logDate.slice(0, 10),
    logHours: wijziging.logHours ?? String(voor.hours ?? '0'),
    ...(pslId ? { projectSecurityLink: { id: pslId } } : {}),
    ...(opmerking ? { comments: opmerking } : {}),
    // Het uurtarief hoort bij de combinatie project × uursoort. Verandert een van die twee, dan
    // laten we Bouw7 het opnieuw bepalen in plaats van het oude bedrag mee te slepen -- dat is
    // dezelfde route als de weekstaat, die nooit zelf een tarief meestuurt.
    ...(voor.hourlyRate != null && !naarAnderProject && !andereUursoort
      ? { hourlyRate: String(voor.hourlyRate) }
      : {}),
    approved: wijziging.approved ?? voor.isApproved === true,
  })

  // Verhuizen en van uursoort wisselen lezen we terug. Een upsert die zo'n veld stilzwijgend
  // negeert zou anders als geslaagd gemeld worden terwijl de uren op het oude project blijven --
  // en dan is er niets te zien behalve een tevreden melding.
  if (naarAnderProject || andereUursoort) {
    const na = await leesHourLog(client, hourLogId)
    if (!na) return { ok: false, error: 'Bouw7 gaf de bijgewerkte uurregel niet terug.' }
    if (naarAnderProject && na.project?.id !== projectId) {
      return { ok: false, error: 'Bouw7 heeft de uren niet naar het andere dossier verplaatst.' }
    }
    if (andereUursoort && na.type?.id !== hourTypeId) {
      return { ok: false, error: 'Bouw7 heeft de uursoort niet aangepast.' }
    }
  }
  return { ok: true, voor }
}

/**
 * Maakt een nieuwe uurregel aan in Bouw7, altijd als niet goedgekeurd: ook een regel die de
 * goedkeurder zelf maakt gaat door de keten. Geen uurtarief: dat bepaalt Bouw7 uit project ×
 * uursoort, net als bij de weekstaat.
 *
 * Het id is nodig -- om de regel te kunnen terugdraaien als de rest mislukt, en voor de
 * tussenstand. Bouw7 geeft het bij aanmaken terug; komt het onverhoopt niet mee, dan zoeken we de
 * regel op die dag terug: de hoogste id met dezelfde inhoud is de zojuist gemaakte.
 */
export async function maakHourLog(
  client: Bouw7Client,
  regel: {
    projectId: number
    employeeId: number
    hourTypeId: number
    logDate: string
    logHours: string
    pslId: number | null
    comments: string
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const res = await client.post<{ id?: number }>('/project/hour-log', {
    project: { id: regel.projectId },
    employee: { id: regel.employeeId },
    hourType: { id: regel.hourTypeId },
    logDate: regel.logDate,
    logHours: regel.logHours,
    ...(regel.pslId ? { projectSecurityLink: { id: regel.pslId } } : {}),
    ...(regel.comments ? { comments: regel.comments } : {}),
    approved: false,
  })
  if (res?.id) return { ok: true, id: res.id }

  // Eén medewerker op één dag: een handvol regels.
  const opDag = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `employee.id = ${regel.employeeId} AND logDate >= "${regel.logDate}" AND logDate <= "${regel.logDate}" LIMIT 200`,
  })
  const kandidaten = (opDag?.items ?? []).filter(l =>
    l.project?.id === regel.projectId && l.type?.id === regel.hourTypeId
    && Number(l.hours) === Number(regel.logHours) && l.isApproved !== true)
  const id = Math.max(0, ...kandidaten.map(l => l.id))
  if (id > 0) return { ok: true, id }
  return {
    ok: false,
    error: 'Bouw7 gaf geen nummer terug voor de nieuwe regel en hij is niet terug te vinden. Kijk in Bouw7 of hij er staat voordat je het opnieuw probeert.',
  }
}

/** Zorgt dat de tussenstand-rij bestaat en werkt hem bij. */
export async function bewaarBeoordeling(
  hourLogId: number,
  regel: Pick<OpenUurRegel, 'medewerkerId' | 'dossierId' | 'datum'>,
  patch: BeoordelingPatch,
) {
  await db().from('uren_bouw7_beoordeling').upsert({
    bouw7_hour_log_id: hourLogId,
    medewerker_id: regel.medewerkerId,
    dossier_id: regel.dossierId,
    log_datum: regel.datum || null,
    ...patch,
  }, { onConflict: 'bouw7_hour_log_id' })
}

/** Het teamleider-akkoord op een regel, om mee te geven aan een regel die eruit is afgesplitst. */
export async function leesTeamleiderAkkoord(
  hourLogId: number,
): Promise<{ tl_akkoord_op: string; tl_akkoord_door: string | null } | null> {
  const { data } = await db()
    .from('uren_bouw7_beoordeling')
    .select('tl_akkoord_op, tl_akkoord_door')
    .eq('bouw7_hour_log_id', hourLogId)
    .maybeSingle()
  return data?.tl_akkoord_op ? { tl_akkoord_op: data.tl_akkoord_op, tl_akkoord_door: data.tl_akkoord_door ?? null } : null
}

/**
 * Haalt één openstaande regel live uit Bouw7 en toetst of `ikId` hem mag aanpassen.
 *
 * De toets is `bewerkrecht` -- dezelfde die het scherm gebruikt om te bepalen of een klik het
 * venster opent. Mag het niet, dan zegt de foutmelding bij wie de regel wél ligt.
 */
export async function vindBewerkbareRegel(
  hourLogId: number,
  ikId: string,
): Promise<{ ok: true; regel: OpenUurRegel } | { ok: false; error: string }> {
  // Met een id-lijst negeert de leeslaag de periode; de grenzen zijn alleen verplicht.
  const jaar = new Date().getFullYear()
  const res = await haalOpenstaandeUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`, [hourLogId])
  if (res.fout) return { ok: false, error: res.fout }

  const regel = res.regels.find(r => r.id === hourLogId)
  // De leeslaag vraagt alleen niet-goedgekeurde regels op.
  if (!regel) return { ok: false, error: 'Deze uurregel is al goedgekeurd of bestaat niet meer in Bouw7.' }

  const recht = bewerkrecht({
    goedgekeurd: false,
    teamleiderId: regel.teamleiderId,
    projectleiderId: regel.projectleiderId,
    vasteGoedkeurderId: regel.vasteGoedkeurderId,
    tlAkkoord: regel.tlAkkoord,
  }, ikId)
  if (recht.mag === 'aanpassen') return { ok: true, regel }

  const wachtOp = regel.status === 'wacht_op_vaste_goedkeurder' ? regel.vasteGoedkeurderNaam
    : regel.status === 'wacht_op_teamleider' ? regel.teamleiderNaam
    : regel.projectleiderNaam
  return {
    ok: false,
    error: bewerkrechtUitleg(recht.mag === null ? recht.reden : 'nietAanZet', {
      wachtOp, projectleider: regel.projectleiderNaam, viaGoedkeurder: regel.vasteGoedkeurderId != null,
    }),
  }
}

/**
 * /uren leest niet live uit Bouw7 maar uit het bewaarde urenvenster; zonder verversing toont het
 * scherm na een wijziging nog de oude stand. Op de achtergrond, want de goedkeurder hoeft daar
 * niet op te wachten.
 */
export async function verversUrenVensterLater(): Promise<void> {
  try {
    const { after } = await import('next/server')
    after(async () => {
      const { ververseGlobaleBron } = await import('@/lib/bouw7/snapshot')
      await ververseGlobaleBron('uren_venster').catch(() => {})
    })
  } catch { /* buiten een request-context bestaat `after` niet */ }
}
