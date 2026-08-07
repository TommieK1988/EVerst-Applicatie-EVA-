/**
 * Schrijf- en verversmechaniek voor het Bouw7-maatwerkveld "Offerte Sub-status"
 * (`caOfferteSubstatus`, id 20987) — de substatus-ladder die EVA deelt met de tweede app op Bouw7.
 * De labeltabel zelf staat in `substatus-map.ts` (puur, ook gebruikt door de lees-sync).
 *
 * Omdat die tweede app dezelfde kolom leest en schrijft, kan hij niet op de 2×/dag-cron wachten.
 * Daarom twee mechanismen náást de gewone sync:
 *
 *  - **write-through** (`schrijfBouw7Substatus`): elke substatuswijziging in EVA gaat meteen naar
 *    Bouw7 via read-modify-write op `POST /project { id, type, customAttributeValues }`.
 *  - **verse read bij openen** (`ververseSubstatussen`): één `GET /list/projects` — het maatwerkveld
 *    komt daar plat in mee — en werkt alleen de statuskolommen bij van de dossiers die afwijken.
 *    Geen fingerprint, geen dure detail-calls; goedkoop genoeg om bij elk paginabezoek te draaien.
 *
 * De opdracht-fase (projectstatus 02.–07.) loopt hier bewust buitenom; die blijft op de
 * projectstatus draaien (`status-map.ts` + `lib/dossiers/bouw7-status.ts`).
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client, fetchAllPages } from '@/lib/bouw7/sync'
import type { Bouw7Client, Bouw7Project, Bouw7Quotation, Bouw7ProjectStatus, Bouw7ListResponse } from '@/lib/bouw7/client'
import {
  resolveCustomAttributeId,
  mergeCustomAttributeValue,
  type Bouw7CustomAttrValue,
} from '@/lib/bouw7/custom-attributes'
import {
  bouw7SubstatusNaarEva,
  evaSubstatusNaarBouw7,
  type SubstatusSectie,
} from '@/lib/bouw7/substatus-map'

/** Geverifieerd tegen de live API (jul 2026): "Offerte Sub-status", dropdown, ownerType 0 (project). */
export const BOUW7_SUBSTATUS_ATTR_ID = 20987

/** Fallback-matcher voor als het attribuut in Bouw7 opnieuw wordt aangemaakt (nieuw id). */
const isSubstatusAttr = (d: { name?: string; code?: string; propertyName?: string }): boolean =>
  d.propertyName === 'caOfferteSubstatus' || /offerte\s*sub-?status/i.test(d.name ?? '')

/**
 * Is dit een Bouw7-**offerte**status die "deze offerte gaat niet door" betekent?
 * De zeven live statussen zijn: 01. Nieuw, 02. Onderhanden, 03. Verstuurd, 04. Gewonnen,
 * 05. Verloren, 06. Vervallen, 07. Mondelinge toezegging. Match op naamdeel, niet op nummer,
 * zodat hernummeren in Bouw7 de regel niet breekt.
 */
function isOfferteAfgeketst(statusNaam: string | null | undefined): boolean {
  const n = (statusNaam ?? '').toLowerCase()
  return n.includes('verloren') || n.includes('vervallen')
}

/**
 * Welke Bouw7-**projectstatus** hoort bij deze EVA-substatus? `null` = projectstatus ongemoeid laten.
 *
 * Twee gevallen (afgesproken met Tom, jul 2026):
 *  - **Gewonnen** → het project wordt een opdracht: projectstatus `02. Nieuwe opdracht`. In EVA doet
 *    de DB-trigger hetzelfde (offerte/gewonnen → opdracht/nieuwe_opdracht).
 *  - **Verloren / Vervallen** → projectstatus `08. Afgewezen`, maar **alleen als álle offertes van
 *    het project** verloren of vervallen zijn. Ligt er nog een levende offerte (nieuw, verstuurd,
 *    gewonnen, …), dan blijft het project gewoon open staan. Een project zónder offertes telt als
 *    "niets meer levend" en gaat dus wél naar Afgewezen.
 */
async function projectstatusPrefixVoor(
  client: Bouw7Client,
  bouw7Id: string | number,
  sectie: SubstatusSectie,
  substatus: string,
): Promise<string | null> {
  if (sectie !== 'offerte') return null
  if (substatus === 'gewonnen') return '02.'
  if (substatus !== 'verloren' && substatus !== 'vervallen') return null

  // Offertes van dít project (HQL-filter op /list/quotations; geverifieerd tegen de live API).
  const res = await client.get<Bouw7ListResponse<Bouw7Quotation>>('/list/quotations', {
    q: `project.id = ${Number(bouw7Id)}`,
  })
  const offertes = res.items ?? []
  const allesAfgeketst = offertes.every((q) => isOfferteAfgeketst(q.quotationStatus?.name))
  return allesAfgeketst ? '08.' : null
}

