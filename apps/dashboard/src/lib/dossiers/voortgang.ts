'use server'

/**
 * EVA-opslag + Bouw7-doorzet van handmatig ingevoerde "% gereed" (voortgang).
 *
 * Twee niveaus (tabel `public.dossier_voortgang`):
 *  - 'project'        — één waarde per project (Management-tabel + dossier-totaal);
 *  - 'bewakingscode'  — standopname per bewakingscode (Financieel-tab, opdracht).
 *
 * Flow per bewaaractie: upsert in EVA (status 'pending') → Bouw7-write (zie bouw7-voortgang.ts) →
 * status bijwerken naar 'synced' | 'pending' (Bouw7-write nog niet bedraad, Fase 0) | 'error'.
 * De EVA-waarde blijft altijd staan, ook als de Bouw7-write faalt (audit + UI-fallback).
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { schrijfBouw7VoortgangProject, schrijfBouw7VoortgangCode } from './bouw7-voortgang'
import { assertDossierBewerkbaar } from './guards'

export type VoortgangNiveau = 'project' | 'bewakingscode'

export type BewaarVoortgangInput = {
  /** EVA-dossier-id (optioneel; aanwezig bij opslaan vanuit een dossier). */
  dossierId?: string | null
  /** Bouw7-project-id — verplicht, dit is de write-sleutel naar Bouw7. */
  bouw7Id: string
  niveau: VoortgangNiveau
  /** Vereist bij niveau 'bewakingscode'. */
  bewakingscode?: string | null
  /**
   * Hoofdstuk-id (Bouw7 chapterInfo.id) van de regel — bij niveau 'bewakingscode'. Nodig omdat
   * bewakingscodes NIET uniek zijn per project: dezelfde code kan in meerdere hoofdstukken staan.
   * Zonder hoofdstuk zou een % gereed voor élke gelijk-benoemde code gelden.
   */
  hoofdstukId?: number | null
  /** 0–100. */
  pctGereed: number
}

export type BewaarVoortgangResult =
  | { ok: true; bouw7: 'synced' | 'pending'; melding?: string }
  | { ok: false; error: string }

/** Sla een % gereed op in EVA en zet 'm (best-effort) door naar Bouw7. */
export async function bewaarVoortgang(input: BewaarVoortgangInput): Promise<BewaarVoortgangResult> {
  const { dossierId, bouw7Id, niveau } = input
  const bewakingscode = niveau === 'bewakingscode' ? (input.bewakingscode ?? null) : null
  const hoofdstukId = niveau === 'bewakingscode' ? (input.hoofdstukId ?? null) : null
  const pct = Math.max(0, Math.min(100, Math.round(input.pctGereed * 100) / 100))

  if (!bouw7Id) return { ok: false, error: 'Geen Bouw7-koppeling voor dit project.' }
  if (niveau === 'bewakingscode' && !bewakingscode) return { ok: false, error: 'Bewakingscode ontbreekt.' }

  await assertDossierBewerkbaar(dossierId)

  const supabase = createAdminClient() as any

  // 1. EVA-opslag (upsert). Markeer als 'pending' tot Bouw7 bevestigt.
  const { error: upsertError } = await supabase
    .from('dossier_voortgang')
    .upsert(
      {
        dossier_id: dossierId ?? null,
        bouw7_id: bouw7Id,
        niveau,
        bewakingscode,
        hoofdstuk_id: hoofdstukId,
        pct_gereed: pct,
        bron: 'eva',
        bouw7_sync_status: 'pending',
        bouw7_sync_fout: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'bouw7_id,niveau,bewakingscode,hoofdstuk_id' },
    )
  if (upsertError) return { ok: false, error: upsertError.message }

  // 2. Bouw7-write (best-effort; faalt nooit hard).
  const write =
    niveau === 'project'
      ? await schrijfBouw7VoortgangProject(bouw7Id, pct)
      : await schrijfBouw7VoortgangCode(bouw7Id, bewakingscode!, pct, hoofdstukId)

  // 3. Sync-status bijwerken.
  const synced = write.ok && !write.skipped
  await supabase
    .from('dossier_voortgang')
    .update({
      bouw7_sync_status: synced ? 'synced' : write.ok ? 'pending' : 'error',
      bouw7_sync_fout: write.ok ? null : write.error,
      bouw7_laatst_sync: synced ? new Date().toISOString() : null,
    })
    .match({ bouw7_id: bouw7Id, niveau, bewakingscode, hoofdstuk_id: hoofdstukId })

  // 4. Caches verversen.
  if (dossierId) {
    revalidatePath(`/opdrachten/${dossierId}/financieel`)
    revalidatePath(`/servicedesk/${dossierId}/financieel`)
  }
  revalidatePath('/management/lopend')
  revalidatePath('/management/servicedesk')
  revalidatePath('/management/dashboard')

  return synced
    ? { ok: true, bouw7: 'synced' }
    : write.ok
      ? { ok: true, bouw7: 'pending', melding: 'Opgeslagen in EVA. Doorzetten naar Bouw7 volgt zodra de koppeling actief is.' }
      : { ok: true, bouw7: 'pending', melding: `Opgeslagen in EVA. Bouw7 nog niet bijgewerkt: ${write.error}` }
}

