/**
 * o365/sharepoint.ts
 *
 * App-only Graph-helpers voor dossier-bestanden in SharePoint. EVA zoekt zelfstandig
 * de juiste dossiermap binnen één container (`O365_DOSSIER_DRIVE_ID`) en toont de
 * bestanden. Bestaat de map niet, dan kan hij vanuit EVA aangemaakt worden — de
 * container is een calculatie-archief, dus voor dossiers zonder calculatie is er
 * simpelweg nog niets om te vinden.
 */

import { appGraphFetch, appGraphGet } from './graph'

export interface SharePointBestand {
  id: string
  naam: string
  extensie: string | null
  grootte: number | null
  webUrl: string | null
  datum: string | null
  door: string | null
  /** Drive waar het bestand in staat — nodig om de bytes via de EVA-proxy op te halen. */
  driveId: string | null
  /** Door Graph gegenereerde thumbnail (afbeeldingen/PDF's). Kortlevende URL. */
  thumbUrl: string | null
}

/** Een map in de container, zoals de picker hem toont. */
export interface SharePointMap {
  id: string
  naam: string
  webUrl: string | null
  aantalItems: number | null
  gewijzigd: string | null
}

interface DriveItem {
  id: string
  name?: string
  webUrl?: string
  size?: number
  lastModifiedDateTime?: string
  folder?: { childCount?: number }
  file?: { mimeType?: string }
  createdBy?: { user?: { displayName?: string } }
  parentReference?: { driveId?: string; id?: string }
  thumbnails?: { medium?: { url?: string } }[]
}

export type MatchStatus = 'gematcht' | 'niet_gevonden' | 'meerdere'

export interface MatchResultaat {
  status: MatchStatus
  driveId?: string
  itemId?: string
  webUrl?: string | null
  /** Bij 'meerdere': de gevonden kandidaten, zodat de gebruiker kan kiezen i.p.v. vastlopen. */
  kandidaten?: SharePointMap[]
}

interface DossierMatchInput {
  dossiernummer: string | null
  bouw7Id: string | null
  titel: string | null
}

function normaliseer(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function alsMap(it: DriveItem): SharePointMap {
  return {
    id: it.id,
    naam: it.name ?? 'Map',
    webUrl: it.webUrl ?? null,
    aantalItems: it.folder?.childCount ?? null,
    gewijzigd: it.lastModifiedDateTime ? it.lastModifiedDateTime.slice(0, 10) : null,
  }
}

/** Doel-locatie: een drive + de map waarbinnen gezocht wordt ('root' of 'items/{id}'). */
export interface DriveContext {
  driveId: string
  containerPath: string
  /** driveItem-id van de container zelf — nodig om recursieve zoektreffers te filteren. */
  containerItemId: string
}

const ctxCache = new Map<string, DriveContext>()

/**
 * Zet de env-waarde `O365_DOSSIER_DRIVE_ID` om naar een DriveContext. Accepteert
 * zowel een kale drive-id als een SharePoint-deel-link (naar de bibliotheek óf de
 * map waarin de dossiermappen staan). Bij een link wordt binnen díé map gezocht.
 * Resultaat wordt in-memory gecachet.
 */
export async function resolveDriveContext(envValue: string): Promise<DriveContext | null> {
  if (!envValue) return null

  const cached = ctxCache.get(envValue)
  if (cached) return cached

  let ctx: DriveContext
  if (!/^https?:\/\//i.test(envValue)) {
    // Kale drive-id → de root van die drive is de container.
    const root = await appGraphGet<DriveItem>(`/drives/${envValue}/root?$select=id`)
    if (!root.id) return null
    ctx = { driveId: envValue, containerPath: 'root', containerItemId: root.id }
  } else {
    const item = await appGraphGet<DriveItem>(`/shares/${encodeShareUrl(envValue)}/driveItem?$select=id,name,folder,parentReference`)
    const driveId = item.parentReference?.driveId
    if (!driveId || !item.id) return null
    ctx = { driveId, containerPath: `items/${item.id}`, containerItemId: item.id }
  }

  ctxCache.set(envValue, ctx)
  return ctx
}

/** Deel-link → Graph `/shares/{token}`-token. */
function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url.trim(), 'utf-8').toString('base64')
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

/** Container-pad ('root' of 'items/{id}') → Graph children-endpoint. */
export function childrenPad(ctx: DriveContext): string {
  return `/drives/${ctx.driveId}/${ctx.containerPath}/children`
}

/* ─── Container-listing (met korte TTL-cache) ─────────────────────────────── */

