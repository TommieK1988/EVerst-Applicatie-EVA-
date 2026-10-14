import 'server-only'

/**
 * Wie keurt welke inkoopfactuur goed — Bouw7 of EVA — en welke EVA-route krijgt hij.
 *
 * Draait na elke inkoopfacturen-sync (`syncInkoopfacturen`). Drie taken:
 *  1. **Toewijzen.** Facturen met een Bouw7-approval zijn van Bouw7 (de oude keten maakt het daar
 *     af). Facturen die ná `inkoop_goedkeuring_eva_vanaf` in Bouw7 zijn aangemaakt, op status 0/1
 *     staan en géén approval hebben, krijgen een EVA-route. Zonder ingestelde datum doet EVA niets:
 *     zo verandert er niets tot de workflow in Bouw7 echt uit staat.
 *  2. **Vervallen.** Handelt iemand een EVA-factuur in Bouw7 af (status 2/4/5 of betaald), dan
 *     sluiten we de open stappen — niet stil, maar met een gebeurtenis.
 *  3. **Herhalen.** Een besluit waarvan de Bouw7-write mislukte, proberen we opnieuw.
 *
 * Bewust geen melding per factuur: inkoopfacturen komen in bulk (zie de sync-toelichting). De
 * teller op de startpagina en het tabblad "Te accorderen door mij" zijn de ingang.
 */

import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database/types'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { schrijfBesluitNaarBouw7 } from '@/lib/bouw7/inkoopfactuur-besluit'
import { nlDelen } from '@/lib/planning/nl-tijd'
import {
  ALLE_DOSSIER_ROLLEN, DOSSIER_ROLLEN, STANDAARD_PROJECTROUTE, bepaalStappen, besluitRegel, kiesDossierRol,
  kiesGrootboek, korteDatumTijd, ontleedGrootboekNaam, regelVoorDivisie,
  type DossierRol, type GoedkeurRegel, type ProjectRoute,
} from './goedkeur-route'
import type { Bouw7Client } from '@/lib/bouw7/client'

const db = () => createAdminClient()

/** Hoeveel nieuwe facturen één run hooguit toewijst (elk kost één Bouw7-detailcall). */
const MAX_TOEWIJZEN = 100
const MAX_HERHALEN = 20

export async function getEvaVanaf(): Promise<string | null> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.inkoop_goedkeuring_eva_vanaf
  return typeof v === 'string' && v ? v : null
}

export async function getGoedkeurRegels(): Promise<GoedkeurRegel[]> {
  const { data } = await db()
    .from('inkoop_goedkeur_regels')
    .select('divisie_bouw7_id, terugval_goedkeurder_id, drempel_excl, drempel_goedkeurder_id')
  return (data ?? []).map(r => ({ ...r, drempel_excl: r.drempel_excl == null ? null : Number(r.drempel_excl) }))
}

export async function medewerkerNaam(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data: m } = await db().from('medewerkers').select('voornaam, tussenvoegsel, achternaam').eq('id', id).maybeSingle()
  return m ? [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') : null
}

export async function logGebeurtenis(
  inkoopfactuurId: string, actie: string, medewerkerId: string | null, detail: Record<string, unknown> = {},
): Promise<void> {
  await db().from('inkoopfactuur_gebeurtenissen').insert({ inkoopfactuur_id: inkoopfactuurId, actie, medewerker_id: medewerkerId, detail: detail as Json })
}

/** De route voor projectfacturen; ontbreekt de rij, dan de standaard (alleen de projectleider). */
export async function getProjectRoute(): Promise<ProjectRoute> {
  const { data } = await db().from('inkoop_goedkeur_project').select('rollen, drempel_excl, drempel_goedkeurder_id').maybeSingle()
  if (!data) return STANDAARD_PROJECTROUTE
  const rollen = (data.rollen ?? []).filter((r): r is DossierRol => (ALLE_DOSSIER_ROLLEN as string[]).includes(r))
  return {
    rollen: rollen.length ? rollen : STANDAARD_PROJECTROUTE.rollen,
    drempel_excl: data.drempel_excl == null ? null : Number(data.drempel_excl),
    drempel_goedkeurder_id: data.drempel_goedkeurder_id,
  }
}

