/**
 * o365/sharepoint-bestand.ts
 *
 * Graph-acties op één bestand in een dossiermap: controleren dat het er echt in
 * staat, hernoemen en een voorvertoningslink ophalen. Staat los van `sharepoint.ts`
 * (mappen zoeken, koppelen, uploaden), dat al groot genoeg is.
 */

import { appGraphFetch } from './graph'

type BestandItem = {
  id: string
  name?: string
  webUrl?: string
  file?: unknown
  parentReference?: { driveId?: string; id?: string }
}

/**
 * Staat dit item als bestand direct in de opgegeven map? De drive- en item-id komen
 * van de client; zonder deze controle kan een geknutseld verzoek elk bestand in de
 * hele container hernoemen. De bestandenlijst toont alleen directe kinderen van de
 * dossiermap, dus meer hoeft hier ook niet te mogen.
 */
export async function bestandStaatInMap(
  driveId: string,
  itemId: string,
  mapItemId: string,
): Promise<boolean> {
  const res = await appGraphFetch(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,file,parentReference`,
  )
  if (!res.ok) return false
  const item = (await res.json()) as BestandItem
  return !!item.file && item.parentReference?.id === mapItemId
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
