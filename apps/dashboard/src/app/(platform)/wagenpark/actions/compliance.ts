'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/wagenpark/supabase/service-role'
import { vereisRecht } from '@/lib/auth/rechten'
import { voerComplianceUit } from '@/lib/wagenpark/compliance-kern'

/**
 * De compliance-controle draaien vanaf een knop in de app.
 *
 * Het rekenwerk staat in `lib/wagenpark/compliance-kern.ts`, zodat de
 * nachtelijke cron dezelfde controle kan draaien zonder ingelogde gebruiker.
 * Hier staat alleen de rechtencontrole omheen.
 */
export async function runComplianceAction(): Promise<{
  totaal: number
  perRegel: Record<string, number>
  ritten: number
}> {
  await vereisRecht('wagenpark', 'schrijven')
  return voerComplianceUit()
}

export async function markeerUitzonderingAction(bevinding_id: string, toelichting: string) {
  await vereisRecht('wagenpark', 'schrijven')
  const supabase = createServiceRoleClient()
  await supabase
    .from('compliance_bevindingen')
    .update({ status: 'geaccepteerd_uitzondering' })
    .eq('id', bevinding_id)
  await supabase.from('compliance_feedback').insert({
    bevinding_id,
    actie: 'markeer_uitzondering',
    toelichting,
  })
  revalidatePath('/wagenpark/ritten')
  revalidatePath('/wagenpark/bestuurders')
}

export async function bevestigOvertredingAction(bevinding_id: string, toelichting: string) {
  await vereisRecht('wagenpark', 'schrijven')
  const supabase = createServiceRoleClient()
  await supabase
    .from('compliance_bevindingen')
    .update({ status: 'afgewezen' })
    .eq('id', bevinding_id)
  await supabase.from('compliance_feedback').insert({
    bevinding_id,
    actie: 'bevestig_overtreding',
    toelichting,
  })
  revalidatePath('/wagenpark/ritten')
  revalidatePath('/wagenpark/bestuurders')
}

