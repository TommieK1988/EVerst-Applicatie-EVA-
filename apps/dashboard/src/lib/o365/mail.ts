import 'server-only'
import { graphFetch } from './graph'

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
