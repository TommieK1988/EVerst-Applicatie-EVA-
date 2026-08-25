/**
 * VCA-bemensing: wie werkt er op deze opdracht, en is zijn VCA-diploma in orde?
 *
 * Het VCA-tab toonde hier eerder de eerste vijftig rijen uit
 * `medewerker_bestanden` — niet gefilterd op dossier, en uit de verkeerde bron:
 * geüploade bestanden in plaats van het diplomaregister (`vca_diplomas`) dat
 * onder KAM/VGM wordt bijgehouden. Wie er op de opdracht stond deed er dus niet
 * toe, en de geldigheidsdatum kwam nergens vandaan.
 *
 * De bemensing komt uit twee hoeken: de medewerkers die op het dossier zijn
 * ingepland, en de rolhouders van het dossier zelf. Iemand kan beide zijn; die
 * verschijnt één keer, met zijn rol erbij.
 */

import { createAdminClient } from '@everts/database/server'
import { bepaalVcaStatus, type VcaSoort, type VcaStatus } from '@/lib/kam/vca'

/** Rol-kolom op `dossiers` → label zoals de gebruiker de rol kent. */
const ROL_LABELS: Record<string, string> = {
  project_manager_id:  'Projectleider',
  teamleider_id:       'Teamleider',
  werkvoorbereider_id: 'Werkvoorbereider',
  calculator_id:       'Calculator',
  uitvoerder_id:       'Uitvoerder',
  controller_id:       'Controller',
}

/** Volgorde waarin problemen bovenaan komen te staan. */
const STATUS_VOLGORDE: Record<VcaStatus, number> = {
  verlopen: 0,
  geen: 1,
  verloopt_binnenkort: 2,
  onbekend: 3,
  geldig: 4,
}

export type VcaBemensingRij = {
  medewerker_id: string
  naam: string
  /** 'Uitvoerder', 'Projectleider', … of 'Ingepland' als hij alleen in de planning staat. */
  rol: string
  soort: VcaSoort | null
  diplomanummer: string | null
  geldig_tot: string | null
  status: VcaStatus
  dagen_tot_verval: number | null
}

/**
 * De medewerkers op deze opdracht met hun meest actuele VCA-diploma.
 * Medewerkers zonder diploma komen mee met status 'geen' — juist die wil je zien.
 */
export async function getVcaBemensing(dossierId: string): Promise<VcaBemensingRij[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // 1. Rolhouders van het dossier.
  const { data: dossier } = await supabase
    .from('dossiers')
    .select(Object.keys(ROL_LABELS).join(', '))
    .eq('id', dossierId)
    .maybeSingle()

  const rolVanMedewerker = new Map<string, string>()
  for (const [kolom, label] of Object.entries(ROL_LABELS)) {
    const medewerkerId = (dossier as Record<string, string | null> | null)?.[kolom]
    // Eerste rol wint: de lijst staat op volgorde van hoe je iemand noemt.
    if (medewerkerId && !rolVanMedewerker.has(medewerkerId)) rolVanMedewerker.set(medewerkerId, label)
  }

  // 2. Medewerkers die op dit dossier zijn ingepland.
  const { data: activiteiten } = await supabase
    .from('planning_activiteiten')
    .select('id')
    .eq('dossier_id', dossierId)
  const activiteitIds = (activiteiten ?? []).map((a: { id: string }) => a.id)

  const ingepland = new Set<string>()
  if (activiteitIds.length > 0) {
    const { data: items } = await supabase
      .from('planning_items')
      .select('medewerker_id')
      .in('activiteit_id', activiteitIds)
    for (const i of (items ?? []) as { medewerker_id: string | null }[]) {
      if (i.medewerker_id) ingepland.add(i.medewerker_id)
    }
  }

  const medewerkerIds = [...new Set([...rolVanMedewerker.keys(), ...ingepland])]
  if (medewerkerIds.length === 0) return []

  // 3. Namen en diploma's erbij.
  const [{ data: medewerkers }, { data: diplomas }] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', medewerkerIds),
    supabase
      .from('vca_diplomas')
      .select('medewerker_id, soort, diplomanummer, geldig_tot')
      .in('medewerker_id', medewerkerIds),
  ])

  // Per medewerker het diploma dat het langst geldig is.
  const diplomaVanMedewerker = new Map<string, {
    soort: string | null; diplomanummer: string | null; geldig_tot: string | null
  }>()
  for (const d of (diplomas ?? []) as Array<{
    medewerker_id: string; soort: string | null; diplomanummer: string | null; geldig_tot: string | null
  }>) {
    const huidig = diplomaVanMedewerker.get(d.medewerker_id)
    if (!huidig || (d.geldig_tot ?? '') > (huidig.geldig_tot ?? '')) {
      diplomaVanMedewerker.set(d.medewerker_id, d)
    }
  }

  const rijen: VcaBemensingRij[] = ((medewerkers ?? []) as Array<{
    id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null
  }>).map(m => {
    const d = diplomaVanMedewerker.get(m.id)
    const { status, dagen } = bepaalVcaStatus(d?.geldig_tot ?? null, !!d)
    return {
      medewerker_id: m.id,
      naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || '—',
      rol: rolVanMedewerker.get(m.id) ?? 'Ingepland',
      soort: (d?.soort as VcaSoort) ?? null,
      diplomanummer: d?.diplomanummer ?? null,
      geldig_tot: d?.geldig_tot ?? null,
      status,
      dagen_tot_verval: dagen,
    }
  })

  // Problemen bovenaan, daarbinnen op naam.
  rijen.sort((a, b) => {
    const verschil = STATUS_VOLGORDE[a.status] - STATUS_VOLGORDE[b.status]
    return verschil !== 0 ? verschil : a.naam.localeCompare(b.naam)
  })
  return rijen
}
