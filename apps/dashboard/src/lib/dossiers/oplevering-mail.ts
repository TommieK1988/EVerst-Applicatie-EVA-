'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { opleverPuntStatusLabels, type OpleverPuntStatus } from '@everts/database'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { verstuurMailNamensMedewerker, type MailBijlage } from '@/lib/o365/mail'
import { getOplevermomentRapport } from './oplevering'
import { genereerOpleverRapportPdf, opleverRapportBestandsnaam } from './oplever-rapport-pdf'
import { getMailSjabloonTekst } from '@/lib/mail/sjabloon-bron'
import { mailTekstNaarHtml, mailOnderwerp } from '@/lib/mail/opmaak'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type OpleverMailSoort = 'rapportage' | 'herinnering' | 'feedback_uitnodiging'
export type OpleverMailStatus = 'wachtend' | 'verzonden' | 'mislukt' | 'geannuleerd'

export type OpleverMailItem = {
  id: string
  dossier_id: string
  soort: OpleverMailSoort
  ontvangers: string[]
  cc: string[]
  onderwerp: string
  status: OpleverMailStatus
  sleutel: string | null
  pogingen: number
  laatste_fout: string | null
  verzonden_op: string | null
  created_at: string
}

const MAX_POGINGEN = 3

/**
 * Graph `sendMail` accepteert een bericht van ~4 MB inclusief de base64-bijlage (die ~1/3 groter is
 * dan de bytes). We kappen daarom op 3 MB PDF en geven een begrijpelijke melding in plaats van een
 * kale HTTP-fout uit Graph. Foto's worden al teruggeschaald, dus dit is een vangnet.
 */
const MAX_BIJLAGE_BYTES = 3 * 1024 * 1024

