'use server'

import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'
import { appGraphGet } from './graph'

/**
 * onedrive-pad.ts — waar de SharePoint-dossiermap op de eigen schijf staat.
 *
 * De knop "Open in Verkenner" loopt via een `eva://`-handler die per pc geïnstalleerd
 * moet zijn, en die lang niet overal aanslaat (zie `scripts/eva-verkenner/LEESMIJ.md`).
 * Dit is het vangnet: een pad dat je in de adresbalk van Verkenner plakt, zonder dat er
 * iets geïnstalleerd hoeft te zijn.
 *
 * **Waarom niet het WebDAV-pad** (`\\host@SSL\DavWWWRoot\…`), zoals de handler als
 * terugval gebruikt: op deze tenant is dat onbereikbaar — niet alleen de dossiermap, de
 * hele DavWWWRoot-share. SharePoint Online laat Verkenner daar niet meer bij zonder dat
 * de site in de intranetzone staat. Een pad tonen dat "kan niet vinden" oplevert is
 * erger dan geen pad.
 *
 * **Hoe OneDrive de map noemt.** Synchroniseer je een map uit een teamsite, dan komt hij
 * lokaal onder `<OneDrive-map>\<Sitenaam> - <naam van de gesynchroniseerde map>` te
 * staan. Voor `…/sites/DeRekenkamer/Shared Documents/Calculaties/Begrotingen/<dossier>`
 * is dat dus `…\De Rekenkamer - Calculaties\Begrotingen\<dossier>`. De sitenaam mét
 * spaties is niet uit de URL af te leiden ("DeRekenkamer"), vandaar dat we hem bij Graph
 * opvragen; per drive gebeurt dat één keer per serverinstantie.
 *
 * `%OneDriveCommercial%` blijft bewust onvertaald in het pad: Verkenner vult
 * omgevingsvariabelen zelf in, en zo hoeven we niet te weten hoe de OneDrive-map van
 * deze gebruiker heet of op welke schijf zijn profiel staat.
 *
 * Het blijft een aanname over wat iemand heeft gesynchroniseerd: wie de hele
 * bibliotheek synchroniseert in plaats van de map `Calculaties` krijgt een andere
 * mapnaam. De tekst in het venster zegt daarom "als je de map synchroniseert" en zet de
 * SharePoint-link ernaast.
 */

type DriveInfo = { siteNaam: string; bibliotheekNaam: string; rootWebUrl: string }

/** Per drive één keer ophalen; deze gegevens veranderen niet tijdens een deploy. */
const driveCache = new Map<string, DriveInfo | null>()

async function driveInfo(driveId: string): Promise<DriveInfo | null> {
  const gecachet = driveCache.get(driveId)
  if (gecachet !== undefined) return gecachet

  let info: DriveInfo | null = null
  try {
    const [drive, root] = await Promise.all([
      appGraphGet<{ name?: string }>(`/drives/${driveId}?$select=name`),
      appGraphGet<{ webUrl?: string; sharepointIds?: { siteId?: string } }>(
        `/drives/${driveId}/root?$select=webUrl,sharepointIds`,
      ),
    ])
    const siteId = root.sharepointIds?.siteId
    if (root.webUrl && siteId) {
      const site = await appGraphGet<{ displayName?: string; name?: string }>(
        `/sites/${siteId}?$select=displayName,name`,
      )
      const siteNaam = site.displayName || site.name
      if (siteNaam) {
        info = {
          siteNaam,
          bibliotheekNaam: drive.name || 'Documents',
          rootWebUrl: root.webUrl.replace(/\/+$/, ''),
        }
      }
    }
  } catch {
    // Graph onbereikbaar of geen rechten op /sites — dan gewoon geen pad tonen.
    info = null
  }

  driveCache.set(driveId, info)
  return info
}

/** Padsegmenten van de dossiermap binnen de bibliotheek, gedecodeerd. */
function segmentenBinnenBibliotheek(webUrl: string, rootWebUrl: string): string[] | null {
  // Vergelijken op de rauwe, gecodeerde tekst: beide komen van Graph en coderen
  // hetzelfde. Eerst splitsen en dan per segment decoderen, anders zou een %2F in een
  // mapnaam alsnog als mapscheiding gaan werken.
  if (!webUrl.toLowerCase().startsWith(rootWebUrl.toLowerCase() + '/')) return null
  const staart = webUrl.slice(rootWebUrl.length + 1)
  const segmenten = staart.split('/').filter(Boolean).map(decodeURIComponent)
  if (segmenten.length === 0) return null
  if (segmenten.some(s => s === '.' || s === '..' || s.includes('\\'))) return null
  return segmenten
}

/**
 * Het lokale pad van de dossiermap, of null als het niet te bepalen is (geen
 * gekoppelde map, Graph onbereikbaar, of een URL die niet onder de bibliotheek valt).
 */
export async function getDossierMapLokaalPad(dossierId: string): Promise<string | null> {
  await vereisSessie()

  const { data } = await createAdminClient()
    .from('dossiers')
    .select('sharepoint_drive_id, sharepoint_web_url')
    .eq('id', dossierId)
    .maybeSingle()

  const driveId = data?.sharepoint_drive_id ?? null
  const webUrl = data?.sharepoint_web_url ?? null
  if (!driveId || !webUrl) return null

  const info = await driveInfo(driveId)
  if (!info) return null

  const segmenten = segmentenBinnenBibliotheek(webUrl, info.rootWebUrl)
  if (!segmenten) return null

  // Staat de dossiermap direct in de bibliotheek, dan is de bibliotheek zelf het
  // gesynchroniseerde niveau en draagt de OneDrive-map diens naam.
  const [eerste, ...rest] = segmenten
  const mapNaam = rest.length === 0
    ? `${info.siteNaam} - ${info.bibliotheekNaam}`
    : `${info.siteNaam} - ${eerste}`
  const staart = rest.length === 0 ? [eerste] : rest

  return ['%OneDriveCommercial%', mapNaam, ...staart].join('\\')
}
