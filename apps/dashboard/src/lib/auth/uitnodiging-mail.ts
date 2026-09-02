import 'server-only'
import type { GebruikerType } from '@everts/database/platform-types'

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
 * Bouwt onderwerp + HTML van de uitnodiging. De inhoud verschilt per
 * gebruikerstype: platformgebruikers loggen op de desktop met Microsoft in,
 * app-gebruikers hebben juist een wachtwoord nodig voor de mobiele app.
 */
export function bouwUitnodigingsMail(input: UitnodigingMailInput): { onderwerp: string; bodyHtml: string } {
  const { voornaam, gebruikerType, actieLink, afzenderNaam, herhaling } = input
  const aanhef = voornaam ? `Hallo ${esc(voornaam)},` : 'Hallo,'
  const app = appBaseUrl()
  const groet = afzenderNaam
    ? `<p style="font-size:13px;line-height:1.6;margin-top:18px">Met vriendelijke groet,<br>${esc(afzenderNaam)}</p>`
    : ''

  const platform = gebruikerType === 'platform_gebruiker'

  const inhoud = platform
    ? `
  <p style="font-size:13px;line-height:1.6">${aanhef}</p>
  <p style="font-size:13px;line-height:1.6">
    Je hebt toegang gekregen tot <strong>EVA</strong>, het platform van Everts. Daarin vind je onder andere
    de dossiers, planning, calculaties, offertes en je eigen acties — alles op één plek.
  </p>
  <p style="font-size:13px;line-height:1.6">
    Inloggen doe je met je Microsoft-account, hetzelfde account als je mail. Je hoeft dus niets te activeren
    en geen wachtwoord aan te maken: klik op de knop en kies <em>Inloggen met Microsoft</em>.
  </p>
  ${knop(app, 'Ga naar EVA')}
  <p style="font-size:12.5px;line-height:1.6;color:#4a545b">
    Op je telefoon werkt het net zo: open <a href="${esc(app)}/m" style="color:#009439;font-weight:600">${esc(app)}/m</a>
    en log ook daar in met Microsoft. Zet die pagina via het deelmenu van je browser op je beginscherm,
    dan opent EVA voortaan als een gewone app.
  </p>`
    : `
  <p style="font-size:13px;line-height:1.6">${aanhef}</p>
  <p style="font-size:13px;line-height:1.6">
    Je hebt toegang gekregen tot de <strong>EVA-app</strong> van Everts. Daarin zie je je taken en werkbonnen,
    en registreer je je uren, foto's en formulieren op locatie.
  </p>
  <p style="font-size:13px;line-height:1.6">
    Kies eerst een wachtwoord. Daarna log je in met je e-mailadres en dat wachtwoord.
  </p>
  ${knop(actieLink ?? app, 'Wachtwoord instellen')}
  <p style="font-size:12.5px;line-height:1.6;color:#4a545b">
    Open de app daarna op je telefoon via <a href="${esc(app)}/m" style="color:#009439;font-weight:600">${esc(app)}/m</a>.
    Zet hem via het deelmenu van je browser op je beginscherm, dan opent EVA voortaan als een gewone app.
  </p>
  <p style="font-size:12px;line-height:1.6;color:#8a938f">
    De link is beperkte tijd geldig. Is hij verlopen, vraag dan een nieuwe uitnodiging aan.
  </p>`

  return {
    onderwerp: herhaling ? 'Je toegang tot EVA — Everts' : 'Welkom bij EVA — Everts',
    bodyHtml: wikkel(herhaling ? 'Je toegang tot EVA' : 'Welkom bij EVA', inhoud + groet),
  }
}
