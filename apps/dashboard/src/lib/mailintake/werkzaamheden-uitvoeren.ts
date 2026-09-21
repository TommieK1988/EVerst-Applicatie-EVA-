/**
 * mailintake/werkzaamheden-uitvoeren.ts
 *
 * Verzamelt de bronnen voor de scope-samenvatting en schrijft het resultaat weg.
 * De samenvatting zelf (prompt, schema, aanroep) staat in werkzaamheden.ts; hier
 * gaat het puur over waar de documenten vandaan komen.
 *
 * Twee ingangen, met bewust verschillende bronnen:
 *
 *  - `maakWerkzaamhedenSamenvatting(berichtId)` — de aanvraagmail plus de
 *    bijlagen die eraan hingen. Draait bij de intake en achter de knop in het
 *    behandelscherm.
 *  - `verzamelDossierBronnen(dossierId)` — álle bestanden van het dossier:
 *    SharePoint-dossiermap, Bouw7-bestanden én de oorspronkelijke intakebijlagen.
 *    Voor de knop op het dossier, als er later een bestek is bijgekomen.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { beoordeelBijlage } from './bijlagen-filter'
import type { Json } from '@everts/database'

import { appGraphFetch } from '@/lib/o365/graph'

import { vatWerkzaamhedenSamen, herkomstregel, type BronBestand, type WerkzaamhedenResultaat, deelTeksten } from './werkzaamheden'

/** Zelfde rem als in werkzaamheden.ts: één Anthropic-verzoek mag maximaal 32 MB. */
const MAX_TOTAAL_BYTES = 20 * 1024 * 1024

// ─── Bronnen verzamelen ───────────────────────────────────────────────────────

/** De bijlagen van één intakebericht, uit de privébucket. */
async function bijlagenVanBericht(berichtId: string): Promise<{ bestanden: BronBestand[]; gemist: string[] }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_bijlagen')
    .select('bestandsnaam, content_type, opslag_pad, grootte_bytes, te_groot, is_inline')
    .eq('bericht_id', berichtId)
    .limit(50)

  const bestanden: BronBestand[] = []
  const gemist: string[] = []
  let totaal = 0

  for (const b of data ?? []) {
    // Zelfde zeef als de veldronde: geplakte foto's lezen mee, mailopmaak niet.
    if (!beoordeelBijlage({
      bestandsnaam: b.bestandsnaam, contentType: b.content_type,
      grootteBytes: b.grootte_bytes, isInline: Boolean(b.is_inline),
    }).meelezen) continue
    if (b.te_groot || !b.opslag_pad) { gemist.push(`${b.bestandsnaam} (niet opgeslagen)`); continue }
    if (totaal + (b.grootte_bytes ?? 0) > MAX_TOTAAL_BYTES) { gemist.push(`${b.bestandsnaam} (past niet meer)`); continue }
    try {
      const { data: blob, error } = await supabase.storage.from('mail-intake').download(b.opslag_pad)
      if (error || !blob) { gemist.push(`${b.bestandsnaam} (ophalen mislukt)`); continue }
      const bytes = Buffer.from(await blob.arrayBuffer())
      bestanden.push({ bestandsnaam: b.bestandsnaam, contentType: b.content_type, bytes, herkomst: 'mail' })
      totaal += bytes.length
    } catch {
      gemist.push(`${b.bestandsnaam} (ophalen mislukt)`)
    }
  }

  return { bestanden, gemist }
}

/**
 * Alle bestanden die aan een dossier hangen: SharePoint, Bouw7 en de
 * intakebijlagen van de mail waar het dossier uit ontstond.
 *
 * Bewust in deze volgorde: SharePoint bevat de stukken die er ná de intake bij
 * zijn gekomen — meestal precies het bestek waarvoor iemand op deze knop drukt.
 */
