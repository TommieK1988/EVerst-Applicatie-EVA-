'use server'

/**
 * Server-acties achter het goedkeurscherm van inkoopfacturen: de bewakingscode van een factuur
 * bekijken en wijzigen.
 *
 * De bewakingscode hangt niet op de factuur maar op de **leverbon** eronder. Wijzigen loopt daarom
 * via de bestaande hercodeerroute van het Inkoop-tab (`hercodeerGeboekteKost`), met dezelfde regels:
 * niet bij een kost die via een inkooporder/OA-contract aan zijn code hangt, en de doelcode moet
 * een bewakingslink hebben voor de kostensoort van de bon. Facturen zónder leverbon kunnen (nog)
 * niet aan een project worden gekoppeld — dat vraagt een nieuwe leverbon in Bouw7 en is nog niet
 * getest (zie WRITE-ENDPOINTS §7c).
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { getDossierInkoop, hercodeerGeboekteKost } from '@/lib/dossiers/actions'
import { vereisInkoopfactuurToegang } from './actions'
import { logGebeurtenis } from './route'

const db = () => createAdminClient()

export type BewakingscodeOptie = { code: string; naam: string | null; hoofdstukId: number | null; hoofdstukNaam: string | null }

export type BewakingscodeKeuze = {
  huidig: { code: string | null; naam: string | null }
  opties: BewakingscodeOptie[]
  /** Null = wijzigen kan; anders de reden waarom niet, in gewone taal. */
  nietWijzigbaar: string | null
}

async function factuurMetDossier(inkoopfactuurId: string) {
  const { data } = await db().from('inkoopfacturen')
    .select('dossier_id, bouw7_invoice_id, bewakingscode, bewakingscode_naam')
    .eq('id', inkoopfactuurId).maybeSingle()
  return data
}

export async function getBewakingscodeKeuze(inkoopfactuurId: string): Promise<BewakingscodeKeuze> {
  await vereisRecht('inkoopfacturen', 'lezen')
  await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
  const f = await factuurMetDossier(inkoopfactuurId)
  const huidig = { code: f?.bewakingscode ?? null, naam: f?.bewakingscode_naam ?? null }
  if (!f?.dossier_id) return { huidig, opties: [], nietWijzigbaar: 'Deze factuur hangt niet aan een dossier.' }

  const inkoop = await getDossierInkoop(f.dossier_id)
  const rij = inkoop.geboekteKosten.find(r => String(r.bronId) === String(f.bouw7_invoice_id))
  const opties = inkoop.projectcodes.map(c => ({ code: c.code, naam: c.naam, hoofdstukId: c.hoofdstukId, hoofdstukNaam: c.hoofdstukNaam }))
  const nietWijzigbaar =
    !rij ? 'Deze factuur staat (nog) niet bij de geboekte kosten van het dossier.'
    : rij.bonId == null ? 'Deze factuur heeft geen leverbon in Bouw7, dus er is geen bewakingscode om te wijzigen.'
    : rij.contractGebonden ? 'Deze kost hangt aan een inkooporder of OA-contract; daar bepaalt het contract de bewakingscode.'
    : null
  return { huidig, opties, nietWijzigbaar }
}

export async function wijzigInkoopBewakingscode(
  inkoopfactuurId: string,
  code: string,
  hoofdstukId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'schrijven')
    await vereisInkoopfactuurToegang(inkoopfactuurId, 'schrijven')
    const f = await factuurMetDossier(inkoopfactuurId)
    if (!f?.dossier_id) return { ok: false, error: 'Deze factuur hangt niet aan een dossier.' }

    const res = await hercodeerGeboekteKost(f.dossier_id, Number(f.bouw7_invoice_id), code, hoofdstukId)
    if (!res.ok) return res

    // Naam en hoofdstuk voor de lijst; de sync zou ze anders pas bij de volgende run bijwerken.
    const inkoop = await getDossierInkoop(f.dossier_id)
    const nieuw = inkoop.projectcodes.find(c => c.code === code && (hoofdstukId == null || c.hoofdstukId === hoofdstukId))
    await db().from('inkoopfacturen')
      .update({ bewakingscode: code, bewakingscode_naam: nieuw?.naam ?? null, bewakingscode_hoofdstuk: nieuw?.hoofdstukNaam ?? null })
      .eq('id', inkoopfactuurId)
    await logGebeurtenis(inkoopfactuurId, 'bewakingscode_gewijzigd', medewerker.id, { van: f.bewakingscode, naar: code })

    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Wijzigen mislukt.' }
  }
}
