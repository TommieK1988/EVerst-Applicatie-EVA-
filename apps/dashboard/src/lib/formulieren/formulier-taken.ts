/**
 * Formulier-taken: de taken uit een actielijst waaraan een formulier hangt.
 *
 * Dit is de bron voor het Formulieren-overzicht, het KAM/VGM-dashboard en het
 * VCA-tab van een opdracht. Die schermen lazen eerder uit `form_taken`, een
 * tabel die in de praktijk nooit gevuld is geraakt — nul rijen, projectbreed.
 * De echte formulier-taken leven in `tasks`, onder de actielijst van het
 * dossier, en daardoor stond overal 0.
 *
 * Een taak hangt aan een dossier via `tasks.dossier_id` (losse taak) óf via de
 * actielijst waar hij onder valt; taken uit een sjabloon hebben alleen dat
 * laatste. Beide routes tellen hier mee.
 */

import { createAdminClient } from '@everts/database/server'

/** Inzending-statussen die gelden als 'het formulier is daadwerkelijk ingevuld'. */
const INGEVULD_STATUSSEN = ['ingediend', 'goedgekeurd']

export type FormulierTaak = {
  id: string
  titel: string
  /** Taakstatus: open | in_behandeling | wacht_op | gereed. */
  status: string
  deadline: string | null
  dossier_id: string
  formulier_template_id: string
  formulier_naam: string
  formulier_categorie: string | null
  /** De inzending die bij deze taak hoort, als die er is. */
  inzending_id: string | null
  inzending_status: string | null
  /** Formulier ingediend of goedgekeurd — dus echt ingevuld, niet enkel afgevinkt. */
  formulier_ingevuld: boolean
  /** Auth-user van de verantwoordelijke, als die er is. */
  toegewezen_aan: string | null
}

/**
 * Alle formulier-taken van de opgegeven dossiers. Vervallen taken tellen niet
 * mee: die horen niet meer bij de opdracht.
 *
 * `alleenKamVgm` beperkt tot formulieren met de KAM/VGM-vlag — dat is wat een
 * taak tot VCA-actie maakt.
 */
export async function getFormulierTaken(opties: {
  dossierIds: string[]
  alleenKamVgm?: boolean
}): Promise<FormulierTaak[]> {
  const { dossierIds, alleenKamVgm = false } = opties
  if (dossierIds.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // 1. De formulieren waar het om gaat.
  let templateQuery = supabase.from('form_templates').select('id, naam, categorie')
  if (alleenKamVgm) templateQuery = templateQuery.eq('is_kam_vgm', true)
  const { data: templates } = await templateQuery

  const templateInfo = new Map<string, { naam: string; categorie: string | null }>(
    (templates ?? []).map((t: { id: string; naam: string; categorie: string | null }) =>
      [t.id, { naam: t.naam, categorie: t.categorie }],
    ),
  )
  if (templateInfo.size === 0) return []

  // 2. De actielijsten van deze dossiers, zodat we taken zonder eigen
  //    dossier-koppeling alsnog bij het juiste dossier kunnen leggen.
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
    .in('formulier_template_id', [...templateInfo.keys()])
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
  if (rijen.length === 0) return []

  const taakIds = rijen.map(r => r.id)

  // 4. Inzendingen en toewijzingen bij die taken.
  const [{ data: inzendingen }, { data: assignees }] = await Promise.all([
    supabase
      .from('form_inzendingen')
      .select('id, task_id, status, aangemaakt_op')
      .in('task_id', taakIds)
      .order('aangemaakt_op', { ascending: true }),
    supabase
      .from('task_assignees')
      .select('task_id, user_id, rol')
      .in('task_id', taakIds),
  ])

  const inzendingVanTaak = new Map<string, { id: string; status: string }>()
  for (const inz of (inzendingen ?? []) as Array<{ id: string; task_id: string; status: string }>) {
    const huidige = inzendingVanTaak.get(inz.task_id)
    // Een ingevulde inzending verdringt een concept; verder wint de laatste.
    if (huidige && INGEVULD_STATUSSEN.includes(huidige.status) && !INGEVULD_STATUSSEN.includes(inz.status)) continue
    inzendingVanTaak.set(inz.task_id, { id: inz.id, status: inz.status })
  }

  const toegewezenVanTaak = new Map<string, string>()
  for (const a of (assignees ?? []) as Array<{ task_id: string; user_id: string; rol: string }>) {
    // De verantwoordelijke wint; anders de eerste die we tegenkomen.
    if (a.rol === 'verantwoordelijke' || !toegewezenVanTaak.has(a.task_id)) {
      toegewezenVanTaak.set(a.task_id, a.user_id)
    }
  }

  const resultaat: FormulierTaak[] = []
  for (const r of rijen) {
    const dossierId = r.dossier_id ?? (r.lijst_id ? dossierVanLijst.get(r.lijst_id) : undefined)
    if (!dossierId || !dossierIds.includes(dossierId)) continue

    const template = templateInfo.get(r.formulier_template_id)
    const inz = inzendingVanTaak.get(r.id) ?? null
    resultaat.push({
      id: r.id,
      titel: r.titel ?? 'Formulier-actie',
      status: r.status,
      deadline: r.deadline,
      dossier_id: dossierId,
      formulier_template_id: r.formulier_template_id,
      formulier_naam: template?.naam ?? 'Formulier',
      formulier_categorie: template?.categorie ?? null,
      inzending_id: inz?.id ?? null,
      inzending_status: inz?.status ?? null,
      formulier_ingevuld: inz ? INGEVULD_STATUSSEN.includes(inz.status) : false,
      toegewezen_aan: toegewezenVanTaak.get(r.id) ?? null,
    })
  }

  return resultaat
}
