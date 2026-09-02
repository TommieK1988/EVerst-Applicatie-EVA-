'use server'

// De brug tussen de EVA-weekstaat en de urenadministratie in Bouw7.
//
// Twee kanten op:
//
//   HEEN — `stuurUrenWeekNaarBouw7`. Elke urenregel wordt één `POST /project/hour-log`. Of de
//   vlag `approved` meteen op true gaat hangt af van de route: in de EVA-keten is de goedkeuring
//   al rond als we hier komen, in de Bouw7-route moet er dáár nog iemand naar kijken.
//
//   TERUG — `leesGoedkeuringTerug`. Bouw7 blijft de plek waar geaccordeerd wórdt zolang de
//   overstap loopt, dus EVA leest `isApproved` op en zet de week op goedgekeurd zodra alle regels
//   akkoord zijn. Dit draait in béide routes: ook een week die EVA zelf goedkeurde kan in Bouw7
//   worden teruggedraaid, en dan hoort EVA een goedkeuring niet te blijven claimen.
//
// IDEMPOTENTIE. `bouw7_hour_log_id` is de sleutel: staat hij in de body, dan werkt Bouw7 de
// bestaande regel bij; ontbreekt hij, dan maakt Bouw7 een nieuwe aan. Zonder dat id levert
// opnieuw versturen dus een duplicaat op. Het teruggekregen id wordt daarom meteen weggeschreven,
// per regel, niet pas aan het eind.
//
// Er is geen bulk-endpoint: de regels gaan sequentieel, en één struikelende regel laat de rest
// doorgaan — hetzelfde patroon als `updateUurlogBewakingscodeBulk`.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getBouw7Client, logSync } from '@/lib/bouw7/sync'
import type { Bouw7EmployeeHourLog, Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type VerstuurResultaat = {
  ok: boolean
  verzonden: number
  mislukt: number
  fouten: string[]
}

/**
 * Stuurt de regels van een week naar Bouw7.
 *
 * `approved` volgt de route van de week: in modus 'eva' is de goedkeuringsketen hier al doorlopen
 * en gaat de vlag meteen om; in modus 'bouw7' komen de uren als onbeoordeeld binnen, precies zoals
 * nu, zodat er in Bouw7 nog naar gekeken wordt.
 */
export async function stuurUrenWeekNaarBouw7(weekId: string): Promise<VerstuurResultaat> {
  const start = Date.now()
  const supabase = db()

  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, week_nr, goedkeuring_modus, medewerkers!uren_weken_medewerker_id_fkey(bouw7_id)')
    .eq('id', weekId)
    .maybeSingle()
  if (!week) return { ok: false, verzonden: 0, mislukt: 0, fouten: ['Week niet gevonden.'] }

  const employeeId = Number(week.medewerkers?.bouw7_id)
  if (!employeeId) {
    return {
      ok: false, verzonden: 0, mislukt: 0,
      fouten: ['Deze medewerker is niet aan Bouw7 gekoppeld; zijn uren kunnen daar niet geboekt worden.'],
    }
  }

  const approved = week.goedkeuring_modus === 'eva'

  const { data: regels } = await supabase
    .from('uren_regels')
    .select('id, datum, uren, opmerking, bouw7_psl_id, bouw7_hour_log_id, planning_uursoorten(bouw7_id), dossiers(bouw7_id)')
    .eq('week_id', weekId)
    .neq('bouw7_status', 'verzonden')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lijst = (regels ?? []) as any[]
  if (!lijst.length) return { ok: true, verzonden: 0, mislukt: 0, fouten: [] }

  const client = await getBouw7Client()
  let verzonden = 0
  let mislukt = 0
  const fouten: string[] = []

  for (const r of lijst) {
    const projectId = Number(r.dossiers?.bouw7_id)
    const hourTypeId = Number(r.planning_uursoorten?.bouw7_id)
    if (!projectId || !hourTypeId) {
      mislukt++
      const reden = !projectId
        ? `${r.datum}: het dossier heeft geen Bouw7-koppeling.`
        : `${r.datum}: de uursoort bestaat niet in Bouw7.`
      fouten.push(reden)
      await supabase.from('uren_regels')
        .update({ bouw7_status: 'fout', bouw7_fout: reden }).eq('id', r.id)
      continue
    }

    try {
      const res = await client.post<{ id?: number }>('/project/hour-log', {
        ...(r.bouw7_hour_log_id ? { id: r.bouw7_hour_log_id } : {}),
        project: { id: projectId },
        employee: { id: employeeId },
        logDate: r.datum,
        logHours: String(r.uren),
        hourType: { id: hourTypeId },
        ...(r.bouw7_psl_id ? { projectSecurityLink: { id: r.bouw7_psl_id } } : {}),
        ...(r.opmerking ? { comments: r.opmerking } : {}),
        approved,
      })

      await supabase.from('uren_regels').update({
        // Bij een update geeft Bouw7 het id niet altijd terug; het bestaande blijft dan staan.
        bouw7_hour_log_id: res?.id ?? r.bouw7_hour_log_id ?? null,
        bouw7_status: 'verzonden',
        bouw7_fout: null,
        bouw7_goedgekeurd: approved,
        bouw7_goedgekeurd_op: approved ? new Date().toISOString() : null,
      }).eq('id', r.id)
      verzonden++
    } catch (e) {
      mislukt++
      const melding = `${r.datum}: ${e instanceof Error ? e.message : 'versturen mislukt'}`
      fouten.push(melding)
      await supabase.from('uren_regels')
        .update({ bouw7_status: 'fout', bouw7_fout: melding }).eq('id', r.id)
    }
  }

  await supabase.from('uren_weken').update({
    bouw7_verstuurd_op: new Date().toISOString(),
    bouw7_fouten: fouten.length ? fouten : null,
  }).eq('id', weekId)

  await logSync('uren_weken', 'out', {
    verwerkt: verzonden + mislukt, nieuw: verzonden, bijgewerkt: 0, fouten: mislukt,
    foutmeldingen: fouten,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any, Date.now() - start)

  revalidatePath('/m/uren')
  revalidatePath('/uren/goedkeuren')
  return { ok: mislukt === 0, verzonden, mislukt, fouten }
}

/**
 * Leest de goedkeurvlag terug uit Bouw7 en werkt de weken bij.
 *
 * Dit is wat de Bouw7-route laat werken: iemand accordeert daar, en EVA volgt. Een week gaat op
 * goedgekeurd zodra álle verzonden regels de vlag hebben. Draait de goedkeuring in Bouw7 terug,
 * dan zakt de week ook terug — EVA mag geen goedkeuring tonen die er niet meer is.
 *
 * `dagen` bepaalt hoe ver terug gekeken wordt; de cron draait dit met een korte staart.
 */
export async function leesGoedkeuringTerug(dagen = 60): Promise<{
  gecontroleerd: number
  bijgewerkt: number
  weken: number
}> {
  const start = Date.now()
  const supabase = db()

  const van = new Date()
  van.setDate(van.getDate() - dagen)
  const vanaf = `${van.getFullYear()}-${String(van.getMonth() + 1).padStart(2, '0')}-${String(van.getDate()).padStart(2, '0')}`

  // Alleen weken die al in Bouw7 staan en nog niet definitief zijn afgehandeld.
  const { data: weken } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, status, goedkeuring_modus, medewerkers!uren_weken_medewerker_id_fkey(bouw7_id)')
    .gte('week_start', vanaf)
    .not('bouw7_verstuurd_op', 'is', null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lijst = (weken ?? []) as any[]
  if (!lijst.length) return { gecontroleerd: 0, bijgewerkt: 0, weken: 0 }

  const client = await getBouw7Client()

  // Eén call per medewerker in plaats van per week: het endpoint filtert op medewerker en datum,
  // en een medewerker heeft vaak meerdere weken openstaan.
  const perMedewerker = new Map<string, { bouw7Id: string; weken: typeof lijst }>()
  for (const w of lijst) {
    const bouw7Id = w.medewerkers?.bouw7_id
    if (!bouw7Id) continue
    const v = perMedewerker.get(w.medewerker_id) ?? { bouw7Id: String(bouw7Id), weken: [] }
    v.weken.push(w)
    perMedewerker.set(w.medewerker_id, v)
  }

  let gecontroleerd = 0
  let bijgewerkt = 0
  let weekWissels = 0

  for (const [, { bouw7Id, weken: eigenWeken }] of perMedewerker) {
    let logs: Bouw7EmployeeHourLog[] = []
    try {
      const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
        q: `employee.id = ${bouw7Id} AND logDate >= "${vanaf}" SORT(logDate, DESC) LIMIT 2000`,
      })
      logs = resp?.items ?? []
    } catch {
      continue // een hapering bij één medewerker mag de rest niet stilzetten
    }

    const status = new Map<number, Bouw7EmployeeHourLog>()
    for (const l of logs) if (l.id != null) status.set(l.id, l)

    for (const w of eigenWeken) {
      const { data: regels } = await supabase
        .from('uren_regels')
        .select('id, bouw7_hour_log_id, bouw7_goedgekeurd')
        .eq('week_id', w.id)
        .eq('bouw7_status', 'verzonden')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rij = (regels ?? []) as any[]
      if (!rij.length) continue

      let alleAkkoord = true
      for (const r of rij) {
        gecontroleerd++
        const log = r.bouw7_hour_log_id != null ? status.get(r.bouw7_hour_log_id) : undefined
        // Regel niet teruggevonden: niets aannemen. Hem als goedgekeurd bestempelen omdat Bouw7
        // hem niet teruggaf zou een week kunnen afronden die er nooit is aangekomen.
        const akkoord = log?.isApproved === true
        if (!akkoord) alleAkkoord = false
        if (akkoord !== r.bouw7_goedgekeurd) {
          await supabase.from('uren_regels').update({
            bouw7_goedgekeurd: akkoord,
            bouw7_goedgekeurd_op: akkoord ? (log?.approvedAt ?? new Date().toISOString()) : null,
            bouw7_goedgekeurd_door: akkoord ? (log?.approvedBy?.username ?? null) : null,
          }).eq('id', r.id)
          bijgewerkt++
        }
      }

      // In de Bouw7-route bepaalt de vlag de status van de week. In de EVA-route is de week al via
      // de eigen keten goedgekeurd; daar corrigeren we alleen terug als Bouw7 de goedkeuring
      // intrekt, want dan klopt "goedgekeurd" in EVA niet meer.
      const nieuweStatus =
        alleAkkoord ? 'goedgekeurd'
        : w.status === 'goedgekeurd' ? 'ingediend'
        : null
      if (nieuweStatus && nieuweStatus !== w.status) {
        if (w.goedkeuring_modus === 'bouw7' || nieuweStatus === 'ingediend') {
          await supabase.from('uren_weken').update({ status: nieuweStatus }).eq('id', w.id)
          weekWissels++
        }
      }
    }
  }

  await logSync('uren_goedkeuring', 'in', {
    verwerkt: gecontroleerd, nieuw: 0, bijgewerkt, fouten: 0, foutmeldingen: [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any, Date.now() - start)

  revalidatePath('/uren/goedkeuren')
  return { gecontroleerd, bijgewerkt, weken: weekWissels }
}
