/**
 * offerte-word.ts
 *
 * "Bewerken in Word Online" voor offertes.
 *
 * Het probleem dat dit oplost: een offerte als .docx downloaden en lokaal
 * bijwerken breekt de ketting — het bewerkte bestand kent EVA niet, dus er valt
 * geen goedkeuring op aan te vragen en de klant krijgt hem niet vanuit EVA.
 *
 * De oplossing spiegelt de documenten-module: het ingevulde .docx wordt in de
 * SharePoint-dossiermap gezet en de driveItem-verwijzing komt op `quotes` te
 * staan. Vanaf dat moment is dát bestand de bron voor de offerte-PDF
 * (voorvertoning, download én verzending), en blijft alles binnen EVA werken.
 *
 * Twee bewakingen horen daarbij:
 *  1. `word_etag` (cTag van SharePoint) gaat mee in de goedkeurings-hash. Wie na
 *     de goedkeuring nog in Word iets wijzigt, moet opnieuw laten goedkeuren.
 *  2. `word_inhoud_hash` legt de offerte-inhoud vast op het moment van opstellen.
 *     Wijzigt de calculatie daarna, dan is het Word-document verouderd en zegt de
 *     interface dat — anders zou de PDF stilzwijgend oude bedragen tonen.
 *
 * Bewust `server-only` en géén `'use server'`: dit zijn gewone modules, geen RPC.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { appGraphFetch, appGraphGet, appGraphGetRaw, GraphError } from '@/lib/o365/graph'
import { uploadBuffersNaarDossierMap } from '@/lib/o365/dossier-map'
import { laadOfferteContext } from './offerte-context'
import { renderQuoteDocx, loadQuoteTemplateBuffer } from './render-quote-docx'
import { hashOfferte, type HashbareOfferteRegel } from './goedkeuring-hash'

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const WORD_KOLOMMEN =
  'word_drive_id, word_item_id, word_web_url, word_bestandsnaam, word_etag, word_inhoud_hash, word_gesynct_op, word_gemaakt_op'

export interface OfferteWordKoppeling {
  driveId: string
  itemId: string
  webUrl: string | null
  bestandsnaam: string | null
  /** Versiemarker uit SharePoint zoals EVA hem het laatst zag. */
  etag: string | null
  /** Offerte-inhoud op het moment dat het document werd opgesteld. */
  inhoudHash: string | null
  gesyncOp: string | null
  gemaaktOp: string | null
}

/** De koppeling van deze offerte met een bewerkbaar Word-document (of null). */
export async function getOfferteWordKoppeling(quoteId: string): Promise<OfferteWordKoppeling | null> {
  const { data } = await db().from('quotes').select(WORD_KOLOMMEN).eq('id', quoteId).maybeSingle()
  if (!data?.word_drive_id || !data?.word_item_id) return null
  return {
    driveId: data.word_drive_id,
    itemId: data.word_item_id,
    webUrl: data.word_web_url ?? null,
    bestandsnaam: data.word_bestandsnaam ?? null,
    etag: data.word_etag ?? null,
    inhoudHash: data.word_inhoud_hash ?? null,
    gesyncOp: data.word_gesynct_op ?? null,
    gemaaktOp: data.word_gemaakt_op ?? null,
  }
}

/**
 * Inhouds-hash van de offerte zoals die uit de calculatie komt (regels +
 * subtotaal). Los van de Word-versie; wordt gebruikt om te bepalen of het
 * Word-document nog bij de actuele calculatie hoort.
 */
export async function berekenOfferteInhoudHash(quoteId: string): Promise<string> {
  const d = db()
  const [{ data: quote }, { data: lines }] = await Promise.all([
    d.from('quotes').select('subtotaal_ex_btw').eq('id', quoteId).maybeSingle(),
    d.from('quote_lines').select('id, omschrijving, hoeveelheid, eenheidsprijs, btw_pct').eq('quote_id', quoteId),
  ])
  return hashOfferte((lines ?? []) as HashbareOfferteRegel[], Number(quote?.subtotaal_ex_btw) || 0)
}

// ─── Versie bijhouden ─────────────────────────────────────────────────────────

export type WordVersieSync =
  | { ok: true; etag: string | null; veranderd: boolean }
  | { ok: false; fout: string; verdwenen: boolean }

