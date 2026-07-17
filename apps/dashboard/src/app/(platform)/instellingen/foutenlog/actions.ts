'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'

type ActieResultaat = { ok: true } | { ok: false; error: string }

const PAD = '/instellingen/foutenlog'

/**
 * Vinkt een fout af. Puur administratief: de fout heropent vanzelf zodra hij opnieuw
 * gebeurt (zie log_fout() in migratie 20260716f), dus dit is een "ik heb ernaar
 * gekeken"-markering, geen belofte.
 */
export async function markeerOpgelost(id: string, notitie: string): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisBeheerder()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { error } = await admin
      .from('fout_logboek')
      .update({
        opgelost: true,
        opgelost_op: new Date().toISOString(),
        opgelost_door: medewerker.id,
        notitie: notitie.trim() || null,
      })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    revalidatePath(PAD)
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/** Zet een afgevinkte fout terug op open — voor als het toch niet opgelost bleek. */
export async function heropen(id: string): Promise<ActieResultaat> {
  try {
    await vereisBeheerder()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { error } = await admin
      .from('fout_logboek')
      .update({ opgelost: false, opgelost_op: null, opgelost_door: null })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    revalidatePath(PAD)
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}
