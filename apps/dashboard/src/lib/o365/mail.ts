import 'server-only'
import { graphFetch, appGraphFetch } from './graph'

export interface MailBijlage {
  naam: string
  contentType: string
  inhoud: Buffer | Uint8Array
}

export interface VerstuurMailInput {
  to: string[]
  cc?: string[]
  subject: string
  bodyHtml: string
  attachments?: MailBijlage[]
}

function recipients(adressen: string[]) {
  return adressen.filter(Boolean).map(adres => ({ emailAddress: { address: adres.trim() } }))
}

/**
 * Verstuurt een e-mail namens de medewerker via Graph (/me/sendMail). Graph
 * antwoordt met 202 Accepted; dat geldt als succesvol verzonden (er is geen
 * synchrone bezorgbevestiging). Gooit bij een andere status.
 */
export async function verstuurMailNamensMedewerker(
  medewerkerId: string,
  input: VerstuurMailInput,
): Promise<void> {
  const attachments = (input.attachments ?? []).map(b => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: b.naam,
    contentType: b.contentType,
    contentBytes: Buffer.from(b.inhoud).toString('base64'),
  }))

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: 'HTML', content: input.bodyHtml },
    toRecipients: recipients(input.to),
  }
  const cc = recipients(input.cc ?? [])
  if (cc.length) message.ccRecipients = cc
  if (attachments.length) message.attachments = attachments

  const res = await graphFetch(medewerkerId, '/me/sendMail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })

  if (res.status !== 202) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Mail versturen mislukt (HTTP ${res.status}) ${detail.slice(0, 300)}`)
  }
}

/**
 * Verstuurt een e-mail vanuit de gedeelde postbus, zónder ingelogde medewerker.
 *
 * WAAROM DIT NAAST verstuurMailNamensMedewerker BESTAAT
 * Alle andere EVA-mail gaat via /me/sendMail met het persoonlijke token van wie
 * op dat moment is ingelogd. Een cron heeft die niet, en daarom kan de
 * oplever-mailwachtrij zichzelf niet legen: er moet altijd iemand op "Nu
 * versturen" klikken. Voor het klantportaal kan dat niet — een inloglink moet
 * aankomen op het moment dat de klant hem aanvraagt, ook 's avonds.
 *
 * Deze variant gebruikt daarom app-only Graph (client credentials) op één vaste
 * postbus. Dat vraagt in Azure de applicatiepermissie Mail.Send mét admin
 * consent, én — belangrijk — een Exchange ApplicationAccessPolicy die de app
 * beperkt tot precies deze postbus. Zonder die policy mag de app namens iedere
 * postbus in de tenant mailen.
 *
 * Graph antwoordt met 202 Accepted; dat geldt als verzonden.
 */
export async function verstuurMailViaGedeeldePostbus(input: VerstuurMailInput): Promise<void> {
  const afzender = process.env.O365_PORTAAL_AFZENDER?.trim()
  if (!afzender) {
    throw new Error('O365_PORTAAL_AFZENDER ontbreekt — de gedeelde postbus voor portaalmail is niet ingesteld.')
  }

  const attachments = (input.attachments ?? []).map(b => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: b.naam,
    contentType: b.contentType,
    contentBytes: Buffer.from(b.inhoud).toString('base64'),
  }))

  const message: Record<string, unknown> = {
    subject: input.subject,
    body: { contentType: 'HTML', content: input.bodyHtml },
    toRecipients: recipients(input.to),
  }
  const cc = recipients(input.cc ?? [])
  if (cc.length) message.ccRecipients = cc
  if (attachments.length) message.attachments = attachments

  // Antwoorden van klanten horen bij een echt bemenst adres terecht te komen,
  // niet bij een postbus waar niemand in kijkt.
  const antwoord = process.env.O365_PORTAAL_ANTWOORD_ADRES?.trim()
  if (antwoord) message.replyTo = recipients([antwoord])

  const res = await appGraphFetch(`/users/${encodeURIComponent(afzender)}/sendMail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })

  if (res.status !== 202) {
    const detail = await res.text().catch(() => '')
    // 403 hier betekent bijna altijd: Mail.Send ontbreekt, of de
    // ApplicationAccessPolicy sluit deze postbus juist uit.
    throw new Error(
      `Portaalmail versturen mislukt (HTTP ${res.status}) via ${afzender}: ${detail.slice(0, 300)}`,
    )
  }
}

/**
 * Haalt de zojuist verzonden mail als MIME (.eml) uit Verzonden-items, gezocht op
 * onderwerp (nieuwste eerst). Best-effort: `null` als het bericht (nog) niet
 * gevonden wordt. Gebruikt voor archivering in SharePoint.
 */
export async function haalVerzondenMailMime(
  medewerkerId: string,
  subject: string,
): Promise<Buffer | null> {
  try {
    const filter = encodeURIComponent(`subject eq '${subject.replace(/'/g, "''")}'`)
    const zoek = `/me/mailFolders/sentitems/messages?$filter=${filter}&$top=1&$orderby=sentDateTime desc&$select=id`
    const res = await graphFetch(medewerkerId, zoek)
    if (!res.ok) return null
    const data = (await res.json()) as { value?: { id: string }[] }
    const id = data.value?.[0]?.id
    if (!id) return null
    const mimeRes = await graphFetch(medewerkerId, `/me/messages/${id}/$value`)
    if (!mimeRes.ok) return null
    return Buffer.from(await mimeRes.arrayBuffer())
  } catch {
    return null
  }
}
