'use server'

// Wie beoordeelt de weekstaat van een medewerker, en langs welke route.
//
// Accorderen gebeurt vandaag in Bouw7 (de vlag `isApproved` op een uurregel). Dat blijft werken
// zolang de overstap loopt; de modus bepaalt welke route een week volgt:
//
//   'bouw7' — indienen stuurt de uren meteen naar Bouw7 met approved = false. Accorderen gebeurt
//             daarna op het Uren-overzicht (lib/uren/bouw7-goedkeuring.ts) of in Bouw7 zelf;
//             EVA leest `isApproved` terug.
//   'eva'   — de weekstaat houdt zijn eigen tussenstand bij in `uren_weken`.
//
// LET OP: het scherm dat die 'eva'-keten afhandelde is verwijderd. De statusovergangen bestaan nog
// in het datamodel, maar er is op dit moment geen plek waar iemand een ingediende week beoordeelt.
// Zolang de modus op 'bouw7' staat maakt dat niets uit; zet je hem op 'eva', dan blijft een
// ingediende week hangen tot daar weer een scherm voor is.
//
// De modus wordt bij indienen op de week bevroren. Zet iemand de instelling halverwege om, dan
// blijft een lopende week op zijn eigen route — anders zou een week die op de teamleider wacht
// ineens op een Bouw7-vlag gaan wachten die nooit komt.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getUrenInstellingen } from './instellingen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type GoedkeuringModus = 'eva' | 'bouw7'

/**
 * Welke route geldt voor deze medewerker: de ploeg mag de bedrijfsinstelling overschrijven,
 * zodat je met één ploeg kunt proefdraaien.
 */
export async function bepaalModus(medewerkerId: string): Promise<GoedkeuringModus> {
  const supabase = db()
  const [{ data: mw }, inst] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('ploeg_id, ploegen!medewerkers_ploeg_id_fkey(goedkeuring_modus)')
      .eq('id', medewerkerId)
      .maybeSingle(),
    getUrenInstellingen(),
  ])
  const perPloeg = mw?.ploegen?.goedkeuring_modus as GoedkeuringModus | null | undefined
  return perPloeg ?? (inst.goedkeuring_modus as GoedkeuringModus)
}

/**
 * Wie de week van deze medewerker beoordeelt in de EVA-route.
 *
 * De teamleider van de ploeg is de normale route. 32 van de 52 actieve medewerkers zitten in geen
 * ploeg, dus zonder terugval zou hun week nergens heen kunnen; daarom de instelbare
 * terugvalgoedkeurder, en als laatste redmiddel iemand van Directie. Levert null op als er
 * werkelijk niemand is — dat moet als blokkade zichtbaar worden, niet stilzwijgend doorlopen.
 */
export async function bepaalTeamleider(medewerkerId: string): Promise<string | null> {
  const supabase = db()
  const { data: mw } = await supabase
    .from('medewerkers')
    .select('ploeg_id, ploegen!medewerkers_ploeg_id_fkey(teamleider_id)')
    .eq('id', medewerkerId)
    .maybeSingle()

  const teamleider = mw?.ploegen?.teamleider_id as string | null | undefined
  // Je eigen week goedkeuren gaat niet: een teamleider die zelf in zijn ploeg zit valt terug.
  if (teamleider && teamleider !== medewerkerId) return teamleider

  const inst = await getUrenInstellingen()
  if (inst.terugval_goedkeurder_id && inst.terugval_goedkeurder_id !== medewerkerId) {
    return inst.terugval_goedkeurder_id
  }

  const { data: directie } = await supabase
    .from('medewerkers')
    .select('id')
    .eq('actief', true)
    .eq('afdeling', 'Directie')
    .neq('id', medewerkerId)
    .limit(1)
    .maybeSingle()
  return directie?.id ?? null
}
