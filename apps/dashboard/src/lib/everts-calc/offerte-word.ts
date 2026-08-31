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
import { heeftConceptWatermerk, pasConceptWatermerkToe, zetConceptWatermerk } from './docx-watermerk'
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

/**
 * Hetzelfde document, maar met de CONCEPT-watermerkstaat die bij deze uitvoer hoort.
 *
 * Elke uitlevering dwingt de staat opnieuw af in plaats van te vertrouwen op wat er
 * in SharePoint staat. Wie het watermerk in Word weghaalt, krijgt het daarmee bij de
 * eerstvolgende download gewoon terug — en een goedgekeurde offerte gaat er nooit
 * met een concept-stempel uit.
 *
 * De PDF-pijplijn geeft hier altijd `concept: false` mee: daar stempelt pdf-lib.
 */
export async function haalBewerkteOfferteDocxVoorUitvoer(
  quoteId: string,
  concept: boolean,
): Promise<Buffer | null> {
  const docx = await haalBewerkteOfferteDocx(quoteId)
  if (!docx) return null
  return pasConceptWatermerkToe(docx, concept)
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

/**
 * Zorgt dat een bestaand werkdocument het CONCEPT-watermerk draagt.
 *
 * Nodig voor documenten die zijn opgesteld voordat het watermerk bestond, en als
 * vangnet voor wie het in Word weghaalt. Draait bij het openen, niet bij elke
 * uitlevering: de uitlever-routes dwingen de staat toch al af op de bytes die zij
 * versturen (`haalBewerkteOfferteDocxVoorUitvoer`) — hier gaat het om wat de
 * gebruiker straks in Word Online voor zich krijgt.
 *
 * Alleen wanneer de offerte nog niet is goedgekeurd. Dat is bewust: het bestand
 * herschrijven verschuift de cTag en dus de goedkeurings-hash, en juist bij een
 * niet-goedgekeurde offerte valt er niets te verliezen. Best-effort — een storing
 * mag het openen van het document nooit blokkeren.
 */
async function zorgVoorWatermerkInWerkbestand(quoteId: string): Promise<void> {
  try {
    const { assertOfferteVerzendbaar } = await import('@/lib/goedkeuring/offerte')
    if ((await assertOfferteVerzendbaar(quoteId)).ok) return

    const k = await getOfferteWordKoppeling(quoteId)
    if (!k) return

    const huidig = await appGraphGetRaw(`/drives/${k.driveId}/items/${k.itemId}/content`)
    if (await heeftConceptWatermerk(huidig)) return

    const res = await appGraphFetch(`/drives/${k.driveId}/items/${k.itemId}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': DOCX_MIME },
      body: (await zetConceptWatermerk(huidig)) as unknown as BodyInit,
    })
    if (res.ok) await ververWordVersie(quoteId)
  } catch (err) {
    console.warn('Watermerk in bestaand Word-werkbestand zetten mislukt:', err)
  }
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
      await zorgVoorWatermerkInWerkbestand(quoteId)
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
  const gerenderd = await renderQuoteDocx(
    quote as Parameters<typeof renderQuoteDocx>[0],
    bedrijf,
    layout,
    templateBuffer,
    // Bewust `false`: een `{#is_concept}`-blok uit het sjabloon belandt in de body en
    // is daarna niet meer weg te halen zonder het handwerk van de gebruiker te raken.
    // Het watermerk hieronder zit in de header en kan er wél weer af.
    { dossier, is_concept: false },
  )

  // Het werkdocument draagt altijd het CONCEPT-watermerk. Dat mag: het opstellen
  // (of opnieuw opstellen) zet een nieuw bestand neer, waardoor de cTag verschuift
  // en een eerdere goedkeuring sowieso vervalt — er ís op dit moment geen
  // goedgekeurde versie. Bij het uitleveren van een goedgekeurde offerte gaat het
  // watermerk er weer af; zie `haalBewerkteOfferteDocxVoorUitvoer`.
  const docx = await zetConceptWatermerk(gerenderd)

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

/**
 * De driveItem-id's van de Word-werkdocumenten die bij dit dossier horen.
 *
 * De bestandenlijst van het dossier verbergt deze bestanden. Ze staan wel gewoon in
 * de dossiermap — ze horen daar ook thuis — maar als losse download horen ze niet in
 * de lijst: dan is er een .docx te pakken die buiten de goedkeuringsgate om gaat.
 * Wie het bestand nodig heeft, gebruikt "Bewerken in Word Online"; wie de offerte
 * wil, gebruikt de knoppen die het watermerk afdwingen.
 */
export async function getWordWerkbestandItemIds(dossierId: string): Promise<Set<string>> {
  const d = db()
  const { data: dossier } = await d
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .maybeSingle()

  // Een offerte hangt aan het dossier zelf, of alleen aan het calculatie-project.
  const filters = [`dossier_id.eq.${dossierId}`]
  if (dossier?.everts_calc_project_id) filters.push(`project_id.eq.${dossier.everts_calc_project_id}`)

  const { data } = await d
    .from('quotes')
    .select('word_item_id')
    .not('word_item_id', 'is', null)
    .or(filters.join(','))

  return new Set(
    ((data ?? []) as { word_item_id: string | null }[])
      .map((r) => r.word_item_id)
      .filter((id): id is string => !!id),
  )
}

/** Verwijdert het bestand uit SharePoint. Alleen voor opruimen bij een mislukte koppeling. */
export async function verwijderWordBestand(driveId: string, itemId: string): Promise<void> {
  try {
    await appGraphFetch(`/drives/${driveId}/items/${itemId}`, { method: 'DELETE' })
  } catch {
    /* opruimen is best-effort */
  }
}