export type SubstatusWriteResult =
  | { ok: true }
  /** `conflict` = de andere app heeft dit veld gewijzigd sinds EVA het laatst zag. */
  | { ok: false; error: string; conflict?: { bouw7Label: string } }

/**
 * Schrijf de EVA-substatus naar het maatwerkveld op het Bouw7-project (write-through).
 *
 * Conflictdetectie: staat er in Bouw7 al een ándere waarde dan de substatus die EVA vóór deze
 * wijziging had, dan heeft de tweede app hem intussen omgezet. We schrijven dan **niet** — de
 * aanroeper laat de EVA-wijziging vervallen en haalt de Bouw7-stand op. Zo overschrijft een late
 * klik in EVA nooit stilzwijgend een verse wijziging van de ander.
 *
 * `opts.forceer` zet die check uit. Bedoeld voor wijzigingen die géén voorstel zijn maar een
 * **feit**: de offerte is gemaild, dus "07. Verzonden" is waar — ongeacht wat de ander intussen
 * invulde. Ook de handmatige "toch overschrijven"-keuze in de UI komt hier binnen. Zonder deze
 * uitweg is elke drift tussen EVA en Bouw7 een permanente blokkade: de check kan niet zien of de
 * ander zojuist wijzigde of dat EVA ooit vooruitliep zonder write-through.
 *
 * Faalt verder nooit hard: bij ontbrekende config/koppeling/mapping → `{ ok:false }` met melding,
 * zodat de UI een toast kan tonen zonder de EVA-update terug te draaien (de sync haalt de drift op).
 */
