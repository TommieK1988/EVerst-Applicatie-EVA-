/**
 * Two-way "% gereed" (voortgang): schrijft een in EVA ingevoerd percentage terug naar Bouw7.
 *
 * Mechaniek (zie lib/bouw7/WRITE-ENDPOINTS.md, analoog aan bouw7-status.ts en de
 * werkbegroting→prognose-feature):
 *  - project-niveau: read-modify-write op het project (GET /project/{id} → verplichte velden);
 *  - per bewakingscode: doel-id (PSL / security-code) resolven uit de project-control-structuur.
 *
 * STATUS — Fase 0 open: het exacte Bouw7-write-endpoint voor % gereed staat NIET in de
 * gedocumenteerde write-API (de 104 ops). `/list/progress-sheets` is read-only in de spec.
 * Net als bij de prognose (`/project/update-prognosis-other`) is dit vrijwel zeker een
 * ongedocumenteerd Heimdall-endpoint dat uit de Bouw7-UI gecaptured moet worden.
 *
 * Tot het endpoint bevestigd is staat `BOUW7_VOORTGANG_WRITE` op `false`: de schrijf-functies
 * geven dan `{ ok: true, skipped: true }` terug. De waarde staat dan wél in EVA
 * (`dossier_voortgang`, status `pending`) maar is nog niet doorgezet naar Bouw7. Zodra de call
 * bekend is: endpoint + body hieronder invullen en de vlag op `true` zetten.
 *
 * Faalt nooit hard: bij ontbrekende config/koppeling → `{ ok:false }` met melding, zodat de
 * aanroeper (UI) een toast toont zonder de EVA-opslag terug te draaien.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Project } from '@/lib/bouw7/client'

export type VoortgangWriteResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string }

/** Zet op `true` zodra het Bouw7 % gereed-endpoint bevestigd is (Fase 0). */
const BOUW7_VOORTGANG_WRITE = false

/** Clamp + afronden op 2 decimalen (Bouw7 verwacht 0–100). */
function normaliseerPct(p: number): number {
  const v = Math.max(0, Math.min(100, p))
  return Math.round(v * 100) / 100
}

/**
 * Schrijf de project-brede % gereed terug naar Bouw7.
 * Gebruikt door Management (inline) en het dossier-totaal (Financieel-tab).
 */
export async function schrijfBouw7VoortgangProject(
  bouw7Id: string | number,
  pctGereed: number,
): Promise<VoortgangWriteResult> {
  const pct = normaliseerPct(pctGereed)
  // Fase 0 nog niet afgerond → alleen in EVA opgeslagen, niet naar Bouw7 doorgezet.
  if (!BOUW7_VOORTGANG_WRITE) return { ok: true, skipped: true }

  try {
    const client = await getBouw7Client()

    // Read-modify-write: huidig project ophalen voor de verplichte velden (zoals `type`).
    const project = await client.get<Bouw7Project & { type?: number }>(`/project/${bouw7Id}`)
    const type = (project as { type?: number }).type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; % gereed niet teruggeschreven.' }

    // TODO Fase 0: exact endpoint + body invullen op basis van de gecapturede UI-call.
    //   Vermoedelijk een ongedocumenteerd Heimdall-endpoint; `pct` (0–100) als string of number.
    //   await client.post('<voortgang-endpoint>', { id: Number(bouw7Id), type, /* progress: */ pct })
    void pct
    return { ok: false, error: 'Bouw7 % gereed-endpoint nog niet geconfigureerd (Fase 0).' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}

/**
 * Schrijf de % gereed (standopname) van één bewakingscode terug naar Bouw7.
 * Gebruikt door het Financieel-tab bij Opdrachten (per-code editor).
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

    // TODO Fase 0: doel-id resolven (welke id Bouw7 nodig heeft blijkt uit de capture: PSL-id of
    //   security-code-id). De PSL-ids per code staan in de project-control-structuur:
    //   GET /project/{id}/project-security-links  of  /project-control/{id}/.../chapters → pslIds.
    //   Vervolgens het bevestigde endpoint posten met `pct` voor die code.
    void client; void bewakingscode; void pct
    return { ok: false, error: 'Bouw7 % gereed-endpoint (per bewakingscode) nog niet geconfigureerd (Fase 0).' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}
