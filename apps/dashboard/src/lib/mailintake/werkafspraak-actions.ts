'use server'

/**
 * mailintake/werkafspraak-actions.ts
 *
 * Het beheren van werkafspraken, en het geven van een aanwijzing bij één bericht.
 *
 * TWEE SOORTEN, ÉÉN INVOERVAK
 * Op het behandelscherm typ je wat EVA moet weten en kies je de reikwijdte: alleen
 * dit bericht, of vanaf nu altijd. Dat tweede slaat hetzelfde zinnetje op als
 * werkafspraak. Zo hoeft niemand vooraf te bedenken of iets een regel is -- dat
 * blijkt vaak pas bij de derde keer dat je het typt.
 *
 * De grens staat in `werkafspraken.ts`: een afspraak stuurt het lezen, niet de
 * besluiten. Dit bestand verandert daar niets aan; het bewaart alleen tekst en
 * trapt een herlezing af.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'

import { legWerkafspraakUit } from './werkafspraak-uitleg'
import { haalWerkafspraken, MAX_AFSPRAKEN_IN_PROMPT, type Werkafspraak } from './werkafspraken'

/** Hetzelfde antwoord voor alle drie de knoppen; het scherm toont `uitleg` als die er is. */
export interface AfspraakAntwoord {
  ok: boolean
  error?: string
  /** Wat EVA van de afspraak begreep. Null als de uitleg niet gelukt is. */
  uitleg?: string | null
  /** False als EVA zegt dat hij de afspraak niet (helemaal) kan opvolgen. */
  volledig?: boolean
}

const schoon = (t: string) => (t ?? '').trim().replace(/\s+/g, ' ')

/**
 * Een nieuwe werkafspraak, geldig voor alle post of voor één postbus.
 *
 * De uitleg van EVA wordt meteen opgeslagen. Mislukt die aanroep, dan gaat de
 * afspraak er alsnog in: de afspraak is wat telt, de uitleg is de controle erop.
 */
