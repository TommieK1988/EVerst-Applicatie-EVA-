/**
 * Hulpjes om acties volledig op te halen, naast taken.ts (dat al boven de 800 regels zit).
 * Alleen server-side: gebruikt de admin-client.
 */
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/**
 * Id's van alle taken waaraan deze gebruiker is toegewezen. Gepagineerd: `task_assignees`
 * bewaart ook afgeronde taken, dus dit groeit per persoon gestaag door. Admin-client om
 * dezelfde reden als in `telMijnOpenTaken` (taken.ts).
 */
export async function toegewezenTaakIds(userId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const rijen = await haalAlleRijen<{ task_id: string }>((van, tot) => supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId)
    .order('task_id')
    .range(van, tot))
  return rijen.map(r => r.task_id)
}

/**
 * Deadline aflopend, zonder deadline achteraan: de volgorde die deze lijsten altijd hadden.
 * Opgehaald in blokken komt die niet meer vanzelf uit de database.
 */
export function deadlineAflopend(a: { deadline?: unknown }, b: { deadline?: unknown }): number {
  const da = (a.deadline as string | null) ?? ''
  const db = (b.deadline as string | null) ?? ''
  if (!da || !db) return da ? -1 : db ? 1 : 0
  return db.localeCompare(da)
}