export async function schrijfBouw7Substatus(
  bouw7Id: string | number,
  sectie: SubstatusSectie,
  nieuweSubstatus: string,
  /** De sectie + substatus die EVA vóór deze wijziging had — basis voor de conflictcheck. */
  vorige?: { sectie: SubstatusSectie; substatus: string | null } | null,
  opts?: { forceer?: boolean },
): Promise<SubstatusWriteResult> {
  const nieuwLabel = evaSubstatusNaarBouw7(sectie, nieuweSubstatus)
  if (!nieuwLabel) return { ok: false, error: `Geen Bouw7-substatus bekend voor "${nieuweSubstatus}".` }

  try {
    const client = await getBouw7Client()

    // Read-modify-write: het project ophalen voor het verplichte `type`, de bestaande maatwerkvelden
    // én — meteen gratis — de actuele waarde van het gedeelde veld voor de conflictcheck.
    const project = await client.get<
      Bouw7Project & { type?: number; customAttributeValues?: Bouw7CustomAttrValue[] }
    >(`/project/${bouw7Id}`)

    const type = project.type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; substatus niet teruggeschreven.' }

    const bestaand: Bouw7CustomAttrValue[] = Array.isArray(project.customAttributeValues)
      ? project.customAttributeValues
      : []

    const attrId =
      bestaand.find((v) => v.customAttribute?.id === BOUW7_SUBSTATUS_ATTR_ID)?.customAttribute?.id
      ?? (await resolveCustomAttributeId(client, isSubstatusAttr))
    if (attrId == null) return { ok: false, error: 'Maatwerkveld "Offerte Sub-status" niet gevonden in Bouw7.' }

    const huidigLabel = (bestaand.find((v) => v.customAttribute?.id === attrId)?.value ?? '').trim()
    if (!opts?.forceer && huidigLabel && huidigLabel !== nieuwLabel && bouw7SubstatusNaarEva(huidigLabel)) {
      // Wat verwachtte EVA daar te vinden? Alleen als Bouw7 daarvan afwijkt is er een echte botsing.
      // Bij een leeg/onbekend Bouw7-label is er niets om te overschrijven → gewoon schrijven.
      const verwachtLabel =
        vorige?.substatus != null ? evaSubstatusNaarBouw7(vorige.sectie, vorige.substatus) : null
      if (verwachtLabel != null && huidigLabel !== verwachtLabel) {
        return {
          ok: false,
          error: `In Bouw7 staat inmiddels "${huidigLabel}" — daar is de substatus zojuist gewijzigd.`,
          conflict: { bouw7Label: huidigLabel },
        }
      }
    }

    // Eindstatussen trekken de projectstatus mee: Gewonnen → 02. Nieuwe opdracht, Verloren/Vervallen
    // → 08. Afgewezen (alleen als álle offertes van het project afgeketst zijn). In dezelfde POST als
    // het maatwerkveld, zodat status en substatus niet uit elkaar kunnen lopen.
    const prefix = await projectstatusPrefixVoor(client, bouw7Id, sectie, nieuweSubstatus)
    let statusId: number | null = null
    if (prefix) {
      const lijst = (await client.get<Bouw7ListResponse<Bouw7ProjectStatus>>('/list/project-statuses', { q: 'LIMIT 200' })).items ?? []
      statusId = lijst.find((s) => (s.name ?? '').trim().startsWith(prefix))?.id ?? null
      if (statusId == null) {
        return { ok: false, error: `Bouw7-projectstatus met prefix "${prefix}" niet gevonden.` }
      }
    }

    await client.post('/project', {
      id: Number(bouw7Id),
      type,
      customAttributeValues: mergeCustomAttributeValue(bestaand, attrId, nieuwLabel),
      ...(statusId != null ? { status: { id: statusId } } : {}),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.' }
  }
}

export type SubstatusVerversResult =
  | { ok: true; bijgewerkt: number }
  | { ok: false; error: string }

/**
 * Lichte verse read van álleen het gedeelde substatusveld — voor de Aanvragen-/Offertes-lijst en
 * -kanban, die bij openen de actuele stand moeten tonen ook als de andere app zojuist iets wijzigde.
 *
 * Eén `GET /list/projects` (het maatwerkveld komt daar plat in mee) en dan alleen een DB-update voor
 * de dossiers waar het veld gevuld is én afwijkt van wat EVA heeft staan. Dossiers met een leeg
 * maatwerkveld blijven op de bestaande, uit project-/offertestatus afgeleide substatus staan — die
 * blijft de gewone sync doen.
 *
 * Bewust niet in scope: servicedesk (eigen ladder) en opdracht (projectstatus is daar leidend).
 */
export async function ververseSubstatussen(
  scope?: SubstatusSectie,
): Promise<SubstatusVerversResult> {
  try {
    const supabase = createAdminClient()

    const { data: dossiers, error } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, hoofdstatus, aanvraag_substatus, offerte_substatus, verzonden_op')
      .not('bouw7_id', 'is', null)
      .is('servicedesk_substatus', null)
      .in('hoofdstatus', ['aanvraag', 'offerte'])

    if (error) return { ok: false, error: error.message }
    if (!dossiers?.length) return { ok: true, bijgewerkt: 0 }

    const client = await getBouw7Client()
    const projects = await fetchAllPages<Bouw7Project>(client, '/list/projects')
    const caMap = new Map(projects.map((p) => [String(p.id), p.caOfferteSubstatus ?? null]))

    let bijgewerkt = 0
    for (const d of dossiers) {
      // Huidige fase mee: bij "12. Verloren"/"13. Vervallen" blijft een afgewezen/vervallen
      // aanvraag op de Aanvragen-tab staan in plaats van naar Offertes te springen.
      const eva = bouw7SubstatusNaarEva(
        caMap.get(String(d.bouw7_id)),
        d.hoofdstatus === 'aanvraag' ? 'aanvraag' : 'offerte',
      )
      if (!eva) continue // leeg of onbekend label → oude afleiding laten staan

      // Alleen schrijven bij een echte afwijking; anders is dit een no-op per paginabezoek.
      const gelijk =
        d.hoofdstatus === eva.hoofdstatus
        && (d.aanvraag_substatus ?? null) === eva.aanvraag_substatus
        && (d.offerte_substatus ?? null) === eva.offerte_substatus
      if (gelijk) continue

      // Scope-filter: bij het openen van één lijst hoeven we alleen dossiers aan te raken die in
      // die lijst thuishoren of er juist uit vertrekken.
      if (scope && d.hoofdstatus !== scope && eva.hoofdstatus !== scope) continue

      const { error: updError } = await supabase
        .from('dossiers')
        .update({
          hoofdstatus:        eva.hoofdstatus,
          aanvraag_substatus: eva.aanvraag_substatus,
          offerte_substatus:  eva.offerte_substatus,
          opdracht_substatus: null,
          // Offertefase: `verzonden_op` stuurt de 7-daagse nazichtbaarheid op de Aanvragen-tab.
          ...(eva.hoofdstatus === 'offerte' && d.verzonden_op == null
            ? { verzonden_op: new Date().toISOString() }
            : {}),
        })
        .eq('id', d.id)

      if (updError) console.error(`[substatus-ververs] dossier ${d.id} niet bijgewerkt:`, updError.message)
      else bijgewerkt++
    }

    return { ok: true, bijgewerkt }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verversen van substatussen mislukt.' }
  }
}