const LIJST_TTL_MS = 60_000
const lijstCache = new Map<string, { op: number; mappen: SharePointMap[] }>()

function lijstSleutel(ctx: DriveContext): string {
  return `${ctx.driveId}|${ctx.containerPath}`
}

/**
 * Lijst alle mappen die direct in de container staan (gepagineerd). Dit is de
 * deterministische bron: hij werkt met app-only rechten en ziet — anders dan de
 * Graph-zoekindex — alleen het niveau waar de dossiermappen echt staan.
 *
 * De container telt honderden mappen, dus het resultaat wordt kort gecachet:
 * de picker filtert per toetsaanslag en zou anders steeds opnieuw pagineren.
 */
export async function lijstContainerMappen(ctx: DriveContext): Promise<SharePointMap[]> {
  const sleutel = lijstSleutel(ctx)
  const cached = lijstCache.get(sleutel)
  if (cached && Date.now() - cached.op < LIJST_TTL_MS) return cached.mappen

  const mappen: SharePointMap[] = []
  let url: string | undefined =
    `${childrenPad(ctx)}?$select=id,name,webUrl,folder,lastModifiedDateTime,parentReference&$top=200`
  for (let i = 0; i < 50 && url; i++) {
    const res: { value?: DriveItem[]; '@odata.nextLink'?: string } = await appGraphGet(url)
    for (const it of res.value ?? []) if (it.folder) mappen.push(alsMap(it))
    url = res['@odata.nextLink']
  }

  lijstCache.set(sleutel, { op: Date.now(), mappen })
  return mappen
}

/** Wist de listing-cache — na het aanmaken van een map, zodat hij meteen zichtbaar is. */
function vergeetLijst(ctx: DriveContext): void {
  lijstCache.delete(lijstSleutel(ctx))
}

/**
 * Zoekt mappen in de container op (deel van) hun naam, voor de picker.
 * Filtert server-side over de gecachete listing: SharePoints eigen
 * `$filter=startswith(name,…)` is op document-library children onbetrouwbaar.
 */
export async function zoekContainerMappen(
  ctx: DriveContext,
  query: string,
  offset = 0,
  limit = 50,
): Promise<{ mappen: SharePointMap[]; totaal: number }> {
  const alle = await lijstContainerMappen(ctx)
  const q = normaliseer(query)
  const raak = q ? alle.filter((m) => normaliseer(m.naam).includes(q)) : alle
  // Beste treffer eerst: namen die met de query beginnen (het dossiernummer-geval).
  const gesorteerd = q
    ? [...raak].sort((a, b) => {
        const aStart = normaliseer(a.naam).startsWith(q) ? 0 : 1
        const bStart = normaliseer(b.naam).startsWith(q) ? 0 : 1
        return aStart - bStart || a.naam.localeCompare(b.naam, 'nl')
      })
    : [...raak].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  return { mappen: gesorteerd.slice(offset, offset + limit), totaal: gesorteerd.length }
}

/* ─── Mapnamen ────────────────────────────────────────────────────────────── */

/**
 * De naamconventie in de container: `20267.00600 - Toepad 120 Rotterdam, …`.
 * Het dossiernummer-prefix is wat de automatische match later terugvindt.
 */
export function dossierMapNaam(d: { dossiernummer: string | null; titel: string | null }): string {
  const delen = [d.dossiernummer, d.titel].filter((x): x is string => !!x && !!x.trim())
  return delen.join(' - ')
}

