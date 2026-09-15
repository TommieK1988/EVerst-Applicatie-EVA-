/**
 * o365/dossiermap-standaardbestanden.ts
 *
 * De voorbeeldbestanden die EVA direct in een nieuw aangemaakte dossiermap zet. Welke dat
 * zijn stelt een beheerder in onder Instellingen → Dossiermap; de bestanden zelf staan in
 * een privé Supabase-bucket, niet in SharePoint — zo hangt een regel niet aan een map die
 * iemand kan verplaatsen of hernoemen.
 *
 * Bewust `server-only` en géén `'use server'`: als publiek RPC-endpoint zou een ingelogde
 * gebruiker hiermee bestanden in elke willekeurige map kunnen laten zetten. Zelfde
 * afweging als in `dossier-map.ts`.
 */
import 'server-only'
import { maakSubmap, uploadNaarMap, saneerMapNaam } from './sharepoint'
import { dossierDb, netteFout, type DossierRij } from './dossier-map'

export const STANDAARDBESTANDEN_BUCKET = 'dossiermap-bestanden'

export type StandaardbestandRegel = {
  id: string
  naam: string
  bestandsnaam: string
  submap: string | null
  storage_path: string
  content_type: string | null
  grootte: number | null
  categorie_ids: number[]
  werkmaatschappij_ids: string[]
  actief: boolean
  volgorde: number
}

/**
 * Een lege filterlijst betekent "geldt voor alles" — zelfde regel als bij de
 * documentsjablonen, zodat beide schermen zich hetzelfde gedragen.
 */
function pastBijDossier(
  r: StandaardbestandRegel,
  d: { bouw7_categorie_id: number | null; werkmaatschappij_id: string | null },
): boolean {
  if (r.categorie_ids.length && (d.bouw7_categorie_id == null || !r.categorie_ids.includes(d.bouw7_categorie_id))) {
    return false
  }
  if (r.werkmaatschappij_ids.length && (!d.werkmaatschappij_id || !r.werkmaatschappij_ids.includes(d.werkmaatschappij_id))) {
    return false
  }
  return true
}

/** De actieve regels die op dít dossier van toepassing zijn, op volgorde. */
export async function regelsVoorDossier(
  d: { bouw7_categorie_id: number | null; werkmaatschappij_id: string | null },
): Promise<StandaardbestandRegel[]> {
  const supabase = dossierDb()
  const { data } = await supabase
    .from('dossiermap_standaardbestanden')
    .select('*')
    .eq('actief', true)
    .order('volgorde', { ascending: true })
    .order('bestandsnaam', { ascending: true })

  return ((data ?? []) as StandaardbestandRegel[])
    .map(r => ({
      ...r,
      categorie_ids: Array.isArray(r.categorie_ids) ? r.categorie_ids : [],
      werkmaatschappij_ids: Array.isArray(r.werkmaatschappij_ids) ? r.werkmaatschappij_ids : [],
    }))
    .filter(r => pastBijDossier(r, d))
}

/** Bovengrens per map: een instellingenlijst die ontspoort mag geen aanvraag ophouden. */
const MAX_BESTANDEN = 15

/**
 * Zet de voorbeeldbestanden in een **zojuist aangemaakte** dossiermap. Nooit in een
 * bestaande map — die is van de calculator, en achteraf aanvullen zou bestanden laten
 * opduiken in mappen waar iemand ze bewust heeft weggehaald.
 *
 * Gooit nooit: een mislukt voorbeeldbestand mag een nieuwe aanvraag niet blokkeren.
 */
export async function plaatsStandaardbestanden(
  dossier: Pick<DossierRij, 'bouw7_categorie_id' | 'werkmaatschappij_id'>,
  doel: { driveId: string; itemId: string },
): Promise<{ geplaatst: number; fouten: string[] }> {
  const fouten: string[] = []
  let geplaatst = 0

  try {
    const regels = (await regelsVoorDossier(dossier)).slice(0, MAX_BESTANDEN)
    if (regels.length === 0) return { geplaatst: 0, fouten: [] }

    const supabase = dossierDb()

    // Submappen één keer per naam aanmaken in plaats van per bestand.
    const submapIds = new Map<string, string>()
    async function doelMap(submap: string | null): Promise<string> {
      const schoon = submap ? saneerMapNaam(submap) : ''
      if (!schoon) return doel.itemId
      const bekend = submapIds.get(schoon)
      if (bekend) return bekend
      const map = await maakSubmap(doel.driveId, doel.itemId, schoon)
      submapIds.set(schoon, map.itemId)
      return map.itemId
    }

    for (const r of regels) {
      try {
        const { data: blob, error } = await supabase.storage.from(STANDAARDBESTANDEN_BUCKET).download(r.storage_path)
        if (error || !blob) {
          fouten.push(`${r.bestandsnaam}: bestand niet gevonden in EVA`)
          continue
        }

        const bytes = new Uint8Array(await blob.arrayBuffer())
        const ouder = await doelMap(r.submap)
        const res = await uploadNaarMap(
          doel.driveId,
          ouder,
          r.bestandsnaam,
          bytes,
          r.content_type || 'application/octet-stream',
        )

        // 409 = er stond al een bestand met die naam. Dat is het gewenste eindresultaat,
        // geen fout: we overschrijven andermans bestand nooit.
        if (res.ok) geplaatst++
        else if (res.status !== 409) fouten.push(`${r.bestandsnaam} (${res.status})`)
      } catch (e) {
        fouten.push(`${r.bestandsnaam}: ${netteFout(e)}`)
      }
    }
  } catch (err) {
    fouten.push(netteFout(err))
  }

  return { geplaatst, fouten }
}
