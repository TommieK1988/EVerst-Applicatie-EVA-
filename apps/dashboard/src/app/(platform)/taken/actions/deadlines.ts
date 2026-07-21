'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import {
  berekenDeadline,
  herhalingsDatums,
  HERBEREKENBARE_BASISSEN,
  MAX_HERHALINGEN,
  type PlanningVenster,
} from '@/lib/taken/deadlines'
import {
  DOSSIER_ROL_SELECT,
  kopieerCompletionActies,
  resolveerToewijzingen,
} from '@/lib/taken/kloon'

const LEEG_VENSTER: PlanningVenster = { start: null, eind: null }

/**
 * Vroegste start en laatste eind van de detailplanning, per dossier. Dezelfde
 * RPC waarop de Projectplanning-tab zijn planbalken baseert, zodat "start/einde
 * detailplanning" overal hetzelfde betekent.
 */
async function planningVensters(sb: any): Promise<Map<string, PlanningVenster>> {
  const { data } = await sb.rpc('planning_datums_per_dossier')
  const map = new Map<string, PlanningVenster>()
  for (const r of (data ?? []) as { dossier_id: string; planning_start: string | null; planning_eind: string | null }[]) {
    map.set(r.dossier_id, { start: r.planning_start, eind: r.planning_eind })
  }
  return map
}

/**
 * Stem de losse taken van één herhalende sjabloontaak af op het uitvoeringsvenster.
 *
 * Afstemmen gebeurt op volgnummer (herhaling_index), niet op datum: schuift de planning
 * een week op, dan houdt "keer 3" dezelfde taak — met zijn opmerkingen en toewijzingen —
 * en krijgt hij alleen een nieuwe deadline. Krimpt het venster, dan verdwijnen alleen de
 * overtollige keren die nog op 'open' staan; waar al aan gewerkt is blijft staan.
 */
async function stemHerhalingAf(
  sb: any,
  dossier: Record<string, any>,
  lijst_id: string,
  sjabloonTaak: any,
  venster: PlanningVenster,
): Promise<void> {
  const datums = herhalingsDatums(sjabloonTaak.herhaling_interval, venster.start, venster.eind)
  const n = datums.length

  if (n === MAX_HERHALINGEN) {
    console.warn(
      `[deadlines] Herhaling "${sjabloonTaak.titel}" afgekapt op ${MAX_HERHALINGEN} keer ` +
      `(venster ${venster.start} t/m ${venster.eind}, interval ${sjabloonTaak.herhaling_interval}).`,
    )
  }

  const { data: bestaand } = await sb
    .from('tasks')
    .select('id, herhaling_index, status, titel, deadline, deadline_handmatig')
    .eq('lijst_id', lijst_id)
    .eq('herhaling_bron_taak_id', sjabloonTaak.id)
    .order('herhaling_index')

  const rijen = (bestaand ?? []) as any[]
  const opIndex = new Map<number, any>(rijen.map(t => [t.herhaling_index as number, t]))

  for (let i = 0; i < n; i++) {
    const titel = n > 1 ? `${sjabloonTaak.titel} (${i + 1}/${n})` : sjabloonTaak.titel
    const bestaande = opIndex.get(i)

    if (bestaande) {
      // Afgeronde of vervallen keren zijn historie: hun deadline en volgnummer laten zien
      // waar het destijds om ging. Die achteraf verzetten omdat de planning schoof
      // zou dat verleden herschrijven.
      if (bestaande.status === 'gereed' || bestaande.status === 'vervallen') continue

      const patch: Record<string, unknown> = {}
      if (bestaande.titel !== titel) patch.titel = titel
      if (!bestaande.deadline_handmatig && bestaande.deadline !== datums[i]) patch.deadline = datums[i]
      if (Object.keys(patch).length > 0) {
        await sb.from('tasks').update(patch).eq('id', bestaande.id)
      }
      continue
    }

    const { data: nieuweTaak } = await sb
      .from('tasks')
      .insert({
        lijst_id,
        titel,
        omschrijving:           sjabloonTaak.omschrijving,
        status:                 'open',
        prioriteit:             sjabloonTaak.prioriteit,
        deadline:               datums[i],
        deadline_basis:         'geen',
        geschatte_uren:         sjabloonTaak.geschatte_uren,
        volgorde:               sjabloonTaak.volgorde,
        assignee_type:          sjabloonTaak.assignee_type ?? 'direct',
        dossier_rollen:         sjabloonTaak.dossier_rollen ?? [],
        formulier_template_id:  sjabloonTaak.formulier_template_id ?? null,
        herhaling_bron_taak_id: sjabloonTaak.id,
        herhaling_index:        i,
        aangemaakt_door:        null,
      })
      .select('id')
      .single()

    if (!nieuweTaak) continue
    await resolveerToewijzingen(sb, { dossier }, sjabloonTaak, nieuweTaak.id)
    await kopieerCompletionActies(sb, sjabloonTaak, nieuweTaak.id)
  }

  for (const t of rijen) {
    if ((t.herhaling_index as number) >= n && t.status === 'open') {
      await sb.from('tasks').delete().eq('id', t.id)
    }
  }
}

