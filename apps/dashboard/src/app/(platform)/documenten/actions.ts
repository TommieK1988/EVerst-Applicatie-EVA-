'use server'

/**
 * Server-actions voor het opstellen van documenten vanuit een dossier.
 *
 * Genereren/downloaden loopt via de API-routes (die geven bytes terug); hier
 * zitten de lees-acties voor het tab en het mailen.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht, getCurrentMedewerker, GeenToegangError } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { getDossierToggles } from '@/lib/dossiers/actions'
import { TAB_TOGGLE_GATES } from '@/lib/dossiers/tab-gating'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import {
  genereerDocumentPdf, laadSjabloon, bestandsnaamVoor, assertInvoerCompleet,
} from '@/lib/documenten/genereer-document'
import { archiveerEnRegistreer, markeerGemaild } from '@/lib/documenten/archiveer'
import type { DocumentSjabloon, DossierDocument } from '@/lib/documenten/types'
import {
  getOpleverTokenLinks, getOpleverFeedbackTemplates, maakToegangToken,
  type OpleverTokenLink,
} from '@/lib/dossiers/oplevering'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient() as any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naarSjabloon(row: any): DocumentSjabloon {
  return { ...row, velden: Array.isArray(row?.velden) ? row.velden : [] } as DocumentSjabloon
}

/**
 * Actieve sjablonen die voor dít dossier gelden. De filters op een sjabloon zijn
 * "leeg = geen filter"; een gevulde lijst moet de dossierwaarde bevatten.
 */
export async function getSjablonenVoorDossier(dossierId: string): Promise<DocumentSjabloon[]> {
  await vereisRecht('dossiers', 'lezen')

  const supabase = db()
  const [{ data: rijen }, { data: dossier }] = await Promise.all([
    supabase.from('document_sjablonen').select('*').eq('actief', true)
      .order('volgorde', { ascending: true }).order('naam', { ascending: true }),
    supabase.from('dossiers').select('categorie, hoofdstatus, werkmaatschappij_id').eq('id', dossierId).maybeSingle(),
  ])

  const alle: DocumentSjabloon[] = (rijen ?? []).map(naarSjabloon)
  if (!dossier) return alle

  // De houtrot-rapportage hoort alleen bij dossiers waar houtrot ook geregistreerd
  // wordt — zelfde poort als de Houtrot-tab zelf (TAB_TOGGLE_GATES).
  const heeftHoutrot = alle.some(s => s.documentsoort === 'houtrot_rapportage')
  const houtrotAan = heeftHoutrot
    ? (await getDossierToggles(dossierId)).some(t => t.sleutel === TAB_TOGGLE_GATES.houtrot && t.aan)
    : false

  return alle.filter((s: DocumentSjabloon) => {
    if (s.documentsoort === 'houtrot_rapportage' && !houtrotAan) return false
    if (s.categorie_filter?.length && !s.categorie_filter.includes(dossier.categorie)) return false
    if (s.hoofdstatus_filter?.length && !s.hoofdstatus_filter.includes(dossier.hoofdstatus)) return false
    if (s.werkmaatschappij_id && dossier.werkmaatschappij_id && s.werkmaatschappij_id !== dossier.werkmaatschappij_id) return false
    return true
  })
}

/** Eerder opgestelde documenten van dit dossier, nieuwste eerst. */
export async function getDossierDocumenten(dossierId: string): Promise<DossierDocument[]> {
  await vereisRecht('dossiers', 'lezen')
  const { data } = await db()
    .from('dossier_documenten')
    .select('*, opsteller:medewerkers!gegenereerd_door ( voornaam, tussenvoegsel, achternaam )')
    .eq('dossier_id', dossierId)
    .order('gegenereerd_op', { ascending: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    ...r,
    invoer: r.invoer ?? {},
    gegenereerd_door_naam: medewerkerNaam(r.opsteller) ?? null,
  })) as DossierDocument[]
}

export async function verwijderDossierDocument(id: string, dossierId: string): Promise<void> {
  await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)
  // Alleen de registratie verdwijnt; het bestand blijft in SharePoint staan —
  // documenten weggooien uit een dossiermap is bewust geen EVA-actie.
  await db().from('dossier_documenten').delete().eq('id', id)
}

export interface MailDocumentArgs {
  dossierId: string
  sjabloonId: string
  invoer: Record<string, unknown>
  to: string[]
  cc?: string[]
  onderwerp: string
  bodyHtml: string
  archiveren?: boolean
}

/**
 * Stelt het document op, mailt het als PDF-bijlage namens de ingelogde medewerker
 * en registreert het. De mail is de kritieke stap: mislukt die, dan faalt de actie
 * (en is er niets geregistreerd als "gemaild").
 */
