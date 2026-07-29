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
import type { Bouw7ControlResponse, Bouw7CostTypeId } from '@/lib/bouw7/client'

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
    //    Athena `GET /wip/project-progress/{id}` (pad-param!) geeft een plat object terug;
    //    de `?projectId=`-queryvariant geeft 405.
    let current: WipProjectProgress | null = null
    try {
      current = await client.getAthena<WipProjectProgress>(`/wip/project-progress/${bouw7Id}`)
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
    //    Management-edit is handmatig → progressType 1.
    await client.postAthena('/wip/project-progress', {
      projectId: Number(bouw7Id),
      progressType: 1,
      progress: String(pct),
      prognosisType: current.prognosisType,
      prognosisAmount: current.prognosisAmount,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}

/**
 * Resolve de ProjectSecurityLink-ids van een bewakingscode binnen ÉÉN hoofdstuk van een project.
 *
 * Bron: Athena `/project-control/{id}/cost-type/{ct}/chapters` → `securityCodes[].pslIds`
 * (zelfde PSL-ids als de prognose-feature en als de progress-READ). NB: NIET `securityCode.id`
 * uit `/project-security-links` — dat is de code-*definitie*-id en geeft een 403 protection_error.
 *
 * Eén code kan onder meerdere kostensoorten een eigen PSL hebben → binnen het hoofdstuk verzamelen
 * we ze allemaal (dedup). BELANGRIJK: bewakingscodes zijn NIET uniek per project — dezelfde code
 * kan in meerdere hoofdstukken staan. Met `hoofdstukId` (chapterInfo.id) beperken we de write tot
 * het bewerkte hoofdstuk; zonder zou de standopname naar élk gelijk-benoemd hoofdstuk lekken. Wordt
 * `hoofdstukId` niet meegegeven (null), dan vallen we terug op alle hoofdstukken (oud gedrag).
 */
const PSL_KOSTENSOORTEN: Bouw7CostTypeId[] = [1, 2, 3, 4, 5, 6]

async function resolvePslIds(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
  bouw7Id: string | number,
  bewakingscode: string,
  hoofdstukId?: number | null,
): Promise<number[]> {
  const doel = bewakingscode.trim()
  const responses = await Promise.all(
    PSL_KOSTENSOORTEN.map((ct) =>
      client
        .getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`)
        .catch(() => null),
    ),
  )

  const ids = new Set<number>()
  for (const resp of responses) {
    if (!resp) continue
    for (const item of resp.items ?? []) {
      if (hoofdstukId != null && (item.chapterInfo?.id ?? null) !== hoofdstukId) continue
      for (const sc of item.securityCodes ?? []) {
        if ((sc.code ?? '').trim() !== doel) continue
        for (const psl of sc.pslIds ?? []) {
          if (psl != null) ids.add(psl)
        }
      }
    }
  }
  return [...ids]
}

/**
 * Schrijf de % gereed (standopname) van één bewakingscode terug naar Bouw7
 * als progress-logregel (Heimdall `POST /project/progress-log`).
 */
export async function schrijfBouw7VoortgangCode(
  bouw7Id: string | number,
  bewakingscode: string,
  pctGereed: number,
  hoofdstukId?: number | null,
): Promise<VoortgangWriteResult> {
  const pct = normaliseerPct(pctGereed)
  if (!BOUW7_VOORTGANG_WRITE) return { ok: true, skipped: true }

  try {
    const client = await getBouw7Client()

    const pslIds = await resolvePslIds(client, bouw7Id, bewakingscode, hoofdstukId)
    if (pslIds.length === 0) {
      return { ok: false, error: `Bewakingscode "${bewakingscode.trim()}" niet gevonden in Bouw7; % gereed niet teruggeschreven.` }
    }

    // Standopname op elke kostensoort-PSL van de code schrijven.
    const dateRecorded = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const resultaten = await Promise.allSettled(
      pslIds.map((id) =>
        client.post('/project/progress-log', {
          projectSecurityLink: { id },
          dateRecorded,
          progress: String(pct),
        }),
      ),
    )

    const mislukt = resultaten.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (mislukt.length === pslIds.length) {
      const reden = mislukt[0]?.reason
      return { ok: false, error: reden instanceof Error ? reden.message : 'Bouw7-write mislukt.' }
    }
    if (mislukt.length > 0) {
      return {
        ok: false,
        error: `${pslIds.length - mislukt.length}/${pslIds.length} kostensoort-PSL's bijgewerkt; rest mislukte.`,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}