export async function bewaarWerkafspraak(
  tekst: string,
  postbusId: string | null,
): Promise<AfspraakAntwoord> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const t = schoon(tekst)
  if (t.length < 3) return { ok: false, error: 'Schrijf iets meer; één woord is geen afspraak.' }
  if (t.length > 2000) return { ok: false, error: 'Dat is te lang. Knip het op in losse afspraken.' }

  const supabase = createAdminClient()

  // Vol is vol, en dat moet opvallen. Een lijst die ongemerkt blijft groeien gaat
  // zichzelf op een punt tegenspreken, en dan is niet te zien welke regel wint.
  const { count } = await supabase
    .from('mailintake_werkafspraken')
    .select('id', { count: 'exact', head: true })
    .is('gearchiveerd_op', null)
    .eq('actief', true)
  if ((count ?? 0) >= MAX_AFSPRAKEN_IN_PROMPT) {
    return {
      ok: false,
      error: `Er staan al ${count} afspraken aan. Zet er eerst een paar uit die niet meer gelden —`
        + ' anders gaan ze elkaar tegenspreken zonder dat iemand ziet welke voorgaat.',
    }
  }

  const uitleg = await legWerkafspraakUit(t, { watHetIs: 'werkafspraak' })

  const { error } = await supabase.from('mailintake_werkafspraken').insert({
    tekst: t,
    postbus_id: postbusId,
    uitleg: uitleg?.uitleg ?? null,
    aangemaakt_door: medewerker.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/instellingen/mailintake')
  revalidatePath('/mailintake')
  return { ok: true, uitleg: uitleg?.uitleg ?? null, volledig: uitleg?.volledig ?? true }
}

/** Afspraak aan of uit, zonder hem kwijt te raken. */
export async function zetWerkafspraakActief(id: string, actief: boolean): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  await supabase.from('mailintake_werkafspraken')
    .update({ actief, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

/**
 * Archiveren, niet verwijderen.
 *
 * Een afspraak verklaart hoe de post in die periode gelezen is. Weggooien maakt een
 * dossier uit vorige maand onverklaarbaar; zie DEVELOPMENT_STANDARDS.md §5.5.
 */
export async function archiveerWerkafspraak(id: string): Promise<{ ok: boolean }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  await supabase.from('mailintake_werkafspraken')
    .update({ gearchiveerd_op: new Date().toISOString(), actief: false })
    .eq('id', id)
  revalidatePath('/instellingen/mailintake')
  return { ok: true }
}

export async function getWerkafspraken(): Promise<Werkafspraak[]> {
  await vereisRecht('mailintake', 'lezen')
  return haalWerkafspraken()
}

/**
 * Een aanwijzing bij dit ene bericht, en meteen opnieuw laten lezen.
 *
 * De aanwijzing komt op het bericht te staan en gaat als eigen blok de prompt in,
 * vóór de mail. Dat is waarom hij blijft staan: hij hoort elke volgende herlezing
 * mee te doen, anders ben je hem na één klik op "opnieuw lezen" weer kwijt.
 *
 * Herlezen gebeurt hier en niet in een aparte klik: een aanwijzing geven zonder er
 * iets mee te doen is een invoervak dat niets lijkt te doen.
 */
export async function geefAanwijzing(
  berichtId: string,
  tekst: string,
  opties: { onthouden?: boolean; postbusId?: string | null } = {},
): Promise<AfspraakAntwoord> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const t = schoon(tekst)
  if (t.length < 3) return { ok: false, error: 'Schrijf iets meer; één woord is geen aanwijzing.' }
  if (t.length > 2000) return { ok: false, error: 'Dat is te lang voor één aanwijzing.' }

  const supabase = createAdminClient()
  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('dossier_id, onderwerp')
    .eq('id', berichtId)
    .maybeSingle()
  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }
  // Hetzelfde slot als op `leesOpnieuw`: opnieuw lezen van een bericht dat al een
  // dossier heeft zou het formulier naast een bestaand dossier zetten.
  if (b.dossier_id) return { ok: false, error: 'Aan dit bericht hangt al een dossier.' }

  const uitleg = await legWerkafspraakUit(t, { watHetIs: 'aanwijzing', onderwerp: b.onderwerp })

  await supabase.from('mailintake_berichten').update({
    aanwijzing: t,
    aanwijzing_op: new Date().toISOString(),
    aanwijzing_door: medewerker.id,
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'aanwijzing_gegeven',
    details: { tekst: t, onthouden: opties.onthouden === true, uitleg: uitleg?.uitleg ?? null },
  })

  if (opties.onthouden) {
    // Bewust niet via `bewaarWerkafspraak`: die doet zijn eigen rechtencontrole en
    // een tweede uitleg-aanroep, en we hebben de uitleg hier al.
    await supabase.from('mailintake_werkafspraken').insert({
      tekst: t,
      postbus_id: opties.postbusId ?? null,
      uitleg: uitleg?.uitleg ?? null,
      aangemaakt_door: medewerker.id,
    })
  }

  const { leesOpnieuw } = await import('./actions')
  const res = await leesOpnieuw(berichtId)

  revalidatePath('/mailintake')
  return res.ok
    ? { ok: true, uitleg: uitleg?.uitleg ?? null, volledig: uitleg?.volledig ?? true }
    : { ok: false, error: res.error, uitleg: uitleg?.uitleg ?? null }
}

/** De aanwijzing weer eraf, en opnieuw lezen zonder. */
export async function wisAanwijzing(berichtId: string): Promise<{ ok: boolean; error?: string }> {
  await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()
  await supabase.from('mailintake_berichten')
    .update({ aanwijzing: null, aanwijzing_op: null, aanwijzing_door: null })
    .eq('id', berichtId)

  const { leesOpnieuw } = await import('./actions')
  const res = await leesOpnieuw(berichtId)
  revalidatePath('/mailintake')
  return res
}
