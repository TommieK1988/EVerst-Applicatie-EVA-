import 'server-only'

/**
 * Bij een bezwaar op een inkoopfactuur komt er een taak bij de financiële administratie: zij vragen
 * de leverancier om een creditnota of een gecorrigeerde factuur. Zonder taak lag een afgekeurde
 * factuur stil — er ging nergens een signaal heen (Tom, 14-10-2026).
 *
 * Wie de taak krijgt staat in `bedrijfsinstellingen.overige.inkoop_bezwaar_taak_medewerker_id`,
 * instelbaar op /instellingen/inkoop-goedkeuring. Eén bezwaar = één taak met één melding; geen
 * bulk, dus geen strijd met "geen melding per factuur" (dat ging over de sync).
 */

import { createAdminClient } from '@everts/database/server'
import { meldTaakToegewezen } from '@/lib/taken/meldingen'

const db = () => createAdminClient()

export async function getBezwaarTaakMedewerker(): Promise<string | null> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.inkoop_bezwaar_taak_medewerker_id
  return typeof v === 'string' && v ? v : null
}

/** Maakt de taak aan. Gooit niet: het bezwaar zelf is al vastgelegd en mag hier niet op stranden. */
export async function maakBezwaarTaak(inkoopfactuurId: string, door: string | null, reden: string): Promise<void> {
  try {
    const medewerkerId = await getBezwaarTaakMedewerker()
    if (!medewerkerId) return

    const [{ data: f }, { data: m }] = await Promise.all([
      db().from('inkoopfacturen')
        .select('factuurnummer, leverancier_naam, bedrag_incl, dossier_id, project_nummer, project_naam')
        .eq('id', inkoopfactuurId).maybeSingle(),
      db().from('medewerkers').select('auth_user_id').eq('id', medewerkerId).maybeSingle(),
    ])
    if (!f) return

    const titel = `Inkoopfactuur afgekeurd: ${f.leverancier_naam ?? 'leverancier'} ${f.factuurnummer ?? ''}`.trim()

    // Niet dubbel: een tweede klik of een herhaalde poging mag geen tweede taak opleveren.
    const { data: bestaand } = await db().from('tasks').select('id').eq('titel', titel)
      .not('status', 'in', '("gereed","vervallen")').limit(1).maybeSingle()
    if (bestaand) return

    const bedrag = f.bedrag_incl == null ? '' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(f.bedrag_incl))
    const project = [f.project_nummer, f.project_naam].filter(Boolean).join(' · ')
    const tekst = [
      `${door ?? 'Iemand'} heeft bezwaar gemaakt tegen deze inkoopfactuur.`,
      `Reden: ${reden}`,
      '',
      `Leverancier: ${f.leverancier_naam ?? '—'}`,
      `Factuurnummer: ${f.factuurnummer ?? '—'}${bedrag ? ` · ${bedrag}` : ''}`,
      project ? `Project: ${project}` : 'Geen project (overhead)',
      '',
      'Vraag de leverancier om een creditnota of een gecorrigeerde factuur. De factuur staat in EVA onder Inkoop en in Bouw7 op Afgekeurd.',
    ].join('\n')

    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const { data: taak, error } = await db().from('tasks').insert({
      titel,
      omschrijving: { text: tekst },
      dossier_id: f.dossier_id,
      status: 'open',
      prioriteit: 'hoog',
      deadline: morgen,
      assignee_type: 'direct',
      dossier_rollen: [],
    }).select('id').single()
    if (error || !taak) return

    if (m?.auth_user_id) {
      await db().from('task_assignees').insert({ task_id: taak.id, user_id: m.auth_user_id, rol: 'verantwoordelijke' })
      await meldTaakToegewezen(taak.id, [m.auth_user_id])
    }
  } catch {
    // Stil: zie de toelichting bovenaan. Het bezwaar staat in EVA en in Bouw7.
  }
}
