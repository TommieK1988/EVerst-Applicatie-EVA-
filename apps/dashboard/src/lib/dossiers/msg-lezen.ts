/**
 * msg-lezen.ts
 *
 * Leest een Outlook-`.msg` uit tot een leesbaar bericht, zodat een mail in het
 * dossier direct te openen is in plaats van eerst te moeten downloaden.
 *
 * Een .msg is een OLE-container met MAPI-eigenschappen. De body zit er in maximaal
 * drie smaken in, in aflopende voorkeur:
 *
 *  1. `bodyHtml`      — kant-en-klare HTML.
 *  2. `compressedRtf` — Outlook stopt de HTML meestal ingepakt in RTF. Uitpakken en
 *                       de-encapsuleren levert dezelfde HTML op.
 *  3. `body`          — platte tekst als laatste redmiddel.
 *
 * Alles draait server-side; de client krijgt alleen het uitgelezen resultaat.
 */

import MsgReader from '@kenjiuno/msgreader'
import type { FieldsData } from '@kenjiuno/msgreader'
import { decompressRTF } from '@kenjiuno/decompressrtf'
import { deEncapsulateSync } from 'rtf-stream-parser'
import * as iconv from 'iconv-lite'

export type MailBijlage = {
  /** Positie in `attachments` — waarmee de route hem terug kan opvragen. */
  index: number
  naam: string
  grootte: number | null
  /** Inline-afbeelding uit de body (logo, handtekening) i.p.v. een echte bijlage. */
  inline: boolean
}

export type MailBericht = {
  onderwerp: string | null
  van: string | null
  aan: string[]
  cc: string[]
  datum: string | null
  /** Body als HTML. Nog niet vertrouwd — de client toont hem in een afgeschermd venster. */
  bodyHtml: string | null
  bodyTekst: string | null
  bijlagen: MailBijlage[]
  /** true als de body verwijst naar afbeeldingen buiten de mail (trackers, logo's op een server). */
  heeftExterneAfbeeldingen: boolean
}

/** Inline-plaatjes worden als data-URI in de body gezet; boven deze grens slaan we ze over. */
const MAX_INLINE_BYTES = 2 * 1024 * 1024
const MAX_INLINE_TOTAAL = 8 * 1024 * 1024

function lezer(buf: Buffer): MsgReader {
  // MsgReader wil een ArrayBuffer; een Buffer kan een venster op een grotere pool zijn,
  // dus snijd exact het eigen bereik eruit.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return new MsgReader(ab)
}

function persoon(f: FieldsData): string | null {
  const naam = f.name?.trim()
  const adres = (f.smtpAddress || f.email || '').trim()
  // Exchange-adressen ('/o=ExchangeLabs/ou=…') zijn onleesbaar; die tonen we niet.
  const netAdres = adres && !adres.startsWith('/') ? adres : ''
  if (naam && netAdres && naam.toLowerCase() !== netAdres.toLowerCase()) return `${naam} <${netAdres}>`
  return naam || netAdres || null
}

function ontvangers(velden: FieldsData, soort: 'to' | 'cc'): string[] {
  return (velden.recipients ?? [])
    .filter(r => (r.recipType ?? 'to') === soort)
    .map(persoon)
    .filter((s): s is string => !!s)
}

function afzender(velden: FieldsData): string | null {
  const naam = velden.senderName?.trim()
  const adres = (velden.senderSmtpAddress || velden.senderEmail || '').trim()
  const netAdres = adres && !adres.startsWith('/') ? adres : ''
  if (naam && netAdres && naam.toLowerCase() !== netAdres.toLowerCase()) return `${naam} <${netAdres}>`
  return naam || netAdres || null
}