/** De dossierrollen, alleen gevuld met actieve medewerkers. */
async function dossierRollen(dossierId: string): Promise<Partial<Record<DossierRol, string | null>>> {
  const kolommen = ALLE_DOSSIER_ROLLEN.map(r => DOSSIER_ROLLEN[r].kolom)
  const { data: d } = await db().from('dossiers').select(kolommen.join(', ')).eq('id', dossierId).maybeSingle()
  if (!d) return {}
  const rij = d as unknown as Record<string, string | null>
  const ids = [...new Set(kolommen.map(k => rij[k]).filter((v): v is string => !!v))]
  const { data: ms } = ids.length
    ? await db().from('medewerkers').select('id, actief').in('id', ids)
    : { data: [] as { id: string; actief: boolean | null }[] }
  const actief = new Set((ms ?? []).filter(m => m.actief !== false).map(m => m.id))
  return Object.fromEntries(ALLE_DOSSIER_ROLLEN.map(r => {
    const id = rij[DOSSIER_ROLLEN[r].kolom]
    return [r, id && actief.has(id) ? id : null]
  }))
}

/** Goedkeurder per 4xxx-grootboeknummer (alleen overhead). */
export async function getGrootboekGoedkeurders(): Promise<Map<string, string>> {
  const { data } = await db().from('inkoop_goedkeur_grootboek').select('grootboek_nummer, goedkeurder_id')
  return new Map((data ?? []).map(r => [r.grootboek_nummer, r.goedkeurder_id]))
}

type Grootboekrekening = { id: number; code: string; name: string }

/**
 * GUID → "(4400) Autokosten …", per vestiging. Zonder `?branch=` geeft Bouw7 onze sleutel een lege
 * lijst (ENDPOINTS.md). Eén call per vestiging per run.
 */
export function maakGrootboekOpzoeker(bouw7: Bouw7Client): (branchId: number, guid: string) => Promise<string | null> {
  const perBranch = new Map<number, Promise<Map<string, string>>>()
  return async (branchId, guid) => {
    if (!perBranch.has(branchId)) {
      perBranch.set(branchId, bouw7.get<Grootboekrekening[]>(`/organization/general-ledger-accounts?branch=${branchId}`)
        .then(l => new Map((Array.isArray(l) ? l : []).map(g => [g.code, g.name])))
        .catch(() => new Map()))
    }
    return (await perBranch.get(branchId)!).get(guid) ?? null
  }
}

type Detail = {
  approval?: { id?: number } | null
  branch?: { id?: number } | null
  lines?: { ledger?: string | null; subTotal?: string | number | null }[]
}

/** Het grootboek dat de goedkeurder bepaalt: de 4xxx-rekening met het hoogste bedrag. */
async function grootboekVan(detail: Detail, zoek: (b: number, g: string) => Promise<string | null>): Promise<{ nummer: string; naam: string } | null> {
  const branch = detail.branch?.id
  if (branch == null) return null
  const regels = await Promise.all((detail.lines ?? []).filter(l => l.ledger).map(async l => {
    const volledig = await zoek(branch, l.ledger!)
    const { nummer, naam } = ontleedGrootboekNaam(volledig ?? '')
    return { nummer, naam, bedrag: Number(l.subTotal ?? 0) || 0 }
  }))
  return kiesGrootboek(regels)
}

type Kandidaat = {
  id: string; bouw7_invoice_id: string; dossier_id: string | null; divisie_bouw7_id: number | null; bedrag_excl: number | null
}

