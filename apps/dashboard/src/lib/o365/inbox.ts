/**
 * o365/inbox.ts
 *
 * Lezen uit de gedeelde intakepostbussen, en de nabehandeling erop.
 *
 * WAAROM POLLING EN GEEN CHANGE NOTIFICATIONS
 * Een Graph-abonnement op mail verloopt na ~2,9 dagen en moet worden verlengd.
 * Mist die verlenging, dan stopt de intake *stil* — er komt geen fout, er komt
 * alleen niets meer binnen. Bovendien zijn notificaties niet gegarandeerd, dus
 * je hebt sowieso een inhaalronde nodig. Dan kun je net zo goed alleen die
 * inhaalronde bouwen. Bij pollen zie je meteen "laatste ophaal 6 uur geleden".
 *
 * De sleutel is `internetMessageId`, niet het Graph-`id`: dat laatste verandert
 * zodra een bericht van map wisselt — ook door onze eigen nabehandeling.
 */

import 'server-only'
import { intakeGraphFetch, intakeGraphGet, GraphError } from './graph'
import { intakeRegistratie, type IntakeRegistratie } from './tokens'

/** Boven deze grens halen we een bijlage niet op; hij wordt alleen geregistreerd. */
export const MAX_BIJLAGE_BYTES = 25 * 1024 * 1024

/** Overlap op het receivedDateTime-filter. Dubbel ophalen is gratis door de unieke index. */
const OVERLAP_MINUTEN = 30

export interface GraphBericht {
  id: string
  internetMessageId: string | null
  conversationId: string | null
  subject: string | null
  bodyPreview: string | null
  body: { contentType: string; content: string } | null
  from: string | null
  fromNaam: string | null
  to: string[]
  cc: string[]
  ontvangenOp: string
  heeftBijlagen: boolean
  /** Ruwe internetheaders, voor de goedkope triage (auto-reply, nieuwsbrief). */
  headers: Record<string, string>
}

interface GraphMessageRaw {
  id: string
  internetMessageId?: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: string; content?: string }
  from?: { emailAddress?: { address?: string; name?: string } }
  sender?: { emailAddress?: { address?: string; name?: string } }
  toRecipients?: { emailAddress?: { address?: string } }[]
  ccRecipients?: { emailAddress?: { address?: string } }[]
  receivedDateTime?: string
  hasAttachments?: boolean
  internetMessageHeaders?: { name?: string; value?: string }[]
}

function adressen(lijst?: { emailAddress?: { address?: string } }[]): string[] {
  return (lijst ?? [])
    .map(r => r.emailAddress?.address?.trim().toLowerCase())
    .filter((a): a is string => Boolean(a))
}

function headersNaarObject(rij?: { name?: string; value?: string }[]): Record<string, string> {
  const uit: Record<string, string> = {}
  for (const h of rij ?? []) {
    if (h.name) uit[h.name.toLowerCase()] = h.value ?? ''
  }
  return uit
}

/**
 * Haalt de nieuwe berichten uit één postbus op.
 *
 * `sinds` mag null zijn (eerste run); dan pakken we alleen de laatste 24 uur, zodat
 * een postbus met tienduizenden oude mails niet in één keer wordt binnengetrokken.
 * De oudere mail is bewust geen werkvoorraad: die is al met de hand afgehandeld.
 */
export async function haalNieuweBerichten(
  postbusAdres: string,
  mapId: string,
  sinds: string | null,
  max = 25,
): Promise<GraphBericht[]> {
  const vanaf = sinds
    ? new Date(new Date(sinds).getTime() - OVERLAP_MINUTEN * 60_000)
    : new Date(Date.now() - 24 * 60 * 60 * 1000)

  const velden = [
    'id', 'internetMessageId', 'conversationId', 'subject', 'bodyPreview',
    'from', 'sender', 'toRecipients', 'ccRecipients', 'receivedDateTime',
    'hasAttachments', 'body', 'internetMessageHeaders',
  ].join(',')

  const pad =
    `/users/${encodeURIComponent(postbusAdres)}/mailFolders/${encodeURIComponent(mapId)}/messages` +
    `?$filter=${encodeURIComponent(`receivedDateTime ge ${vanaf.toISOString()}`)}` +
    `&$orderby=receivedDateTime asc&$top=${max}&$select=${velden}`

  const data = await intakeGraphGet<{ value?: GraphMessageRaw[] }>(pad)

  return (data.value ?? []).map(m => {
    const van = m.from?.emailAddress ?? m.sender?.emailAddress
    return {
      id: m.id,
      internetMessageId: m.internetMessageId?.trim() || null,
      conversationId: m.conversationId ?? null,
      subject: m.subject ?? null,
      bodyPreview: m.bodyPreview ?? null,
      body: m.body?.content != null
        ? { contentType: m.body.contentType ?? 'text', content: m.body.content }
        : null,
      from: van?.address?.trim().toLowerCase() ?? null,
      fromNaam: van?.name?.trim() ?? null,
      to: adressen(m.toRecipients),
      cc: adressen(m.ccRecipients),
      ontvangenOp: m.receivedDateTime ?? new Date().toISOString(),
      heeftBijlagen: Boolean(m.hasAttachments),
      headers: headersNaarObject(m.internetMessageHeaders),
    }
  })
}

