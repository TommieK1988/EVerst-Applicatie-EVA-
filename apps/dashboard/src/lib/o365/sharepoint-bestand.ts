/**
 * o365/sharepoint-bestand.ts
 *
 * Graph-acties op één bestand in een dossiermap: controleren dat het er echt in
 * staat, hernoemen en een voorvertoningslink ophalen. Staat los van `sharepoint.ts`
 * (mappen zoeken, koppelen, uploaden), dat al groot genoeg is.
 */

import { appGraphFetch } from './graph'
import { MAX_MAPDIEPTE } from './mappad'

type BestandItem = {
  id: string
  name?: string
  webUrl?: string
  file?: unknown
  parentReference?: { driveId?: string; id?: string }
}

async function haalItem(driveId: string, itemId: string): Promise<BestandItem | null> {
  const res = await appGraphFetch(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,file,parentReference`,
  )
  return res.ok ? ((await res.json()) as BestandItem) : null
}

/**
 * Staat dit item als bestand in de opgegeven map, direct of in een submap daarvan?
 * De drive- en item-id komen van de client; zonder deze controle kan een geknutseld
 * verzoek elk bestand in de hele container hernoemen.
 *
 * We lopen de ouders af tot we de map tegenkomen. Niet dieper dan de bestandenlijst
 * zelf kijkt (`MAX_MAPDIEPTE`): wat daar niet in staat, hoeft hier ook niet te mogen.
 */
export async function bestandStaatInMap(
  driveId: string,
  itemId: string,
  mapItemId: string,
): Promise<boolean> {
  const item = await haalItem(driveId, itemId)
  if (!item?.file) return false

  let ouder = item.parentReference?.id
  for (let stap = 0; ouder && stap < MAX_MAPDIEPTE; stap++) {
    if (ouder === mapItemId) return true
    ouder = (await haalItem(driveId, ouder))?.parentReference?.id
  }
  return false
}

/**
 * Bestandsnaam veilig maken voor SharePoint: dezelfde verboden tekens als bij
 * mappen, geen punt of spatie aan het eind. De extensie plakt de aanroeper erachter.
 */
export function saneerBestandsnaam(naam: string): string {
  return naam
    .replace(/[\\/:*?"<>|#%]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .slice(0, 200)
    .trim()
}

export type BestandHernoemResultaat =
  | { status: 'hernoemd'; naam: string; webUrl: string | null }
  | { status: 'naam_bezet' }
  | { status: 'in_gebruik' }
  | { status: 'niet_gevonden' }
  | { status: 'mislukt'; fout: string }

/** Hernoemt een bestand. `volledigeNaam` is inclusief extensie. Gooit nooit. */
export async function hernoemBestandItem(
  driveId: string,
  itemId: string,
  volledigeNaam: string,
): Promise<BestandHernoemResultaat> {
  try {
    const res = await appGraphFetch(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // `fail`: liever een duidelijke melding dan stil "naam 1.pdf".
      body: JSON.stringify({ name: volledigeNaam, '@microsoft.graph.conflictBehavior': 'fail' }),
    })
    if (res.status === 404) return { status: 'niet_gevonden' }
    if (res.status === 409) return { status: 'naam_bezet' }
    // Iemand heeft het bestand open in Word/Excel.
    if (res.status === 423) return { status: 'in_gebruik' }
    if (!res.ok) {
      return { status: 'mislukt', fout: `HTTP ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 300) }
    }
    const item = (await res.json()) as BestandItem
    return { status: 'hernoemd', naam: item.name ?? volledigeNaam, webUrl: item.webUrl ?? null }
  } catch (err) {
    return { status: 'mislukt', fout: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Een insluitbare voorvertoning (Office-documenten, PDF's) via Graph `preview`.
 * De link is kortlevend en anoniem te openen — daarom alleen op aanvraag ophalen,
 * nooit bewaren. `null` als Graph dit type niet kan tonen.
 */
export async function haalVoorvertoningUrl(driveId: string, itemId: string): Promise<string | null> {
  try {
    const res = await appGraphFetch(
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/preview`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { getUrl?: string }
    return data.getUrl ?? null
  } catch {
    return null
  }
}
