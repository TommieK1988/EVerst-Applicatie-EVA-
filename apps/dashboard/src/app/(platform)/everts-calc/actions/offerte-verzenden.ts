'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { createAdminClient } from '@everts/database/server'
import { laadOfferteContext, genereerOffertePdfMetBijlagen } from '@/lib/everts-calc/genereer-offerte-pdf'
import { getOfferteMailSjabloon, buildMailVars, renderMailTekst } from '@/lib/everts-calc/offerte-mail'
import { verstuurMailNamensMedewerker, haalVerzondenMailMime, type MailBijlage } from '@/lib/o365/mail'
import { uploadBuffersNaarDossierMap } from '@/lib/o365/dossier-map'
import type { GoedkeuringStatus } from '@/lib/goedkeuring/types'

export interface MailConcept {
  to: string
  subject: string
  bodyHtml: string
}

export interface OfferteDetailStatus {
  quoteNummer: string
  status: string
  isIntern: boolean
  verzendbaar: boolean
  totaalBedrag: number
  dossierId: string | null
}

/** Laadt de toolbar-status voor de inline offerte-detailweergave in het dossier. */
export async function laadOfferteDetailStatus(quoteId: string): Promise<OfferteDetailStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: q } = await admin
    .from('quotes')
    .select('quote_nummer, status, type, subtotaal_ex_btw, dossier_id, project_id')
    .eq('id', quoteId)
    .maybeSingle()
  if (!q) throw new Error('Offerte niet gevonden')

  const isIntern = q.type === 'interne_calculatie'
  const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
  const verzendbaar = !isIntern && (await assertOfferteVerzendbaar(quoteId)).ok

  let dossierId: string | null = q.dossier_id ?? null
  if (!dossierId && q.project_id) {
    const { data: d } = await admin.from('dossiers').select('id').eq('everts_calc_project_id', q.project_id).maybeSingle()
    dossierId = d?.id ?? null
  }

  return {
    quoteNummer: q.quote_nummer,
    status: q.status,
    isIntern,
    verzendbaar,
    totaalBedrag: q.subtotaal_ex_btw ?? 0,
    dossierId,
  }
}

export interface OfferteGoedkeuringKnopStatus {
  /** Status van de actuele (laatste) ronde; null = nog nooit goedkeuring aangevraagd. */
  status: GoedkeuringStatus | null
  /** Mag de ingelogde gebruiker de openstaande aanvraag beoordelen (controller/Directie/gedelegeerde)? */
  magBeoordelen: boolean
  /** Is goedkeuring voor deze offerte überhaupt vereist (categorie/drempel)? */
  vereist: boolean
  /** Laatste goedgekeurde ronde én de inhoud is sindsdien niet gewijzigd (object_hash matcht). */
  ongewijzigd: boolean
}

/**
 * Alles wat de offerte-goedkeuringsknop nodig heeft om zijn status te tonen, in één call.
 * Spiegelt de werkbegroting-header: groen "Offerte goedkeuren" als je mag accorderen,
 * anders een statusgekleurde knop.
 */
export async function getOfferteGoedkeuringKnopStatus(quoteId: string): Promise<OfferteGoedkeuringKnopStatus> {
  const { getGoedkeuring } = await import('@/lib/goedkeuring/actions')
  const { offerteGoedkeuringVereist, berekenOfferteHash } = await import('@/lib/goedkeuring/offerte')

  const [overzicht, vereistInfo] = await Promise.all([
    getGoedkeuring('offerte', quoteId),
    offerteGoedkeuringVereist(quoteId),
  ])

  // Ongewijzigd = laatste goedgekeurde ronde met een object_hash die nog matcht.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: laatsteGoedgekeurd } = await admin
    .from('goedkeuringen')
    .select('object_hash')
    .eq('object_type', 'offerte')
    .eq('object_id', quoteId)
    .eq('status', 'goedgekeurd')
    .order('ronde', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ongewijzigd = laatsteGoedgekeurd
    ? laatsteGoedgekeurd.object_hash === (await berekenOfferteHash(quoteId))
    : false

  return {
    status: overzicht.actueel?.status ?? null,
    magBeoordelen: overzicht.magBeoordelen,
    vereist: vereistInfo.vereist,
    ongewijzigd,
  }
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
): Promise<{ ok: true; sharepoint: string; bouw7: string } | { ok: false; error: string }> {
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

  // ── Calculatie bevriezen bij deze offerteversie (audit-proof) ───────────────
  // Onveranderbare kopie van de scenario-subboom + `bevroren_op` op het scenario,
  // zodat de verzonden versie exact reproduceerbaar blijft. Fail-soft: de
  // quote_lines blijven het primaire record.
  try {
    const { bevriesCalculatieVoorOfferte } = await import('./sync')
    await bevriesCalculatieVoorOfferte(quoteId)
  } catch { /* niet blokkerend voor de verzending */ }

  // ── Offerte als Bouw7-offerte registreren (POST /quotation) ─────────────────
  // Best-effort: schrijft de kopgegevens + totaal excl. BTW als samenvattingsregel weg naar het
  // gekoppelde Bouw7-project. Faalt nooit de verzending; resultaat gaat mee terug voor een toast.
  let bouw7 = 'niet naar Bouw7 geschreven'
  try {
    const { stuurOfferteNaarBouw7 } = await import('@/lib/dossiers/bouw7-offerte')
    const res = await stuurOfferteNaarBouw7(quoteId)
    bouw7 = res.ok ? 'naar Bouw7 geschreven' : res.error
  } catch (e) {
    bouw7 = e instanceof Error ? e.message : 'Bouw7-offerte schrijven mislukt'
  }

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
  return { ok: true, sharepoint, bouw7 }
}