/**
 * Haalt de actuele versiemarker van het SharePoint-bestand op en schrijft hem weg.
 *
 * Dit is het mechanisme waarmee een bewerking in Word Online zichtbaar wordt voor
 * de goedkeuringsgate: `word_etag` zit in de goedkeurings-hash, dus zodra de cTag
 * verschuift, matcht de opgeslagen hash niet meer.
 *
 * We gebruiken de cTag (verandert bij inhoudswijziging) en vallen terug op de
 * eTag wanneer SharePoint er geen meegeeft.
 */
export async function ververWordVersie(quoteId: string): Promise<WordVersieSync> {
  const k = await getOfferteWordKoppeling(quoteId)
  if (!k) return { ok: true, etag: null, veranderd: false }

  try {
    const item = await appGraphGet<{ cTag?: string; eTag?: string; webUrl?: string; name?: string }>(
      `/drives/${k.driveId}/items/${k.itemId}?$select=id,cTag,eTag,webUrl,name`,
    )
    const etag = item.cTag ?? item.eTag ?? null
    const veranderd = etag !== k.etag

    await db().from('quotes').update({
      word_etag: etag,
      word_web_url: item.webUrl ?? k.webUrl,
      word_bestandsnaam: item.name ?? k.bestandsnaam,
      word_gesynct_op: new Date().toISOString(),
    }).eq('id', quoteId)

    return { ok: true, etag, veranderd }
  } catch (err) {
    const verdwenen = err instanceof GraphError && err.status === 404
    return {
      ok: false,
      verdwenen,
      fout: verdwenen
        ? 'Het Word-document staat niet meer in de dossiermap. Ontkoppel het of stel het opnieuw op.'
        : `Kon de Word-versie niet ophalen bij SharePoint: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── Document ophalen ─────────────────────────────────────────────────────────

/** Er hangt een Word-document aan de offerte, maar het is niet op te halen. */
export class WordBronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordBronError'
  }
}

/**
 * De .docx-bytes die als bron voor deze offerte gelden: het bewerkte Word-document
 * uit SharePoint, of `null` als er geen koppeling is (dan geldt het layout-sjabloon).
 *
 * Gooit een `WordBronError` wanneer er wél een koppeling is maar het bestand niet
 * op te halen valt. Stilletjes terugvallen op het sjabloon zou de handmatige
 * bewerkingen uit de offerte laten verdwijnen zonder dat iemand het merkt — en in
 * het ergste geval een andere offerte naar de klant sturen dan is goedgekeurd.
 */
export async function haalBewerkteOfferteDocx(quoteId: string): Promise<Buffer | null> {
  const k = await getOfferteWordKoppeling(quoteId)
  if (!k) return null
  try {
    return await appGraphGetRaw(`/drives/${k.driveId}/items/${k.itemId}/content`)
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) {
      throw new WordBronError(
        `Het gekoppelde Word-document "${k.bestandsnaam ?? 'offerte.docx'}" staat niet meer in de dossiermap. ` +
        'Stel het opnieuw op of verbreek de koppeling.',
      )
    }
    throw new WordBronError(
      `Kon het gekoppelde Word-document niet ophalen bij SharePoint: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ─── Document opstellen ───────────────────────────────────────────────────────

export class GeenDossierMapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeenDossierMapError'
  }
}

/** Dossier-UUID bij een offerte: directe koppeling of via het calc-project. */
async function resolveDossierId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any,
): Promise<string | null> {
  if (quote.dossier_id) return quote.dossier_id
  if (quote.project_id) {
    const { data } = await db().from('dossiers').select('id').eq('everts_calc_project_id', quote.project_id).maybeSingle()
    return data?.id ?? null
  }
  return null
}

export interface WordDocumentResultaat {
  webUrl: string
  bestandsnaam: string
  /** True = bestaand document heropend, false = nieuw opgesteld uit het sjabloon. */
  hergebruikt: boolean
}

/**
 * Zet het bewerkbare Word-document klaar en geeft de webUrl terug waarmee de
 * browser het in Word Online opent.
 *
 * Bestaat er al een gekoppeld document, dan wordt dát geopend — opnieuw renderen
 * zou de handmatige bewerkingen overschrijven. Met `opnieuw: true` is dat juist
 * de bedoeling (de gebruiker bevestigt dat expliciet in de interface).
 */
