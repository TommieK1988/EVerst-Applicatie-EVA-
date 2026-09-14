import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { nieuweSeed } from './shuffle'
import { maakNotificatie } from '@/lib/notificaties/maak'

/**
 * Zet een toolboxversie klaar bij een set medewerkers: per medewerker één
 * toewijzing (op de gegeven versie, met eigen shuffle-seed) plus een openstaande
 * taak in "Mijn taken". Idempotent: bestaande (versie, medewerker)-toewijzingen
 * worden overgeslagen. Gedeeld door de losse toewijzing (beheerscherm) en de
 * cron-drain die agenda-momenten op hun datum klaarzet.
 *
 * Alleen medewerkers met een gekoppeld auth-account (login) krijgen een taak —
 * zonder login kunnen ze de toolbox op hun telefoon toch niet doorlopen.
 *
 * Elke medewerker krijgt ook een melding. Die is bewust níét de algemene
 * "actie voor jou"-melding uit `lib/taken/meldingen.ts`: een toolbox doorloop je
 * op je telefoon op een eigen scherm, en de melding hoort daar rechtstreeks heen
 * te brengen in plaats van naar een taakregel die alleen maar zegt dat het bestaat.
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
    const { data: toewijzing, error: toewErr } = await admin
      .from('toolbox_toewijzingen')
      .insert({
        toolbox_id: toolboxId,
        versie_id: versieId,
        medewerker_id: mw.id,
        moment_id: momentId,
        task_id: taak.id,
        shuffle_seed: nieuweSeed(),
        status: 'open',
        toegewezen_door: toegewezenDoor,
      })
      .select('id')
      .single()
    if (toewErr || !toewijzing) {
      // Rol de zojuist gemaakte taak terug zodat er geen weestaak blijft staan.
      await admin.from('tasks').delete().eq('id', taak.id)
      overgeslagen++
      continue
    }

    // Rechtstreeks naar de doorloop. Dit pad bestaat alleen op mobiel — de toolbox
    // is nergens anders te doen — dus hier géén desktop-pad dat `naarMobielPad`
    // nog moet vertalen.
    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'toolbox',
      titel: 'Toolbox staat voor je klaar',
      body: titel,
      url: `/m/toolbox/${toewijzing.id}`,
    })

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
