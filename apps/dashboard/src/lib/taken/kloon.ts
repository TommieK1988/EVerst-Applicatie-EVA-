/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gedeelde bouwstenen voor het klonen van een sjabloontaak naar een echte taak op
 * een dossier. Gebruikt door zowel het activeren van een sjabloon als het
 * bijhouden van herhalende taken wanneer de detailplanning schuift.
 */

/** Rol-kolommen op dossiers waarnaar een sjabloontaak kan verwijzen. */
export const DOSSIER_ROL_SELECT =
  'id, project_manager_id, teamleider_id, werkvoorbereider_id, calculator_id, uitvoerder_id, controller_id'

/**
 * Zet de toewijzingen van een sjabloontaak om naar echte medewerkers op de nieuwe taak:
 * een rol-toewijzing wordt opgezocht op het dossier, een directe toewijzing overgenomen.
 */
export async function resolveerToewijzingen(
  sb: any,
  dossier: Record<string, any>,
  sjabloonTaak: any,
  nieuweTaakId: string,
): Promise<void> {
  if (sjabloonTaak.assignee_type === 'dossier_rol' && (sjabloonTaak.dossier_rollen ?? []).length > 0) {
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
