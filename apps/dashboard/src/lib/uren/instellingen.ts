// Bedrijfsbrede instellingen voor de urenverantwoording: deadlines, de terugvalgoedkeurder en
// het dossier waar niet-projectgebonden uren op landen.

import { createAdminClient } from '@everts/database/server'
import { isoWeekdag, weekDagen } from './rooster'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type UrenInstellingen = {
  terugval_goedkeurder_id: string | null
  tolerantie_uren: number
  indien_deadline_dag: number
  indien_deadline_tijd: string
  goedkeur_deadline_dag: number
  goedkeur_deadline_tijd: string
  /**
   * Waar weekstaten geaccordeerd worden. Standaard 'bouw7' — dat is de huidige praktijk en die
   * moet blijven werken zolang de overstap loopt. Per ploeg te overschrijven, zie `bepaalModus`.
   */
  goedkeuring_modus: 'eva' | 'bouw7'
}

const STANDAARD: UrenInstellingen = {
  terugval_goedkeurder_id: null,
  tolerantie_uren: 0,
  indien_deadline_dag: 5,
  indien_deadline_tijd: '17:00:00',
  goedkeur_deadline_dag: 1,
  goedkeur_deadline_tijd: '12:00:00',
  goedkeuring_modus: 'bouw7',
}

/** De singleton-rij. Valt terug op de standaarden als de rij (nog) ontbreekt. */
export async function getUrenInstellingen(): Promise<UrenInstellingen> {
  const supabase = db()
  const { data } = await supabase
    .from('uren_instellingen')
    .select('terugval_goedkeurder_id, tolerantie_uren, indien_deadline_dag, indien_deadline_tijd, goedkeur_deadline_dag, goedkeur_deadline_tijd, goedkeuring_modus')
    .eq('id', true)
    .maybeSingle()
  if (!data) return STANDAARD
  return { ...data, tolerantie_uren: Number(data.tolerantie_uren ?? 0) }
}

/**
 * Het dossier waar niet-projectgebonden uren (verlof, ziek, feestdag, tijd voor tijd) op geboekt
 * worden. Bouw7 eist een project op elke hour-log, dus zonder dit dossier kan zulk verlof niet
 * verstuurd worden — de weekstaat moet dat als blokkade tonen, niet stilzwijgend overslaan.
 *
 * Per werkmaatschappij in te stellen; valt terug op de eerste werkmaatschappij die er wél een
 * heeft, zodat één ingevulde instelling het hele bedrijf al werkend krijgt.
 */
export async function getIndirectDossierId(werkmaatschappijId: string | null): Promise<string | null> {
  const supabase = db()
  if (werkmaatschappijId) {
    const { data } = await supabase
      .from('bedrijfsgegevens')
      .select('indirect_uren_dossier_id')
      .eq('id', werkmaatschappijId)
      .maybeSingle()
    if (data?.indirect_uren_dossier_id) return data.indirect_uren_dossier_id
  }
  const { data: fallback } = await supabase
    .from('bedrijfsgegevens')
    .select('indirect_uren_dossier_id')
    .not('indirect_uren_dossier_id', 'is', null)
    .limit(1)
    .maybeSingle()
  return fallback?.indirect_uren_dossier_id ?? null
}

/**
 * Het moment waarop een week ingediend moet zijn: de ingestelde weekdag+tijd ná de maandag van
 * die week. Bij de standaard (dag 5, 17:00) is dat vrijdag 17:00 van diezelfde week.
 */
export function indienDeadline(weekStart: string, inst: UrenInstellingen): Date {
  return deadlineVan(weekStart, inst.indien_deadline_dag, inst.indien_deadline_tijd, false)
}

/**
 * Het moment waarop de goedkeuring rond moet zijn. De standaard is maandag 12:00 — dat is de
 * maandag ná de week, niet de maandag waarop de week begon; vandaar `volgendeWeek`.
 */
export function goedkeurDeadline(weekStart: string, inst: UrenInstellingen): Date {
  return deadlineVan(weekStart, inst.goedkeur_deadline_dag, inst.goedkeur_deadline_tijd, true)
}

function deadlineVan(weekStart: string, dag: number, tijd: string, volgendeWeek: boolean): Date {
  const dagen = weekDagen(weekStart)
  let datum = dagen.find(d => isoWeekdag(d) === dag) ?? dagen[dagen.length - 1]
  if (volgendeWeek) {
    const d = new Date(`${datum}T12:00:00`)
    d.setDate(d.getDate() + 7)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    datum = `${d.getFullYear()}-${mm}-${dd}`
  }
  const [uu = '0', mi = '0'] = tijd.split(':')
  const dt = new Date(`${datum}T00:00:00`)
  dt.setHours(Number(uu), Number(mi), 0, 0)
  return dt
}
