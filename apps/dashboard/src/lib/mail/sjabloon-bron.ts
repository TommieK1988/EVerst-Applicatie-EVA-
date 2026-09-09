import 'server-only'
import { createAdminClient } from '@everts/database/server'
import {
  MAIL_SOORT_INFO, isMailSoort,
  type MailSjabloon, type MailSoort,
} from './sjablonen'

/**
 * sjabloon-bron.ts — waar de verzendkant zijn mailtekst vandaan haalt.
 *
 * Eén regel: staat er een actief sjabloon in `mail_sjablonen`, dan wint dat; anders de
 * standaardtekst uit `lib/mail/sjablonen.ts`. Zo verandert er niets aan de uitgaande post zolang
 * niemand in Instellingen iets heeft aangepast, en blijft de code de terugval — ook als een rij
 * per ongeluk leeg wordt opgeslagen.
 *
 * Bewust géén cache: mailtekst is zeldzaam gelezen (bij het versturen van één mail) en een
 * aanpassing moet meteen gelden. Een stale tekst die pas na een deploy verdwijnt is hier erger dan
 * één extra query.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type MailTekst = { onderwerp: string; tekst: string }

/**
 * Onderwerp en tekst voor één mailmoment. Lege velden vallen per veld terug op de standaard,
 * niet per rij: een sjabloon waarin alleen het onderwerp is aangepast houdt de standaardtekst.
 */
export async function getMailSjabloonTekst(soort: MailSoort): Promise<MailTekst> {
  return (await getMailSjabloonTekstOfNiets(soort)) ?? MAIL_SOORT_INFO[soort].standaard
}

/**
 * Zelfde, maar geeft `null` terug wanneer er gewoon geen beheerd sjabloon is. Alleen nodig waar het
 * verschil telt tussen "hij heeft de standaardtekst overgetypt" en "er staat niets" — de offertemail
 * kent nog een oudere opslagplek en moet weten of hij daarnaar mag terugvallen.
 */
export async function getMailSjabloonTekstOfNiets(soort: MailSoort): Promise<MailTekst | null> {
  const standaard = MAIL_SOORT_INFO[soort].standaard
  try {
    const { data } = await db()
      .from('mail_sjablonen')
      .select('onderwerp, tekst')
      .eq('soort', soort)
      .eq('actief', true)
      .order('volgorde', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!data) return null
    return {
      onderwerp: (data.onderwerp ?? '').trim() || standaard.onderwerp,
      tekst: (data.tekst ?? '').trim() || standaard.tekst,
    }
  } catch {
    // Een mail die niet uitgaat omdat de instellingentabel hapert is erger dan een mail met de
    // standaardtekst. Daarom vangen we hier en gaan we door.
    return null
  }
}

/** Alle opgeslagen sjablonen, voor het beheerscherm. */
export async function getMailSjablonen(): Promise<MailSjabloon[]> {
  const { data } = await db()
    .from('mail_sjablonen')
    .select('id, soort, naam, onderwerp, tekst, actief, volgorde, updated_at')
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).filter(r => isMailSoort(r.soort)) as MailSjabloon[]
}
