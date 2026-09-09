import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { verstuurMailViaGedeeldePostbus } from '@/lib/o365/mail'
import { appBaseUrl } from '@/lib/app-url'
import { getMailSjabloonTekst } from '@/lib/mail/sjabloon-bron'
import { mailTekstNaarHtml, mailOnderwerp } from '@/lib/mail/opmaak'
import type { PortaalMailSoort } from '@everts/database/platform-types'

/**
 * mail.ts — uitgaande post van het klantportaal.
 *
 * Alles loopt via portaal_mail_wachtrij en de cron die hem leegt. Waarom niet
 * gewoon direct versturen: een klant die om 22:00 een inloglink aanvraagt mag
 * niet wachten tot er morgen iemand inlogt, en tegelijk mag een haperende
 * mailserver de knop niet laten hangen. De wachtrij ontkoppelt die twee.
 *
 * De inloglink staat NOOIT in de wachtrij-rij. Die wordt pas gemaakt op het
 * moment van verzenden: een magic link is kort geldig, en zodra de wachtrij een
 * keer een uur achterloopt zou de klant een link krijgen die al verlopen is.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function knop(href: string, tekst: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">
    <tr><td style="background:#009439;border-radius:8px">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">${esc(tekst)}</a>
    </td></tr>
  </table>`
}

/** Zelfde wikkel als de oplever- en uitnodigingsmails; Outlook negeert <style>. */
function wikkel(titel: string, inhoud: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a1f24;max-width:640px">
  <div style="border-bottom:2px solid #009439;padding-bottom:10px;margin-bottom:16px">
    <span style="font-weight:800;letter-spacing:.06em;font-size:16px">EVERTS.</span>
    <div style="font-size:17px;font-weight:700;margin-top:4px">${esc(titel)}</div>
  </div>
  ${inhoud}
  <div style="margin-top:22px;padding-top:10px;border-top:1px solid #e4e8e7;font-size:11px;color:#8a938f">
    Deze link is persoonlijk voor u aangemaakt. Deel hem niet met derden.
  </div>
</div>`
}

/**
 * Plaats waar de link in de body komt te staan. De wachtrij bewaart de body met
 * deze plaatshouder erin; de cron vervangt hem vlak voor verzending door een
 * verse magic link. Zo staat er nooit een geldige inloglink in de database.
 */
export const LINK_PLAATSHOUDER = '{{PORTAAL_LINK}}'

/**
 * De drie portaalmails komen uit Instellingen -> E-mailsjablonen. De knop wordt hier gebouwd en als
 * {knop}-blok in de tekst gezet: de link zelf is een plaatshouder die de cron vlak voor verzending
 * vervangt, dus die mag nooit uit een beheerd tekstveld komen.
 */
async function portaalMail(
  soort: 'portaal_uitnodiging' | 'portaal_inloglink' | 'portaal_bericht',
  titel: string,
  knopTekst: string,
  vars: Record<string, string>,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  const sjabloon = await getMailSjabloonTekst(soort)
  const alle = { ...vars, 'portaal.url': `${appBaseUrl()}/portaal` }
  return {
    onderwerp: mailOnderwerp(sjabloon.onderwerp, alle),
    bodyHtml: wikkel(titel, mailTekstNaarHtml(sjabloon.tekst, {
      vars: alle,
      blokken: { knop: knop(LINK_PLAATSHOUDER, knopTekst) },
    })),
  }
}

/** "Beste Jan," of, zonder bekende voornaam, de neutrale variant. */
function portaalAanhef(voornaam: string | null): string {
  return voornaam ? `Beste ${voornaam},` : 'Beste heer/mevrouw,'
}

export async function bouwInloglinkMail(voornaam: string | null): Promise<{ onderwerp: string; bodyHtml: string }> {
  return portaalMail('portaal_inloglink', 'Inloggen op uw projectomgeving', 'Inloggen', {
    aanhef: portaalAanhef(voornaam),
    voornaam: voornaam ?? '',
  })
}

export async function bouwUitnodigingMail(
  voornaam: string | null,
  afzenderNaam: string | null,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  return portaalMail('portaal_uitnodiging', 'Welkom in uw projectomgeving', 'Naar uw projectomgeving', {
    aanhef: portaalAanhef(voornaam),
    voornaam: voornaam ?? '',
    'afzender.naam': afzenderNaam ?? '',
  })
}

export async function bouwNieuwBerichtMail(
  voornaam: string | null,
  projectTitel: string,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  return portaalMail('portaal_bericht', 'Er staat een bericht voor u klaar', 'Bericht lezen', {
    aanhef: portaalAanhef(voornaam),
    voornaam: voornaam ?? '',
    'dossier.titel': projectTitel,
  })
}

/**
 * Verstuurt nu meteen, met een verse inloglink op de plaats van de
 * plaatshouder. Voor mail waar iemand op zit te wachten: de inloglink die de
 * klant zojuist aanvroeg, en de uitnodiging die een collega net verstuurde.
 * Alles wat niet urgent is (berichtmeldingen) gaat via de wachtrij.
 *
 * Gooit bij mislukken — de aanvrager moet horen dát het misging, anders staat
 * hij te wachten op een mail die nooit komt.
 */
export async function verstuurPortaalMailDirect(input: {
  email: string
  onderwerp: string
  bodyHtml: string
}): Promise<void> {
  const body = input.bodyHtml.includes(LINK_PLAATSHOUDER)
    ? input.bodyHtml.split(LINK_PLAATSHOUDER).join(await maakInloglink(input.email))
    : input.bodyHtml

  await verstuurMailViaGedeeldePostbus({
    to: [input.email],
    subject: input.onderwerp,
    bodyHtml: body,
  })
}

/**
 * Zet een mail klaar. `sleutel` maakt de rij idempotent: met dezelfde sleutel
 * staat er nooit twee keer dezelfde melding te wachten (unieke index).
 */
export async function queuePortaalMail(input: {
  soort: PortaalMailSoort
  ontvangers: string[]
  onderwerp: string
  bodyHtml: string
  portaalGebruikerId?: string | null
  dossierId?: string | null
  cc?: string[]
  sleutel?: string | null
}): Promise<void> {
  const ontvangers = input.ontvangers.map(a => a.trim()).filter(Boolean)
  if (ontvangers.length === 0) return

  await db().from('portaal_mail_wachtrij').upsert(
    {
      soort: input.soort,
      ontvangers,
      cc: input.cc ?? [],
      onderwerp: input.onderwerp,
      body_html: input.bodyHtml,
      portaal_gebruiker_id: input.portaalGebruikerId ?? null,
      dossier_id: input.dossierId ?? null,
      sleutel: input.sleutel ?? null,
      status: 'wachtend',
    },
    { onConflict: 'dossier_id,soort,sleutel', ignoreDuplicates: true },
  )
}

/**
 * Maakt een verse inloglink voor dit e-mailadres.
 *
 * Supabase verstuurt de mail bewust niet zelf: dan zouden de tekst en de afzender
 * buiten de codebase liggen en gelden de rate limits van hun mailer. We vragen
 * alleen het token op en bouwen de link zelf.
 *
 * LET OP — waarom we NIET `properties.action_link` gebruiken, hoe verleidelijk
 * die naam ook is. Die link wijst naar Supabase zelf, en Supabase stuurt de
 * bezoeker daarna door met de tokens in de URL-FRAGMENT (`#access_token=…`).
 * Een fragment wordt door de browser nooit meegestuurd naar de server, dus onze
 * server-side callback zou een lege hand hebben en iedereen wegsturen met
 * "link verlopen". Uitgezocht en gemeten; dit is geen theoretisch punt.
 *
 * In plaats daarvan gaat de link rechtstreeks naar onze eigen callback met het
 * gehashte token als gewone queryparameter. Die wisselt het server-side in voor
 * een sessie (verifyOtp). Bijkomend voordeel: in de mail staat alleen een
 * everts-link, geen doorverwijzing via een vreemd domein.
 */
export async function maakInloglink(email: string): Promise<string> {
  const admin = createAdminClient()
  // redirectTo wordt bij deze route niet gebruikt, maar Supabase eist een
  // toegestane waarde bij het genereren.
  const redirectTo = `${appBaseUrl()}/portaal/auth/callback`

  const link = async () => admin.auth.admin.generateLink({
    type: 'magiclink', email, options: { redirectTo },
  })

  let { data, error } = await link()

  // Bij de allereerste uitnodiging bestaat het auth-account nog niet en geeft
  // Supabase "User not found". Dan maken we het alsnog aan en proberen opnieuw.
  // Het account krijgt geen wachtwoord: inloggen kan uitsluitend via een link.
  // Zo'n account komt níét in EVA binnen — de medewerkerspoort in /login en
  // /auth/callback kijkt in `medewerkers`, en daar staat een klant niet in.
  if (error && /not found|no user/i.test(error.message ?? '')) {
    const { error: maakFout } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { portaal: true },
    })
    // Race met een gelijktijdige aanvraag: bestaat hij nu al, dan is dat prima.
    if (maakFout && !/already/i.test(maakFout.message ?? '')) {
      throw new Error(`Portaalaccount aanmaken mislukt: ${maakFout.message}`)
    }
    ;({ data, error } = await link())
  }

  const hash = data?.properties?.hashed_token
  if (error || !hash) {
    throw new Error(`Inloglink maken mislukt: ${error?.message ?? 'geen token ontvangen'}`)
  }
  return `${appBaseUrl()}/portaal/auth/callback?token_hash=${encodeURIComponent(hash)}&type=magiclink`
}
