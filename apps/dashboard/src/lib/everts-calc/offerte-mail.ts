import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getMailSjabloonTekstOfNiets } from '@/lib/mail/sjabloon-bron'
import { MAIL_SOORT_INFO } from '@/lib/mail/sjablonen'
import type { RenderContext } from './quote-renderer'

/**
 * Rendering van het e-mailsjabloon waarmee een goedgekeurde offerte naar de opdrachtgever wordt
 * gemaild. De tekst zelf wordt beheerd in Instellingen -> E-mailsjablonen en staat in de tabel
 * `mail_sjablonen` (soort 'offerte'); dit bestand is alleen nog de offertekant ervan.
 *
 * Stond eerder als singleton in bedrijfsinstellingen.overige. Die twee sleutels blijven staan als
 * terugval voor het geval de migratie niet gedraaid is, maar er wordt niet meer naartoe geschreven.
 */

export interface OfferteMailSjabloon {
  onderwerp: string
  tekst: string
}

export const STANDAARD_MAIL_SJABLOON: OfferteMailSjabloon = MAIL_SOORT_INFO.offerte.standaard

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function getOfferteMailSjabloon(): Promise<OfferteMailSjabloon> {
  const uitBeheer = await getMailSjabloonTekstOfNiets('offerte')
  if (uitBeheer) return uitBeheer

  // Terugval voor een omgeving waar de mailsjabloon-migratie nog niet gedraaid is: daar staat de
  // aangepaste tekst nog in bedrijfsinstellingen.overige. Alleen kijken wanneer er écht geen beheerd
  // sjabloon is — niet wanneer de beheerde tekst toevallig gelijk is aan de standaard, want dan zou
  // een teruggezette tekst stilletijd door de oude worden overruled.
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige as Record<string, unknown> | null) ?? {}
  const onderwerp = typeof overige.offerte_mail_onderwerp === 'string' && overige.offerte_mail_onderwerp
    ? (overige.offerte_mail_onderwerp as string) : STANDAARD_MAIL_SJABLOON.onderwerp
  const tekst = typeof overige.offerte_mail_tekst === 'string' && overige.offerte_mail_tekst
    ? (overige.offerte_mail_tekst as string) : STANDAARD_MAIL_SJABLOON.tekst
  return { onderwerp, tekst }
}

/**
 * Bouwt de variabele-map voor de mail uit de offerte-render-context (dezelfde
 * bron als de PDF-variabelen). Ondersteunt een subset dotted keys.
 */
export function buildMailVars(ctx: RenderContext): Record<string, string> {
  return {
    'offerte.nummer': ctx.offerte.nummer,
    'offerte.titel': ctx.offerte.titel,
    'offerte.datum': ctx.offerte.datum,
    'offerte.geldig_tot': ctx.offerte.geldig_tot,
    'offerte.referentie': ctx.offerte.referentie,
    'klant.naam': ctx.klant.naam,
    'klant.bedrijfsnaam': ctx.klant.bedrijfsnaam,
    'klant.bedrijf_of_naam': ctx.klant.bedrijf_of_naam,
    'bedrijf.naam': ctx.bedrijf.naam,
    'dossier.contactpersoon': ctx.dossier.contactpersoon || ctx.klant.bedrijf_of_naam || 'heer/mevrouw',
    'contactpersoon.aanspreekvorm': ctx.contactpersoon.aanspreekvorm || 'heer/mevrouw',
    'dossier.werkadres': ctx.dossier.werkadres,
    'dossier.referentie': ctx.dossier.referentie,
  }
}

/** Vervangt {key}-placeholders in een tekst door hun waarde (onbekende blijven leeg). */
export function renderMailTekst(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z0-9_.]+)\}/gi, (_, key) => vars[key] ?? '')
}
