'use server'

import { createAdminClient } from '@everts/database/server'
import { assertDossierBewerkbaar } from './guards'

/**
 * Offerte-paneel op de Informatie-tab (fase Offerte). Toont uitsluitend échte
 * offertes: in EVA gemaakte quotes (gerenderd via de pdf-preview-route) of een
 * handmatig aan het dossier gekoppelde PDF. De PDF staat in de private
 * storage-bucket 'dossier-offertes'; inzien loopt via kortstondige signed URLs.
 */

const BUCKET = 'dossier-offertes'

export type OffertePaneelQuote = {
  id: string
  quote_nummer: string
  versie: number
  status: string
  verzonden_at: string | null
}

export type OffertePaneelData = {
  /** In EVA gemaakte verkoopoffertes voor dit dossier, oudste versie eerst. */
  quotes: OffertePaneelQuote[]
  /** Handmatig gekoppelde offerte-PDF, met kortstondige inzage-URL. */
  pdf: { naam: string; url: string } | null
}

/** Alles wat het offerte-paneel nodig heeft, in één call. */
export async function getOffertePaneelData(dossierId: string): Promise<OffertePaneelData> {
  if (!dossierId) return { quotes: [], pdf: null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: dossier } = await admin
    .from('dossiers')
    .select('everts_calc_project_id, offerte_pdf_pad, offerte_pdf_naam')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier) return { quotes: [], pdf: null }

  // Offertes via de directe dossier-koppeling én via het gekoppelde calc-project;
  // interne calculaties horen niet in het klantgerichte paneel.
  let query = admin
    .from('quotes')
    .select('id, quote_nummer, versie, status, verzonden_at')
    .neq('type', 'interne_calculatie')
  query = dossier.everts_calc_project_id
    ? query.or(`dossier_id.eq.${dossierId},project_id.eq.${dossier.everts_calc_project_id}`)
    : query.eq('dossier_id', dossierId)
  const { data: quotes } = await query
    .order('versie', { ascending: true })
    .order('created_at', { ascending: true })

  let pdf: OffertePaneelData['pdf'] = null
  if (dossier.offerte_pdf_pad) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(dossier.offerte_pdf_pad, 3600)
    if (signed?.signedUrl) pdf = { naam: dossier.offerte_pdf_naam ?? 'Offerte.pdf', url: signed.signedUrl }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quotes: ((quotes ?? []) as any[]).map(q => ({
      id: q.id,
      quote_nummer: q.quote_nummer,
      versie: q.versie ?? 1,
      status: q.status,
      verzonden_at: q.verzonden_at ?? null,
    })),
    pdf,
  }
}

/** Koppelt een geüploade offerte-PDF aan het dossier (vervangt een eerdere koppeling). */
export async function koppelOffertePdf(
  dossierId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)

  const file = formData.get('bestand') as File | null
  if (!file || !file.size) return { ok: false, error: 'Geen bestand meegegeven' }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, error: 'Alleen een PDF kan als offerte gekoppeld worden' }
  }
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'PDF is te groot (max. 25 MB)' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  // Privaat: offertes zijn klant-/prijsdata — inzien alleen via signed URLs.
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => null)

  const veiligNaam = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const pad = `${dossierId}/${Date.now()}_${veiligNaam}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(pad, buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) return { ok: false, error: upErr.message }

  const { data: huidig } = await admin
    .from('dossiers').select('offerte_pdf_pad').eq('id', dossierId).maybeSingle()
  const { error } = await admin
    .from('dossiers')
    .update({ offerte_pdf_pad: pad, offerte_pdf_naam: file.name })
    .eq('id', dossierId)
  if (error) return { ok: false, error: error.message }

  // Oude PDF opruimen — best effort, de koppeling is al vervangen.
  if (huidig?.offerte_pdf_pad && huidig.offerte_pdf_pad !== pad) {
    await admin.storage.from(BUCKET).remove([huidig.offerte_pdf_pad]).catch(() => null)
  }
  return { ok: true }
}

/** Verwijdert de gekoppelde offerte-PDF van het dossier (incl. het storage-bestand). */
export async function ontkoppelOffertePdf(
  dossierId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: huidig } = await admin
    .from('dossiers').select('offerte_pdf_pad').eq('id', dossierId).maybeSingle()
  const { error } = await admin
    .from('dossiers')
    .update({ offerte_pdf_pad: null, offerte_pdf_naam: null })
    .eq('id', dossierId)
  if (error) return { ok: false, error: error.message }

  if (huidig?.offerte_pdf_pad) {
    await admin.storage.from(BUCKET).remove([huidig.offerte_pdf_pad]).catch(() => null)
  }
  return { ok: true }
}