export async function mailDocument(args: MailDocumentArgs): Promise<{ ok: boolean; fout?: string }> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(args.dossierId)

  const ontvangers = args.to.map(t => t.trim()).filter(Boolean)
  if (ontvangers.length === 0) return { ok: false, fout: 'Vul minstens één ontvanger in.' }

  const supabase = db()
  const sjabloon = await laadSjabloon(supabase, args.sjabloonId)
  if (!sjabloon) return { ok: false, fout: 'Sjabloon niet gevonden.' }

  try {
    assertInvoerCompleet(sjabloon, args.invoer)
  } catch (e) {
    return { ok: false, fout: (e as Error).message }
  }

  try {
    // medewerker-id komt uit de sessie, NOOIT uit de client (anders mail je namens
    // een willekeurige collega).
    const pdf = await genereerDocumentPdf(supabase, sjabloon, args.dossierId, args.invoer, medewerker.id)

    const { data: dossier } = await supabase.from('dossiers').select('dossiernummer').eq('id', args.dossierId).maybeSingle()
    const naam = `${bestandsnaamVoor(sjabloon, dossier?.dossiernummer)}.pdf`

    const { verstuurMailNamensMedewerker } = await import('@/lib/o365/mail')
    await verstuurMailNamensMedewerker(medewerker.id, {
      to: ontvangers,
      cc: (args.cc ?? []).map(c => c.trim()).filter(Boolean),
      subject: args.onderwerp,
      bodyHtml: args.bodyHtml,
      attachments: [{ naam, contentType: 'application/pdf', inhoud: pdf }],
    })

    // Pas ná een geslaagde mail archiveren + registreren.
    const archief = await archiveerEnRegistreer({
      supabase, dossierId: args.dossierId, sjabloon, invoer: args.invoer,
      bestandsnaam: naam, bytes: pdf, medewerkerId: medewerker.id,
      archiveren: args.archiveren ?? true,
    })
    if (archief.documentId) await markeerGemaild(supabase, archief.documentId, ontvangers)

    return { ok: true }
  } catch (err) {
    if (err instanceof GeenToegangError) throw err
    console.error('Document mailen mislukt:', err)
    return { ok: false, fout: 'Mailen mislukt. Controleer of je met Microsoft bent ingelogd.' }
  }
}

/* ─────────────────────── Feedback-link (bewoners) ─────────────────────── */

/**
 * Bestaande bewoners-feedbacklinks van een dossier, voor de picker bij een
 * feedback_link-invoerveld. Hergebruikt het Oplevering-tokensysteem (`/p/feedback/…`),
 * zodat een link intrekbaar is en ook op de Oplevering-tab zichtbaar blijft.
 */
export async function getFeedbackLinks(dossierId: string): Promise<OpleverTokenLink[]> {
  await vereisRecht('dossiers', 'lezen')
  return getOpleverTokenLinks(dossierId, 'feedback')
}

/** Gepubliceerde feedbackformulieren (categorie 'oplevering') om een nieuwe link aan te hangen. */
export async function getFeedbackFormulieren(): Promise<{ id: string; naam: string }[]> {
  await vereisRecht('dossiers', 'lezen')
  return getOpleverFeedbackTemplates()
}

/**
 * Maakt een nieuwe bewoners-feedbacklink (60 dagen geldig) en geeft de volledige URL terug,
 * klaar om als waarde van het feedback_link-veld te gebruiken.
 */
export async function maakFeedbackLink(
  dossierId: string,
  formTemplateId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await vereisRecht('dossiers', 'schrijven')
  if (!formTemplateId) return { ok: false, error: 'Kies eerst een feedbackformulier.' }
  const r = await maakToegangToken('feedback', {
    dossierId,
    formTemplateId,
    omschrijving: 'Bewonersbrief',
    geldigDagen: 60,
  })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, url: r.url }
}

/** Standaard-ontvanger + gerenderde mailtekst voor de modal. */
export async function getMailVoorstel(dossierId: string, sjabloonId: string): Promise<{
  to: string
  onderwerp: string
  bodyHtml: string
}> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = db()
  const [sjabloon, { data: dossier }] = await Promise.all([
    laadSjabloon(supabase, sjabloonId),
    supabase.from('dossiers')
      .select('titel, dossiernummer, werkadres_email, contactpersoon:contactpersonen!contactpersoon_id ( email )')
      .eq('id', dossierId).maybeSingle(),
  ])

  const to = dossier?.werkadres_email || dossier?.contactpersoon?.email || ''
  const vul = (t: string) => t
    .replace(/\{dossier\.titel\}/g, dossier?.titel ?? '')
    .replace(/\{dossier\.dossiernummer\}/g, dossier?.dossiernummer ?? '')

  return {
    to,
    onderwerp: vul(sjabloon?.mail_onderwerp ?? `${sjabloon?.naam ?? 'Document'} — ${dossier?.titel ?? ''}`),
    bodyHtml: vul(sjabloon?.mail_body_html ?? ''),
  }
}
