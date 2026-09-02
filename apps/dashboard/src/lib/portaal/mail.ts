import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { verstuurMailViaGedeeldePostbus } from '@/lib/o365/mail'
import { appBaseUrl } from '@/lib/app-url'
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

export function bouwInloglinkMail(voornaam: string | null): { onderwerp: string; bodyHtml: string } {
  const aanhef = voornaam ? `Beste ${esc(voornaam)},` : 'Beste heer/mevrouw,'
  return {
    onderwerp: 'Uw inloglink voor het klantportaal — Everts',
    bodyHtml: wikkel('Inloggen op uw projectomgeving', `
  <p style="font-size:13px;line-height:1.6">${aanhef}</p>
  <p style="font-size:13px;line-height:1.6">
    U kunt met onderstaande knop inloggen op uw projectomgeving. Daar vindt u de stand van zaken,
    documenten en foto's van uw project, en kunt u ons rechtstreeks een bericht sturen.
  </p>
  ${knop(LINK_PLAATSHOUDER, 'Inloggen')}
  <p style="font-size:12px;line-height:1.6;color:#8a938f">
    De link is één uur geldig en werkt één keer. Is hij verlopen? Vraag op de inlogpagina gewoon een nieuwe aan.
    Heeft u deze mail niet zelf aangevraagd, dan kunt u hem negeren.
  </p>`),
  }
}

export function bouwUitnodigingMail(
  voornaam: string | null,
  afzenderNaam: string | null,
): { onderwerp: string; bodyHtml: string } {
  const aanhef = voornaam ? `Beste ${esc(voornaam)},` : 'Beste heer/mevrouw,'
  const groet = afzenderNaam
    ? `<p style="font-size:13px;line-height:1.6;margin-top:18px">Met vriendelijke groet,<br>${esc(afzenderNaam)}</p>`
    : ''
  return {
    onderwerp: 'Uw projectomgeving bij Everts',
    bodyHtml: wikkel('Welkom in uw projectomgeving', `
  <p style="font-size:13px;line-height:1.6">${aanhef}</p>
  <p style="font-size:13px;line-height:1.6">
    Wij hebben een persoonlijke projectomgeving voor u klaargezet. Daarin volgt u de voortgang van uw
    project, vindt u de documenten en foto's die wij met u delen, en kunt u ons rechtstreeks een bericht sturen.
  </p>
  <p style="font-size:13px;line-height:1.6">
    U hoeft geen wachtwoord te kiezen: u vult uw e-mailadres in en krijgt een inloglink toegestuurd.
  </p>
  ${knop(LINK_PLAATSHOUDER, 'Naar uw projectomgeving')}
  <p style="font-size:12px;line-height:1.6;color:#8a938f">
    Bewaar deze mail niet als toegangsmiddel — de link is kort geldig. Ga voortaan naar
    <a href="${esc(appBaseUrl())}/portaal" style="color:#009439;font-weight:600">${esc(appBaseUrl())}/portaal</a>
    en vraag daar een nieuwe inloglink aan.
  </p>${groet}`),
  }
}

export function bouwNieuwBerichtMail(
  voornaam: string | null,
  projectTitel: string,
): { onderwerp: string; bodyHtml: string } {
  const aanhef = voornaam ? `Beste ${esc(voornaam)},` : 'Beste heer/mevrouw,'
  return {
    onderwerp: `Nieuw bericht over ${projectTitel} — Everts`,
    bodyHtml: wikkel('Er staat een bericht voor u klaar', `
  <p style="font-size:13px;line-height:1.6">${aanhef}</p>
  <p style="font-size:13px;line-height:1.6">
    Wij hebben u een bericht gestuurd over <strong>${esc(projectTitel)}</strong>. U leest en beantwoordt
    het in uw projectomgeving.
  </p>
  ${knop(LINK_PLAATSHOUDER, 'Bericht lezen')}
  <p style="font-size:12px;line-height:1.6;color:#8a938f">
    Reageren op deze mail kan ook — dan komt uw antwoord bij ons op kantoor binnen in plaats van in het portaal.
  </p>`),
  }
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
