'use server'

/**
 * Server-actions voor de inkoopfacturen-module.
 *
 * **De scope staat hier, niet in de client.** Anders dan bij debiteuren — waar de Mijn/Alle-knop
 * een zachte filter is over data die iedereen mag zien — is niet-zien hier een harde eis: de
 * facturen zónder project zijn overhead (leasecontracten, abonnementen, juridisch, verzekeringen).
 * Daarom:
 *   * `getInkoopfacturen` bouwt de scope in de Supabase-query, niet in React;
 *   * elke actie op één factuur begint met `vereisInkoopfactuurToegang(id)`, die de rij ophaalt
 *     en de scope hertoetst. Een id dat van de client komt is nooit een bewijs van toegang.
 *
 * De scope-regel: wie het recht `inkoopfacturen_alle` niet heeft, ziet facturen mét een
 * Bouw7-project (opdrachten én servicedesk) plus de facturen waarvan hij zélf de goedkeurder is.
 * Die tweede helft is nodig omdat een goedkeurder ook overheadfacturen toegewezen kan krijgen —
 * zonder die uitzondering kan hij zijn eigen werk niet doen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import {
  vereisRecht, getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang,
  GeenToegangError, type CurrentMedewerker,
} from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { isServicedeskDossier } from '@/components/dossiers/types'
import { INKOOP_STATUS_BETAALBAAR } from '@/lib/bouw7/inkoop-status'
import { dagenTotVervaldatum, type InkoopfactuurRij, type BetaalrondeRij } from './types'

export type ActieResultaat = { ok: true } | { ok: false; error: string }

// Newlines eruit: PostgREST krijgt de select als query-parameter, en losse witruimte
// daarin is vragen om moeilijkheden.
const LIJST_SELECT = [
  'id', 'bouw7_invoice_id', 'factuurnummer', 'betalingskenmerk', 'boekstuknummer',
  'bouw7_status', 'status',
  'leverancier_naam', 'leverancier_type',
  'bouw7_project_id', 'project_naam', 'project_nummer', 'dossier_id',
  'divisie_naam', 'divisie_exact_id', 'journaalcode_inkoop', 'vestiging_naam',
  'bedrag_excl', 'btw_bedrag', 'bedrag_incl', 'factuurdatum', 'vervaldatum', 'datum_betaald',
  'bouw7_opmerking', 'ordernummer', 'bon_nummer', 'is_geboekt_in_exact', 'keten_verloopt_op',
  'huidige_goedkeurder_naam', 'huidige_goedkeurder_id', 'bouw7_approval_id', 'betaalronde_id',
].join(',')

/** De ingelogde medewerker + of hij de volledige scope mag zien. */
async function scopeVoorGebruiker(min: 'lezen' | 'schrijven' | 'beheren' = 'lezen'): Promise<{
  medewerker: CurrentMedewerker
  allesZien: boolean
}> {
  const { medewerker, rechten } = await vereisRecht('inkoopfacturen', min)
  return { medewerker, allesZien: heeftModuleToegang(rechten, 'inkoopfacturen_alle', 'lezen') }
}

/**
 * Haalt de rij op en controleert dat de aanroeper hem mag zien. Gooit `GeenToegangError`.
 * Retourneert de rij zodat aanroepers geen tweede query hoeven te doen.
 */
export async function vereisInkoopfactuurToegang(
  inkoopfactuurId: string,
  min: 'lezen' | 'schrijven' | 'beheren' = 'lezen',
): Promise<{
  medewerker: CurrentMedewerker
  factuur: { id: string; bouw7_invoice_id: string; bouw7_project_id: string | null; bouw7_status: number | null; huidige_goedkeurder_id: string | null; bouw7_approval_id: string | null }
}> {
  const { medewerker, allesZien } = await scopeVoorGebruiker(min)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data } = await supabase
    .from('inkoopfacturen')
    .select('id, bouw7_invoice_id, bouw7_project_id, bouw7_status, huidige_goedkeurder_id, bouw7_approval_id')
    .eq('id', inkoopfactuurId)
    .maybeSingle()

  if (!data) throw new GeenToegangError('Inkoopfactuur niet gevonden')
  const magZien = allesZien
    || data.bouw7_project_id != null
    || data.huidige_goedkeurder_id === medewerker.id
  if (!magZien) throw new GeenToegangError('Geen toegang tot deze inkoopfactuur')

  return { medewerker, factuur: data }
}