/** Splitst een vrij ingevoerde adreslijst (komma/puntkomma/nieuwe regel) in losse adressen. */
export async function splitsAdressen(invoer: string): Promise<string[]> {
  return invoer
    .split(/[,;\n]/)
    .map(a => a.trim())
    .filter(a => a.includes('@'))
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const STATUS_KLEUR: Record<OpleverPuntStatus, string> = {
  nieuw: '#7a5a17', open: '#6b757c', in_behandeling: '#1d4e89', opgelost: '#7a5a17',
  geaccepteerd: '#1c7a3f', geweigerd: '#a12020', afgewezen: '#6b757c',
}

/** Gedeelde mailwikkel: inline styles, want Outlook negeert <style>-blokken grotendeels. */
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

/** De groene knop die de sjablonen als {knop} plaatsen. */
function knop(href: string, tekst: string): string {
  return `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#009439;color:#fff;text-decoration:none;border-radius:6px;padding:10px 18px;font-size:14px;font-weight:600;display:inline-block">${esc(tekst)}</a></p>`
}

/* ─────────────────────────── Rapportage-mail ─────────────────────────────── */

/**
 * Bouwt de opleverrapportage als mailtekst (inline HTML). Bewust een compacte samenvatting met
 * alle punten en hun status; de volledige, printbare rapportage staat op
 * /api/oplevering/rapport/<momentId> (intern) en kan als PDF worden opgeslagen.
 */
export async function bouwRapportageMailHtml(momentId: string): Promise<{ onderwerp: string; bodyHtml: string } | null> {
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return null
  const { dossier, moment, punten, handtekeningen } = rapport

  const rijen = punten.map(p => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eef1f2;font-size:12px;color:#a4adb2;white-space:nowrap">OP${String(p.volgnummer).padStart(2, '0')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eef1f2;font-size:13px">${esc(p.omschrijving)}${p.ruimte ? `<div style="font-size:11px;color:#6b757c">${esc(p.ruimte)}</div>` : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eef1f2;font-size:12px;font-weight:700;color:${STATUS_KLEUR[p.status] ?? '#6b757c'};white-space:nowrap">${esc(opleverPuntStatusLabels[p.status] ?? p.status)}</td>
    </tr>`).join('')

  const open = punten.filter(p => p.status !== 'geaccepteerd').length

  // Enkelvoud/meervoud blijft in de code: een beheerder moet een mailtekst kunnen herschrijven
  // zonder daarbij de grammatica van een telling te hoeven regelen.
  const samenvatting =
    `Er ${punten.length === 1 ? 'is 1 opleverpunt' : `zijn ${punten.length} opleverpunten`} vastgelegd, ` +
    `waarvan ${punten.length - open} geaccepteerd${open > 0 ? ` en ${open} nog openstaand` : ''}.`

  const blokken: Record<string, string> = {
    gegevens: `
  <table style="border-collapse:collapse;margin-bottom:16px;font-size:13px">
    <tr><td style="color:#8a938f;padding-right:14px">Project</td><td>${esc(dossier.titel ?? '—')}</td></tr>
    <tr><td style="color:#8a938f;padding-right:14px">Projectnummer</td><td>${esc(dossier.nummer ?? '—')}</td></tr>
    <tr><td style="color:#8a938f;padding-right:14px">Werkadres</td><td>${esc(dossier.werkadres ?? '—')}</td></tr>
    <tr><td style="color:#8a938f;padding-right:14px">Oplevering</td><td>${esc(moment.titel)}</td></tr>
  </table>`,
    punten: punten.length
      ? `<table style="border-collapse:collapse;width:100%;margin:8px 0 14px 0">${rijen}</table>`
      : '<p style="margin:0 0 14px 0;font-size:13px;color:#6b757c">Geen opleverpunten geregistreerd.</p>',
    ondertekening: handtekeningen.length
      ? `<p style="margin:0 0 14px 0;font-size:12.5px;color:#4a545b">Ondertekend door: ${handtekeningen.map(h => esc(h.naam ?? h.rol)).join(', ')}.</p>`
      : '',
  }

  const vars: Record<string, string> = {
    'dossier.nummer': dossier.nummer ?? '',
    'dossier.titel': dossier.titel ?? '',
    'dossier.werkadres': dossier.werkadres ?? '',
    'moment.titel': moment.titel,
    'punten.samenvatting': samenvatting,
    'punten.aantal': String(punten.length),
    'punten.open': String(open),
  }

  const sjabloon = await getMailSjabloonTekst('oplever_rapportage')
  return {
    onderwerp: mailOnderwerp(sjabloon.onderwerp, vars),
    bodyHtml: wikkel('Opleverrapportage', mailTekstNaarHtml(sjabloon.tekst, { vars, blokken })),
  }
}

/* ────────────────────────────── Wachtrij ─────────────────────────────────── */

export type QueueInput = {
  dossierId: string
  soort: OpleverMailSoort
  ontvangers: string[]
  cc?: string[]
  onderwerp: string
  bodyHtml: string
  /** Ontdubbelsleutel: per (dossier, soort, sleutel) staat er hooguit één bericht te wachten. */
  sleutel?: string | null
  momentId?: string | null
  relatieId?: string | null
}

/**
 * Zet een bericht klaar. Wordt door de cron gebruikt (die zelf niet kan versturen) en door de
 * "Rapportage mailen"-actie. Dubbele wachtende berichten met dezelfde sleutel worden genegeerd.
 */
export async function queueOpleverMail(input: QueueInput): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const ontvangers = input.ontvangers.filter(a => a && a.includes('@'))
  if (ontvangers.length === 0) return { ok: false, error: 'Geen geldig e-mailadres.' }

  // Vangnet: tokenlinks worden opgebouwd uit NEXT_PUBLIC_APP_URL. Staat die niet gezet, dan valt de
  // basis terug op localhost — een onbruikbare link in een mail naar een onderaannemer of klant.
  // Liever hier weigeren dan een kapotte link versturen (mail is niet terug te halen).
  if (process.env.NODE_ENV === 'production' && /https?:\/\/localhost/i.test(input.bodyHtml)) {
    return {
      ok: false,
      error: 'Zet NEXT_PUBLIC_APP_URL op de EVA-URL; zonder die instelling bevat de mail een localhost-link.',
    }
  }

  const supabase = db()
  const { data, error } = await supabase
    .from('oplever_mail_wachtrij')
    .insert({
      dossier_id: input.dossierId,
      soort: input.soort,
      ontvangers,
      cc: (input.cc ?? []).filter(a => a && a.includes('@')),
      onderwerp: input.onderwerp,
      body_html: input.bodyHtml,
      sleutel: input.sleutel ?? null,
      moment_id: input.momentId ?? null,
      relatie_id: input.relatieId ?? null,
    })
    .select('id')
    .maybeSingle()

  // 23505 = unieke index (er staat al een identiek bericht te wachten) → stil overslaan.
  if (error && (error as any).code === '23505') return { ok: true, id: null }
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${input.dossierId}/kam`)
  return { ok: true, id: data?.id ?? null }
}

/** Wachtende + recent verzonden berichten van een dossier (voor het Mail-blok op de tab). */
export async function getOpleverMailWachtrij(dossierId: string): Promise<OpleverMailItem[]> {
  const supabase = db()
  const { data } = await supabase
    .from('oplever_mail_wachtrij')
    .select('id, dossier_id, soort, ontvangers, cc, onderwerp, status, sleutel, pogingen, laatste_fout, verzonden_op, created_at')
    .eq('dossier_id', dossierId)
    .in('status', ['wachtend', 'mislukt'])
    .order('created_at', { ascending: true })
  return (data ?? []) as OpleverMailItem[]
}

export async function annuleerOpleverMail(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data, error } = await supabase
    .from('oplever_mail_wachtrij')
    .update({ status: 'geannuleerd' })
    .eq('id', id)
    .select('dossier_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (data?.dossier_id) revalidatePath(`/opdrachten/${data.dossier_id}/kam`)
  return { ok: true }
}

/**
 * Verstuurt de klaargezette berichten van een dossier — namens de ingelogde medewerker. Dit is
 * bewust een expliciete handeling: geautomatiseerde mails blijven wachten tot iemand is ingelogd
 * en ze vrijgeeft, zodat er nooit ongemerkt post naar klanten of onderaannemers uitgaat.
 */
export async function verstuurOpleverMailWachtrij(
  dossierId: string,
): Promise<{ ok: true; verzonden: number; mislukt: number } | { ok: false; error: string }> {
  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Log in om de klaargezette mails te versturen.' }

  const supabase = db()
  const { data } = await supabase
    .from('oplever_mail_wachtrij')
    .select('*')
    .eq('dossier_id', dossierId)
    .in('status', ['wachtend', 'mislukt'])
    .order('created_at', { ascending: true })
  const rijen = (data ?? []) as any[]
  if (rijen.length === 0) return { ok: true, verzonden: 0, mislukt: 0 }

  let verzonden = 0
  let mislukt = 0
  for (const rij of rijen) {
    try {
      // De opleverrapportage krijgt de PDF als bijlage. Die wordt hier opgebouwd (niet bij het
      // klaarzetten) zodat hij de stand op het moment van verzenden weergeeft — en zodat een
      // mislukte PDF nooit het klaarzetten blokkeert.
      const bijlagen: MailBijlage[] = []
      if (rij.soort === 'rapportage' && rij.moment_id) {
        const pdf = await genereerOpleverRapportPdf(rij.moment_id)
        if (!pdf) throw new Error('Opleverrapport kon niet worden opgebouwd (moment niet gevonden).')
        if (pdf.byteLength > MAX_BIJLAGE_BYTES) {
          throw new Error(
            `De rapportage-PDF is te groot om te mailen (${(pdf.byteLength / 1024 / 1024).toFixed(1)} MB). ` +
            'Verwijder een paar foto\'s bij de opleverpunten en probeer het opnieuw.',
          )
        }
        const rapport = await getOplevermomentRapport(rij.moment_id)
        bijlagen.push({
          naam: opleverRapportBestandsnaam(rapport?.dossier.nummer ?? null, rapport?.moment.titel ?? 'oplevering'),
          contentType: 'application/pdf',
          inhoud: Buffer.from(pdf),
        })
      }

      await verstuurMailNamensMedewerker(mw.id, {
        to: rij.ontvangers ?? [],
        cc: rij.cc?.length ? rij.cc : undefined,
        subject: rij.onderwerp,
        bodyHtml: rij.body_html,
        attachments: bijlagen.length ? bijlagen : undefined,
      })
      await supabase.from('oplever_mail_wachtrij')
        .update({ status: 'verzonden', verzonden_op: new Date().toISOString(), verzonden_door: mw.id, laatste_fout: null })
        .eq('id', rij.id)
      verzonden++
    } catch (err) {
      const pogingen = (rij.pogingen ?? 0) + 1
      await supabase.from('oplever_mail_wachtrij')
        .update({
          pogingen,
          laatste_fout: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          // Na een paar mislukte pogingen niet eindeloos blijven proberen.
          status: pogingen >= MAX_POGINGEN ? 'mislukt' : 'wachtend',
        })
        .eq('id', rij.id)
      mislukt++
    }
  }

  revalidatePath(`/opdrachten/${dossierId}/kam`)
  return { ok: true, verzonden, mislukt }
}

/**
 * Zet de opleverrapportage klaar voor de opdrachtgever + overige betrokkenen. Verstuurt niet zelf:
 * het bericht komt in de wachtrij en gaat pas weg als een ingelogde medewerker het vrijgeeft.
 */
export async function queueRapportageMail(
  momentId: string,
  ontvangersInvoer: string,
  ccInvoer?: string,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const opgemaakt = await bouwRapportageMailHtml(momentId)
  if (!opgemaakt) return { ok: false, error: 'Oplevermoment niet gevonden.' }
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return { ok: false, error: 'Oplevermoment niet gevonden.' }

  const ontvangers = await splitsAdressen(ontvangersInvoer)
  if (ontvangers.length === 0) return { ok: false, error: 'Vul minstens één geldig e-mailadres in.' }
  const cc = ccInvoer ? await splitsAdressen(ccInvoer) : []

  return queueOpleverMail({
    dossierId: rapport.moment.dossier_id,
    soort: 'rapportage',
    ontvangers,
    cc,
    onderwerp: opgemaakt.onderwerp,
    bodyHtml: opgemaakt.bodyHtml,
    momentId,
    // Rapportages mogen vaker verstuurd worden (herzien/nazenden) → geen ontdubbelsleutel.
    sleutel: null,
  })
}

/* ─────────────── Berichten die de cron klaarzet (bouwers) ─────────────────── */

/** Herinneringsmail aan een onderaannemer met nog openstaande punten, inclusief zijn afmeldlink. */
export async function bouwHerinneringMail(
  naam: string,
  projectnaam: string,
  aantalOpen: number,
  afmeldUrl: string,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  const een = aantalOpen === 1
  const vars: Record<string, string> = {
    'relatie.naam': naam,
    'dossier.titel': projectnaam,
    'punten.open': String(aantalOpen),
    'punten.zin': een
      ? 'staat nog 1 opleverpunt open dat aan u is toegewezen'
      : `staan nog ${aantalOpen} opleverpunten open die aan u zijn toegewezen`,
    'punten.afmelden': een
      ? 'dit punt afmelden zodra het is opgelost'
      : 'deze punten afmelden zodra ze zijn opgelost',
  }

  const sjabloon = await getMailSjabloonTekst('oplever_herinnering')
  return {
    onderwerp: mailOnderwerp(sjabloon.onderwerp, vars),
    bodyHtml: wikkel('Openstaande opleverpunten', mailTekstNaarHtml(sjabloon.tekst, {
      vars,
      blokken: { knop: knop(afmeldUrl, 'Mijn opleverpunten afmelden') },
    })),
  }
}

/** Uitnodiging aan bewoners/gebruikers om de feedbackvragenlijst in te vullen. */
export async function bouwFeedbackUitnodigingMail(
  projectnaam: string,
  feedbackUrl: string,
): Promise<{ onderwerp: string; bodyHtml: string }> {
  const vars: Record<string, string> = { 'dossier.titel': projectnaam }
  const sjabloon = await getMailSjabloonTekst('oplever_feedback')
  return {
    onderwerp: mailOnderwerp(sjabloon.onderwerp, vars),
    bodyHtml: wikkel('Uw mening telt', mailTekstNaarHtml(sjabloon.tekst, {
      vars,
      blokken: { knop: knop(feedbackUrl, 'Vragenlijst invullen') },
    })),
  }
}