export async function verzamelDossierBronnen(
  dossierId: string,
): Promise<{ bestanden: BronBestand[]; gemist: string[] }> {
  const supabase = createAdminClient()
  const bestanden: BronBestand[] = []
  const gemist: string[] = []
  let totaal = 0

  const past = (n: number) => totaal + n <= MAX_TOTAAL_BYTES

  // ── SharePoint-dossiermap ───────────────────────────────────────────────
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('sharepoint_drive_id, sharepoint_item_id, mailintake_bericht_id')
    .eq('id', dossierId)
    .maybeSingle()

  if (dossier?.sharepoint_drive_id && dossier?.sharepoint_item_id) {
    try {
      const { listFolderChildren } = await import('@/lib/o365/sharepoint')
      const kinderen = await listFolderChildren(dossier.sharepoint_drive_id, dossier.sharepoint_item_id)
      for (const f of kinderen) {
        if (!f.driveId || !f.id) continue
        if (!past(f.grootte ?? 0)) { gemist.push(`${f.naam} (past niet meer)`); continue }
        try {
          const res = await appGraphFetch(`/drives/${f.driveId}/items/${f.id}/content`)
          if (!res.ok) { gemist.push(`${f.naam} (ophalen mislukt)`); continue }
          const bytes = Buffer.from(await res.arrayBuffer())
          bestanden.push({
            bestandsnaam: f.naam,
            contentType: res.headers.get('content-type'),
            bytes,
            herkomst: 'sharepoint',
          })
          totaal += bytes.length
        } catch {
          gemist.push(`${f.naam} (ophalen mislukt)`)
        }
      }
    } catch {
      gemist.push('SharePoint-map kon niet worden gelezen')
    }
  }

  // ── Bouw7-bestanden ─────────────────────────────────────────────────────
  // Read-only uit de snapshot; de bytes komen live via dezelfde route die de
  // download-proxy gebruikt (getBinary op de storage-hash).
  try {
    const { getDossierBestanden } = await import('@/lib/dossiers/bestanden')
    const stand = await getDossierBestanden(dossierId)
    if (stand.beschikbaar) {
      const { getBouw7Client } = await import('@/lib/bouw7/sync')
      const client = await getBouw7Client()
      for (const f of stand.bestanden) {
        if (!f.fileHash && !f.id) continue
        if (!past(f.grootte ?? 0)) { gemist.push(`${f.naam} (past niet meer)`); continue }
        try {
          const pad = f.fileHash
            ? `/storage/${encodeURIComponent(f.fileHash)}/download`
            : `/project/file/${encodeURIComponent(String(f.id))}`
          const { data, contentType } = await client.getBinary(pad)
          const bytes = Buffer.from(data)
          bestanden.push({ bestandsnaam: f.naam, contentType: contentType ?? null, bytes, herkomst: 'bouw7' })
          totaal += bytes.length
        } catch {
          gemist.push(`${f.naam} (Bouw7-download mislukt)`)
        }
      }
    }
  } catch {
    // Bouw7 onbereikbaar of geen koppeling: dan gewoon zonder.
  }

  // ── De oorspronkelijke intakebijlagen ───────────────────────────────────
  if (dossier?.mailintake_bericht_id) {
    const uitMail = await bijlagenVanBericht(dossier.mailintake_bericht_id)
    for (const b of uitMail.bestanden) {
      // Kan dubbel zijn: intakebijlagen worden ook naar SharePoint gekopieerd.
      const alAanwezig = bestanden.some(x => x.bestandsnaam.endsWith(b.bestandsnaam))
      if (alAanwezig || !past(b.bytes.length)) continue
      bestanden.push(b)
      totaal += b.bytes.length
    }
    gemist.push(...uitMail.gemist)
  }

  return { bestanden, gemist }
}

// ─── Uitvoeren en wegschrijven ────────────────────────────────────────────────

/** Kosten van vandaag voor deze postbus; de samenvatting deelt het budget met de veldextractie. */
async function budgetOp(postbusId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const begin = new Date(); begin.setHours(0, 0, 0, 0)
  const [{ data: rijen }, { data: postbus }] = await Promise.all([
    supabase
      .from('mailintake_extracties')
      .select('kosten_cent, bericht:mailintake_berichten!inner(postbus_id)')
      .eq('bericht.postbus_id', postbusId)
      .gte('created_at', begin.toISOString())
      .limit(1000),
    supabase.from('mailintake_postbussen').select('dagbudget_cent').eq('id', postbusId).maybeSingle(),
  ])
  const besteed = (rijen ?? []).reduce((s: number, r: any) => s + (r.kosten_cent ?? 0), 0)
  return besteed >= (postbus?.dagbudget_cent ?? 2000)
}

/**
 * Maakt (of vernieuwt) de samenvatting voor één intakebericht en slaat hem op.
 *
 * Gooit niet. Mislukt de samenvatting, dan blijft het bericht gewoon staan met
 * een leeg scope-blok en de knop om het alsnog te proberen — een samenvatting is
 * nooit belangrijk genoeg om een aanvraag op te laten sneuvelen.
 */
