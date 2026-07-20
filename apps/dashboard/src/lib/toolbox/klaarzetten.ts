import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { nieuweSeed } from './shuffle'

/**
 * Zet een toolboxversie klaar bij een set medewerkers: per medewerker één
 * toewijzing (op de gegeven versie, met eigen shuffle-seed) plus een openstaande
 * taak in "Mijn taken". Idempotent: bestaande (versie, medewerker)-toewijzingen
 * worden overgeslagen. Gedeeld door de losse toewijzing (beheerscherm) en de
 * cron-drain die agenda-momenten op hun datum klaarzet.
 *
 * Alleen medewerkers met een gekoppeld auth-account (login) krijgen een taak —
 * zonder login kunnen ze de toolbox op hun telefoon toch niet doorlopen.
 */
export async function zetToolboxKlaar(opts: {
  toolboxId: string
  versieId: string
  titel: string
  medewerkerIds: string[]
  momentId?: string | null
  toegewezenDoor?: string | null
}): Promise<{ aangemaakt: number; overgeslagen: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { toolboxId, versieId, titel, momentId = null, toegewezenDoor = null } = opts

  const uniek = [...new Set(opts.medewerkerIds)]
  if (uniek.length === 0) return { aangemaakt: 0, overgeslagen: 0 }

  // Medewerkers met login (auth_user_id) — de rest kan de toolbox niet doen.
  const { data: medewerkers } = await admin
    .from('medewerkers')
    .select('id, auth_user_id')
    .in('id', uniek)
    .eq('actief', true)
    .not('auth_user_id', 'is', null)

  // Al bestaande toewijzingen voor deze versie overslaan (idempotent).
  const { data: bestaand } = await admin
    .from('toolbox_toewijzingen')
    .select('medewerker_id')
    .eq('versie_id', versieId)
  const alToegewezen = new Set((bestaand ?? []).map((r: { medewerker_id: string }) => r.medewerker_id))

  let aangemaakt = 0
  let overgeslagen = 0

  for (const mw of (medewerkers ?? []) as { id: string; auth_user_id: string }[]) {
    if (alToegewezen.has(mw.id)) {
      overgeslagen++
      continue
    }

    // 1) Taak zonder deadline → verloopt nooit, blijft in Mijn taken staan.
    const { data: taak, error: taakErr } = await admin
      .from('tasks')
      .insert({
        titel: `Toolbox: ${titel}`,
        status: 'open',
        prioriteit: 'normaal',
        assignee_type: 'direct',
        aangemaakt_door: toegewezenDoor,
      })
      .select('id')
      .single()
    if (taakErr || !taak) {
      overgeslagen++
      continue
    }

    await admin.from('task_assignees').insert({
      task_id: taak.id,
      user_id: mw.auth_user_id,
      rol: 'verantwoordelijke',
    })

    // 2) Toewijzing met eigen seed + taak-koppeling.
    const { error: toewErr } = await admin.from('toolbox_toewijzingen').insert({
      toolbox_id: toolboxId,
      versie_id: versieId,
      medewerker_id: mw.id,
      moment_id: momentId,
      task_id: taak.id,
      shuffle_seed: nieuweSeed(),
      status: 'open',
      toegewezen_door: toegewezenDoor,
    })
    if (toewErr) {
      // Rol de zojuist gemaakte taak terug zodat er geen weestaak blijft staan.
      await admin.from('tasks').delete().eq('id', taak.id)
      overgeslagen++
      continue
    }

    aangemaakt++
  }

  return { aangemaakt, overgeslagen }
}

/**
 * Bepaal de doelgroep-medewerkers van een agenda-item: individueel gekoppelde
 * medewerkers plus alle actieve medewerkers van de gekoppelde afdelingen.
 */
export async function doelgroepMedewerkers(agendaItemId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const [{ data: directe }, { data: afdelingen }] = await Promise.all([
    admin
      .from('bedrijfsagenda_doelgroep_medewerkers')
      .select('medewerker_id')
      .eq('agenda_item_id', agendaItemId),
    admin
      .from('bedrijfsagenda_doelgroep_afdelingen')
      .select('afdeling_naam')
      .eq('agenda_item_id', agendaItemId),
  ])

  const ids = new Set<string>((directe ?? []).map((r: { medewerker_id: string }) => r.medewerker_id))

  const afdelingNamen = (afdelingen ?? []).map((r: { afdeling_naam: string }) => r.afdeling_naam)
  if (afdelingNamen.length > 0) {
    const { data: mws } = await admin
      .from('medewerkers')
      .select('id')
      .in('afdeling', afdelingNamen)
      .eq('actief', true)
    for (const m of (mws ?? []) as { id: string }[]) ids.add(m.id)
  }

  return [...ids]
}