export interface GraphBijlageMeta {
  id: string
  naam: string
  contentType: string | null
  grootte: number
  isInline: boolean
  /** Ingesloten mailbericht (.msg) in plaats van een bestand. */
  isItem: boolean
}

/**
 * Alleen de metadata van de bijlagen. Bewust niet via `$expand=attachments` op het
 * bericht: dan komt de volledige base64 mee en klapt de respons boven ~4 MB.
 */
export async function haalBijlageMeta(
  postbusAdres: string,
  berichtId: string,
): Promise<GraphBijlageMeta[]> {
  const pad =
    `/users/${encodeURIComponent(postbusAdres)}/messages/${encodeURIComponent(berichtId)}/attachments` +
    `?$select=id,name,contentType,size,isInline`

  const data = await intakeGraphGet<{
    value?: { id?: string; name?: string; contentType?: string; size?: number; isInline?: boolean; '@odata.type'?: string }[]
  }>(pad)

  return (data.value ?? [])
    .filter(a => Boolean(a.id))
    .map(a => ({
      id: a.id as string,
      naam: a.name?.trim() || 'bijlage',
      contentType: a.contentType ?? null,
      grootte: a.size ?? 0,
      isInline: Boolean(a.isInline),
      isItem: (a['@odata.type'] ?? '').includes('itemAttachment'),
    }))
}

/**
 * Downloadt één bijlage. Eén tegelijk aanroepen: base64 van 25 MB is ~34 MB
 * bovenop de buffer, en een Vercel-functie heeft dat niet drie keer over.
 */
export async function haalBijlageBytes(
  postbusAdres: string,
  berichtId: string,
  bijlageId: string,
): Promise<Buffer> {
  const pad =
    `/users/${encodeURIComponent(postbusAdres)}/messages/${encodeURIComponent(berichtId)}` +
    `/attachments/${encodeURIComponent(bijlageId)}/$value`
  const res = await intakeGraphFetch(pad)
  if (!res.ok) throw new GraphError(res.status, `Bijlage ophalen mislukt (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

// ─── Nabehandeling ────────────────────────────────────────────────────────────

/**
 * Zoekt de submap "Verwerkt door EVA" onder Postvak IN, of maakt hem aan.
 * De folder-id wordt door de aanroeper gecached in `mailintake_postbussen`.
 */
export async function zorgVoorVerwerktMap(postbusAdres: string, naam: string): Promise<string> {
  const basis = `/users/${encodeURIComponent(postbusAdres)}/mailFolders/inbox/childFolders`
  const gevonden = await intakeGraphGet<{ value?: { id?: string; displayName?: string }[] }>(
    `${basis}?$filter=${encodeURIComponent(`displayName eq '${naam.replace(/'/g, "''")}'`)}&$select=id,displayName&$top=1`,
  )
  const id = gevonden.value?.[0]?.id
  if (id) return id

  const res = await intakeGraphFetch(basis, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: naam }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new GraphError(res.status, `Map "${naam}" aanmaken mislukt (HTTP ${res.status}) ${detail.slice(0, 200)}`)
  }
  const nieuw = (await res.json()) as { id?: string }
  if (!nieuw.id) throw new GraphError(500, `Map "${naam}" aangemaakt maar Graph gaf geen id terug.`)
  return nieuw.id
}

/** Zet categorieën en markeert als gelezen. Doe dit vóór het verplaatsen. */
export async function markeerBericht(
  postbusAdres: string,
  berichtId: string,
  categorieen: string[],
  gelezen: boolean,
): Promise<void> {
  const res = await intakeGraphFetch(
    `/users/${encodeURIComponent(postbusAdres)}/messages/${encodeURIComponent(berichtId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: categorieen, isRead: gelezen }),
    },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new GraphError(res.status, `Bericht markeren mislukt (HTTP ${res.status}) ${detail.slice(0, 200)}`)
  }
}