export async function maakWerkzaamhedenSamenvatting(
  berichtId: string,
): Promise<{
  ok: boolean
  /** Het Scope-deel. */
  tekst: string | null
  buitenScope: string | null
  aandachtspunten: string | null
  fout: string | null
  kostenCent: number
}> {
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, postbus_id, onderwerp, van_naam, van_adres, ontvangen_op, body_tekst')
    .eq('id', berichtId)
    .maybeSingle()

  if (!b) return { ok: false, tekst: null, buitenScope: null, aandachtspunten: null, fout: 'Bericht niet gevonden.', kostenCent: 0 }

  if (await budgetOp(b.postbus_id)) {
    return { ok: false, tekst: null, buitenScope: null, aandachtspunten: null, fout: 'Het dagbudget voor deze postbus is bereikt.', kostenCent: 0 }
  }

  const { data: laatsteExtractie } = await supabase
    .from('mailintake_extracties').select('velden')
    .eq('bericht_id', berichtId).eq('ronde', 'velden')
    .order('versie', { ascending: false }).limit(1).maybeSingle()

  const v = (laatsteExtractie?.velden ?? {}) as Record<string, string | null>
  const werkadres = [
    [v.werkadres_straat, v.werkadres_huisnummer].filter(Boolean).join(' '),
    [v.werkadres_postcode, v.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  const { bestanden, gemist } = await bijlagenVanBericht(berichtId)

  const res = await vatWerkzaamhedenSamen({
    onderwerp: b.onderwerp,
    vanNaam: b.van_naam,
    vanAdres: b.van_adres,
    ontvangenOp: b.ontvangen_op,
    bodyTekst: b.body_tekst,
    werkadres,
    bestanden,
  })

  await bewaarExtractie(berichtId, res)

  if (!res.ok) {
    return {
      ok: false, tekst: null, buitenScope: null, aandachtspunten: null,
      fout: res.fout, kostenCent: res.kostenCent,
    }
  }

  // De omschrijving heeft drie delen. Ze worden apart bewaard omdat de behandelaar
  // ze los bijschaaft en omdat een uitsluiting tussen de werkzaamheden als werk leest.
  const delen = res.data ? deelTeksten(res.data) : { scope: '', buitenScope: '', aandachtspunten: '' }

  await supabase.from('mailintake_berichten').update({
    gevraagde_werkzaamheden: delen.scope || null,
    buiten_scope: delen.buitenScope || null,
    aandachtspunten: delen.aandachtspunten || null,
    gevraagde_werkzaamheden_bronnen: res.gelezen,
    gevraagde_werkzaamheden_gemist: [...res.gemist, ...gemist],
    gevraagde_werkzaamheden_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  return {
    ok: true,
    tekst: delen.scope || null,
    buitenScope: delen.buitenScope || null,
    aandachtspunten: delen.aandachtspunten || null,
    fout: null,
    kostenCent: res.kostenCent,
  }
}

/** Legt de aanroep vast als tweede soort extractie, zodat de kostenmeter klopt. */
async function bewaarExtractie(berichtId: string, res: WerkzaamhedenResultaat): Promise<void> {
  const supabase = createAdminClient()
  const { data: laatste } = await supabase
    .from('mailintake_extracties').select('versie')
    .eq('bericht_id', berichtId).eq('ronde', 'werkzaamheden')
    .order('versie', { ascending: false }).limit(1).maybeSingle()

  await supabase.from('mailintake_extracties').insert({
    bericht_id: berichtId,
    ronde: 'werkzaamheden',
    versie: ((laatste?.versie ?? 0) as number) + 1,
    model: res.model,
    prompt_versie: res.promptVersie,
    velden: res.data ? (res.data as unknown as Json) : {},
    toelichting: res.kop,
    invoer_tokens: res.invoerTokens,
    uitvoer_tokens: res.uitvoerTokens,
    kosten_cent: res.kostenCent,
    status: res.ok ? 'gereed' : 'mislukt',
    fout: res.fout,
  })
}

/**
 * Stelt een nieuwe samenvatting op uit álle dossierbestanden — maar slaat hem
 * niet op. De aanroeper toont oud en nieuw naast elkaar en laat een mens kiezen;
 * ongevraagd overschrijven zou een handmatige aanscherping wissen.
 */
export async function stelDossierSamenvattingVoor(
  dossierId: string,
): Promise<{ ok: boolean; tekst: string | null; herkomst: string | null; gemist: string[]; fout: string | null }> {
  const supabase = createAdminClient()

  const { data: d } = await supabase
    .from('dossiers')
    .select('titel, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, opmerkingen')
    .eq('id', dossierId)
    .maybeSingle()

  if (!d) return { ok: false, tekst: null, herkomst: null, gemist: [], fout: 'Dossier niet gevonden.' }

  const werkadres = [
    [d.werkadres_straat, d.werkadres_huisnummer].filter(Boolean).join(' '),
    [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  const { bestanden, gemist } = await verzamelDossierBronnen(dossierId)
  if (!bestanden.length) {
    return { ok: false, tekst: null, herkomst: null, gemist, fout: 'Er zijn geen leesbare bestanden aan dit dossier gekoppeld.' }
  }

  const res = await vatWerkzaamhedenSamen({
    onderwerp: d.titel,
    vanNaam: null,
    vanAdres: null,
    ontvangenOp: null,
    bodyTekst: d.opmerkingen ?? null,
    werkadres,
    bestanden,
  })

  if (!res.ok) return { ok: false, tekst: null, herkomst: null, gemist: [...gemist, ...res.gemist], fout: res.fout }

  return {
    ok: true,
    tekst: res.tekst,
    herkomst: herkomstregel(res.gelezen, 'dossier'),
    gemist: [...gemist, ...res.gemist],
    fout: null,
  }
}