/** Haalt tekens weg die SharePoint niet in een mapnaam accepteert. */
export function saneerMapNaam(naam: string): string {
  return naam
    .replace(/[\\/:*?"<>|#%]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .slice(0, 250)
    .trim()
}

/* ─── Matchen ─────────────────────────────────────────────────────────────── */

/**
 * Mappen waarvan de genormaliseerde naam met het genormaliseerde prefix begint.
 * `strikt` eist bovendien dat er ná het prefix een niet-alfanumeriek teken volgt in
 * de ruwe naam: een kaal bouw7-id als `12345` zou anders `123456 - …` meepakken.
 */
function opPrefix(mappen: SharePointMap[], prefix: string, strikt = false): SharePointMap[] {
  const p = normaliseer(prefix)
  if (!p) return []
  return mappen.filter((m) => {
    if (!normaliseer(m.naam).startsWith(p)) return false
    if (!strikt) return true
    const rest = m.naam.trim().slice(prefix.trim().length)
    return rest === '' || /^[^a-z0-9]/i.test(rest)
  })
}

/**
 * Zoekt mappen via de Graph-zoekindex. Best-effort: met app-only tokens is de index
 * niet altijd toegankelijk (HTTP 403) — dan een lege lijst, zodat de deterministische
 * listing het werk doet.
 *
 * De index zoekt **recursief**, dus resultaten worden gefilterd op directe kinderen
 * van de container. Zonder dat filter melden submappen ván een dossiermap zich als
 * extra kandidaat en wordt een unieke map ten onrechte 'meerdere'.
 */
async function zoekIndexMappen(ctx: DriveContext, query: string): Promise<SharePointMap[]> {
  const q = query.replace(/'/g, '').trim()
  if (!q) return []
  try {
    const res = await appGraphGet<{ value?: DriveItem[] }>(
      `/drives/${ctx.driveId}/${ctx.containerPath}/search(q='${encodeURIComponent(q)}')?$select=id,name,webUrl,folder,lastModifiedDateTime,parentReference&$top=50`,
    )
    return (res.value ?? [])
      .filter((it) => it.folder && it.parentReference?.id === ctx.containerItemId)
      .map(alsMap)
  } catch {
    return []
  }
}

const MAX_KANDIDATEN = 10

/**
 * Bepaalt welke SharePoint-map bij een dossier hoort. De mapnaam begint met het
 * dossiernummer, gevolgd door het adres. Volgorde:
 *   1. deterministische container-listing op dossiernummer-prefix,
 *   2. Graph-zoekindex op dossiernummer (alleen als 1 niets gaf),
 *   3. bouw7-id-prefix (alleen zonder dossiernummer),
 *   4. fuzzy op titel.
 * Vergelijking is punctuatie-ongevoelig (2024.00123 == 2024-00123).
 *
 * Levert een strategie meerdere kandidaten op, dan gaan we **door** naar de volgende
 * strategie in plaats van meteen 'meerdere' te melden; pas als niets een unieke
 * treffer geeft komen de kandidaten terug zodat de gebruiker kan kiezen.
 */
export async function matchDossierFolder(dossier: DossierMatchInput, ctx: DriveContext): Promise<MatchResultaat> {
  const gevonden = (m: SharePointMap): MatchResultaat => ({
    status: 'gematcht',
    driveId: ctx.driveId,
    itemId: m.id,
    webUrl: m.webUrl,
  })

  const kandidaten: SharePointMap[] = []
  const onthoud = (mappen: SharePointMap[]) => {
    for (const m of mappen) if (!kandidaten.some((k) => k.id === m.id)) kandidaten.push(m)
  }

  const containerMappen = await lijstContainerMappen(ctx)

  // 1. Deterministisch op dossiernummer — het gangbare geval.
  if (dossier.dossiernummer) {
    const raak = opPrefix(containerMappen, dossier.dossiernummer)
    if (raak.length === 1) return gevonden(raak[0])
    onthoud(raak)

    // 2. Zoekindex, voor het geval de listing hem miste (bv. > 10.000 items).
    if (raak.length === 0) {
      const viaIndex = opPrefix(await zoekIndexMappen(ctx, dossier.dossiernummer), dossier.dossiernummer)
      if (viaIndex.length === 1) return gevonden(viaIndex[0])
      onthoud(viaIndex)
    }
  }

  // 3. Bouw7-id, alleen als er geen dossiernummer is. Strikt: het id moet een
  //    volledig naamdeel zijn, anders matcht '12345' ook op '123456 - …'.
  if (!dossier.dossiernummer && dossier.bouw7Id) {
    const raak = opPrefix(containerMappen, dossier.bouw7Id, true)
    if (raak.length === 1) return gevonden(raak[0])
    onthoud(raak)
  }

  // 4. Fuzzy op titel (laatste redmiddel).
  if (dossier.titel) {
    const doel = normaliseer(dossier.titel)
    const raak = containerMappen.filter((m) => {
      const n = normaliseer(m.naam)
      return !!doel && (n.includes(doel) || doel.includes(n))
    })
    if (raak.length === 1) return gevonden(raak[0])
    onthoud(raak)
  }

  if (kandidaten.length) return { status: 'meerdere', kandidaten: kandidaten.slice(0, MAX_KANDIDATEN) }
  return { status: 'niet_gevonden' }
}

/* ─── Bestanden ───────────────────────────────────────────────────────────── */

/**
 * Lijst de bestanden (geen submappen) in een dossiermap.
 *
 * `$expand=thumbnails` levert de voorbeeldplaatjes in dezelfde call, zodat de
 * fotogalerij geen aparte call per afbeelding hoeft te doen. Graph geeft die
 * alleen voor bestandstypen die het kan renderen; voor de rest blijft hij leeg.
 */
export async function listFolderChildren(driveId: string, itemId: string): Promise<SharePointBestand[]> {
  const res = await appGraphGet<{ value?: DriveItem[] }>(
    `/drives/${driveId}/items/${itemId}/children` +
      `?$select=id,name,size,webUrl,file,folder,lastModifiedDateTime,createdBy,parentReference` +
      `&$expand=thumbnails($select=medium)&$top=200`,
  )
  return (res.value ?? [])
    .filter((it) => it.file)
    .map((f) => {
      const punt = f.name?.lastIndexOf('.') ?? -1
      return {
        id: f.id,
        naam: f.name ?? 'Bestand',
        extensie: punt > 0 ? (f.name ?? '').slice(punt + 1) : null,
        grootte: f.size ?? null,
        webUrl: f.webUrl ?? null,
        datum: f.lastModifiedDateTime ? f.lastModifiedDateTime.slice(0, 10) : null,
        door: f.createdBy?.user?.displayName ?? null,
        driveId: f.parentReference?.driveId ?? driveId,
        thumbUrl: f.thumbnails?.[0]?.medium?.url ?? null,
      }
    })
}

/* ─── Koppelen & aanmaken ─────────────────────────────────────────────────── */

/**
 * Haalt één driveItem op ter validatie bij het koppelen. De itemId komt van de
 * client, dus we controleren zelf dat hij bestaat, een map is en in de juiste drive
 * staat — nooit blind doorgeven aan een service-role-write.
 */
export async function haalMapItem(driveId: string, itemId: string): Promise<MatchResultaat> {
  const item = await appGraphGet<DriveItem>(
    `/drives/${driveId}/items/${itemId}?$select=id,name,webUrl,folder,parentReference`,
  )
  if (!item.folder || !item.id) return { status: 'niet_gevonden' }
  return {
    status: 'gematcht',
    driveId: item.parentReference?.driveId ?? driveId,
    itemId: item.id,
    webUrl: item.webUrl ?? null,
  }
}

/**
 * Maakt een map in de container aan. Bestaat hij al (409), dan zoeken we de
 * bestaande map op en melden `bestaat_al` — dat is voor de aanroeper geen fout maar
 * precies het gewenste eindresultaat: een gekoppelde map.
 */
export async function maakContainerMap(
  ctx: DriveContext,
  naam: string,
): Promise<{ status: 'aangemaakt' | 'bestaat_al'; driveId: string; itemId: string; webUrl: string | null }> {
  const schoon = saneerMapNaam(naam)
  if (!schoon) throw new Error('Geef een mapnaam op.')

  const res = await appGraphFetch(childrenPad(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: schoon, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  })

  if (res.status === 409) {
    vergeetLijst(ctx)
    const doel = normaliseer(schoon)
    const bestaand = (await lijstContainerMappen(ctx)).find((m) => normaliseer(m.naam) === doel)
    if (bestaand) return { status: 'bestaat_al', driveId: ctx.driveId, itemId: bestaand.id, webUrl: bestaand.webUrl }
    throw new Error(`Er bestaat al een map met de naam "${schoon}", maar die kon niet worden teruggevonden.`)
  }

  if (!res.ok) {
    throw new Error(`Kon SharePoint-map niet aanmaken (${res.status}): ${await res.text().catch(() => '')}`)
  }

  const item = (await res.json()) as DriveItem
  vergeetLijst(ctx)
  return { status: 'aangemaakt', driveId: ctx.driveId, itemId: item.id, webUrl: item.webUrl ?? null }
}

/** Resolvet een SharePoint/OneDrive deel-link naar een map-driveItem (voor handmatig koppelen). */
export async function resolveShareLink(shareLink: string): Promise<MatchResultaat> {
  const item = await appGraphGet<DriveItem>(
    `/shares/${encodeShareUrl(shareLink)}/driveItem?$select=id,name,webUrl,folder,parentReference`,
  )
  if (!item.folder) {
    // Link naar een bestand → gebruik de bovenliggende map is niet triviaal; vraag een map-link.
    return { status: 'niet_gevonden' }
  }
  const driveId = item.parentReference?.driveId
  if (!driveId || !item.id) return { status: 'niet_gevonden' }
  return { status: 'gematcht', driveId, itemId: item.id, webUrl: item.webUrl ?? null }
}