export type InkoopfacturenData = {
  rijen: InkoopfactuurRij[]
  allesZien: boolean
  medewerkerId: string
  /** Hoeveel facturen op de ingelogde gebruiker wachten — de teller op het werkvoorraad-tabblad. */
  mijnBeurt: number
}

/**
 * Alle inkoopfacturen die de ingelogde gebruiker mag zien.
 *
 * Standaard alleen de nog niet afgehandelde facturen; `alles` haalt ook de historie op.
 */
export async function getInkoopfacturen(opts?: { alles?: boolean }): Promise<InkoopfacturenData> {
  const { medewerker, allesZien } = await scopeVoorGebruiker('lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Gepagineerd: `inkoopfacturen` staat nu op 559 rijen en groeit met honderden per jaar —
  // een kale select kapt straks stil af op 1000. Zie lib/supabase/paginate.ts.
  type Rij = Record<string, unknown> & { id: string; dossier_id: string | null }
  const rijen = await haalAlleRijen<Rij>((van, tot) => {
    let q = supabase.from('inkoopfacturen').select(LIJST_SELECT)
    if (!opts?.alles) q = q.eq('status', 'open')
    if (!allesZien) {
      q = q.or(`bouw7_project_id.not.is.null,huidige_goedkeurder_id.eq.${medewerker.id}`)
    }
    return q.order('id').range(van, tot)
  })

  // Dossiers erbij voor de sectie (opdracht vs servicedesk) — één query, geen N+1.
  const dossierIds = [...new Set(rijen.map(r => r.dossier_id).filter((v): v is string => !!v))]
  const dossierSectie = new Map<string, 'opdracht' | 'servicedesk'>()
  for (let i = 0; i < dossierIds.length; i += 500) {
    const { data } = await supabase
      .from('dossiers')
      .select('id, bouw7_projectstatus_naam, bouw7_categorie_naam')
      .in('id', dossierIds.slice(i, i + 500))
    for (const d of (data ?? []) as { id: string; bouw7_projectstatus_naam: string | null; bouw7_categorie_naam: string | null }[]) {
      dossierSectie.set(d.id, isServicedeskDossier(d) ? 'servicedesk' : 'opdracht')
    }
  }

  const betaalrondeNaam = new Map<string, string>()
  const rondeIds = [...new Set(rijen.map(r => r.betaalronde_id as string | null).filter((v): v is string => !!v))]
  if (rondeIds.length > 0) {
    const { data } = await supabase.from('betaalrondes').select('id, naam').in('id', rondeIds)
    for (const b of (data ?? []) as { id: string; naam: string }[]) betaalrondeNaam.set(b.id, b.naam)
  }

  const vandaag = new Date()
  const uit: InkoopfactuurRij[] = rijen.map(r => {
    const rij = r as unknown as InkoopfactuurRij
    return {
      ...rij,
      dossier_sectie: rij.dossier_id ? dossierSectie.get(rij.dossier_id) ?? null : null,
      betaalronde_naam: rij.betaalronde_id ? betaalrondeNaam.get(rij.betaalronde_id) ?? null : null,
      dagen_tot_vervaldatum: dagenTotVervaldatum(rij.vervaldatum, vandaag),
      mijn_beurt: rij.huidige_goedkeurder_id === medewerker.id,
    }
  })

  return {
    rijen: uit,
    allesZien,
    medewerkerId: medewerker.id,
    mijnBeurt: uit.filter(r => r.mijn_beurt).length,
  }
}

export type GoedkeurderStap = {
  id: string
  volgorde: number | null
  naam: string | null
  medewerker_id: string | null
  status: number | null
  besloten_op: string | null
  opmerking: string | null
}

export type OpmerkingRij = {
  id: string
  tekst: string
  naar_bouw7: boolean
  created_at: string
  medewerker_naam: string | null
}

export type InkoopfactuurDetail = {
  goedkeurders: GoedkeurderStap[]
  opmerkingen: OpmerkingRij[]
}

/** De goedkeuringsketen en de EVA-opmerkingenthread van één factuur. */
export async function getInkoopfactuurDetail(inkoopfactuurId: string): Promise<InkoopfactuurDetail> {
  await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data: stappen }, { data: opmerkingen }] = await Promise.all([
    supabase
      .from('inkoopfactuur_goedkeurders')
      .select('id, volgorde, naam, medewerker_id, status, besloten_op, opmerking')
      .eq('inkoopfactuur_id', inkoopfactuurId)
      .order('volgorde', { ascending: true }),
    supabase
      .from('inkoopfactuur_opmerkingen')
      .select('id, tekst, naar_bouw7, created_at, medewerkers:medewerker_id (voornaam, tussenvoegsel, achternaam)')
      .eq('inkoopfactuur_id', inkoopfactuurId)
      .order('created_at', { ascending: true }),
  ])

  type OpmerkingRuw = {
    id: string; tekst: string; naar_bouw7: boolean; created_at: string
    medewerkers?: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null
  }

  return {
    goedkeurders: (stappen ?? []) as GoedkeurderStap[],
    opmerkingen: ((opmerkingen ?? []) as OpmerkingRuw[]).map(o => ({
      id: o.id,
      tekst: o.tekst,
      naar_bouw7: o.naar_bouw7,
      created_at: o.created_at,
      medewerker_naam: o.medewerkers
        ? [o.medewerkers.voornaam, o.medewerkers.tussenvoegsel, o.medewerkers.achternaam].filter(Boolean).join(' ')
        : null,
    })),
  }
}

