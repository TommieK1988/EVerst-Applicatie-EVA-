import 'server-only'
import { createAdminClient } from '@everts/database/server'
import {
  leesBouw7Contract, verwijderBouw7Contract, verwijderBouw7ContractLeverbonnen,
  type ContractSoort,
} from '@/lib/bouw7/contracten'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'

export type IntrekResultaat = { ok: true } | { ok: false; error: string }

/**
 * Een inkooporder of OA-contract intrekken: de leverbon(nen) en het contract in Bouw7 verwijderen
 * en een eventuele EVA-bestelling terugzetten op concept.
 *
 * Werkt voor élk contract op het project — ook een dat al verstuurd en afgeroepen is, en ook een
 * dat iemand rechtstreeks in Bouw7 maakte (dan is er geen EVA-rij). De partij en het project voor
 * de verwijder-body komen daarom uit het contract zelf, niet uit de EVA-bestelling.
 *
 * Volgorde is dwingend: een bestelregel die aan een contracttermijn hangt is niet verwijderbaar,
 * en een bon die blijft staan telt door als kosten op de bewakingscode. Zit er op een bon al een
 * inkoopfactuur, dan weigert `verwijderBouw7ContractLeverbonnen` — dat moet in Bouw7 worden
 * afgehandeld, en dan blijft het contract ook staan.
 *
 * Geen mail naar de partij: wie intrekt, belt of mailt die zelf. Alleen de aanroeper checkt
 * rechten; dit is de gedeelde kern achter twee server actions.
 */
export async function trekContractInKern(
  dossierId: string,
  soort: ContractSoort,
  contractId: number,
  doorMedewerkerId: string | null,
): Promise<IntrekResultaat> {
  const db = createAdminClient()

  const { data: dossier } = await db.from('dossiers').select('bouw7_id').eq('id', dossierId).maybeSingle()
  const projectId = dossier?.bouw7_id != null ? Number(dossier.bouw7_id) : NaN
  if (!Number.isFinite(projectId)) return { ok: false, error: 'Dit dossier heeft geen Bouw7-koppeling.' }

  let detail: Record<string, unknown>
  try {
    detail = await leesBouw7Contract(soort, contractId)
  } catch (e) {
    return { ok: false, error: `Contract niet gevonden in Bouw7 (${e instanceof Error ? e.message : 'onbekende fout'}).` }
  }

  // Het contract moet echt bij dit dossier horen: anders kan een gemanipuleerde aanroep elk
  // contract van elk project laten verwijderen.
  const project = detail.project as { id?: number } | undefined
  if (Number(project?.id) !== projectId) return { ok: false, error: 'Dit contract hoort niet bij dit dossier.' }

  const partij = (soort === 'oa_contract' ? detail.subcontractor : detail.supplier) as { id?: number } | undefined
  const relatieBouw7Id = Number(partij?.id)
  if (!Number.isFinite(relatieBouw7Id)) return { ok: false, error: 'Kan het contract niet intrekken: de partij ontbreekt in Bouw7.' }

  const bonRes = await verwijderBouw7ContractLeverbonnen(soort, contractId)
  if (!bonRes.ok) return { ok: false, error: `De leverbon(nen) kunnen niet verwijderd worden (${bonRes.error}).` }

  const res = await verwijderBouw7Contract(soort, contractId, { projectId, relatieBouw7Id, bedrag: '0.00' })
  if (!res.ok) return { ok: false, error: res.error }

  // De EVA-bestelling (als die er is) terug op concept: de regels zijn weer bestelbaar. Wie en
  // wanneer blijft staan, zodat te zien is dat deze opdracht al eens bij de partij lag.
  const nu = new Date().toISOString()
  await db.from('werkbegroting_bestellingen')
    .update({
      status: 'concept', verzonden_op: null,
      verstuurd_op: null, verstuurd_door: null, verstuurd_naar: null,
      bouw7_contract_id: null, bouw7_nummer: null,
      bouw7_leverbon_id: null, bouw7_bonnummer: null, bouw7_afroep_op: null,
      bouw7_sync_status: null, bouw7_sync_fout: null, bouw7_verwijderd_op: null,
      bouw7_gesynct_op: nu,
      ingetrokken_op: nu, ingetrokken_door: doorMedewerkerId,
    })
    .eq('bouw7_contract_id', contractId)

  // Het contract is in Bouw7 verwijderd; zonder verversing blijft het op het Inkoop-tab staan.
  await ververSnapshotsNaSchrijven(
    dossierId,
    ['inkooporders', 'oa_contracten'],
    ['heimdall_inkoopfacturen', 'apollo_inkoopfacturen', 'athena_control'],
  )
  // De servicedeskbon blijft staan waar hij staat. Tot oktober 2026 ging hij terug van "Uitgezet";
  // die kolom is opgegaan in In voorbereiding, en daar hoort een bon na een ingetrokken opdracht
  // ook: het werk moet opnieuw geregeld worden. Terug naar Nieuw zou wegpoetsen dat de offerte al
  // gewonnen of het mandaat al goedgekeurd is.
  return { ok: true }
}
