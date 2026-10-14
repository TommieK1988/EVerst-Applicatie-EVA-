'use server'

/**
 * Inkoopfacturen goedkeuren in EVA (okt 2026).
 *
 * Alleen voor facturen met `goedkeuring_bron = 'eva'` — die krijgen hun route in `route.ts`.
 * Facturen met een Bouw7-keten worden in Bouw7 afgemaakt; daar staat in het paneel een doorklik.
 *
 * Wie mag beslissen over de open stap: de aangewezen goedkeurder, of iemand uit Directie (ook als
 * er niemand is aangewezen). Overdragen mag daarnaast de financiële administratie
 * (`inkoopfacturen: beheren`) — die moet een vastgelopen factuur bij iemand anders kunnen leggen,
 * maar geeft zelf geen akkoord namens een ander (besluit Tom, 14-10-2026). Na de laatste stap gaat het besluit naar Bouw7: eerst een tekstregel
 * met naam en tijdstip, dan de status — zie `lib/bouw7/inkoopfactuur-besluit.ts`.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, heeftModuleToegang, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { DIRECTIE_AFDELING } from '@/lib/goedkeuring/types'
import { vereisInkoopfactuurToegang } from './actions'
import { logGebeurtenis, medewerkerNaam, stuurBesluitNaarBouw7 } from './route'
import { maakBezwaarTaak } from './bezwaar-taak'
import type { GoedkeurStapSoort, GoedkeurStapStatus } from './goedkeur-route'

const db = () => createAdminClient()

export type Resultaat = { ok: true; melding?: string } | { ok: false; error: string }

export type EvaStap = {
  id: string
  stap: number
  soort: GoedkeurStapSoort
  status: GoedkeurStapStatus
  goedkeurder_id: string | null
  goedkeurder_naam: string | null
  beoordeeld_door_naam: string | null
  beoordeeld_op: string | null
  toelichting: string | null
}

export type EvaGoedkeuring = {
  bron: 'bouw7' | 'eva' | null
  stappen: EvaStap[]
  besluit: 'goedgekeurd' | 'afgekeurd' | null
  besluitOp: string | null
  bouw7BijgewerktOp: string | null
  bouw7Fout: string | null
  /** De 4xxx-rekening die de route bepaalde, bv. "4400 Autokosten direkt personeel". */
  grootboek: string | null
  /** De ingelogde gebruiker mag de open stap afhandelen. */
  magBeslissen: boolean
  /** De ingelogde gebruiker mag de open stap aan iemand anders geven. */
  magOverdragen: boolean
}

function isDirectie(m: CurrentMedewerker): boolean {
  return (m.afdeling ?? '').trim().toLowerCase() === DIRECTIE_AFDELING.toLowerCase()
}

function foutVan(e: unknown): Resultaat {
  if (e instanceof GeenToegangError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : 'Er ging iets mis.' }
}

async function openStap(inkoopfactuurId: string): Promise<{ id: string; stap: number; goedkeurder_id: string | null } | null> {
  const { data } = await db().from('inkoop_goedkeur_stappen')
    .select('id, stap, goedkeurder_id').eq('inkoopfactuur_id', inkoopfactuurId).eq('status', 'open')
    .order('stap', { ascending: true }).limit(1).maybeSingle()
  return data ?? null
}

