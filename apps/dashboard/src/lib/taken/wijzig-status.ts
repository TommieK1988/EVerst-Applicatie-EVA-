import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import type { TaskStatus } from '@/lib/taken/supabase/database.types'

/**
 * Voor client-componenten: zet de status en gooit bij een taakregel een `Error` mét de uitleg,
 * zodat de bestaande `catch (e) { toast.error(e.message) }` gewoon de goede tekst toont.
 */
export async function wijzigTaakStatus(id: string, status: TaskStatus): Promise<void> {
  const uitkomst = await updateTaakStatus(id, status)
  if (!uitkomst.ok) throw new Error(uitkomst.error)
}
