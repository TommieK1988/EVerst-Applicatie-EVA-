import 'server-only'
import type { GebruikerType } from '@everts/database/platform-types'
import { getMailSjabloonTekst } from '@/lib/mail/sjabloon-bron'
import { mailTekstNaarHtml, mailOnderwerp } from '@/lib/mail/opmaak'

/**
 * uitnodiging-mail.ts
 *
 * De uitnodigingsmail voor een nieuwe EVA-gebruiker. Supabase Auth verstuurt
 * deze mail bewust NIET zelf: de actie verstuurt hem via Graph namens de
 * beheerder die uitnodigt. Zo staat de tekst in de codebase, komt de mail uit
 * een @everts.chat-mailbox en gelden de rate limits van de Supabase-mailer niet.
 *
 * Twee smaken, want de twee gebruikerstypen komen langs verschillende wegen
 * binnen: een platformgebruiker logt altijd met Microsoft in (desktop én mobiel)
 * en heeft dus geen wachtwoord en geen activatielink nodig — de koppeling aan
 * zijn medewerkerrecord legt /auth/callback bij de eerste login op e-mailadres.
 * Een app-gebruiker heeft geen Microsoft-account en logt op /m in met e-mail +
 * wachtwoord; die krijgt wél een activatielink om dat wachtwoord te kiezen.
 *
 * Opmaak met inline styles — Outlook negeert <style>-blokken grotendeels.
 * Zelfde wikkel als de oplevermails (lib/dossiers/oplevering-mail.ts).
 */

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function schoonBasisUrl(ruw: string): string {
  return ruw
    .replace(/^['"]|['"]$/g, '')          // omringende quotes
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')   // per ongeluk meegeplakte "KEY=" (bv. NEXT_PUBLIC_APP_URL=)
    .trim()
    .replace(/\/+$/, '')                  // trailing slash(es)
}

/** Basis-URL van EVA voor links in de mail. */
export function appBaseUrl(): string {
  const ruw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return schoonBasisUrl(ruw)
}

function knop(href: string, tekst: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">
    <tr><td style="background:#009439;border-radius:8px">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">${esc(tekst)}</a>
    </td></tr>
  </table>`
}

function wikkel(titel: string, inhoud: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a1f24;max-width:640px">
  <div style="border-bottom:2px solid #009439;padding-bottom:10px;margin-bottom:16px">
    <span style="font-weight:800;letter-spacing:.06em;font-size:16px">EVERTS.</span>
    <div style="font-size:17px;font-weight:700;margin-top:4px">${esc(titel)}</div>
  </div>
  ${inhoud}
  <div style="margin-top:22px;padding-top:10px;border-top:1px solid #e4e8e7;font-size:11px;color:#8a938f">
    Verstuurd vanuit EVA — Everts.
  </div>
</div>`
}

export type UitnodigingMailInput = {
  voornaam: string | null
  gebruikerType: GebruikerType
  /** Activatielink uit Supabase (`generateLink`) — alleen voor app-gebruikers. */
  actieLink: string | null
  /** Naam van de beheerder die uitnodigt; verschijnt in de afsluiting. */
  afzenderNaam: string | null
  /** Herinnering i.p.v. eerste uitnodiging (account bestond al). */
  herhaling?: boolean
}

/**
 * Bouwt onderwerp + HTML van de uitnodiging. De tekst komt uit Instellingen -> E-mailsjablonen;
 * er zijn twee sjablonen omdat de twee gebruikerstypen langs verschillende wegen binnenkomen.
 * De knop wordt hier gebouwd: de activatielink van een app-gebruiker is eenmalig en persoonlijk en
 * hoort niet in een beheerd tekstveld thuis.
 */
export async function bouwUitnodigingsMail(
  input: UitnodigingMailInput,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  const { voornaam, gebruikerType, actieLink, afzenderNaam, herhaling } = input
  const app = appBaseUrl()
  const platform = gebruikerType === 'platform_gebruiker'
  const titel = herhaling ? 'Je toegang tot EVA' : 'Welkom bij EVA'

  const vars: Record<string, string> = {
    aanhef: voornaam ? `Hallo ${voornaam},` : 'Hallo,',
    voornaam: voornaam ?? '',
    'eva.url': app,
    'eva.mobiel_url': `${app}/m`,
    titel,
    'afzender.naam': afzenderNaam ?? '',
  }

  const sjabloon = await getMailSjabloonTekst(
    platform ? 'gebruiker_uitnodiging_platform' : 'gebruiker_uitnodiging_app',
  )
  const bodyHtml = mailTekstNaarHtml(sjabloon.tekst, {
    vars,
    blokken: {
      knop: platform
        ? knop(app, 'Ga naar EVA')
        : knop(actieLink ?? app, 'Wachtwoord instellen'),
    },
  })

  return { onderwerp: mailOnderwerp(sjabloon.onderwerp, vars), bodyHtml: wikkel(titel, bodyHtml) }
}