export async function getEvaGoedkeuring(inkoopfactuurId: string): Promise<EvaGoedkeuring> {
  const { medewerker, set } = await vereisRecht('inkoopfacturen', 'lezen')
  await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
  const isAdministratie = heeftModuleToegang(set, 'inkoopfacturen', 'beheren')

  const [{ data: f }, { data: rijen }] = await Promise.all([
    db().from('inkoopfacturen')
      .select('goedkeuring_bron, eva_besluit, eva_besluit_op, bouw7_bijgewerkt_op, laatste_vote_fout, grootboek_nummer, grootboek_naam')
      .eq('id', inkoopfactuurId).maybeSingle(),
    db().from('inkoop_goedkeur_stappen')
      .select('id, stap, soort, status, goedkeurder_id, beoordeeld_door, beoordeeld_op, toelichting')
      .eq('inkoopfactuur_id', inkoopfactuurId).order('stap', { ascending: true }),
  ])
  const lijst = rijen ?? []
  const ids = [...new Set(lijst.flatMap(s => [s.goedkeurder_id, s.beoordeeld_door]).filter(Boolean))] as string[]
  const namen = new Map<string, string>()
  if (ids.length > 0) {
    const { data: ms } = await db().from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', ids)
    for (const m of ms ?? []) namen.set(m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
  }

  const open = lijst.find(s => s.status === 'open')
  const ikBen = open && (open.goedkeurder_id === medewerker.id || isDirectie(medewerker))
  return {
    bron: (f?.goedkeuring_bron ?? null) as EvaGoedkeuring['bron'],
    stappen: lijst.map(s => ({
      id: s.id, stap: s.stap, soort: s.soort as GoedkeurStapSoort, status: s.status as GoedkeurStapStatus,
      goedkeurder_id: s.goedkeurder_id,
      goedkeurder_naam: s.goedkeurder_id ? namen.get(s.goedkeurder_id) ?? null : null,
      beoordeeld_door_naam: s.beoordeeld_door ? namen.get(s.beoordeeld_door) ?? null : null,
      beoordeeld_op: s.beoordeeld_op, toelichting: s.toelichting,
    })),
    besluit: (f?.eva_besluit ?? null) as EvaGoedkeuring['besluit'],
    besluitOp: f?.eva_besluit_op ?? null,
    bouw7BijgewerktOp: f?.bouw7_bijgewerkt_op ?? null,
    bouw7Fout: f?.laatste_vote_fout ?? null,
    grootboek: f?.grootboek_nummer ? [f.grootboek_nummer, f.grootboek_naam].filter(Boolean).join(' ') : null,
    magBeslissen: !!ikBen && !f?.eva_besluit,
    magOverdragen: !!open && (!!ikBen || isAdministratie) && !f?.eva_besluit,
  }
}

/**
 * Akkoord of bezwaar op de open stap. Bij bezwaar is een reden verplicht; die komt ook in Bouw7.
 * Een akkoord met nog een stap erna zet alleen de volgende stap open; het laatste akkoord (of
 * elk bezwaar) is het eindbesluit en gaat naar Bouw7.
 */
export async function beslisInkoopfactuur(
  inkoopfactuurId: string,
  keuze: 'akkoord' | 'bezwaar',
  toelichting: string,
): Promise<Resultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'lezen')
    await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
    const reden = toelichting.trim()
    if (keuze === 'bezwaar' && !reden) return { ok: false, error: 'Geef een reden voor het bezwaar.' }

    const { data: f } = await db().from('inkoopfacturen')
      .select('goedkeuring_bron, eva_besluit, status').eq('id', inkoopfactuurId).maybeSingle()
    if (f?.goedkeuring_bron !== 'eva') return { ok: false, error: 'Deze factuur wordt in Bouw7 goedgekeurd.' }
    if (f.eva_besluit || f.status !== 'open') return { ok: false, error: 'Over deze factuur is al besloten.' }

    const stap = await openStap(inkoopfactuurId)
    if (!stap) return { ok: false, error: 'Er staat geen stap open voor deze factuur.' }
    if (stap.goedkeurder_id !== medewerker.id && !isDirectie(medewerker)) {
      return { ok: false, error: 'Deze factuur ligt niet bij jou.' }
    }

    const nu = new Date().toISOString()
    // Voorwaardelijk op status 'open': twee mensen tegelijk op de knop → één wint.
    const { data: bijgewerkt } = await db().from('inkoop_goedkeur_stappen')
      .update({ status: keuze, beoordeeld_door: medewerker.id, beoordeeld_op: nu, toelichting: reden || null, updated_at: nu })
      .eq('id', stap.id).eq('status', 'open').select('id')
    if (!bijgewerkt?.length) return { ok: false, error: 'Iemand anders heeft deze stap net afgehandeld. Ververs het scherm.' }
    await logGebeurtenis(inkoopfactuurId, keuze === 'akkoord' ? 'goedgekeurd' : 'afgekeurd', medewerker.id, { stap: stap.stap, toelichting: reden || null })

    if (keuze === 'akkoord') {
      const { data: volgende } = await db().from('inkoop_goedkeur_stappen')
        .select('id, goedkeurder_id').eq('inkoopfactuur_id', inkoopfactuurId).eq('status', 'wacht')
        .order('stap', { ascending: true }).limit(1).maybeSingle()
      if (volgende) {
        await db().from('inkoop_goedkeur_stappen').update({ status: 'open', updated_at: nu }).eq('id', volgende.id)
        await db().from('inkoopfacturen').update({
          huidige_goedkeurder_id: volgende.goedkeurder_id,
          huidige_goedkeurder_naam: await medewerkerNaam(volgende.goedkeurder_id),
        }).eq('id', inkoopfactuurId)
        revalidatePath('/inkoop/facturen')
        return { ok: true, melding: 'Akkoord gegeven. De factuur gaat door naar de volgende goedkeurder.' }
      }
    } else {
      await db().from('inkoop_goedkeur_stappen').update({ status: 'vervallen', updated_at: nu })
        .eq('inkoopfactuur_id', inkoopfactuurId).eq('status', 'wacht')
    }

    await db().from('inkoopfacturen').update({
      eva_besluit: keuze === 'akkoord' ? 'goedgekeurd' : 'afgekeurd',
      eva_besluit_op: nu,
      eva_besluit_door: medewerker.id,
      huidige_goedkeurder_id: null,
      huidige_goedkeurder_naam: null,
    }).eq('id', inkoopfactuurId)

    const bouw7 = await stuurBesluitNaarBouw7(inkoopfactuurId, medewerker.id)
    if (keuze === 'bezwaar') {
      await maakBezwaarTaak(inkoopfactuurId, [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' '), reden)
    }
    revalidatePath('/inkoop/facturen')
    if (!bouw7.ok) {
      return { ok: true, melding: `Je besluit is vastgelegd, maar Bouw7 is nog niet bijgewerkt: ${bouw7.error} EVA probeert het bij de volgende sync opnieuw.` }
    }
    return { ok: true, melding: keuze === 'akkoord' ? 'Goedgekeurd en bijgewerkt in Bouw7.' : 'Afgekeurd en bijgewerkt in Bouw7.' }
  } catch (e) {
    return foutVan(e)
  }
}

