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
  /** Dossier achter deze offerte — voedt de ontvangerkiezer in het verzendvenster. */
  dossierId: string | null
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
  // Eerst de versie van een gekoppeld Word-document ophalen: is er in Word Online
  // gewijzigd, dan moet de toolbar dat meteen laten zien (goedkeuring verlopen).
  const { ververWordVersie } = await import('@/lib/everts-calc/offerte-word')
  await ververWordVersie(quoteId).catch(() => null)
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

  // Word-versie bijwerken vóór de hashvergelijking, anders blijft de knop
  // "Goedgekeurd" tonen terwijl er in Word Online al iets is aangepast.
  const { ververWordVersie } = await import('@/lib/everts-calc/offerte-word')
  await ververWordVersie(quoteId).catch(() => null)

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

  // Het dossier hangt aan de offerte zelf, of — bij oudere offertes — via het calc-project.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: q } = await admin.from('quotes').select('dossier_id, project_id').eq('id', quoteId).maybeSingle()
  let dossierId: string | null = q?.dossier_id ?? null
  if (!dossierId && q?.project_id) {
    const { data: d } = await admin.from('dossiers').select('id').eq('everts_calc_project_id', q.project_id).maybeSingle()
    dossierId = d?.id ?? null
  }

  return { to, subject, bodyHtml, dossierId }
}

function splitAdressen(v: string | undefined): string[] {
  return (v ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

/**
 * Offerte-substatussen die ná "07. Verzonden" in de ladder liggen. Die zetten we niet terug wanneer
 * er opnieuw een offerte de deur uit gaat: dat de klant al nagebeld is of mondeling toegezegd heeft,
 * is informatie die een hernieuwde verzending niet ongedaan maakt.
 */
const VERDER_DAN_VERZONDEN = new Set([
  'nabellen', 'in_behandeling', 'mondelinge_toezegging', 'gewonnen', 'verloren', 'vervallen',
])

/**
 * Zet het dossier van een zojuist verstuurde offerte op substatus **Verzonden** — in EVA én
 * (write-through) in het gedeelde Bouw7-maatwerkveld "Offerte Sub-status" ("07. Verzonden").
 * Staat het dossier nog in de aanvraagfase, dan promoveert het daarmee naar de offertefase.
 *
 * De mail is hier al de deur uit, dus "Verzonden" is een **feit**, geen voorstel: de write gaat
 * met `forceerBouw7` zodat de conflictcheck hem niet tegenhoudt wanneer EVA en Bouw7 uit elkaar
 * gelopen zijn. Om dezelfde reden schrijven we ook door als EVA zelf al op Verzonden staat — het
 * gaat er juist om dát het maatwerkveld in Bouw7 gevuld raakt, en dat kan achterlopen.
 *
 * Overslaan alleen wanneer "Verzonden" geen zinnige stap is: een dossier dat al opdracht is, een
 * servicedesk-melding (eigen ladder), of een offerte die al verder in de ladder staat — die
 * terugzetten zou informatie weggooien.
 *
 * Geeft een melding terug voor de toast plus of de statusstap slaagde; gooit niet.
 */
async function zetDossierOpVerzonden(dossierId: string): Promise<{ ok: boolean; tekst: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: d } = await admin
    .from('dossiers')
    .select('hoofdstatus, offerte_substatus, servicedesk_substatus, bouw7_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d)                                 return { ok: false, tekst: 'dossier niet gevonden' }
  if (d.servicedesk_substatus != null)    return { ok: true,  tekst: 'servicedeskmelding, status ongewijzigd' }
  if (d.hoofdstatus === 'opdracht')       return { ok: true,  tekst: 'dossier is al opdracht, status ongewijzigd' }
  if (d.offerte_substatus && VERDER_DAN_VERZONDEN.has(d.offerte_substatus)) {
    return { ok: true, tekst: `offerte staat al verder in de ladder (${d.offerte_substatus}), status ongewijzigd` }
  }

  const { updateDossierSubstatus } = await import('@/lib/dossiers/actions')
  const res = await updateDossierSubstatus(dossierId, 'verzonden', {
    schrijfBouw7: true,
    forceerBouw7: true,
  })
  if (!res.ok) return { ok: false, tekst: res.error }
  if (res.bouw7 && !res.bouw7.ok) return { ok: false, tekst: `Verzonden in EVA · Bouw7 mislukt: ${res.bouw7.error}` }
  return { ok: true, tekst: d.bouw7_id ? 'Verzonden (EVA + Bouw7)' : 'Verzonden (alleen EVA)' }
}

/**
 * Verstuurt de goedgekeurde offerte per e-mail namens de ingelogde medewerker,
 * zet de status op 'verzonden' na een geslaagde verzending (HTTP 202), zet het dossier op
 * substatus Verzonden (EVA + Bouw7) en archiveert de PDF + verzonden mail (.eml) in de
 * SharePoint-dossiermap.
 */
export async function verstuurOfferte(
  quoteId: string,
  input: { to: string; cc?: string; subject: string; bodyHtml: string },
): Promise<
  | { ok: true; sharepoint: string; status: string; statusOk: boolean }
  | { ok: false; error: string }
> {
  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd.' }

  // Word-versie ophalen vóór de gate. Dit is het moment dat telt: zonder deze
  // sync zou een bewerking in Word Online ná de goedkeuring ongemerkt naar de
  // klant gaan — de regels in de database veranderen daar immers niet van.
  // Bewust fail-closed: lukt de sync niet, dan gaat de offerte niet de deur uit.
  const { ververWordVersie } = await import('@/lib/everts-calc/offerte-word')
  const wordSync = await ververWordVersie(quoteId)
  if (!wordSync.ok) return { ok: false, error: wordSync.fout }

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

  // Dossier-UUID bepalen: directe koppeling of via het calc-project.
  let dossierId: string | null = quote.dossier_id ?? null
  if (!dossierId && quote.project_id) {
    const { data: d } = await admin.from('dossiers').select('id').eq('everts_calc_project_id', quote.project_id).maybeSingle()
    dossierId = d?.id ?? null
  }

  // ── Dossierstatus → Verzonden (EVA + Bouw7) ─────────────────────────────────
  // Er wordt bewust géén offerte in Bouw7 aangemaakt; alleen de status volgt mee. Best-effort:
  // faalt nooit de verzending, het resultaat gaat mee terug voor een toast.
  let status = 'geen dossier gekoppeld'
  let statusOk = true
  if (quote.type === 'interne_calculatie') {
    status = 'interne calculatie, status ongewijzigd'
  } else if (dossierId) {
    try {
      const res = await zetDossierOpVerzonden(dossierId)
      status = res.tekst
      statusOk = res.ok
    } catch (e) {
      status = e instanceof Error ? e.message : 'status bijwerken mislukt'
      statusOk = false
    }
  }

  // ── SharePoint-archief (fail-soft) ──────────────────────────────────────────
  let sharepoint = 'niet gearchiveerd'
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
  // De aanvraag-/offertelijsten worden al door `updateDossierSubstatus` gerevalideerd.
  return { ok: true, sharepoint, status, statusOk }
}
