import 'server-only'
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
  /**
   * Logt deze medewerker met Microsoft in? Dat volgt uit zijn e-mailadres, niet uit zijn
   * gebruikerstype — zie lib/auth/account-regels.ts. Het bepaalt welk sjabloon en welke knop
   * de mail krijgt: "Ga naar EVA" of "Wachtwoord instellen".
   *
   * Dit stond eerder op `gebruikerType`, maar dat is het verkeerde onderscheid: een
   * app-gebruiker met een bedrijfsadres kreeg dan een mail die hem een wachtwoord liet
   * instellen dat hij niet mag hebben.
   */
  viaMicrosoft: boolean
  /** Activatielink uit Supabase (`generateLink`) — alleen bij een wachtwoordaccount. */
  actieLink: string | null
  /** Naam van de beheerder die uitnodigt; verschijnt in de afsluiting. */
  afzenderNaam: string | null
  /** Herinnering i.p.v. eerste uitnodiging (account bestond al). */
  herhaling?: boolean
  /**
   * Naam van de handleiding die als bijlage meegaat. Alleen gezet als het bouwen van de PDF is
   * gelukt — een mail die een bijlage aankondigt die er niet in zit, is erger dan een mail zonder
   * aankondiging.
   */
  bijlageNaam?: string | null
}

/**
 * Bouwt onderwerp + HTML van de uitnodiging. De tekst komt uit Instellingen -> E-mailsjablonen;
 * er zijn twee sjablonen omdat de twee inlogwegen verschillende instructies nodig hebben.
 * De knop wordt hier gebouwd: een activatielink is eenmalig en persoonlijk en hoort niet in een
 * beheerd tekstveld thuis.
 */
export async function bouwUitnodigingsMail(
  input: UitnodigingMailInput,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  const { voornaam, viaMicrosoft, actieLink, afzenderNaam, herhaling, bijlageNaam } = input
  const app = appBaseUrl()
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
    viaMicrosoft ? 'gebruiker_uitnodiging_platform' : 'gebruiker_uitnodiging_app',
  )
  const bodyHtml = mailTekstNaarHtml(sjabloon.tekst, {
    vars,
    blokken: {
      knop: viaMicrosoft
        ? knop(app, 'Ga naar EVA')
        : knop(actieLink ?? app, 'Wachtwoord instellen'),
    },
  })

  return {
    onderwerp: mailOnderwerp(sjabloon.onderwerp, vars),
    bodyHtml: wikkel(titel, bodyHtml + bijlageRegel(bijlageNaam)),
  }
}

/**
 * De aankondiging van de meegestuurde handleiding.
 *
 * Staat hier in code en niet in het beheerde sjabloon: of er een bijlage meegaat weet pas de
 * verzendkant (de PDF wordt per mail opgebouwd en dat kan misgaan), terwijl de sjabloontekst in
 * Instellingen door een beheerder is overgetypt en dan blijft staan zoals hij stond. Zou de zin
 * daar staan, dan belooft een bestaand sjabloon een bijlage die er niet altijd is — en een
 * aangepast sjabloon noemt hem juist nooit.
 */
function bijlageRegel(bijlageNaam: string | null | undefined): string {
  if (!bijlageNaam) return ''
  return `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#4d575e">
    Bij deze mail zit de handleiding <strong>${esc(bijlageNaam)}</strong>. Daarin staat stap voor stap
    hoe je inlogt, hoe je EVA op je beginscherm zet en wat je per onderdeel kunt doen.
  </p>`
}

/**
 * De mail achter "Wachtwoord vergeten". Vaste tekst: dit is een systeemmail die iemand zelf
 * aanvraagt, geen bericht van een collega, en heeft dus geen beheerd sjabloon nodig.
 */
export function bouwHerstelMail(input: { voornaam: string | null; actieLink: string }): {
  onderwerp: string
  bodyHtml: string
} {
  const aanhef = input.voornaam ? `Hallo ${esc(input.voornaam)},` : 'Hallo,'
  const p = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55">${t}</p>`
  return {
    onderwerp: 'Nieuw wachtwoord voor EVA',
    bodyHtml: wikkel('Nieuw wachtwoord',
      p(aanhef)
      + p('Je hebt gevraagd om een nieuw wachtwoord voor EVA. Tik op de knop en kies een nieuw wachtwoord; daarna ben je meteen ingelogd.')
      + knop(input.actieLink, 'Nieuw wachtwoord kiezen')
      + p('De knop werkt 24 uur. Heb je dit niet zelf aangevraagd? Dan kun je deze mail negeren; je huidige wachtwoord blijft gewoon werken.'),
    ),
  }
}
