/**
 * Two-way projectstatus: schrijft een EVA opdracht-substatus terug naar Bouw7.
 *
 * Mechaniek (zie lib/bouw7/WRITE-ENDPOINTS.md):
 *  - status-id ophalen via GET /list/project-statuses (gemapt op de prefix uit status-map.ts);
 *  - read-modify-write: GET /project/{id} voor het verplichte `type`, dan
 *    POST /project { id, type, status: { id } }.
 *
 * Faalt nooit hard: bij ontbrekende config/koppeling/mapping → { ok:false } met melding,
 * zodat de aanroeper (kanban/knop) een toast kan tonen zonder de EVA-update terug te draaien.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7ProjectStatus, Bouw7Project, Bouw7ListResponse } from '@/lib/bouw7/client'
import { opdrachtSubstatusNaarPrefix } from '@/lib/bouw7/status-map'

export type Bouw7WriteResult = { ok: true } | { ok: false; error: string }

/** Alle Bouw7-projectstatussen ({ id, name }). Bron voor de status-id bij terugschrijven. */
export async function getBouw7Projectstatussen(): Promise<Bouw7ProjectStatus[]> {
  const client = await getBouw7Client()
  const res = await client.get<Bouw7ListResponse<Bouw7ProjectStatus>>('/list/project-statuses', {
    q: 'LIMIT 200',
  })
  return res.items ?? []
}

/**
 * Schrijf de projectstatus van een Bouw7-project terug op basis van een EVA opdracht-substatus.
 * `sectie` is meegegeven voor toekomstige uitbreiding; momenteel schrijven alleen opdracht-substatussen.
 */
export async function schrijfBouw7Projectstatus(
  bouw7Id: string | number,
  substatus: string,
  sectie: 'opdracht' | 'servicedesk' = 'opdracht',
): Promise<Bouw7WriteResult> {
  // Servicedesk-substatussen hebben geen 1:1 Bouw7-projectstatus → niet terugschrijven.
  if (sectie !== 'opdracht') return { ok: false, error: 'Servicedesk-status wordt niet naar Bouw7 geschreven.' }

  const prefix = opdrachtSubstatusNaarPrefix(substatus)
  if (!prefix) return { ok: false, error: `Geen Bouw7-status bekend voor "${substatus}".` }

  try {
    const client = await getBouw7Client()

    // 1. Status-id bepalen via de naam-prefix (bv. "04." → "04. Onderhanden").
    const lijst = (await client.get<Bouw7ListResponse<Bouw7ProjectStatus>>('/list/project-statuses', { q: 'LIMIT 200' })).items ?? []
    const status = lijst.find((s) => (s.name ?? '').trim().startsWith(prefix))
    if (!status) return { ok: false, error: `Bouw7-projectstatus met prefix "${prefix}" niet gevonden.` }

    // 2. Read-modify-write: huidig project ophalen voor het verplichte `type`.
    const project = await client.get<Bouw7Project & { type?: number }>(`/project/${bouw7Id}`)
    const type = (project as { type?: number }).type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; status niet teruggeschreven.' }

    // 3. Status zetten (upsert: id aanwezig = update). Alleen id/type/status meesturen.
    await client.post('/project', { id: Number(bouw7Id), type, status: { id: status.id } })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}
