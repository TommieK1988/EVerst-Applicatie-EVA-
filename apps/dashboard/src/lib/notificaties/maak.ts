import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { stuurPush } from './push'

/**
 * Eén ingang voor het aanmaken van een melding.
 *
 * Waarom hier en niet los per module: een melding moet op twee plekken landen — in het
 * belletje in de app én als pushmelding op de telefoon. Wie zelf in `notificaties`
 * insert, slaat de push over. Gebruik daarom deze functie (of, waar de insert via de
 * pooler loopt, `stuurPush()` er direct achteraan).
 *
 * Gooit niet: de aanroeper is meestal een actie die niet mag klappen op een melding.
 */
export type NotificatieInvoer = {
  user_id: string
  type: string
  titel: string
  body?: string | null
  url?: string | null
  dossier_id?: string | null
  dossier_naam?: string | null
}

export async function maakNotificatie(input: NotificatieInvoer): Promise<void> {
  if (!input.user_id) return

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('notificaties')
      .insert({
        user_id:      input.user_id,
        type:         input.type,
        titel:        input.titel,
        body:         input.body ?? null,
        url:          input.url ?? null,
        dossier_id:   input.dossier_id ?? null,
        dossier_naam: input.dossier_naam ?? null,
        gelezen:      false,
      })
      .select('id')
      .single()

    await stuurPush(input.user_id, {
      titel: input.titel,
      // In het belletje toont EVA de dossiernaam als tweede regel; op de telefoon
      // is er maar één regel ruimte, dus daar wint de inhoudelijke tekst.
      body:  input.body ?? input.dossier_naam ?? null,
      url:   input.url ?? '/',
      type:  input.type,
      id:    (data as { id?: string } | null)?.id ?? null,
    })
  } catch {
    // stil — zie de kop van dit bestand
  }
}
