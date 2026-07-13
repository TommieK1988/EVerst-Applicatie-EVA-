import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { RenderContext } from './quote-renderer'

/**
 * Beheer + rendering van het standaard e-mailsjabloon waarmee een goedgekeurde
 * offerte naar de opdrachtgever wordt gemaild. Opgeslagen als singleton in
 * bedrijfsinstellingen.overige (offerte_mail_onderwerp / offerte_mail_tekst),
 * net als de goedkeuring-drempel.
 */

export interface OfferteMailSjabloon {
  onderwerp: string
  tekst: string // HTML
}

export const STANDAARD_MAIL_SJABLOON: OfferteMailSjabloon = {
  onderwerp: 'Offerte {offerte.nummer} — {offerte.titel}',
  tekst: [
    'Geachte {dossier.contactpersoon},',
    '',
    'Hierbij ontvangt u onze offerte {offerte.nummer} voor {offerte.titel}.',
    'De offerte is geldig tot {offerte.geldig_tot}. Onze algemene voorwaarden zijn als bijlage toegevoegd.',
    '',
    'Heeft u vragen? Neem gerust contact met ons op.',
    '',
    'Met vriendelijke groet,',
    '{bedrijf.naam}',
  ].join('\n'),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function getOfferteMailSjabloon(): Promise<OfferteMailSjabloon> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige as Record<string, unknown> | null) ?? {}
  const onderwerp = typeof overige.offerte_mail_onderwerp === 'string' && overige.offerte_mail_onderwerp
    ? (overige.offerte_mail_onderwerp as string) : STANDAARD_MAIL_SJABLOON.onderwerp
  const tekst = typeof overige.offerte_mail_tekst === 'string' && overige.offerte_mail_tekst
    ? (overige.offerte_mail_tekst as string) : STANDAARD_MAIL_SJABLOON.tekst
  return { onderwerp, tekst }
}

export async function setOfferteMailSjabloon(sjabloon: OfferteMailSjabloon): Promise<void> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige as Record<string, unknown> | null) ?? {}
  await db().from('bedrijfsinstellingen').update({
    overige: { ...overige, offerte_mail_onderwerp: sjabloon.onderwerp, offerte_mail_tekst: sjabloon.tekst },
  }).eq('id', 1)
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