/**
 * Herbereken alle planning-gebonden deadlines van één dossier en stem de herhalende
 * taken af op het huidige uitvoeringsvenster.
 */
async function verwerkDossier(sb: any, dossier_id: string, venster: PlanningVenster): Promise<void> {
  const { data: dossier } = await sb
    .from('dossiers')
    .select(`${DOSSIER_ROL_SELECT}, verwacht_startdatum, verwacht_einddatum`)
    .eq('id', dossier_id)
    .maybeSingle()
  if (!dossier) return

  const { data: lijsten } = await sb
    .from('task_lists')
    .select('id, template_id, streefdatum')
    .eq('dossier_id', dossier_id)
    .eq('is_template', false)

  const vandaag = new Date().toISOString().split('T')[0]

  for (const lijst of (lijsten ?? []) as any[]) {
    const ctx = {
      activatiedatum: vandaag,
      // Staat alleen op de lijst als iemand hem bij het activeren intypte; die datum
      // volgt het dossier niet en blijft dus staan zoals hij is.
      streefdatum:         lijst.streefdatum ?? null,
      planning_start:      venster.start,
      planning_eind:       venster.eind,
      verwacht_startdatum: dossier.verwacht_startdatum,
      verwacht_einddatum:  dossier.verwacht_einddatum,
    }

    // 1. Losse taken met een anker dat kan verschuiven: deadline opnieuw uitrekenen.
    //    Handmatig gezette deadlines blijven met rust.
    const { data: gebonden } = await sb
      .from('tasks')
      .select('id, deadline, deadline_basis, deadline_dagen')
      .eq('lijst_id', lijst.id)
      .eq('deadline_handmatig', false)
      .is('herhaling_bron_taak_id', null)
      .in('deadline_basis', HERBEREKENBARE_BASISSEN)

    for (const taak of (gebonden ?? []) as any[]) {
      const nieuw = berekenDeadline(taak.deadline_basis, taak.deadline_dagen, ctx)
      if (nieuw !== taak.deadline) {
        await sb.from('tasks').update({ deadline: nieuw }).eq('id', taak.id)
      }
    }

    // 2. Herhalende taken uit het sjabloon: aantal en datums bijwerken.
    if (!lijst.template_id) continue
    const { data: herhalers } = await sb
      .from('tasks')
      .select('*, task_assignees(*), task_completion_acties(*)')
      .eq('lijst_id', lijst.template_id)
      .neq('herhaling_interval', 'geen')
      .order('volgorde')

    for (const sjabloonTaak of (herhalers ?? []) as any[]) {
      await stemHerhalingAf(sb, dossier, lijst.id, sjabloonTaak, venster)
    }
  }
}

/**
 * Herbereken de deadlines van één dossier meteen, buiten de wachtrij om.
 * Gebruikt direct na het activeren van een sjabloon: er kan al planning staan.
 */
export async function herberekenDossierNu(dossier_id: string): Promise<void> {
  const sb = createAdminClient() as any
  const vensters = await planningVensters(sb)
  await verwerkDossier(sb, dossier_id, vensters.get(dossier_id) ?? LEEG_VENSTER)
  revalidatePath('/taken')
}

/**
 * Verwerk de 'pending' rijen in taak_deadline_herberekeningen die de DB-trigger
 * (tg_planning_items_deadline_queue) aanmaakte bij een planningswijziging.
 *
 * De DB signaleert write-path-agnostisch dát de planning wijzigde — ook bij een
 * Bouw7-planningsync, die niet via de planning-UI loopt. Deze functie doet het rekenwerk.
 * Claim-first ('processing') voorkomt dat twee gelijktijdige drains hetzelfde dossier doen.
 */
export async function herberekenDeadlines(dossier_id?: string): Promise<number> {
  const sb = createAdminClient() as any

  let query = sb
    .from('taak_deadline_herberekeningen')
    .select('dossier_id')
    .eq('status', 'pending')
  if (dossier_id) query = query.eq('dossier_id', dossier_id)

  const { data: rijen } = await query
  if (!rijen?.length) return 0

  const vensters = await planningVensters(sb)
  let verwerkt = 0

  for (const rij of rijen as { dossier_id: string }[]) {
    const { data: geclaimd } = await sb
      .from('taak_deadline_herberekeningen')
      .update({ status: 'processing' })
      .eq('dossier_id', rij.dossier_id)
      .eq('status', 'pending')
      .select('dossier_id')
    if (!geclaimd?.length) continue

    try {
      await verwerkDossier(sb, rij.dossier_id, vensters.get(rij.dossier_id) ?? LEEG_VENSTER)
      await sb
        .from('taak_deadline_herberekeningen')
        .update({ status: 'done', verwerkt_op: new Date().toISOString(), foutmelding: null })
        .eq('dossier_id', rij.dossier_id)
      verwerkt++
    } catch (e) {
      await sb
        .from('taak_deadline_herberekeningen')
        .update({
          status:      'error',
          foutmelding: e instanceof Error ? e.message : String(e),
          verwerkt_op: new Date().toISOString(),
        })
        .eq('dossier_id', rij.dossier_id)
    }
  }

  if (verwerkt > 0) revalidatePath('/taken')
  return verwerkt
}

