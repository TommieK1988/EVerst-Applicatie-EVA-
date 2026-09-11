'use server'

import { losseTabel, tekst, tekstOfNull, type LosseTabelClient, type Rij } from '@/lib/supabase/losse-tabel'
import { vereisRecht, vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import { naarKaart, bepaalBtw, type BtwAfwijking, type BtwUitkomst } from '@/lib/houtrotherstel/btw'

/**
 * Afwijkende btw-tarieven per houtrot-werkzaamheid, op dossier- en
 * opdrachtgeverniveau. Server actions omdat `public.*` niet leesbaar is vanuit de
 * op `houtrotherstel` gescope browserclient, en omdat de resolver de eenheidsprijs
 * (`paint_items`) nodig heeft.
 */

/** Eén werkzaamheid zoals het instelscherm hem toont. */
export interface WerkzaamheidBtw {
  recept_id: string
  code: string
  naam: string
  /** Het tarief dat nu geldt. */
  tarief_id: string | null
  pct: number
  herkomst: BtwUitkomst['herkomst']
  /** Wat er zou gelden zónder de afwijking op dit niveau — voor "terug naar standaard". */
  standaard_pct: number
  /** Komt deze werkzaamheid voor in dit dossier? Stuurt de "alleen gebruikte"-filter. */
  gebruikt: boolean
}

export interface HoutrotBtwScherm {
  tarieven: BtwTariefKeuze[]
  werkzaamheden: WerkzaamheidBtw[]
  /** Naam van de opdrachtgever, of null wanneer het dossier er geen heeft. */
  opdrachtgever: { id: string; naam: string } | null
}


/** Afwijkingen van één niveau. */
async function laadAfwijkingen(
  supabase: LosseTabelClient,
  kolom: 'dossier_id' | 'relatie_id',
  id: string | null,
): Promise<BtwAfwijking[]> {
  if (!id) return []
  const { data } = await supabase
    .from('houtrot_btw_tarieven')
    .select('recept_id, btw_tarief_id')
    .eq(kolom, id)
  return (data ?? []).map((r: Rij) => ({
    recept_id: tekst(r, 'recept_id'),
    btw_tarief_id: tekst(r, 'btw_tarief_id'),
  }))
}

/** De recepten (eenheidsprijzen) die in dit dossier daadwerkelijk gebruikt zijn. */
async function receptenVanDossier(dossierId: string): Promise<Set<string>> {
  const { createHoutrotAdminClient } = await import('@/lib/houtrotherstel/supabase/admin')
  const houtrot = createHoutrotAdminClient() as unknown as LosseTabelClient
  const { data: regs } = await houtrot
    .from('repair_registrations')
    .select('id')
    .eq('dossier_id', dossierId)
    .is('gearchiveerd_op', null)
  const ids = (regs ?? []).map((r: Rij) => tekst(r, 'id')).filter(Boolean)
  if (ids.length === 0) return new Set()
  const { data: regels } = await houtrot
    .from('repair_registration_lines')
    .select('recept_id')
    .in('registration_id', ids)
  return new Set((regels ?? []).map((l: Rij) => tekst(l, 'recept_id')).filter(Boolean))
}

/** Eén recept zoals het instelscherm hem nodig heeft. */
interface ReceptRij { id: string; code: string; naam: string; basisCode: string | null }

/** Alle houtrot-recepten: die met een groep, zoals de app ze aanbiedt. */
async function laadHoutrotRecepten(
  supabase: LosseTabelClient,
  extra: Set<string>,
): Promise<ReceptRij[]> {
  const { data } = await supabase
    .from('paint_items')
    .select('id, item_code, full_name, onderdeel, btw_tarief, groep, active')
    .eq('active', true)
    .order('item_code')
  return (data ?? [])
    .filter((it: Rij) => !!tekst(it, 'groep') || extra.has(tekst(it, 'id')))
    .map((it: Rij) => ({
      id: tekst(it, 'id'),
      code: tekst(it, 'item_code'),
      naam: tekst(it, 'full_name') || tekst(it, 'onderdeel') || tekst(it, 'item_code'),
      basisCode: tekstOfNull(it, 'btw_tarief'),
    }))
}

/**
 * Het instelscherm voor één dossier: alle houtrot-werkzaamheden met het tarief dat
 * nu geldt en waar dat vandaan komt.
 */
export async function laadDossierBtw(dossierId: string): Promise<HoutrotBtwScherm> {
  await vereisSessie()
  const supabase = losseTabel()

  const [tarieven, gebruikt] = await Promise.all([laadBtwTarieven(), receptenVanDossier(dossierId)])

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant_id, relaties:klant_id ( id, naam )')
    .eq('id', dossierId)
    .maybeSingle()
  const klantId = tekstOfNull(dossier, 'klant_id')
  const klantRij = (dossier?.relaties ?? null) as Rij | null

  const [recepten, opDossier, opKlant] = await Promise.all([
    laadHoutrotRecepten(supabase, gebruikt),
    laadAfwijkingen(supabase, 'dossier_id', dossierId),
    laadAfwijkingen(supabase, 'relatie_id', klantId),
  ])

  const dossierKaart = naarKaart(opDossier)
  const klantKaart = naarKaart(opKlant)
  const leeg = new Map<string, string>()

  const werkzaamheden: WerkzaamheidBtw[] = recepten.map(it => {
    const nu = bepaalBtw({
      receptId: it.id, basisCode: it.basisCode,
      dossier: dossierKaart, opdrachtgever: klantKaart, tarieven,
    })
    // Zonder de dossier-afwijking: dat is waar "standaard" op terugvalt.
    const zonder = bepaalBtw({
      receptId: it.id, basisCode: it.basisCode,
      dossier: leeg, opdrachtgever: klantKaart, tarieven,
    })
    return {
      recept_id: it.id,
      code: it.code,
      naam: it.naam,
      tarief_id: nu.tarief?.id ?? null,
      pct: nu.pct,
      herkomst: nu.herkomst,
      standaard_pct: zonder.pct,
      gebruikt: gebruikt.has(it.id),
    }
  })

  return {
    tarieven,
    werkzaamheden,
    opdrachtgever: klantRij ? { id: tekst(klantRij, 'id'), naam: tekst(klantRij, 'naam') } : null,
  }
}

/** Hetzelfde scherm voor één opdrachtgever; hier is de eenheidsprijs de standaard. */
export async function laadRelatieBtw(relatieId: string): Promise<HoutrotBtwScherm> {
  await vereisSessie()
  const supabase = losseTabel()

  const [tarieven, recepten, opKlant] = await Promise.all([
    laadBtwTarieven(),
    laadHoutrotRecepten(supabase, new Set<string>()),
    laadAfwijkingen(supabase, 'relatie_id', relatieId),
  ])

  const klantKaart = naarKaart(opKlant)
  const leeg = new Map<string, string>()

  const werkzaamheden: WerkzaamheidBtw[] = recepten.map(it => {
    const nu = bepaalBtw({
      receptId: it.id, basisCode: it.basisCode, dossier: leeg, opdrachtgever: klantKaart, tarieven,
    })
    const zonder = bepaalBtw({
      receptId: it.id, basisCode: it.basisCode, dossier: leeg, opdrachtgever: leeg, tarieven,
    })
    return {
      recept_id: it.id,
      code: it.code,
      naam: it.naam,
      tarief_id: nu.tarief?.id ?? null,
      pct: nu.pct,
      herkomst: nu.herkomst,
      standaard_pct: zonder.pct,
      // Bij een opdrachtgever is er geen dossier om "in gebruik" aan af te meten.
      gebruikt: false,
    }
  })

  return { tarieven, werkzaamheden, opdrachtgever: null }
}

/**
 * Zet of wist één afwijking. `tariefId = null` verwijdert hem, waarmee het niveau
 * eronder het weer overneemt — dat is wat "terug naar standaard" doet.
 */
async function zetAfwijking(
  kolom: 'dossier_id' | 'relatie_id',
  id: string,
  receptId: string,
  tariefId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = losseTabel()

  if (!tariefId) {
    const { error } = await supabase
      .from('houtrot_btw_tarieven')
      .delete()
      .eq(kolom, id)
      .eq('recept_id', receptId)
    return error ? { ok: false, error: error.message } : { ok: true }
  }

  // Bewust géén upsert: de unieke indexen zijn partieel (`where dossier_id is not
  // null`), en daar kan ON CONFLICT niet naar wijzen — PostgREST antwoordde dan met
  // "no unique or exclusion constraint matching the ON CONFLICT specification".
  // Eerst weg, dan erin: de partiële index blijft het vangnet tegen dubbelen.
  await supabase.from('houtrot_btw_tarieven').delete().eq(kolom, id).eq('recept_id', receptId)

  const { error } = await supabase
    .from('houtrot_btw_tarieven')
    .insert({
      [kolom]: id,
      recept_id: receptId,
      btw_tarief_id: tariefId,
      updated_at: new Date().toISOString(),
    })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function zetDossierBtw(
  dossierId: string,
  receptId: string,
  tariefId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('dossiers')
  await assertDossierBewerkbaar(dossierId)
  return zetAfwijking('dossier_id', dossierId, receptId, tariefId)
}

export async function zetRelatieBtw(
  relatieId: string,
  receptId: string,
  tariefId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('relaties')
  return zetAfwijking('relatie_id', relatieId, receptId, tariefId)
}
