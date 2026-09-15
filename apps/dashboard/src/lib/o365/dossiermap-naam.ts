/**
 * o365/dossiermap-naam.ts
 *
 * Houdt de naam van de SharePoint-dossiermap gelijk aan `{dossiernummer} - {titel}`.
 * Wijzigt de projectnaam — in EVA op de Informatie-tab, of in Bouw7 waarna de sync hem
 * overneemt — dan gaat de map mee.
 *
 * Twee regels bewaken dat EVA geen andermans mappen aanraakt:
 *  1. alleen mappen waarvan EVA de naam zelf schreef (`sharepoint_map_naam` gevuld);
 *  2. is de map intussen buiten EVA om hernoemd, dan wint dat handwerk en neemt EVA de
 *     nieuwe naam over in plaats van hem terug te draaien.
 *
 * Bewust `server-only` en géén `'use server'`: als publiek RPC-endpoint zou elke ingelogde
 * gebruiker hiermee mappen kunnen hernoemen. Zelfde afweging als in `dossier-map.ts`.
 */
import 'server-only'
import { logFout } from '@/lib/fouten/log'
import {
  dossierMapNaam,
  saneerMapNaam,
  hernoemMapItem,
  haalMapNaam,
  resolveDriveContext,
  vergeetContainerLijst,
} from './sharepoint'
import { DOSSIER_SELECT, dossierDb, netteFout, type DossierRij } from './dossier-map'

const BRON = '/lib/o365/dossiermap-naam'

export type NaamSyncUitkomst = 'overgeslagen' | 'gelijk' | 'hernoemd' | 'losgekoppeld' | 'mislukt'

/**
 * De naam die de dossiermap hoort te hebben, of `null` als die niet te bepalen is.
 * Zonder dossiernummer bewust niets: een map die alleen de titel als naam heeft is niet
 * meer op nummer terug te vinden, en dat is juist de manier waarop EVA hem lokaliseert.
 */
export function gewensteMapNaam(d: Pick<DossierRij, 'dossiernummer' | 'titel'>): string | null {
  if (!d.dossiernummer) return null
  return saneerMapNaam(dossierMapNaam(d)) || null
}

/** Wist de koppeling wanneer blijkt dat de map niet meer bestaat. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ontkoppel(supabase: any, dossierId: string): Promise<void> {
  await supabase
    .from('dossiers')
    .update({
      sharepoint_drive_id: null,
      sharepoint_item_id: null,
      sharepoint_web_url: null,
      sharepoint_match_status: null,
      sharepoint_map_naam: null,
      sharepoint_gematcht_op: null,
    })
    .eq('id', dossierId)
}

/**
 * Hernoemt de dossiermap naar de actuele projectnaam. Best-effort; gooit nooit.
 */
export async function synchroniseerDossierMapNaam(dossierId: string): Promise<NaamSyncUitkomst> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return 'overgeslagen'

  try {
    const supabase = dossierDb()
    const { data } = await supabase.from('dossiers').select(DOSSIER_SELECT).eq('id', dossierId).maybeSingle()
    const d = data as DossierRij | null
    if (!d) return 'overgeslagen'

    if (d.sharepoint_match_status !== 'gematcht' || !d.sharepoint_item_id || !d.sharepoint_drive_id) {
      return 'overgeslagen'
    }
    // Leeg = de map is gematcht of met de hand gekozen. Die is niet van ons.
    if (!d.sharepoint_map_naam) return 'overgeslagen'

    const gewenst = gewensteMapNaam(d)
    if (!gewenst) return 'overgeslagen'

    // Vangt alle vals-positieven van de generated kolom af, zonder Graph-call.
    if (gewenst === d.sharepoint_map_naam) return 'gelijk'

    // Heeft iemand de map buiten EVA om hernoemd, dan is dat een bewuste keuze. EVA neemt
    // die naam over (waarmee de verouderd-vlag dooft) in plaats van hem terug te draaien.
    const huidig = await haalMapNaam(d.sharepoint_drive_id, d.sharepoint_item_id)
    if (huidig === null) {
      await ontkoppel(supabase, dossierId)
      return 'losgekoppeld'
    }
    if (huidig !== d.sharepoint_map_naam) {
      await supabase.from('dossiers').update({ sharepoint_map_naam: huidig }).eq('id', dossierId)
      return 'overgeslagen'
    }

    const res = await hernoemMapItem(d.sharepoint_drive_id, d.sharepoint_item_id, gewenst)

    if (res.status === 'hernoemd') {
      // De webUrl bevat het pad mét mapnaam en verandert dus mee; zonder deze update
      // wijst "Open map in SharePoint" na een naamwijziging naar een 404.
      await supabase
        .from('dossiers')
        .update({
          sharepoint_map_naam: res.naam,
          sharepoint_web_url: res.webUrl,
          sharepoint_gematcht_op: new Date().toISOString(),
        })
        .eq('id', dossierId)

      const ctx = await resolveDriveContext(envValue)
      if (ctx) vergeetContainerLijst(ctx)
      return 'hernoemd'
    }

    if (res.status === 'niet_gevonden') {
      await ontkoppel(supabase, dossierId)
      return 'losgekoppeld'
    }

    // naam_bezet = er staat al een andere map met die naam (dubbel dossiernummer in het
    // archief). Koppeling ongemoeid laten en melden; hier moet een mens naar kijken.
    await logFout({
      omgeving: 'server',
      bron: BRON,
      melding:
        res.status === 'naam_bezet'
          ? `Map hernoemen mislukt: er bestaat al een map met de naam ${gewenst}.`
          : `Map hernoemen mislukt: ${res.fout}`,
      soort: 'sharepoint',
      extra: { dossierId },
    }).catch(() => {})
    return 'mislukt'
  } catch (err) {
    await logFout({
      omgeving: 'server',
      bron: BRON,
      melding: `Mapnaam synchroniseren mislukt: ${netteFout(err)}`,
      soort: 'sharepoint',
      extra: { dossierId },
    }).catch(() => {})
    return 'mislukt'
  }
}

