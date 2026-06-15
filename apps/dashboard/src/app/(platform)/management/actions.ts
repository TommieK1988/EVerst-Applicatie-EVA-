'use server'

import { revalidatePath } from 'next/cache'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'

export async function syncManagementAction(): Promise<{ nieuw: number; bijgewerkt: number; fouten: number; foutMelding?: string }> {
  const result = await syncManagementProjecten()
  revalidatePath('/management')
  return result
}