/** Maak de EVA-stappen aan voor één factuur en zet de eerste open. */
export async function maakRoute(
  f: Kandidaat,
  regels: GoedkeurRegel[],
  grootboek: { nummer: string; naam: string } | null = null,
  grootboekGoedkeurders: Map<string, string> = new Map(),
  projectRoute: ProjectRoute = STANDAARD_PROJECTROUTE,
): Promise<void> {
  const project = f.dossier_id
    ? { rol: kiesDossierRol(projectRoute.rollen, await dossierRollen(f.dossier_id)), route: projectRoute }
    : null
  const stappen = bepaalStappen({
    project,
    grootboekGoedkeurderId: grootboek ? grootboekGoedkeurders.get(grootboek.nummer) ?? null : null,
    bedragExcl: f.bedrag_excl == null ? null : Number(f.bedrag_excl),
    regel: regelVoorDivisie(regels, f.divisie_bouw7_id),
  })

  const { error } = await db().from('inkoop_goedkeur_stappen').insert(
    stappen.map((s, i) => ({ inkoopfactuur_id: f.id, ...s, status: i === 0 ? 'open' : 'wacht' })),
  )
  if (error) throw new Error(error.message)

  const eerste = stappen[0].goedkeurder_id
  await db().from('inkoopfacturen').update({
    goedkeuring_bron: 'eva',
    grootboek_nummer: grootboek?.nummer ?? null,
    grootboek_naam: grootboek?.naam ?? null,
    huidige_goedkeurder_id: eerste,
    huidige_goedkeurder_naam: await medewerkerNaam(eerste),
  }).eq('id', f.id)
  await logGebeurtenis(f.id, 'route_bepaald', null, { stappen, grootboek })
}

/**
 * De tekstregel voor Bouw7, opnieuw opgebouwd uit de vastgelegde stappen. Deterministisch, zodat
 * een herhaalde poging exact dezelfde regel oplevert en `voegRegelToe` hem niet dubbel schrijft.
 */
export async function bouwBesluitRegel(inkoopfactuurId: string): Promise<{ regel: string; besluit: 'goedgekeurd' | 'afgekeurd' } | null> {
  const { data: f } = await db().from('inkoopfacturen').select('eva_besluit, eva_besluit_op').eq('id', inkoopfactuurId).maybeSingle()
  if (!f?.eva_besluit || !f.eva_besluit_op) return null
  const { data: stappen } = await db()
    .from('inkoop_goedkeur_stappen')
    .select('stap, status, beoordeeld_door, toelichting')
    .eq('inkoopfactuur_id', inkoopfactuurId)
    .in('status', ['akkoord', 'bezwaar'])
    .order('stap', { ascending: true })
  const lijst = stappen ?? []
  const relevant = f.eva_besluit === 'afgekeurd' ? lijst.filter(s => s.status === 'bezwaar') : lijst
  const namen = (await Promise.all(relevant.map(s => medewerkerNaam(s.beoordeeld_door)))).filter((n): n is string => !!n)
  const { datum, tijd } = nlDelen(f.eva_besluit_op)
  return {
    besluit: f.eva_besluit as 'goedgekeurd' | 'afgekeurd',
    regel: besluitRegel({
      besluit: f.eva_besluit as 'goedgekeurd' | 'afgekeurd',
      namen: [...new Set(namen)],
      datumTijd: korteDatumTijd(datum, tijd),
      toelichting: relevant[relevant.length - 1]?.toelichting ?? null,
    }),
  }
}

/** Schrijf het EVA-besluit naar Bouw7 en leg de uitkomst vast. */
export async function stuurBesluitNaarBouw7(inkoopfactuurId: string, medewerkerId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: f } = await db().from('inkoopfacturen').select('bouw7_invoice_id').eq('id', inkoopfactuurId).maybeSingle()
  const besluit = await bouwBesluitRegel(inkoopfactuurId)
  if (!f || !besluit) return { ok: false, error: 'Er is nog geen besluit om naar Bouw7 te sturen.' }

  const nu = new Date().toISOString()
  const res = await schrijfBesluitNaarBouw7(f.bouw7_invoice_id, besluit.besluit, besluit.regel)
  if (res.ok) {
    await db().from('inkoopfacturen').update({
      bouw7_bijgewerkt_op: nu,
      bouw7_status: besluit.besluit === 'goedgekeurd' ? 2 : 5,
      laatste_vote_op: nu,
      laatste_vote_fout: null,
    }).eq('id', inkoopfactuurId)
    await logGebeurtenis(inkoopfactuurId, 'bouw7_bijgewerkt', medewerkerId, { regel: besluit.regel })
  } else {
    await db().from('inkoopfacturen').update({ laatste_vote_op: nu, laatste_vote_fout: res.error }).eq('id', inkoopfactuurId)
    await logGebeurtenis(inkoopfactuurId, 'bouw7_mislukt', medewerkerId, { fout: res.error })
  }
  return res
}