/**
 * Een vrije EVA-notitie bij een factuur. Gaat bewust NIET naar Bouw7: daar is per goedkeurder
 * maar één comment-veld en dat is de plek voor de akkoord-/afkeurreden. Een losse aantekening
 * zou die reden overschrijven.
 */
export async function plaatsInkoopfactuurOpmerking(
  inkoopfactuurId: string,
  tekst: string,
): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisInkoopfactuurToegang(inkoopfactuurId, 'schrijven')
    const schoon = tekst.trim()
    if (!schoon) return { ok: false, error: 'Een lege opmerking kan niet worden opgeslagen.' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    await supabase.from('inkoopfactuur_opmerkingen').insert({
      inkoopfactuur_id: inkoopfactuurId,
      medewerker_id: medewerker.id,
      tekst: schoon,
      naar_bouw7: false,
    })
    await supabase.from('inkoopfactuur_gebeurtenissen').insert({
      inkoopfactuur_id: inkoopfactuurId,
      actie: 'opmerking',
      medewerker_id: medewerker.id,
    })

    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

// ── Betaalrondes ─────────────────────────────────────────────────────────────
// Samenstellen is voorbehouden aan `beheren` (directie). Lezen/exporteren mag iedereen met
// `lezen`, binnen zijn eigen scope — het totaal dat hij ziet kan dus lager zijn dan het
// werkelijke rondetotaal. De UI zegt dat er expliciet bij.

export async function getBetaalrondes(): Promise<BetaalrondeRij[]> {
  const { allesZien, medewerker } = await scopeVoorGebruiker('lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: rondes } = await supabase
    .from('betaalrondes')
    .select('id, naam, betaaldatum, status, opmerking')
    .order('created_at', { ascending: false })

  const lijst = (rondes ?? []) as { id: string; naam: string; betaaldatum: string | null; status: string; opmerking: string | null }[]
  if (lijst.length === 0) return []

  let q = supabase
    .from('inkoopfacturen')
    .select('betaalronde_id, bedrag_incl')
    .in('betaalronde_id', lijst.map(r => r.id))
  if (!allesZien) {
    q = q.or(`bouw7_project_id.not.is.null,huidige_goedkeurder_id.eq.${medewerker.id}`)
  }
  const { data: regels } = await q

  const totalen = new Map<string, { n: number; som: number }>()
  for (const r of (regels ?? []) as { betaalronde_id: string; bedrag_incl: number | null }[]) {
    const t = totalen.get(r.betaalronde_id) ?? { n: 0, som: 0 }
    t.n += 1
    t.som += r.bedrag_incl ?? 0
    totalen.set(r.betaalronde_id, t)
  }

  return lijst.map(r => ({
    ...r,
    aantal_facturen: totalen.get(r.id)?.n ?? 0,
    totaal_incl: totalen.get(r.id)?.som ?? 0,
  }))
}

export async function maakBetaalronde(naam: string, betaaldatum: string | null): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'beheren')
    const schoon = naam.trim()
    if (!schoon) return { ok: false, error: 'Geef de betaalronde een naam.' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const { error } = await supabase.from('betaalrondes').insert({
      naam: schoon,
      betaaldatum: betaaldatum || null,
      aangemaakt_door: medewerker.id,
    })
    if (error) return { ok: false, error: error.message }

    revalidatePath('/inkoop/betaalrondes')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/**
 * Zet facturen in een betaalronde, of haal ze eruit (`betaalrondeId = null`).
 *
 * Twee harde regels:
 *  - alleen goedgekeurde, nog niet betaalde facturen mogen erin. Een factuur die nog ter
 *    goedkeuring ligt hoort niet in een betaalronde, hoe graag iemand ook wil betalen;
 *  - een afgeronde ronde is bevroren. Anders verandert achteraf waar de administratie
 *    haar betaalbestand op heeft gebaseerd.
 */
export async function zetBetaalronde(
  inkoopfactuurIds: string[],
  betaalrondeId: string | null,
): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'beheren')
    if (inkoopfactuurIds.length === 0) return { ok: false, error: 'Geen facturen geselecteerd.' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    if (betaalrondeId) {
      const { data: ronde } = await supabase
        .from('betaalrondes').select('id, status').eq('id', betaalrondeId).maybeSingle()
      if (!ronde) return { ok: false, error: 'Betaalronde niet gevonden.' }
      if (ronde.status === 'afgerond') {
        return { ok: false, error: 'Deze betaalronde is afgerond en kan niet meer worden gewijzigd.' }
      }
    }

    const { data: facturen } = await supabase
      .from('inkoopfacturen')
      .select('id, bouw7_status, datum_betaald, betaalronde_id, factuurnummer')
      .in('id', inkoopfactuurIds)

    type F = { id: string; bouw7_status: number | null; datum_betaald: string | null; betaalronde_id: string | null; factuurnummer: string | null }
    const lijst = (facturen ?? []) as F[]

    if (betaalrondeId) {
      const geweigerd = lijst.filter(f => f.bouw7_status !== INKOOP_STATUS_BETAALBAAR || f.datum_betaald)
      if (geweigerd.length > 0) {
        const namen = geweigerd.slice(0, 3).map(f => f.factuurnummer ?? f.id).join(', ')
        const meer = geweigerd.length > 3 ? ` en ${geweigerd.length - 3} andere` : ''
        return {
          ok: false,
          error: `Alleen goedgekeurde, nog niet betaalde facturen kunnen in een betaalronde. Geweigerd: ${namen}${meer}.`,
        }
      }
      // Al in een áfgeronde ronde? Dan niet verplaatsen.
      const bevroren = lijst.filter(f => f.betaalronde_id && f.betaalronde_id !== betaalrondeId)
      if (bevroren.length > 0) {
        const { data: rondes } = await supabase
          .from('betaalrondes').select('id, status')
          .in('id', [...new Set(bevroren.map(f => f.betaalronde_id))])
        const afgerond = new Set(
          ((rondes ?? []) as { id: string; status: string }[]).filter(r => r.status === 'afgerond').map(r => r.id)
        )
        if (bevroren.some(f => afgerond.has(f.betaalronde_id!))) {
          return { ok: false, error: 'Een of meer facturen zitten al in een afgeronde betaalronde.' }
        }
      }
    }

    const ids = lijst.map(f => f.id)
    const { error } = await supabase
      .from('inkoopfacturen')
      .update({
        betaalronde_id: betaalrondeId,
        betaalronde_op: betaalrondeId ? new Date().toISOString() : null,
        betaalronde_door: betaalrondeId ? medewerker.id : null,
      })
      .in('id', ids)
    if (error) return { ok: false, error: error.message }

    await supabase.from('inkoopfactuur_gebeurtenissen').insert(
      ids.map(id => ({
        inkoopfactuur_id: id,
        actie: betaalrondeId ? 'betaalronde_toegevoegd' : 'betaalronde_verwijderd',
        medewerker_id: medewerker.id,
        detail: { betaalronde_id: betaalrondeId },
      }))
    )

    revalidatePath('/inkoop/facturen')
    revalidatePath('/inkoop/betaalrondes')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/** Bevriest de samenstelling van een ronde: de administratie kan hem nu in Exact klaarzetten. */
export async function rondBetaalrondeAf(betaalrondeId: string): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'beheren')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    const { data: ronde } = await supabase
      .from('betaalrondes').select('id, status').eq('id', betaalrondeId).maybeSingle()
    if (!ronde) return { ok: false, error: 'Betaalronde niet gevonden.' }
    if (ronde.status === 'afgerond') return { ok: false, error: 'Deze betaalronde is al afgerond.' }

    const { error } = await supabase
      .from('betaalrondes')
      .update({ status: 'afgerond', vrijgegeven_op: new Date().toISOString(), vrijgegeven_door: medewerker.id })
      .eq('id', betaalrondeId)
    if (error) return { ok: false, error: error.message }

    const { data: regels } = await supabase
      .from('inkoopfacturen').select('id').eq('betaalronde_id', betaalrondeId)
    const ids = ((regels ?? []) as { id: string }[]).map(r => r.id)
    if (ids.length > 0) {
      await supabase.from('inkoopfactuur_gebeurtenissen').insert(
        ids.map(id => ({
          inkoopfactuur_id: id,
          actie: 'betaalronde_afgerond',
          medewerker_id: medewerker.id,
          detail: { betaalronde_id: betaalrondeId },
        }))
      )
    }

    revalidatePath('/inkoop/betaalrondes')
    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/** Ververs één factuur direct uit Bouw7 (knop in het paneel). */
export async function ververInkoopfactuur(inkoopfactuurId: string): Promise<ActieResultaat> {
  try {
    await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
    const { ververEenInkoopfactuur } = await import('@/lib/bouw7/sync-inkoopfacturen')
    await ververEenInkoopfactuur(inkoopfactuurId)
    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Verversen mislukt' }
  }
}

/** Handmatige sync-knop op het overzicht. */
export async function ververAlleInkoopfacturen(): Promise<ActieResultaat> {
  try {
    await vereisRecht('inkoopfacturen', 'lezen')
    const { syncInkoopfacturen } = await import('@/lib/bouw7/sync-inkoopfacturen')
    const res = await syncInkoopfacturen({ mode: 'incremental' })
    revalidatePath('/inkoop/facturen')
    return res.foutMelding ? { ok: false, error: res.foutMelding } : { ok: true }
  } catch (e: unknown) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Sync mislukt' }
  }
}

/** Ongebruikt hier, maar expliciet geëxporteerd zodat pagina's de rechten kunnen uitlezen. */
export async function getInkoopfacturenRechten(): Promise<{
  magLezen: boolean; magAccorderen: boolean; magBetaalronde: boolean; allesZien: boolean
}> {
  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker ?? undefined)
  return {
    magLezen:      heeftModuleToegang(rechten, 'inkoopfacturen', 'lezen'),
    magAccorderen: heeftModuleToegang(rechten, 'inkoopfacturen', 'schrijven'),
    magBetaalronde: heeftModuleToegang(rechten, 'inkoopfacturen', 'beheren'),
    allesZien:     heeftModuleToegang(rechten, 'inkoopfacturen_alle', 'lezen'),
  }
}
