'use server'

/**
 * Server-actions voor het beheer van e-mailsjablonen.
 *
 * Twee bronnen, één scherm:
 *  - `mail_sjablonen` — de mails die EVA zelf opstelt (offerte, uitvraag, oplevering, portaal,
 *    gebruikersuitnodiging). Leeg = de standaardtekst uit `lib/mail/sjablonen.ts`.
 *  - `document_sjablonen` — de begeleidende mail bij een Word-document (inkooporder,
 *    onderaannemerscontract, bewonersbrief …). Die tekst blijft dáár staan, want de bijlage en de
 *    mail horen bij elkaar; dit scherm laat hem alleen ook hier bewerken.
 *
 * Elke muterende action begint met `vereisBeheerder()`. Een mailtekst gaat naar klanten en
 * leveranciers; dat is geen veld dat iedere platformgebruiker mag omzetten.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisBeheerder } from '@/lib/auth/rechten'
import { getMailSjablonen } from '@/lib/mail/sjabloon-bron'
import { isMailSoort, MAIL_SOORT_INFO, type MailSjabloon, type MailSoort } from '@/lib/mail/sjablonen'
import { naarPlatteTekst } from '@/lib/mail/sjabloontekst'
import { documentsoortLabels, type Documentsoort } from '@/lib/documenten/types'

const PAD = '/instellingen/mailsjablonen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type DocumentMailRij = {
  id: string
  naam: string
  documentsoort: string
  documentsoortLabel: string
  onderwerp: string
  tekst: string
  actief: boolean
}

export type MailSjablonenOverzicht = {
  sjablonen: MailSjabloon[]
  documentMails: DocumentMailRij[]
}

export async function getOverzicht(): Promise<MailSjablonenOverzicht> {
  const [sjablonen, docs] = await Promise.all([
    getMailSjablonen().catch(() => [] as MailSjabloon[]),
    db().from('document_sjablonen')
      .select('id, naam, documentsoort, mail_onderwerp, mail_body_html, actief')
      .order('documentsoort', { ascending: true })
      .order('volgorde', { ascending: true })
      .then((r: { data: unknown }) => r.data ?? [])
      .catch(() => []),
  ])

  const documentMails: DocumentMailRij[] = (docs as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    naam: String(r.naam ?? ''),
    documentsoort: String(r.documentsoort ?? ''),
    documentsoortLabel:
      documentsoortLabels[r.documentsoort as Documentsoort] ?? String(r.documentsoort ?? ''),
    onderwerp: String(r.mail_onderwerp ?? ''),
    // De documentsjabloon-editor bewaart de mailtekst als HTML; hier bewerk je platte tekst,
    // net als bij de andere sjablonen. Bij opslaan gaat hij er als <p>-alinea's weer in.
    tekst: naarPlatteTekst(String(r.mail_body_html ?? '')),
    actief: r.actief !== false,
  }))

  return { sjablonen, documentMails }
}

export async function maakMailSjabloon(soort: MailSoort): Promise<string> {
  await vereisBeheerder()
  if (!isMailSoort(soort)) throw new Error('Onbekend soort e-mail.')

  const info = MAIL_SOORT_INFO[soort]
  const { data, error } = await db()
    .from('mail_sjablonen')
    // Beginnen met een kopie van de standaardtekst, niet met een leeg vel: bewerken is de
    // gebruikelijke handeling, van nul beginnen de uitzondering.
    .insert({ soort, naam: info.label, onderwerp: info.standaard.onderwerp, tekst: info.standaard.tekst })
    .select('id')
    .single()
  if (error) throw new Error('Sjabloon aanmaken mislukt')
  revalidatePath(PAD)
  return data.id as string
}

export async function updateMailSjabloon(
  id: string,
  patch: { soort?: MailSoort; naam?: string; onderwerp?: string; tekst?: string; actief?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  if (patch.soort !== undefined && !isMailSoort(patch.soort)) {
    return { ok: false, error: 'Onbekend soort e-mail.' }
  }

  const { error } = await db()
    .from('mail_sjablonen')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PAD)
  return { ok: true }
}

/** Terug naar de standaardtekst: de rij verdwijnt, de code neemt het weer over. */
export async function verwijderMailSjabloon(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { error } = await db().from('mail_sjablonen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PAD)
  return { ok: true }
}

/** Alinea's naar de HTML die de documentsjabloon-editor al bewaart. */
function naarBodyHtml(tekst: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return (tekst ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(a => a.trim())
    .filter(Boolean)
    .map(a => `<p>${esc(a).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export async function updateDocumentMail(
  id: string,
  patch: { onderwerp: string; tekst: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { error } = await db()
    .from('document_sjablonen')
    .update({ mail_onderwerp: patch.onderwerp, mail_body_html: naarBodyHtml(patch.tekst) })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(PAD)
  revalidatePath('/instellingen/document-sjablonen')
  return { ok: true }
}