export async function routeerInkoopfacturen(): Promise<{ toegewezen: number; vervallen: number; herhaald: number }> {
  const uit = { toegewezen: 0, vervallen: 0, herhaald: 0 }

  // 1a. Een Bouw7-keten bekend → Bouw7.
  await db().from('inkoopfacturen').update({ goedkeuring_bron: 'bouw7' })
    .is('goedkeuring_bron', null).not('bouw7_approval_id', 'is', null)

  // 1b. Nieuwe facturen zonder keten → EVA, alleen na de ingestelde startdatum.
  const vanaf = await getEvaVanaf()
  if (vanaf) {
    const { data: kandidaten } = await db()
      .from('inkoopfacturen')
      .select('id, bouw7_invoice_id, dossier_id, divisie_bouw7_id, bedrag_excl')
      .eq('status', 'open')
      .is('goedkeuring_bron', null)
      .in('bouw7_status', [0, 1])
      .gte('bouw7_aangemaakt_op', vanaf)
      .order('bouw7_aangemaakt_op', { ascending: true })
      .limit(MAX_TOEWIJZEN)
    const lijst = (kandidaten ?? []) as Kandidaat[]
    if (lijst.length > 0) {
      const bouw7 = await getBouw7Client()
      const regels = await getGoedkeurRegels()
      const grootboekGoedkeurders = await getGrootboekGoedkeurders()
      const projectRoute = await getProjectRoute()
      const zoekGrootboek = maakGrootboekOpzoeker(bouw7)
      for (const f of lijst) {
        try {
          // Het approval-object staat alleen op het detail. Heeft Bouw7 tóch een keten aangemaakt
          // (workflow nog aan), dan blijft de factuur van Bouw7 — nooit twee goedkeurders tegelijk.
          const detail = await bouw7.get<Detail>(
            `/purchase-invoicing/purchase-invoice/${f.bouw7_invoice_id}`,
          )
          if (detail?.approval?.id != null) {
            await db().from('inkoopfacturen')
              .update({ goedkeuring_bron: 'bouw7', bouw7_approval_id: String(detail.approval.id) })
              .eq('id', f.id)
            continue
          }
          await maakRoute(f, regels, await grootboekVan(detail, zoekGrootboek), grootboekGoedkeurders, projectRoute)
          uit.toegewezen++
        } catch {
          // Volgende run opnieuw; één factuur mag de rest niet tegenhouden.
        }
      }
    }
  }

  // 2. Buiten EVA om afgehandeld → open stappen vervallen.
  const { data: weg } = await db()
    .from('inkoopfacturen')
    .select('id, bouw7_status, status')
    .eq('goedkeuring_bron', 'eva')
    .is('eva_besluit', null)
    .or('status.eq.afgehandeld,bouw7_status.not.in.(0,1)')
    .limit(500)
  for (const f of (weg ?? []) as { id: string; bouw7_status: number | null; status: string }[]) {
    const { data: gesloten } = await db().from('inkoop_goedkeur_stappen')
      .update({ status: 'vervallen', updated_at: new Date().toISOString() })
      .eq('inkoopfactuur_id', f.id).in('status', ['open', 'wacht']).select('id')
    await db().from('inkoopfacturen').update({ huidige_goedkeurder_id: null, huidige_goedkeurder_naam: null }).eq('id', f.id)
    if ((gesloten ?? []).length > 0) {
      await logGebeurtenis(f.id, 'vervallen', null, { bouw7_status: f.bouw7_status, status: f.status })
      uit.vervallen++
    }
  }

  // 3. Besluit genomen, Bouw7 nog niet bijgewerkt → opnieuw.
  const { data: open } = await db()
    .from('inkoopfacturen')
    .select('id')
    .eq('goedkeuring_bron', 'eva')
    .not('eva_besluit', 'is', null)
    .is('bouw7_bijgewerkt_op', null)
    .eq('status', 'open')
    .limit(MAX_HERHALEN)
  for (const f of (open ?? []) as { id: string }[]) {
    await stuurBesluitNaarBouw7(f.id, null)
    uit.herhaald++
  }

  return uit
}
