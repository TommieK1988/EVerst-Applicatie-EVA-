/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gedeelde bouwstenen voor het klonen van een sjabloontaak naar een echte taak op
 * een dossier of een medewerker. Gebruikt door zowel het activeren van een sjabloon
 * als het bijhouden van herhalende taken wanneer de detailplanning schuift.
 */

/** Rol-kolommen op dossiers waarnaar een sjabloontaak kan verwijzen. */
export const DOSSIER_ROL_SELECT =
  'id, project_manager_id, teamleider_id, werkvoorbereider_id, calculator_id, uitvoerder_id, controller_id'

/** De context waarbinnen een sjabloon geactiveerd wordt: een dossier óf een medewerker. */
export interface KloonContext {
  dossier?: Record<string, any>
  medewerker?: { id: string; auth_user_id: string | null }
}

/**
 * Zet de toewijzingen van een sjabloontaak om naar echte medewerkers op de nieuwe taak:
 * een rol-toewijzing wordt opgezocht op het dossier, 'medewerker_zelf' wordt de medewerker
 * om wie de actielijst draait, een directe toewijzing wordt overgenomen.
 */
export async function resolveerToewijzingen(
  sb: any,
  context: KloonContext,
  sjabloonTaak: any,
  nieuweTaakId: string,
): Promise<void> {
  if (
    sjabloonTaak.assignee_type === 'dossier_rol' &&
    context.dossier &&
    (sjabloonTaak.dossier_rollen ?? []).length > 0
  ) {
    const dossier = context.dossier
    for (const rol of sjabloonTaak.dossier_rollen as string[]) {
      const medewerkerIdOpDossier = dossier[rol] as string | null
      if (!medewerkerIdOpDossier) continue
      const { data: med } = await sb
        .from('medewerkers')
        .select('auth_user_id')
        .eq('id', medewerkerIdOpDossier)
        .single()
      if (med?.auth_user_id) {
        await sb.from('task_assignees').insert({
          task_id: nieuweTaakId,
          user_id: med.auth_user_id,
          rol:     'verantwoordelijke',
        })
      }
    }
    return
  }

  if (sjabloonTaak.assignee_type === 'medewerker_zelf') {
    // Geen account (auth_user_id null)? Dan blijft de taak zonder assignee; de
    // DB-trigger tg_medewerker_zelf_taken_reconcile koppelt alsnog zodra er een
    // account gekoppeld wordt. Zie 20260720b_medewerker_trigger_events.sql.
    if (context.medewerker?.auth_user_id) {
      await sb.from('task_assignees').insert({
        task_id: nieuweTaakId,
        user_id: context.medewerker.auth_user_id,
        rol:     'verantwoordelijke',
      })
    }
    return
  }

  const assignees = sjabloonTaak.task_assignees ?? []
  if (assignees.length > 0) {
    await sb.from('task_assignees').insert(
      assignees.map((a: { user_id: string; rol: string }) => ({
        task_id: nieuweTaakId,
        user_id: a.user_id,
        rol:     a.rol,
      })),
    )
  }
}

export async function kopieerCompletionActies(
  sb: any,
  sjabloonTaak: any,
  nieuweTaakId: string,
): Promise<void> {
  const acties = sjabloonTaak.task_completion_acties ?? []
  if (acties.length === 0) return
  await sb.from('task_completion_acties').insert(
    acties.map((a: { actie_type: string; config: unknown; volgorde: number }) => ({
      task_id:    nieuweTaakId,
      actie_type: a.actie_type,
      config:     a.config,
      volgorde:   a.volgorde,
    })),
  )
}
