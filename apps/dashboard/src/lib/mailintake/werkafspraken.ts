import 'server-only'

/**
 * mailintake/werkafspraken.ts
 *
 * De afspraken die de binnendienst zelf aan EVA meegeeft over het lezen van de post.
 *
 * WAAROM DIT BESTAAT
 * Elke regel over hoe een mail gelezen moet worden stond tot nu toe in code. "Een
 * mandaat betekent altijd regie", "een treffer op alleen het adres is geen offerte",
 * "deze opdrachtgever zet het bonnummer in de onderwerpregel" -- allemaal via een
 * ontwikkelaar en een deploy. De mensen die de post dagelijks lezen weten dat soort
 * dingen als eerste en konden er niets mee.
 *
 * WAT EEN AFSPRAAK WEL EN NIET IS
 * Een afspraak stuurt het **lezen**. Hij bepaalt niet wat er gebeurt: de categorie
 * komt uit een witte lijst, het adres gaat langs PDOK, bedragen langs een
 * bereikcontrole, en route, fase en duplicaten volgen code met tests eronder. Dat is
 * bewust. Zou een afspraak die poorten kunnen openzetten, dan was één regel als
 * "neem alles over wat de klant schrijft" genoeg om de hele controle te omzeilen --
 * en dan is het geen aanwijzing meer maar een achterdeur.
 *
 * Dit bestand is de leeskant, voor de verwerking die zonder sessie draait. Het
 * beheren gebeurt in `werkafspraken-actions.ts`, met rechtencontrole.
 */

import { createAdminClient } from '@everts/database/server'

import type { Werkafspraak } from './types'

export type { Werkafspraak }

/** Hoeveel afspraken er maximaal meegaan. Zie `haalWerkafsprakenVoorPrompt`. */
export const MAX_AFSPRAKEN_IN_PROMPT = 40

/**
 * De afspraken die bij deze postbus horen, als platte regels voor de prompt.
 *
 * Algemene afspraken eerst, daarna die van de postbus zelf: specifiek wint van
 * algemeen, en bij een tegenstrijdigheid leest een model de laatste regel als de
 * geldende.
 *
 * Begrensd op `MAX_AFSPRAKEN_IN_PROMPT`. Niet om tokens te sparen maar omdat een
 * lijst die blijft groeien op een punt zichzelf begint tegen te spreken zonder dat
 * iemand dat ziet. Loopt de lijst vol, dan hoort hij opgeruimd te worden -- en dan
 * moet dat opvallen in plaats van stil af te kappen.
 */
export async function haalWerkafsprakenVoorPrompt(postbusId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_werkafspraken')
    .select('tekst, postbus_id')
    .is('gearchiveerd_op', null)
    .eq('actief', true)
    .or(`postbus_id.is.null,postbus_id.eq.${postbusId}`)
    .order('postbus_id', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(MAX_AFSPRAKEN_IN_PROMPT)

  return (data ?? []).map(r => (r.tekst ?? '').trim()).filter(Boolean)
}

/** Alle afspraken voor het beheerscherm, inclusief de uitgezette. */
export async function haalWerkafspraken(): Promise<Werkafspraak[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_werkafspraken')
    .select('id, postbus_id, tekst, uitleg, actief, aangemaakt_door, created_at')
    .is('gearchiveerd_op', null)
    .order('created_at', { ascending: false })
    .limit(200)

  return (data ?? []).map(r => ({
    id: r.id,
    postbusId: r.postbus_id ?? null,
    tekst: r.tekst,
    uitleg: r.uitleg ?? null,
    actief: r.actief,
    aangemaaktDoor: r.aangemaakt_door ?? null,
    createdAt: r.created_at,
  }))
}
