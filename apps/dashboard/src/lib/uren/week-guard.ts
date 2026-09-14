import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'

/**
 * De poort van de weekstaat: is deze week wel van jou, en mag hij nog gewijzigd worden?
 *
 * Apart bestand omdat er meer dan één 'use server'-module op leunt (`./weekstaat` voor de uren,
 * `./onkosten-acties` voor de kosten) en zo'n module alleen async functies mag exporteren — het
 * synchrone `bewerkbaar` zou daar niet uit kunnen. De controle hoort op één plek te staan; twee
 * kopieën is precies hoe een IDOR-gat ontstaat.
 *
 * Alles draait op de admin-client (service-role, bypast RLS) omdat een monteur een app_gebruiker
 * is en dus géén platformgebruiker: via de anon-client zou hij overal nul rijen zien. De
 * afscherming zit daarom hier in de code.
 */

export type WeekStatus = 'concept' | 'ingediend' | 'teamleider_akkoord' | 'goedgekeurd' | 'afgekeurd'

/**
 * Haalt de week op en controleert dat hij van de ingelogde medewerker is.
 * Elke muterende functie gaat hier langs; zonder deze guard zou een geraden week-id de uren van
 * een collega blootleggen (zie het IDOR-patroon in m/uren/[id]/page.tsx).
 */
export async function eigenWeek(weekId: string) {
  const medewerker = await vereisSessie()
  const supabase = createAdminClient()
  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, week_start, status, contracturen')
    .eq('id', weekId)
    .maybeSingle()
  if (!week) throw new Error('Week niet gevonden.')
  if (week.medewerker_id !== medewerker.id) throw new Error('Dit is niet jouw weekstaat.')
  return { medewerker, week, supabase }
}

/**
 * Een week is alleen te wijzigen zolang hij nog niet ingediend is (of is afgekeurd).
 *
 * Neemt bewust een gewone string: de statuskolom komt als `string` uit de database en een
 * cast op elke aanroepplek zou alleen maar ruis zijn.
 */
export function bewerkbaar(status: string | null | undefined) {
  return status === 'concept' || status === 'afgekeurd'
}