/** MAPI-tijden komen als RFC-datumstring binnen; normaliseer naar ISO of laat weg. */
function datum(velden: FieldsData): string | null {
  const ruw = velden.messageDeliveryTime || velden.clientSubmitTime || velden.creationTime
  if (!ruw) return null
  const t = Date.parse(ruw)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Uitgepakte RTF → HTML, als Outlook de HTML in de RTF verstopt heeft. */
function htmlUitRtf(compressed: Uint8Array): string | null {
  try {
    const rtf = Buffer.from(decompressRTF(Array.from(compressed)))
    const res = deEncapsulateSync(rtf, { decode: iconv.decode })
    if (res.mode !== 'html') return null
    return typeof res.text === 'string' ? res.text : res.text.toString('utf8')
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

const AFBEELDING_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
}

function mimeVan(f: FieldsData): string | null {
  const tag = f.attachMimeTag?.trim().toLowerCase()
  if (tag?.startsWith('image/')) return tag
  const naam = f.fileName || f.fileNameShort || f.name || ''
  const ext = naam.slice(naam.lastIndexOf('.') + 1).toLowerCase()
  return AFBEELDING_MIME[ext] ?? null
}

/**
 * Vervangt `cid:`-verwijzingen door de bijlage zelf als data-URI.
 *
 * Alternatief zou een aparte URL per plaatje zijn, maar de body wordt in een
 * volledig afgeschermd venster getoond en heeft daar geen eigen herkomst — een
 * relatieve URL is er onbruikbaar. Insluiten werkt wel, en houdt het venster dicht.
 */
function slaInlineAfbeeldingenOp(html: string, reader: MsgReader, bijlagen: FieldsData[]): string {
  if (!/cid:/i.test(html)) return html

  let totaal = 0
  const cache = new Map<string, string>()

  const dataUri = (cid: string): string | null => {
    const sleutel = cid.toLowerCase()
    const gecachet = cache.get(sleutel)
    if (gecachet !== undefined) return gecachet || null

    const treffer = bijlagen.find(a => {
      const eigen = (a.pidContentId ?? '').replace(/^<|>$/g, '').toLowerCase()
      return eigen && eigen === sleutel
    })
    const mime = treffer ? mimeVan(treffer) : null
    if (!treffer || !mime) { cache.set(sleutel, ''); return null }

    try {
      const { content } = reader.getAttachment(treffer)
      if (content.byteLength > MAX_INLINE_BYTES || totaal + content.byteLength > MAX_INLINE_TOTAAL) {
        cache.set(sleutel, '')
        return null
      }
      totaal += content.byteLength
      const uri = `data:${mime};base64,${Buffer.from(content).toString('base64')}`
      cache.set(sleutel, uri)
      return uri
    } catch {
      cache.set(sleutel, '')
      return null
    }
  }

  return html.replace(/(["'(])\s*cid:([^"')\s]+)\s*(["')])/gi, (heel, open, cid, sluit) => {
    const uri = dataUri(decodeURIComponent(cid))
    return uri ? `${open}${uri}${sluit}` : heel
  })
}

export function leesMsg(buf: Buffer): MailBericht {
  const reader = lezer(buf)
  const velden = reader.getFileData()

  const alleBijlagen = velden.attachments ?? []

  let bodyHtml: string | null = velden.bodyHtml?.trim() || null
  if (!bodyHtml && velden.compressedRtf) bodyHtml = htmlUitRtf(velden.compressedRtf)

  const bodyTekst = velden.body?.trim() || null
  if (!bodyHtml && bodyTekst) {
    // Platte tekst in een <pre>: behoudt de regelindeling van de originele mail.
    bodyHtml = `<pre class="platte-tekst">${escapeHtml(bodyTekst)}</pre>`
  }

  if (bodyHtml) bodyHtml = slaInlineAfbeeldingenOp(bodyHtml, reader, alleBijlagen)

  // Alles wat na het insluiten nog naar buiten wijst, is een echte externe afbeelding.
  const heeftExterneAfbeeldingen = !!bodyHtml && /<img[^>]+src=["']?https?:/i.test(bodyHtml)

  const bijlagen: MailBijlage[] = alleBijlagen.map((a, index) => ({
    index,
    naam: (a.fileName || a.fileNameShort || a.name || `bijlage-${index + 1}`).trim(),
    grootte: a.contentLength ?? null,
    // Een plaatje met content-id zit in de body; dat is geen losse bijlage.
    inline: !!a.pidContentId || !!a.attachmentHidden,
  }))

  return {
    onderwerp: velden.subject?.trim() || null,
    van: afzender(velden),
    aan: ontvangers(velden, 'to'),
    cc: ontvangers(velden, 'cc'),
    datum: datum(velden),
    bodyHtml,
    bodyTekst,
    bijlagen,
    heeftExterneAfbeeldingen,
  }
}

/** Haalt één bijlage uit de mail, voor de downloadknop in het leesvenster. */
export function leesMsgBijlage(buf: Buffer, index: number): { naam: string; data: Buffer } | null {
  const reader = lezer(buf)
  const bijlagen = reader.getFileData().attachments ?? []
  const doel = bijlagen[index]
  if (!doel) return null

  try {
    const { fileName, content } = reader.getAttachment(doel)
    const naam = (doel.fileName || fileName || doel.name || `bijlage-${index + 1}`).trim()
    return { naam, data: Buffer.from(content) }
  } catch {
    return null
  }
}
