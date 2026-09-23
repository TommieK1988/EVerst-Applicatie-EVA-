'use server'

/**
 * mailintake/nabehandeling-actions.ts
 *
 * De knop "Nu opnieuw proberen" naast de teller in het beheerscherm.
 *
 * WAAROM DIT APART STAAT
 * De bewakingscron probeert een mislukte verplaatsing drie keer en geeft het
 * daarna op. Dat is de goede grens voor een automaat -- blijven hameren op
 * hetzelfde id levert niets op -- maar het laat wél een achterstand staan die
 * alleen met de hand weg te krijgen is. Zonder knop is het antwoord op "die
 * mails staan er nog" dat je tot de volgende werkdag moet wachten, en bij de
 * opgegeven berichten zelfs voor altijd.
 *
 * Een mens die hierop drukt is bovendien precies het soort beslissing waar de
 * hele nabehandelingsregel om draait: EVA verplaatst niets uit zichzelf wat
 * niemand heeft gezien.
 *
 * In een eigen bestand omdat `actions.ts` tegen de 800 regels aan zit; niet om
 * een inhoudelijke reden.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

import { vereisRecht } from '@/lib/auth/rechten'

import { voerNabehandelingUit } from './nabehandeling'

export interface HerkansingResultaat {
  ok: boolean
  /** Hoeveel er alsnog zijn bijgewerkt in Outlook. */
  gedaan: number
  /** Hoeveel er nog steeds blijven staan. */
  mislukt: number
  /** De reden van de eerste die niet lukte, voor de melding op het scherm. */
  eersteFout: string | null
  error?: string
}

/**
 * Probeert de hele achterstand opnieuw, inclusief de berichten die de cron al
 * had opgegeven. De pogingenteller wordt bewust teruggezet: die telt hoe vaak de
 * automaat het probeerde, en dit is geen automaat.
 */
export async function probeerNabehandelingOpnieuw(): Promise<HerkansingResultaat> {
  await vereisRecht('mailintake', 'beheren')
  const supabase = createAdminClient()

  const { data: openstaand } = await supabase
    .from('mailintake_berichten')
    .select('id')
    .in('status', ['verwerkt', 'genegeerd', 'geen_aanvraag'])
    .in('outlook_nabehandeling', ['open', 'mislukt'])
    .order('behandeld_op', { ascending: true })
    .limit(100)

  const rijen = openstaand ?? []
  if (!rijen.length) {
    return { ok: true, gedaan: 0, mislukt: 0, eersteFout: null }
  }

  // Terug naar nul, anders slaat `voerNabehandelingUit` de berichten over die de
  // cron eerder heeft opgegeven -- juist de gevallen waarvoor deze knop bestaat.
  await supabase
    .from('mailintake_berichten')
    .update({ outlook_pogingen: 0 })
    .in('id', rijen.map(r => r.id))

  let gedaan = 0
  let mislukt = 0
  let eersteFout: string | null = null

  for (const r of rijen) {
    const res = await voerNabehandelingUit(r.id)
    if (res.gedaan) gedaan++
    else if (!res.overgeslagen) {
      mislukt++
      eersteFout ??= res.fout ?? null
    }
  }

  revalidatePath('/instellingen/mailintake')
  revalidatePath('/mailintake')
  return { ok: true, gedaan, mislukt, eersteFout }
}