export type VoortgangOverlay = {
  /** Project-brede % gereed (niveau 'project'), of null. */
  project: number | null
  /**
   * Per bewakingscode-regel. Sleutel = `${hoofdstuk_id ?? 'x'}|${bewakingscode}` — dezelfde vorm
   * als de regelMap-sleutel in `getDossierBewaking`. Codes zijn niet uniek per project, dus het
   * hoofdstuk hoort in de sleutel; anders lekt een pending % naar gelijk-benoemde codes.
   */
  codes: Map<string, number>
}

/**
 * Twee-richtingen sync: de EVA-overlay geldt **alleen** voor nog-niet-bevestigde wijzigingen
 * (`bouw7_sync_status` ∈ {pending, error}). Zodra de Bouw7-write geslaagd is (`synced`) is Bouw7
 * weer de bron van waarheid — een latere wijziging in Bouw7 komt dan gewoon via de read-sync mee
 * en wordt niet door een oude EVA-waarde gemaskeerd.
 */
const OVERLAY_STATUSSEN = ['pending', 'error']

/** EVA-overlay voor één project: project-waarde + per-code waarden (alleen onbevestigde wijzigingen). */
export async function getVoortgang(bouw7Id: string): Promise<VoortgangOverlay> {
  const overlay: VoortgangOverlay = { project: null, codes: new Map() }
  if (!bouw7Id) return overlay

  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_voortgang')
    .select('niveau, bewakingscode, hoofdstuk_id, pct_gereed, bouw7_sync_status')
    .eq('bouw7_id', bouw7Id)
    .in('bouw7_sync_status', OVERLAY_STATUSSEN)

  for (const row of (data ?? []) as { niveau: string; bewakingscode: string | null; hoofdstuk_id: number | null; pct_gereed: number | string }[]) {
    const pct = typeof row.pct_gereed === 'string' ? parseFloat(row.pct_gereed) : row.pct_gereed
    if (row.niveau === 'project') overlay.project = pct
    else if (row.bewakingscode) overlay.codes.set(`${row.hoofdstuk_id ?? 'x'}|${row.bewakingscode}`, pct)
  }
  return overlay
}

/** EVA-overlay voor de Management-tabel: onbevestigde project-waarden voor een set Bouw7-ids. */
export async function getVoortgangProjectMap(bouw7Ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const ids = [...new Set(bouw7Ids.filter(Boolean))]
  if (ids.length === 0) return map

  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_voortgang')
    .select('bouw7_id, pct_gereed, bouw7_sync_status')
    .eq('niveau', 'project')
    .in('bouw7_sync_status', OVERLAY_STATUSSEN)
    .in('bouw7_id', ids)

  for (const row of (data ?? []) as { bouw7_id: string; pct_gereed: number | string }[]) {
    map.set(row.bouw7_id, typeof row.pct_gereed === 'string' ? parseFloat(row.pct_gereed) : row.pct_gereed)
  }
  return map
}
