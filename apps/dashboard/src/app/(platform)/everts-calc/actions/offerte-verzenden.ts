'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { createAdminClient } from '@everts/database/server'
import { laadOfferteContext, genereerOffertePdfMetBijlagen } from '@/lib/everts-calc/genereer-offerte-pdf'
import { getOfferteMailSjabloon, buildMailVars, renderMailTekst } from '@/lib/everts-calc/offerte-mail'
import { verstuurMailNamensMedewerker, haalVerzondenMailMime, type MailBijlage } from '@/lib/o365/mail'
import { uploadBuffersNaarDossierMap } from '@/lib/dossiers/sharepoint-bestanden'

export interface MailConcept {
  to: string
  subject: string
  bodyHtml: string
}

/** Prefill voor het verzendvenster: ontvanger + gerenderd onderwerp/tekst. */
export async function getOfferteMailConcept(quoteId: string): Promise<MailConcept> {
  const { ctx } = await laadOfferteContext(quoteId)
  const sjabloon = await getOfferteMailSjabloon()
  const vars = buildMailVars(ctx)
  const subject = renderMailTekst(sjabloon.onderwerp, vars)
  const bodyHtml = renderMailTekst(sjabloon.tekst, vars).replace(/\n/g, '<br>')
  const to = ctx.dossier.contactpersoon_email || ctx.klant.email || ''
  return { to, subject, bodyHtml }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function splitAdressen(v: string | undefined): string[] {
  return (v ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

/**
 * Verstuurt de goedgekeurde offerte per e-mail namens de ingelogde medewerker,
 * zet de status op 'verzonden' na een geslaagde verzending (HTTP 202) en
 * archiveert de PDF + verzonden mail (.eml) in de SharePoint-dossiermap.
 */
export async function verstuurOfferte(
  quoteId: string,
  input: { to: string; cc?: string; subject: string; bodyHtml: string },
): Promise<{ ok: true; sharepoint: string } | { ok: false; error: string }> {
  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd.' }

  // Harde gate: alleen een goedgekeurde offerte mag de deur uit.
  const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
  const gate = await assertOfferteVerzendbaar(quoteId)
  if (!gate.ok) return { ok: false, error: gate.error }

  const to = splitAdressen(input.to)
  const cc = splitAdressen(input.cc)
  if (to.length === 0) return { ok: false, error: 'Geen ontvanger opgegeven.' }

  // ── PDF's genereren (offerte + losse voorwaarden, zonder watermerk) ─────────
  let offertePdf: Uint8Array
  let voorwaardenPdf: Uint8Array | null
  let quoteNummer: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let quote: any
  try {
    const res = await genereerOffertePdfMetBijlagen(quoteId)
    offertePdf = res.offertePdf
    voorwaardenPdf = res.voorwaardenPdf
    quoteNummer = res.quoteNummer
    quote = res.quote
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'PDF genereren mislukt.' }
  }

  const bestandsnaamPdf = `Offerte ${quoteNummer}.pdf`
  const attachments: MailBijlage[] = [
    { naam: bestandsnaamPdf, contentType: 'application/pdf', inhoud: offertePdf },
  ]
  if (voorwaardenPdf) {
    attachments.push({ naam: 'Algemene voorwaarden.pdf', contentType: 'application/pdf', inhoud: voorwaardenPdf })
  }

  // ── Verzenden (202 Accepted = geslaagd) ─────────────────────────────────────
  try {
    await verstuurMailNamensMedewerker(mw.id, {
      to, cc, subject: input.subject, bodyHtml: input.bodyHtml, attachments,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Mail versturen mislukt.' }
  }

  // ── Status → verzonden (pas ná geslaagde verzending) ────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  await admin.from('quotes').update({
    status: 'verzonden',
    verzonden_at: new Date().toISOString(),
    verzonden_door: mw.id,
    verzonden_naar: to.join(', '),
    updated_at: new Date().toISOString(),
  }).eq('id', quoteId)

  // ── SharePoint-archief (fail-soft) ──────────────────────────────────────────
  let sharepoint = 'niet gearchiveerd'
  // Dossier-UUID bepalen: directe koppeling of via het calc-project.
  let dossierId: string | null = quote.dossier_id ?? null
  if (!dossierId && quote.project_id) {
    const { data: d } = await admin.from('dossiers').select('id').eq('everts_calc_project_id', quote.project_id).maybeSingle()
    dossierId = d?.id ?? null
  }
  if (dossierId) {
    const bestanden: { naam: string; contentType: string; bytes: Uint8Array }[] = [
      { naam: bestandsnaamPdf, contentType: 'application/pdf', bytes: offertePdf },
    ]
    const eml = await haalVerzondenMailMime(mw.id, input.subject)
    if (eml) bestanden.push({ naam: `Offerte ${quoteNummer}.eml`, contentType: 'message/rfc822', bytes: new Uint8Array(eml) })
    try {
      const up = await uploadBuffersNaarDossierMap(dossierId, bestanden)
      sharepoint = up.ok ? `gearchiveerd (${up.geuploaded} bestand(en))` : (up.fout ?? 'archiveren mislukt')
    } catch (e) {
      sharepoint = e instanceof Error ? e.message : 'archiveren mislukt'
    }
  }

  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath(`/everts-calc/quotes/${quoteId}`)
  return { ok: true, sharepoint }
}
