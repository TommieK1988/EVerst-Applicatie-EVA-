'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@everts/database/server'
import { createServiceRoleClient } from '@/lib/wagenpark/supabase/service-role'
import { vereisRecht } from '@/lib/auth/rechten'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'

/**
 * Auth-user-id van de ingelogde gebruiker; `compliance_feedback.gebruiker_id`
 * wijst naar auth.users. Zelfde helper als in handmatige-bevinding.ts.
 *
 * De oudere acties in compliance.ts laten dit veld leeg, waardoor van een
 * afgehandelde bevinding alleen bekend is dát er iets besloten is en niet door
 * wie. Bij werktijden wil je dat wél kunnen terugzien.
 */
async function huidigeAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Afhandelen van een werktijd-signaal vanaf /wagenpark/werktijden.
 *
 * Waarom een eigen action en niet die uit compliance.ts: die revalideren alleen
 * /wagenpark/ritten en /wagenpark/bestuurders, waardoor een afgehandelde dag hier
 * in de lijst bleef staan. Bovendien is dit scherm Directie/beheer-only, dus de
 * privacypoort hoort er ook voor de schrijfkant omheen.
 *
 * LET OP bij de statuswaarden — ze heten tegenintuïtief:
 *
 *   geaccepteerd_uitzondering = de afwijking is verklaard, geen actie nodig
 *   afgewezen                 = de verklaring is afgewezen; de overtreding staat
 *
 * `afgewezen` betekent dus NIET "signaal ingetrokken". Wie dat verwart, filtert
 * precies de bevestigde overtredingen weg. Intrekken van een handmatig signaal
 * gaat via `verwijderHandmatigeBevinding`.
 */

export type AfhandelUitkomst = 'verklaard' | 'bespreken'

const STATUS_PER_UITKOMST: Record<AfhandelUitkomst, string> = {
  verklaard: 'geaccepteerd_uitzondering',
  bespreken: 'afgewezen',
}

const ACTIE_PER_UITKOMST: Record<AfhandelUitkomst, string> = {
  verklaard: 'markeer_uitzondering',
  bespreken: 'bevestig_overtreding',
}

export async function handelWerktijdSignaalAf(
  bevinding_id: string,
  uitkomst: AfhandelUitkomst,
  toelichting: string,
): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden afhandelen.' }
  }

  const status = STATUS_PER_UITKOMST[uitkomst]
  if (!status) return { ok: false, error: 'Onbekende uitkomst.' }

  const supabase = createServiceRoleClient()

  const { error: updateFout } = await supabase
    .from('compliance_bevindingen')
    .update({ status })
    .eq('id', bevinding_id)
  if (updateFout) return { ok: false, error: updateFout.message }

  // De feedbackregel is de audit trail: wie vond wanneer wat, en waarom. Faalt
  // hij, dan is de statuswijziging al doorgevoerd — dat melden we, in plaats van
  // te doen alsof er niets gebeurde.
  const { error: feedbackFout } = await supabase.from('compliance_feedback').insert({
    bevinding_id,
    gebruiker_id: await huidigeAuthUserId(),
    actie: ACTIE_PER_UITKOMST[uitkomst],
    toelichting: toelichting.trim(),
  })

  revalidatePath('/wagenpark/werktijden')
  revalidatePath('/wagenpark/ritten')
  revalidatePath('/wagenpark/bestuurders')

  if (feedbackFout) {
    return { ok: false, error: `Status is aangepast, maar de toelichting niet bewaard: ${feedbackFout.message}` }
  }
  return { ok: true }
}

/** Terug naar 'open' — voor als je je vergist hebt bij het afvinken. */
export async function heropenWerktijdSignaal(
  bevinding_id: string,
): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('wagenpark', 'schrijven')
  if (!(await magPriveRittenZien())) {
    return { ok: false, error: 'Alleen directie en beheer kunnen werktijden afhandelen.' }
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('compliance_bevindingen')
    .update({ status: 'open' })
    .eq('id', bevinding_id)
  if (error) return { ok: false, error: error.message }

  await supabase.from('compliance_feedback').insert({
    bevinding_id,
    actie: 'heropend',
    toelichting: 'Teruggezet naar te controleren.',
  })

  revalidatePath('/wagenpark/werktijden')
  revalidatePath('/wagenpark/ritten')
  return { ok: true }
}
