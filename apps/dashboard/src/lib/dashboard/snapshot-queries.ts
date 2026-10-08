import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { ManagementProject } from './aggregaties'
import type { WerkCijfers } from './wijzigingen'

/**
 * Per-werk cijfers uit een vastgestelde maand (`management_maand_snapshot_regel`).
 * Zelfde velden als een live `ManagementProject`, minus wat niet bevroren wordt
 * (OHW, arbeidsuren, synctijd).
 */
export type SnapshotRegel = Omit<
  ManagementProject,
  'bouw7_laatst_sync' | 'arbeid_prognose_uren' | 'arbeid_geboekte_uren' | 'ohw_omzet' | 'ohw_resultaat'
>

const REGEL_KOLOMMEN =
  'id, projectnummer, bouw7_id, filiaal, status, opdrachtgever, projectnaam, categorie, projectleider, ' +
  'geboekte_kosten, totale_opdracht, pct_gereed, totale_prognose, verwacht_resultaat, pct_marge, ' +
  'omzet_obv_pct, resultaat_obv_pct, gefactureerd, resultaat_gereed, pct_marge_gereed, ' +
  'verschil_pct_marge, is_gereed, kosten_split, dossier_id, dossier_sectie'

/** Alle werken van één vastgestelde maand. Gepagineerd: ruim 500 per maand en groeiend. */
export async function getSnapshotRegels(snapshotId: string): Promise<SnapshotRegel[]> {
  const supabase = createAdminClient()
  const rijen = await haalAlleRijen<SnapshotRegel>((van, tot) =>
    supabase
      .from('management_maand_snapshot_regel')
      .select(REGEL_KOLOMMEN)
      .eq('snapshot_id', snapshotId)
      .order('id')
      .range(van, tot)
      .returns<SnapshotRegel[]>(),
  )
  return rijen.map(getallen)
}

export type WerkVerloopPunt = SnapshotRegel & { periode: string }

/**
 * Eén werk door alle vastgestelde maanden heen, oud → nieuw. Begrensd door het werk:
 * één regel per vastgestelde maand.
 */
export async function getWerkVerloop(bouw7Id: string): Promise<WerkVerloopPunt[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('management_maand_snapshot_regel')
    .select(`${REGEL_KOLOMMEN}, snapshot:management_maand_snapshot!inner(periode)`)
    .eq('bouw7_id', bouw7Id)
  if (error) throw new Error(`Verloop ophalen mislukt: ${error.message}`)
  return ((data ?? []) as (SnapshotRegel & { snapshot: { periode: string } })[])
    .map(({ snapshot, ...r }) => ({ ...getallen(r), periode: snapshot.periode }))
    .sort((a, b) => a.periode.localeCompare(b.periode))
}

const GETAL_VELDEN = [
  'geboekte_kosten', 'totale_opdracht', 'pct_gereed', 'totale_prognose', 'verwacht_resultaat',
  'pct_marge', 'omzet_obv_pct', 'resultaat_obv_pct', 'gefactureerd', 'resultaat_gereed',
  'pct_marge_gereed', 'verschil_pct_marge',
] as const

/** `numeric` kan als string binnenkomen; de rekenkern wil getallen. */
function getallen<T extends SnapshotRegel>(r: T): T {
  const uit = { ...r } as Record<string, unknown>
  for (const v of GETAL_VELDEN) {
    const w = uit[v]
    uit[v] = w == null ? null : Number(w)
  }
  return uit as T
}

export type SnapshotPeriode = { id: string; periode: string }

/** Vastgestelde maanden (alleen id + periode), nieuwste eerst. Eén rij per maand. */
export async function getSnapshotPeriodes(): Promise<SnapshotPeriode[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('management_maand_snapshot')
    .select('id, periode')
    .order('periode', { ascending: false })
  if (error) throw new Error(`Vastgestelde maanden ophalen mislukt: ${error.message}`)
  return (data ?? []) as SnapshotPeriode[]
}

/** Alleen wat de vergelijking nodig heeft — scheelt payload naar de client. */
export function alsWerkCijfers(r: SnapshotRegel): WerkCijfers & { totale_prognose: number | null } {
  return {
    projectnummer: r.projectnummer, bouw7_id: r.bouw7_id, filiaal: r.filiaal, status: r.status,
    opdrachtgever: r.opdrachtgever, projectnaam: r.projectnaam, projectleider: r.projectleider,
    totale_opdracht: r.totale_opdracht, verwacht_resultaat: r.verwacht_resultaat,
    pct_marge: r.pct_marge, pct_gereed: r.pct_gereed, totale_prognose: r.totale_prognose,
    dossier_id: r.dossier_id, dossier_sectie: r.dossier_sectie,
  }
}