/* ─── Nalopen (cron) ──────────────────────────────────────────────────────── */

/** Wandkloklimiet: de naloop mag nooit het budget van de hele cron opsnoepen. */
const NALOOP_MS = 60_000

/**
 * Hernoemt alle dossiermappen waarvan de naam achterloopt.
 *
 * Draait ná de Bouw7-sync in plaats van erin: zo kan een Graph-storing de sync niet
 * vertragen, en herstelt een afgekapte run zichzelf — de `sharepoint_map_naam_verouderd`
 * vlag blijft staan tot de map daadwerkelijk hernoemd is.
 */
export async function hernoemVerouderdeDossierMappen(
  opts?: { max?: number },
): Promise<{ bekeken: number; hernoemd: number; overgeslagen: number; fouten: number }> {
  const uit = { bekeken: 0, hernoemd: 0, overgeslagen: 0, fouten: 0 }
  if (!process.env.O365_DOSSIER_DRIVE_ID) return uit

  const max = opts?.max ?? 50
  const start = Date.now()

  try {
    const { data } = await dossierDb()
      .from('dossiers')
      .select('id')
      .eq('sharepoint_map_naam_verouderd', true)
      .order('id')
      .limit(max)

    // Sequentieel: Graph throttlet op parallelle bursts (429).
    for (const rij of (data ?? []) as { id: string }[]) {
      if (Date.now() - start > NALOOP_MS) break
      uit.bekeken++
      const res = await synchroniseerDossierMapNaam(rij.id)
      if (res === 'hernoemd') uit.hernoemd++
      else if (res === 'mislukt') uit.fouten++
      else uit.overgeslagen++
    }
  } catch (err) {
    console.warn('[dossiermap] hernoem-naloop mislukt:', netteFout(err))
  }

  return uit
}

/**
 * Maakt de mappen alsnog aan voor aanvragen die er nog geen hebben — het geval waarbij de
 * Bouw7-push bij het aanmaken faalde en het dossiernummer pas later binnenkwam.
 */
export async function maakOntbrekendeDossierMappen(
  opts?: { max?: number },
): Promise<{ bekeken: number; aangemaakt: number; fouten: number }> {
  const uit = { bekeken: 0, aangemaakt: 0, fouten: 0 }
  if (!process.env.O365_DOSSIER_DRIVE_ID) return uit

  const max = opts?.max ?? 25
  const start = Date.now()

  try {
    const { data } = await dossierDb()
      .from('dossiers')
      .select('id')
      .eq('sharepoint_map_gewenst', true)
      .is('sharepoint_item_id', null)
      .not('dossiernummer', 'is', null)
      .order('id')
      .limit(max)

    const { zorgVoorDossierMapBijAanmaak } = await import('./dossier-map')
    for (const rij of (data ?? []) as { id: string }[]) {
      if (Date.now() - start > NALOOP_MS) break
      uit.bekeken++
      const res = await zorgVoorDossierMapBijAanmaak(rij.id)
      if (res.status === 'aangemaakt' || res.status === 'bestond_al') uit.aangemaakt++
      else if (!res.ok) uit.fouten++
    }
  } catch (err) {
    console.warn('[dossiermap] aanmaak-naloop mislukt:', netteFout(err))
  }

  return uit
}