// ─── Medewerker-ankers ────────────────────────────────────────────────────────

/**
 * Herbereken de medewerker-gebonden deadlines (in_dienst_vanaf / uit_dienst_per) van
 * één medewerker: zowel de taken op geactiveerde actielijsten als de losse taken.
 *
 * Geen herhalende taken hier: die hangen aan het uitvoeringsvenster van een dossier,
 * een concept dat in de medewerker-context niet bestaat.
 */
async function verwerkMedewerker(sb: any, medewerker_id: string): Promise<void> {
  const { data: medewerker } = await sb
    .from('medewerkers')
    .select('id, in_dienst_vanaf, uit_dienst_per')
    .eq('id', medewerker_id)
    .maybeSingle()
  if (!medewerker) return

  const vandaag = new Date().toISOString().split('T')[0]

  const herbereken = async (taken: any[], streefdatum: string | null) => {
    for (const taak of taken) {
      const nieuw = berekenDeadline(taak.deadline_basis, taak.deadline_dagen, {
        activatiedatum:  vandaag,
        streefdatum,
        in_dienst_vanaf: medewerker.in_dienst_vanaf,
        uit_dienst_per:  medewerker.uit_dienst_per,
      })
      if (nieuw !== taak.deadline) {
        await sb.from('tasks').update({ deadline: nieuw }).eq('id', taak.id)
      }
    }
  }

  const { data: lijsten } = await sb
    .from('task_lists')
    .select('id, streefdatum')
    .eq('medewerker_id', medewerker_id)
    .eq('is_template', false)

  for (const lijst of (lijsten ?? []) as any[]) {
    const { data: gebonden } = await sb
      .from('tasks')
      .select('id, deadline, deadline_basis, deadline_dagen')
      .eq('lijst_id', lijst.id)
      .eq('deadline_handmatig', false)
      .in('deadline_basis', HERBEREKENBARE_BASISSEN)
    await herbereken((gebonden ?? []) as any[], lijst.streefdatum ?? null)
  }

  // Losse taken hangen rechtstreeks aan de medewerker en kennen geen streefdatum.
  const { data: los } = await sb
    .from('tasks')
    .select('id, deadline, deadline_basis, deadline_dagen')
    .eq('medewerker_id', medewerker_id)
    .eq('deadline_handmatig', false)
    .in('deadline_basis', HERBEREKENBARE_BASISSEN)
  await herbereken((los ?? []) as any[], null)
}

/**
 * Verwerk de 'pending' rijen in medewerker_deadline_herberekeningen die de DB-trigger
 * (tg_medewerker_datums_deadline_queue) aanmaakte toen in_dienst_vanaf of uit_dienst_per
 * wijzigde. Claim-first, net als de dossier-variant hierboven.
 */
export async function herberekenMedewerkerDeadlines(medewerker_id?: string): Promise<number> {
  const sb = createAdminClient() as any

  let query = sb
    .from('medewerker_deadline_herberekeningen')
    .select('medewerker_id')
    .eq('status', 'pending')
  if (medewerker_id) query = query.eq('medewerker_id', medewerker_id)

  const { data: rijen } = await query
  if (!rijen?.length) return 0

  let verwerkt = 0
  for (const rij of rijen as { medewerker_id: string }[]) {
    const { data: geclaimd } = await sb
      .from('medewerker_deadline_herberekeningen')
      .update({ status: 'processing' })
      .eq('medewerker_id', rij.medewerker_id)
      .eq('status', 'pending')
      .select('medewerker_id')
    if (!geclaimd?.length) continue

    try {
      await verwerkMedewerker(sb, rij.medewerker_id)
      await sb
        .from('medewerker_deadline_herberekeningen')
        .update({ status: 'done', verwerkt_op: new Date().toISOString(), foutmelding: null })
        .eq('medewerker_id', rij.medewerker_id)
      verwerkt++
    } catch (e) {
      await sb
        .from('medewerker_deadline_herberekeningen')
        .update({
          status:      'error',
          foutmelding: e instanceof Error ? e.message : String(e),
          verwerkt_op: new Date().toISOString(),
        })
        .eq('medewerker_id', rij.medewerker_id)
    }
  }

  if (verwerkt > 0) {
    revalidatePath('/taken')
    revalidatePath('/mijn-taken')
  }
  return verwerkt
}