/**
 * Verplaatst een bericht naar een andere map en geeft het NIEUWE Graph-id terug.
 * Dat id moet worden opgeslagen: het oude bestaat na de verplaatsing niet meer.
 */
export async function verplaatsBericht(
  postbusAdres: string,
  berichtId: string,
  doelMapId: string,
): Promise<string> {
  const res = await intakeGraphFetch(
    `/users/${encodeURIComponent(postbusAdres)}/messages/${encodeURIComponent(berichtId)}/move`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationId: doelMapId }),
    },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new GraphError(res.status, `Bericht verplaatsen mislukt (HTTP ${res.status}) ${detail.slice(0, 200)}`)
  }
  const nieuw = (await res.json()) as { id?: string }
  return nieuw.id ?? berichtId
}

/**
 * Zorgt dat de EVA-categorieën in de postbus bestaan met een kleur. Zonder deze
 * stap werkt categoriseren wél, maar toont Outlook geen kleurblokje. Best-effort:
 * een fout hier mag de nabehandeling niet tegenhouden.
 */
export async function zorgVoorCategorieen(postbusAdres: string): Promise<void> {
  const gewenst: { displayName: string; color: string }[] = [
    { displayName: 'EVA verwerkt', color: 'preset4' },      // groen
    { displayName: 'EVA: genegeerd', color: 'preset9' },    // grijsblauw
    { displayName: 'EVA: geen aanvraag', color: 'preset1' }, // oranje
  ]
  const pad = `/users/${encodeURIComponent(postbusAdres)}/outlook/masterCategories`
  let bestaand: string[] = []
  try {
    const data = await intakeGraphGet<{ value?: { displayName?: string }[] }>(pad)
    bestaand = (data.value ?? []).map(c => (c.displayName ?? '').toLowerCase())
  } catch {
    return // geen leesrecht op de categorielijst; categoriseren werkt alsnog
  }

  for (const cat of gewenst) {
    if (bestaand.includes(cat.displayName.toLowerCase())) continue
    try {
      await intakeGraphFetch(pad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cat),
      })
    } catch {
      /* niet blokkerend */
    }
  }
}

/** Leest één bericht, om de verbinding en de ApplicationAccessPolicy te toetsen. */
export async function toetsPostbus(
  postbusAdres: string,
): Promise<
  | { ok: true; onderwerp: string | null; ontvangenOp: string | null; registratie: IntakeRegistratie }
  | { ok: false; fout: string; registratie: IntakeRegistratie }
> {
  // Welke registratie het token leverde hoort bij de uitslag: lezen via de
  // hoofdregistratie kan toevallig lukken en zegt dan niets over fase 0.
  const registratie = intakeRegistratie()
  try {
    const data = await intakeGraphGet<{ value?: { subject?: string; receivedDateTime?: string }[] }>(
      `/users/${encodeURIComponent(postbusAdres)}/mailFolders/inbox/messages` +
      `?$top=1&$orderby=receivedDateTime desc&$select=subject,receivedDateTime`,
    )
    const eerste = data.value?.[0]
    return {
      ok: true,
      onderwerp: eerste?.subject ?? null,
      ontvangenOp: eerste?.receivedDateTime ?? null,
      registratie,
    }
  } catch (e) {
    const status = e instanceof GraphError ? e.status : 0
    // 403 hier betekent bijna altijd: Mail.ReadWrite ontbreekt, of de
    // ApplicationAccessPolicy sluit deze postbus juist uit.
    const hint = status === 403
      ? ' — controleer Mail.ReadWrite (Application) én de ApplicationAccessPolicy op deze postbus.'
      : status === 404
        ? ' — postbus niet gevonden; klopt het adres?'
        : ''
    return { ok: false, fout: (e instanceof Error ? e.message : String(e)) + hint, registratie }
  }
}
