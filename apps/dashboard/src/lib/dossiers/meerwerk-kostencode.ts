'use server'

/**
 * Op welke bestaande bewakingscode staan de kosten van een meerwerkregel?
 *
 * Voor meerwerk zonder eigen code (vooral uit Bouw7 geïmporteerd): de kosten staan dan op een
 * bestaande projectcode, bijvoorbeeld HR.A. De koppeling staat in `kosten_bewakingscode` en wordt
 * alleen gebruikt door het resultaat per code op het Financieel-tab. Bewust niet de kolom
 * `bewakingscode`: die maakt ook een kostengroep in werkbegroting en planning, en zet regiemeerwerk
 * op nacalculatie.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getDossierBewaking } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisSessie } from '@/lib/auth/rechten'
import { isCorrectieCode } from '@/components/dossiers/types'

/** Een bestaande projectcode waar de kosten van meerwerk op kunnen staan. */
export type MeerwerkKostencode = {
  code: string
  naam: string | null
  /** Meerwerkbudget dat Bouw7 op deze code heeft staan; > 0 = hier staat al meerwerk. */
  meerwerk: number
  begroot: number
}

/** De codes uit de Bouw7-bewaking, zonder "kosten zonder bewaking" en Correcties. */
async function leesKostencodes(dossierId: string): Promise<MeerwerkKostencode[]> {
  const bewaking = await getDossierBewaking(dossierId, { verbergCorrecties: true })
  const perCode = new Map<string, MeerwerkKostencode>()
  for (const h of bewaking.hoofdstukken) {
    for (const r of h.regels) {
      if (!r.code || r.code === '-' || isCorrectieCode(r.code)) continue
      const c = perCode.get(r.code) ?? { code: r.code, naam: r.naam, meerwerk: 0, begroot: 0 }
      c.meerwerk += r.meerwerk
      c.begroot += r.begroot
      perCode.set(r.code, c)
    }
  }
  // Codes waar Bouw7 al meerwerk op heeft staan eerst: daar hoort het meestal bij.
  return [...perCode.values()].sort((a, b) =>
    Number(b.meerwerk > 0) - Number(a.meerwerk > 0) || a.code.localeCompare(b.code, 'nl'))
}

/** Keuzelijst voor "kosten staan op code …" op het Meerwerk-tab. */
export async function getMeerwerkKostencodes(dossierId: string): Promise<MeerwerkKostencode[]> {
  await vereisSessie()
  return leesKostencodes(dossierId)
}

/**
 * Legt vast op welke bestaande bewakingscode de kosten van een meerwerkregel staan, of wist dat
 * (`code = null`). Alleen voor regels zonder eigen bewakingscode; die hebben hun eigen code al.
 * Puur EVA: er gaat niets naar Bouw7 en de regel krijgt geen kostengroep of nacalculatie.
 */
export async function koppelMeerwerkKostencode(
  id: string,
  code: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = createAdminClient()
  const { data: regel } = await supabase
    .from('meerwerk_regels').select('id, dossier_id, bewakingscode').eq('id', id).maybeSingle()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  await assertDossierBewerkbaar(regel.dossier_id)
  if (regel.bewakingscode) return { ok: false, error: 'Deze regel heeft al een eigen bewakingscode.' }

  const schoon = (code ?? '').trim() || null
  if (schoon) {
    const codes = await leesKostencodes(regel.dossier_id)
    if (!codes.some(c => c.code === schoon)) {
      return { ok: false, error: `Bewakingscode "${schoon}" staat niet op dit project in Bouw7.` }
    }
  }
  const { error } = await supabase
    .from('meerwerk_regels')
    .update({ kosten_bewakingscode: schoon, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${regel.dossier_id}/meerwerk`)
  return { ok: true }
}
