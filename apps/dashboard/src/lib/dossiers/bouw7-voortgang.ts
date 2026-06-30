/**
 * Two-way "% gereed" (voortgang): schrijft een in EVA ingevoerd percentage terug naar Bouw7.
 *
 * Endpoints (gecaptured uit de Bouw7-UI, jun 2026 — zie lib/bouw7/WRITE-ENDPOINTS.md §2c):
 *
 *  - PROJECT-NIVEAU → Athena `POST /wip/project-progress`
 *      body: { projectId, progressType, progress: "<pct>", prognosisType, prognosisAmount }
 *      Eén call zet zowel % gereed als de WIP-prognose. We doen daarom **read-modify-write**:
 *      eerst de huidige WIP-instellingen lezen en alléén `progress` vervangen, zodat de
 *      (fiscaal relevante) prognose niet overschreven wordt. Lukt het lezen niet → we schrijven
 *      NIET (waarde blijft in EVA), om de prognose nooit per ongeluk te clobberen.
 *
 *  - PER BEWAKINGSCODE → Heimdall `POST /project/progress-log`
 *      body: { projectSecurityLink: { id }, dateRecorded: "YYYY-MM-DD", progress: "<pct>" }
 *      Append-style logregel per PSL (bewakingscode) — clobbert niets. De PSL-id resolven we
 *      uit `GET /project/{id}/project-security-links` op basis van de kale bewakingscode.
 *
 * Faalt nooit hard: bij ontbrekende config/koppeling/mapping → { ok:false } met melding, zodat de
 * aanroeper (UI) een toast toont zonder de EVA-opslag terug te draaien.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'

export type VoortgangWriteResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string }

/** Bouw7-write actief? Staat aan sinds de endpoints gecaptured zijn (Fase 0 afgerond). */
const BOUW7_VOORTGANG_WRITE = true

/** Clamp + afronden op 2 decimalen (Bouw7 verwacht 0–100). */
function normaliseerPct(p: number): number {
  const v = Math.max(0, Math.min(100, p))
  return Math.round(v * 100) / 100
}

/** Huidige WIP-instellingen van een project (Athena `/wip/project-progress`). */
type WipProjectProgress = {
  projectId?: number
  progressType?: number
  progress?: number | string
  prognosisType?: number
  prognosisAmount?: number | string
}

/**
 * Schrijf de project-brede % gereed terug naar Bouw7 (Athena WIP).
 * Read-modify-write: prognose-instellingen blijven ongewijzigd; alleen `progress` wijzigt.
 */
export async function schrijfBouw7VoortgangProject(
  bouw7Id: string | number,
  pctGereed: number,
): Promise<VoortgangWriteResult> {
  const pct = normaliseerPct(pctGereed)
  if (!BOUW7_VOORTGANG_WRITE) return { ok: true, skipped: true }

  try {
    const client = await getBouw7Client()

    // 1. Huidige WIP-instellingen lezen om de prognose te behouden.
    let current: WipProjectProgress | null = null
    try {
      const r = await client.getAthena<WipProjectProgress | { items?: WipProjectProgress[] }>(
        '/wip/project-progress',
        { projectId: String(bouw7Id) },
      )
      current = Array.isArray((r as { items?: WipProjectProgress[] }).items)
        ? ((r as { items?: WipProjectProgress[] }).items?.[0] ?? null)
        : (r as WipProjectProgress)
    } catch {
      current = null
    }

    // Zonder bekende prognose schrijven we niet — anders riskeren we de WIP-prognose te overschrijven.
    if (!current || current.prognosisType == null || current.prognosisAmount == null) {
      return {
        ok: false,
        error: 'Kon de huidige WIP-prognose in Bouw7 niet lezen; project-% gereed is niet teruggeschreven (prognose niet aangeraakt).',
      }
    }

    // 2. Alléén progress vervangen; prognose-instellingen onveranderd terugsturen.
    await client.postAthena('/wip/project-progress', {
      projectId: Number(bouw7Id),
      progressType: current.progressType ?? 1,
      progress: String(pct),
      prognosisType: current.prognosisType,
      prognosisAmount: current.prognosisAmount,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}

/** Structuur van `GET /project/{id}/project-security-links` (alleen wat we nodig hebben). */
type Bouw7ProjectSecurityLinks = {
  securityCodesPerChapters?: {
    budgetDataPerSecurityCodes?: { securityCode?: { id?: number; code?: string; name?: string } }[]
  }[]
}[]

/** Resolve de PSL-id (project-security-link) van een bewakingscode binnen een project. */
async function resolvePslId(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
  bouw7Id: string | number,
  bewakingscode: string,
): Promise<number | null> {
  const links = await client.get<Bouw7ProjectSecurityLinks>(`/project/${bouw7Id}/project-security-links`)
  const doel = bewakingscode.trim()
  for (const obj of links ?? []) {
    for (const ch of obj.securityCodesPerChapters ?? []) {
      for (const bd of ch.budgetDataPerSecurityCodes ?? []) {
        const code = bd.securityCode?.code
        if (code != null && (code === bewakingscode || code.trim() === doel) && bd.securityCode?.id != null) {
          return bd.securityCode.id
        }
      }
    }
  }
  return null
}

/**
 * Schrijf de % gereed (standopname) van één bewakingscode terug naar Bouw7
 * als progress-logregel (Heimdall `POST /project/progress-log`).
 */
export async function schrijfBouw7VoortgangCode(
  bouw7Id: string | number,
  bewakingscode: string,
  pctGereed: number,
): Promise<VoortgangWriteResult> {
  const pct = normaliseerPct(pctGereed)
  if (!BOUW7_VOORTGANG_WRITE) return { ok: true, skipped: true }

  try {
    const client = await getBouw7Client()

    const pslId = await resolvePslId(client, bouw7Id, bewakingscode)
    if (pslId == null) {
      return { ok: false, error: `Bewakingscode "${bewakingscode.trim()}" niet gevonden in Bouw7; % gereed niet teruggeschreven.` }
    }

    const dateRecorded = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    await client.post('/project/progress-log', {
      projectSecurityLink: { id: pslId },
      dateRecorded,
      progress: String(pct),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}