export async function maakOfferteWordDocument(
  quoteId: string,
  opts: { opnieuw?: boolean; medewerkerId?: string | null } = {},
): Promise<WordDocumentResultaat> {
  const bestaand = await getOfferteWordKoppeling(quoteId)

  if (bestaand && !opts.opnieuw) {
    // Controleer dat het bestand er nog is (en ververs meteen de versiemarker).
    const sync = await ververWordVersie(quoteId)
    if (sync.ok) {
      const k = await getOfferteWordKoppeling(quoteId)
      if (k?.webUrl) {
        return { webUrl: k.webUrl, bestandsnaam: k.bestandsnaam ?? '', hergebruikt: true }
      }
    } else if (!sync.verdwenen) {
      throw new Error(sync.fout)
    }
    // Verdwenen (of geen webUrl): hieronder opnieuw opstellen.
  }

  const { quote, rawLayout, layout, bedrijf, dossier } = await laadOfferteContext(quoteId)
  const dossierId = await resolveDossierId(quote)
  if (!dossierId) {
    throw new GeenDossierMapError(
      'Deze offerte hangt niet aan een dossier. Bewerken in Word Online kan alleen als er een dossiermap is.',
    )
  }

  const templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
  const docx = await renderQuoteDocx(
    quote as Parameters<typeof renderQuoteDocx>[0],
    bedrijf,
    layout,
    templateBuffer,
    { dossier },
  )

  const bestandsnaam = `Offerte ${quote.quote_nummer}.docx`
  const upload = await uploadBuffersNaarDossierMap(dossierId, [
    { naam: bestandsnaam, contentType: DOCX_MIME, bytes: docx },
  ])
  const geplaatst = upload.bestanden?.[0]
  if (!geplaatst?.driveId || !geplaatst?.itemId || !geplaatst?.webUrl) {
    throw new GeenDossierMapError(
      upload.fout ?? 'Kon het Word-document niet in de SharePoint-dossiermap plaatsen.',
    )
  }

  const inhoudHash = await berekenOfferteInhoudHash(quoteId)
  await db().from('quotes').update({
    word_drive_id: geplaatst.driveId,
    word_item_id: geplaatst.itemId,
    word_web_url: geplaatst.webUrl,
    word_bestandsnaam: bestandsnaam,
    word_inhoud_hash: inhoudHash,
    word_gemaakt_door: opts.medewerkerId ?? null,
    word_gemaakt_op: new Date().toISOString(),
    // Versiemarker direct daarna ophalen; de PUT-respons bevat hem niet betrouwbaar.
    word_etag: null,
    word_gesynct_op: null,
  }).eq('id', quoteId)

  await ververWordVersie(quoteId)

  return { webUrl: geplaatst.webUrl, bestandsnaam, hergebruikt: false }
}

/**
 * Verbreekt de koppeling: de offerte wordt weer uit het layout-sjabloon opgemaakt.
 * Het bestand in SharePoint blijft staan (zelfde principe als bij `dossier_documenten`) —
 * verwijderen uit EVA gooit nooit iets weg dat in de dossiermap is gearchiveerd.
 */
export async function ontkoppelOfferteWord(quoteId: string): Promise<void> {
  await db().from('quotes').update({
    word_drive_id: null,
    word_item_id: null,
    word_web_url: null,
    word_bestandsnaam: null,
    word_etag: null,
    word_inhoud_hash: null,
    word_gesynct_op: null,
    word_gemaakt_door: null,
    word_gemaakt_op: null,
  }).eq('id', quoteId)
}

// ─── Status voor de interface ─────────────────────────────────────────────────

export interface OfferteWordStatus {
  gekoppeld: boolean
  webUrl: string | null
  bestandsnaam: string | null
  /** De calculatie is gewijzigd nadat dit Word-document is opgesteld. */
  verouderd: boolean
  gemaaktOp: string | null
}

export async function getOfferteWordStatus(quoteId: string): Promise<OfferteWordStatus> {
  const k = await getOfferteWordKoppeling(quoteId)
  if (!k) return { gekoppeld: false, webUrl: null, bestandsnaam: null, verouderd: false, gemaaktOp: null }

  const actueleInhoud = await berekenOfferteInhoudHash(quoteId)
  return {
    gekoppeld: true,
    webUrl: k.webUrl,
    bestandsnaam: k.bestandsnaam,
    // Zonder opgeslagen hash (oud record) niet als verouderd bestempelen.
    verouderd: k.inhoudHash != null && k.inhoudHash !== actueleInhoud,
    gemaaktOp: k.gemaaktOp,
  }
}

/** Verwijdert het bestand uit SharePoint. Alleen voor opruimen bij een mislukte koppeling. */
export async function verwijderWordBestand(driveId: string, itemId: string): Promise<void> {
  try {
    await appGraphFetch(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' })
  } catch {
    /* opruimen is best-effort */
  }
}
