/**
 * VCA-acties: de taken uit een actielijst waaraan een KAM/VGM-formulier hangt.
 *
 * Dit is de bron voor zowel het KAM/VGM-dashboard als het VCA-tab van een
 * opdracht. Beide lazen eerder uit `form_taken`, een tabel die in de praktijk
 * nooit gevuld is geraakt — de VCA-acties leven in `tasks`, onder de actielijst
 * van het dossier. Daardoor stonden de tellingen altijd op nul.
 *
 * Een taak hangt aan een dossier via `tasks.dossier_id` (losse taak) óf via de
 * actielijst waar hij onder valt; taken uit een sjabloon hebben alleen dat
 * laatste. Beide routes tellen hier mee.
 */

import { createAdminClient } from '@everts/database/server'

/** Inzending-statussen die gelden als 'het formulier is daadwerkelijk ingevuld'. */
const INGEVULD_STATUSSEN = ['ingediend', 'goedgekeurd']

export type VcaActie = {
  id: string
  titel: string
  status: string
  deadline: string | null
  dossier_id: string
  formulier_template_id: string
  formulier_naam: string
  /** De inzending die bij deze actie hoort, als die er is. */
  inzending_id: string | null
  inzending_status: string | null
  /** Formulier ingediend of goedgekeurd — dus echt ingevuld, niet enkel afgevinkt. */
  formulier_ingevuld: boolean
}

/**
 * Alle VCA-acties van de opgegeven dossiers, gegroepeerd per dossier.
 * Vervallen taken tellen niet mee: die horen niet meer bij de opdracht.
 */
export async function getVcaActiesPerDossier(
  dossierIds: string[],
): Promise<Map<string, VcaActie[]>> {
  const leeg = new Map<string, VcaActie[]>()
  if (dossierIds.length === 0) return leeg

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // 1. De KAM/VGM-formulieren; zonder die vlag is een taak geen VCA-actie.
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, naam')
    .eq('is_kam_vgm', true)
  const templateNaam = new Map<string, string>(
    (templates ?? []).map((t: { id: string; naam: string }) => [t.id, t.naam]),
  )
  if (templateNaam.size === 0) return leeg

  // 2. De actielijsten van deze dossiers, zodat we taken zonder eigen
  //    dossier-koppeling alsnog bij de juiste opdracht kunnen leggen.
  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('id, dossier_id')
    .in('dossier_id', dossierIds)
  const dossierVanLijst = new Map<string, string>(
    (lijsten ?? []).map((l: { id: string; dossier_id: string }) => [l.id, l.dossier_id]),
  )

  // 3. De taken zelf: via hun eigen dossier óf via een van die actielijsten.
  const filters = [`dossier_id.in.(${dossierIds.join(',')})`]
  if (dossierVanLijst.size > 0) {
    filters.push(`lijst_id.in.(${[...dossierVanLijst.keys()].join(',')})`)
  }

  const { data: taken } = await supabase
    .from('tasks')
    .select('id, titel, status, deadline, dossier_id, lijst_id, formulier_template_id')
    .in('formulier_template_id', [...templateNaam.keys()])
    .neq('status', 'vervallen')
    .or(filters.join(','))

  const rijen = (taken ?? []) as Array<{
    id: string
    titel: string | null
    status: string
    deadline: string | null
    dossier_id: string | null
    lijst_id: string | null
    formulier_template_id: string
  }>
  if (rijen.length === 0) return leeg

  // 4. De inzendingen die bij die taken horen. Een taak kan een concept én een
  //    ingediende inzending hebben; de ingediende telt.
  const { data: inzendingen } = await supabase
    .from('form_inzendingen')
    .select('id, task_id, status, aangemaakt_op')
    .in('task_id', rijen.map(r => r.id))
    .order('aangemaakt_op', { ascending: true })

  const inzendingVanTaak = new Map<string, { id: string; status: string }>()
  for (const inz of (inzendingen ?? []) as Array<{ id: string; task_id: string; status: string }>) {
    const huidige = inzendingVanTaak.get(inz.task_id)
    // Een ingevulde inzending verdringt een concept; verder wint de laatste.
    if (huidige && INGEVULD_STATUSSEN.includes(huidige.status) && !INGEVULD_STATUSSEN.includes(inz.status)) continue
    inzendingVanTaak.set(inz.task_id, { id: inz.id, status: inz.status })
  }

  const perDossier = new Map<string, VcaActie[]>()
  for (const r of rijen) {
    const dossierId = r.dossier_id ?? (r.lijst_id ? dossierVanLijst.get(r.lijst_id) : undefined)
    if (!dossierId || !dossierIds.includes(dossierId)) continue

    const inz = inzendingVanTaak.get(r.id) ?? null
    const actie: VcaActie = {
      id: r.id,
      titel: r.titel ?? 'Formulier-actie',
      status: r.status,
      deadline: r.deadline,
      dossier_id: dossierId,
      formulier_template_id: r.formulier_template_id,
      formulier_naam: templateNaam.get(r.formulier_template_id) ?? 'Formulier',
      inzending_id: inz?.id ?? null,
      inzending_status: inz?.status ?? null,
      formulier_ingevuld: inz ? INGEVULD_STATUSSEN.includes(inz.status) : false,
    }
    const lijst = perDossier.get(dossierId)
    if (lijst) lijst.push(actie)
    else perDossier.set(dossierId, [actie])
  }

  // Openstaand bovenaan, daarbinnen op deadline (zonder deadline achteraan).
  for (const lijst of perDossier.values()) {
    lijst.sort((a, b) => {
      if ((a.status === 'gereed') !== (b.status === 'gereed')) return a.status === 'gereed' ? 1 : -1
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return a.titel.localeCompare(b.titel)
    })
  }

  return perDossier
}

/** Dezelfde acties voor één dossier. */
export async function getVcaActies(dossierId: string): Promise<VcaActie[]> {
  const perDossier = await getVcaActiesPerDossier([dossierId])
  return perDossier.get(dossierId) ?? []
}
