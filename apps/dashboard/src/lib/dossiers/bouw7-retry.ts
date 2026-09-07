'use server'

/**
 * Herkansing van write-backs naar Bouw7 die eerder mislukten.
 *
 * Rollen en statussen zijn tweerichtingsvelden: EVA schrijft ze naar Bouw7 én leest ze terug.
 * Mislukt zo'n write (Bouw7-storing, verlopen sessie), dan staat het veld in
 * `dossiers.handmatige_velden` en laat de lees-sync het met rust — anders was de EVA-wijziging
 * de volgende ochtend weg. Deze module probeert die writes opnieuw, vóór de lees-sync draait,
 * en ontmarkeert bij succes zodat Bouw7 daarna weer leidend is. Zie lib/bouw7/handmatige-velden.ts.
 */

import { createAdminClient } from '@everts/database/server'
import { logSync, type SyncResult } from '@/lib/bouw7/sync'
import { BOUW7_DOSSIER_ROL_VELDEN, BOUW7_DOSSIER_STATUS_VELDEN } from '@/lib/bouw7/handmatige-velden'
import { herhaalDossierRollenWriteBack, herhaalDossierStatusWriteBack } from './actions'

/**
 * Probeert alle openstaande rol- en status-writes opnieuw. Met `dossierId` alleen dat ene
 * dossier (de verversknop). Faalt nooit hard: een dossier dat opnieuw mislukt blijft gewoon
 * gemarkeerd tot de volgende run.
 */
export async function herhaalUitgesteldeDossierWrites(opts?: { dossierId?: string }): Promise<SyncResult> {
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const meldingen: string[] = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const bereik = [...BOUW7_DOSSIER_ROL_VELDEN, ...BOUW7_DOSSIER_STATUS_VELDEN]
    let q = supabase
      .from('dossiers')
      .select('id, dossiernummer, handmatige_velden')
      .not('bouw7_id', 'is', null)
      .overlaps('handmatige_velden', bereik)
      .limit(500) // meer dan een handvol openstaande writes betekent een storing, geen backlog
    if (opts?.dossierId) q = q.eq('id', opts.dossierId)
    const { data, error } = await q
    if (error) throw new Error(error.message)

    for (const d of (data ?? []) as { id: string; dossiernummer: string | null; handmatige_velden: string[] }[]) {
      const velden = d.handmatige_velden ?? []
      const uitkomsten: { ok: boolean; error?: string }[] = []
      if (velden.some(v => (BOUW7_DOSSIER_ROL_VELDEN as readonly string[]).includes(v))) {
        uitkomsten.push(await herhaalDossierRollenWriteBack(d.id))
      }
      if (velden.some(v => (BOUW7_DOSSIER_STATUS_VELDEN as readonly string[]).includes(v))) {
        uitkomsten.push(await herhaalDossierStatusWriteBack(d.id))
      }
      const mislukt = uitkomsten.filter(u => !u.ok)
      if (mislukt.length === 0) result.bijgewerkt++
      else {
        result.fouten++
        if (meldingen.length < 3) meldingen.push(`${d.dossiernummer ?? d.id.slice(0, 8)}: ${mislukt[0].error ?? 'onbekend'}`)
      }
    }
  } catch (e: unknown) {
    result.fouten++
    meldingen.push(e instanceof Error ? e.message : 'Herkansing mislukt')
  }
  if (meldingen.length > 0) result.foutMelding = meldingen.join(' | ')
  // Alleen loggen als er iets te doen was: een lege run elke cron vervuilt sync_log.
  if (result.bijgewerkt + result.fouten > 0) await logSync('dossier_writes', 'out', result, Date.now() - start)
  return result
}
