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
import { INKOOP_STATUS_BETAALBAAR } from '@/lib/bouw7/inkoop-status'
import { dagenTotVervaldatum, type InkoopfactuurRij } from './types'

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
  'bewakingscode', 'bewakingscode_naam',
  'huidige_goedkeurder_naam', 'huidige_goedkeurder_id', 'bouw7_approval_id',
  'markering_betalen', 'betalen_op',
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

  // Route-sectie van het dossier erbij — één query, geen N+1.
  //
  // Dit moet uit `hoofdstatus`/`servicedesk_substatus` komen, niet uit de Bouw7-velden: de
  // link moet naar de route wijzen waar het dossier daadwerkelijk woont. Een aanvraag zit
  // onder /aanvragen, en die bestaat niet onder /opdrachten. Zelfde afleiding als
  // `toContext()` in lib/dossiers/actief.ts.
  const SECTIE: Record<string, InkoopfactuurRij['dossier_sectie']> = {
    aanvraag: 'aanvragen', offerte: 'offertes', opdracht: 'opdrachten',
  }
  const dossierIds = [...new Set(rijen.map(r => r.dossier_id).filter((v): v is string => !!v))]
  const dossierSectie = new Map<string, InkoopfactuurRij['dossier_sectie']>()
  for (let i = 0; i < dossierIds.length; i += 500) {
    const { data } = await supabase
      .from('dossiers')
      .select('id, hoofdstatus, servicedesk_substatus')
      .in('id', dossierIds.slice(i, i + 500))
    for (const d of (data ?? []) as { id: string; hoofdstatus: string | null; servicedesk_substatus: string | null }[]) {
      dossierSectie.set(d.id, d.servicedesk_substatus ? 'servicedesk' : (SECTIE[d.hoofdstatus ?? ''] ?? null))
    }
  }

  const vandaag = new Date()
  const uit: InkoopfactuurRij[] = rijen.map(r => {
    const rij = r as unknown as InkoopfactuurRij
    return {
      ...rij,
      dossier_sectie: rij.dossier_id ? dossierSectie.get(rij.dossier_id) ?? null : null,
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

// ── Betalen-markering ────────────────────────────────────────────────────────
// Bewust minimaal. Directie zet een vinkje; wie de betaling doet filtert daarop en werkt de
// lijst af in Exact. Geen rondes, geen levenscyclus — dat bleek bij het eerste gebruik meer
// administratie dan de vraag rechtvaardigde.

/**
 * Markeer facturen als "betalen" (of haal de markering weg).
 *
 * Alleen goedgekeurde, nog niet betaalde facturen kunnen worden aangemerkt: een factuur die nog
 * ter goedkeuring ligt hoort niet op de betaallijst, hoe graag iemand ook wil betalen.
 * De markering weghalen mag altijd — anders zit een vergissing muurvast.
 */
export async function markeerBetalen(
  inkoopfactuurIds: string[],
  aan: boolean,
): Promise<ActieResultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'beheren')
    if (inkoopfactuurIds.length === 0) return { ok: false, error: 'Geen facturen geselecteerd.' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    const { data: facturen } = await supabase
      .from('inkoopfacturen')
      .select('id, bouw7_status, datum_betaald, factuurnummer')
      .in('id', inkoopfactuurIds)

    type F = { id: string; bouw7_status: number | null; datum_betaald: string | null; factuurnummer: string | null }
    const lijst = (facturen ?? []) as F[]

    if (aan) {
      const geweigerd = lijst.filter(f => f.bouw7_status !== INKOOP_STATUS_BETAALBAAR || f.datum_betaald)
      if (geweigerd.length > 0) {
        const namen = geweigerd.slice(0, 3).map(f => f.factuurnummer ?? f.id).join(', ')
        const meer = geweigerd.length > 3 ? ` en ${geweigerd.length - 3} andere` : ''
        return {
          ok: false,
          error: `Alleen goedgekeurde, nog niet betaalde facturen kunnen op de betaallijst. Overgeslagen: ${namen}${meer}.`,
        }
      }
    }

    const ids = lijst.map(f => f.id)
    const { error } = await supabase
      .from('inkoopfacturen')
      .update({
        markering_betalen: aan,
        betalen_op:   aan ? new Date().toISOString() : null,
        betalen_door: aan ? medewerker.id : null,
      })
      .in('id', ids)
    if (error) return { ok: false, error: error.message }

    await supabase.from('inkoopfactuur_gebeurtenissen').insert(
      ids.map(id => ({
        inkoopfactuur_id: id,
        actie: aan ? 'betalen_aan' : 'betalen_uit',
        medewerker_id: medewerker.id,
      }))
    )

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
  magLezen: boolean; magAccorderen: boolean; magBetalen: boolean; allesZien: boolean
}> {
  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker ?? undefined)
  return {
    magLezen:      heeftModuleToegang(rechten, 'inkoopfacturen', 'lezen'),
    magAccorderen: heeftModuleToegang(rechten, 'inkoopfacturen', 'schrijven'),
    magBetalen: heeftModuleToegang(rechten, 'inkoopfacturen', 'beheren'),
    allesZien:     heeftModuleToegang(rechten, 'inkoopfacturen_alle', 'lezen'),
  }
}