/** Geef de open stap aan iemand anders (bijv. bij afwezigheid). */
export async function draagInkoopStapOver(inkoopfactuurId: string, naarMedewerkerId: string): Promise<Resultaat> {
  try {
    const { medewerker, set } = await vereisRecht('inkoopfacturen', 'lezen')
    await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
    const stap = await openStap(inkoopfactuurId)
    if (!stap) return { ok: false, error: 'Er staat geen stap open voor deze factuur.' }
    const magHet = stap.goedkeurder_id === medewerker.id || isDirectie(medewerker)
      || heeftModuleToegang(set, 'inkoopfacturen', 'beheren')
    if (!magHet) {
      return { ok: false, error: 'Alleen de huidige goedkeurder, Directie of de financiële administratie kan deze factuur overdragen.' }
    }
    const { data: naar } = await db().from('medewerkers').select('id, actief').eq('id', naarMedewerkerId).maybeSingle()
    if (!naar || naar.actief === false) return { ok: false, error: 'Kies een actieve medewerker.' }

    await db().from('inkoop_goedkeur_stappen')
      .update({ goedkeurder_id: naarMedewerkerId, updated_at: new Date().toISOString() }).eq('id', stap.id)
    await db().from('inkoopfacturen').update({
      huidige_goedkeurder_id: naarMedewerkerId,
      huidige_goedkeurder_naam: await medewerkerNaam(naarMedewerkerId),
    }).eq('id', inkoopfactuurId)
    await logGebeurtenis(inkoopfactuurId, 'overgedragen', medewerker.id, { stap: stap.stap, van: stap.goedkeurder_id, naar: naarMedewerkerId })

    revalidatePath('/inkoop/facturen')
    return { ok: true, melding: 'Overgedragen.' }
  } catch (e) {
    return foutVan(e)
  }
}

/** Een besluit waarvan de Bouw7-write mislukte, nu opnieuw proberen. */
export async function stuurInkoopBesluitOpnieuw(inkoopfactuurId: string): Promise<Resultaat> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'lezen')
    await vereisInkoopfactuurToegang(inkoopfactuurId, 'lezen')
    const res = await stuurBesluitNaarBouw7(inkoopfactuurId, medewerker.id)
    revalidatePath('/inkoop/facturen')
    return res.ok ? { ok: true, melding: 'Bouw7 is bijgewerkt.' } : res
  } catch (e) {
    return foutVan(e)
  }
}
