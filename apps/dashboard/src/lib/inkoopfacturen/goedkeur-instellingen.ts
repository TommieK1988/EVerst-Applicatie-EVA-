'use server'

/**
 * Instellingen van de EVA-goedkeuring van inkoopfacturen: vanaf wanneer EVA nieuwe facturen
 * overneemt, de route per administratie (vaste goedkeurder, drempel, drempelgoedkeurder) en de
 * goedkeurder per 4xxx-grootboekrekening voor overhead.
 * Alleen met `inkoopfacturen: beheren`.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { isKostenrekening, ontleedGrootboekNaam, type GoedkeurRegel } from './goedkeur-route'

const db = () => createAdminClient()

export type GoedkeurInstellingen = {
  /** ISO-moment; facturen die daarna in Bouw7 zijn aangemaakt keurt EVA goed. Null = uit. */
  evaVanaf: string | null
  regels: GoedkeurRegel[]
  administraties: { id: number; naam: string }[]
  medewerkers: { id: string; naam: string; afdeling: string | null }[]
  /** Goedkeurder per 4xxx-nummer (overhead). */
  grootboek: { nummer: string; goedkeurder_id: string }[]
  /** Alle 4xxx-rekeningen uit Bouw7, over de administraties samengevoegd op nummer. */
  rekeningen: { nummer: string; naam: string }[]
  /** Bouw7 gaf geen rekeningen terug (storing) — de lijst is dan alleen wat al is ingesteld. */
  rekeningenFout: string | null
}

/** De 4xxx-rekeningen uit Bouw7. Per vestiging opgevraagd: zonder `?branch=` is de lijst leeg. */
async function haalKostenrekeningen(): Promise<{ nummer: string; naam: string }[]> {
  const bouw7 = await getBouw7Client()
  const vestigingen = await bouw7.get<{ items?: { id: number }[] }>('/list/branches')
  const perNummer = new Map<string, string>()
  for (const v of vestigingen.items ?? []) {
    const lijst = await bouw7.get<{ name?: string }[]>(`/organization/general-ledger-accounts?branch=${v.id}`)
    for (const g of Array.isArray(lijst) ? lijst : []) {
      const { nummer, naam } = ontleedGrootboekNaam(g.name ?? '')
      if (isKostenrekening(nummer) && !perNummer.has(nummer)) perNummer.set(nummer, naam)
    }
  }
  return [...perNummer].map(([nummer, naam]) => ({ nummer, naam })).sort((a, b) => a.nummer.localeCompare(b.nummer))
}

export async function getGoedkeurInstellingen(): Promise<GoedkeurInstellingen> {
  await vereisRecht('inkoopfacturen', 'beheren')
  const [{ data: inst }, { data: regels }, { data: ms }, facturen, { data: gb }, rekeningen] = await Promise.all([
    db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle(),
    db().from('inkoop_goedkeur_regels').select('divisie_bouw7_id, terugval_goedkeurder_id, drempel_excl, drempel_goedkeurder_id'),
    db().from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam, afdeling')
      .eq('actief', true).not('auth_user_id', 'is', null).order('voornaam').limit(500),
    haalAlleRijen<{ divisie_bouw7_id: number | null; divisie_naam: string | null }>((van, tot) =>
      db().from('inkoopfacturen').select('divisie_bouw7_id, divisie_naam')
        .not('divisie_bouw7_id', 'is', null).order('id').range(van, tot)),
    db().from('inkoop_goedkeur_grootboek').select('grootboek_nummer, goedkeurder_id'),
    haalKostenrekeningen().then(r => ({ r, fout: null as string | null }))
      .catch(e => ({ r: [] as { nummer: string; naam: string }[], fout: e instanceof Error ? e.message : 'Bouw7 niet bereikbaar' })),
  ])

  const administraties = new Map<number, string>()
  for (const f of facturen) if (f.divisie_bouw7_id != null) administraties.set(f.divisie_bouw7_id, f.divisie_naam ?? `Administratie ${f.divisie_bouw7_id}`)

  const v = (inst?.overige as Record<string, unknown> | null)?.inkoop_goedkeuring_eva_vanaf
  return {
    evaVanaf: typeof v === 'string' && v ? v : null,
    regels: (regels ?? []).map(r => ({ ...r, drempel_excl: r.drempel_excl == null ? null : Number(r.drempel_excl) })),
    administraties: [...administraties].map(([id, naam]) => ({ id, naam })).sort((a, b) => a.naam.localeCompare(b.naam)),
    medewerkers: (ms ?? []).map(m => ({
      id: m.id, naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '), afdeling: m.afdeling ?? null,
    })),
    grootboek: (gb ?? []).map(g => ({ nummer: g.grootboek_nummer, goedkeurder_id: g.goedkeurder_id })),
    rekeningen: rekeningen.r,
    rekeningenFout: rekeningen.fout,
  }
}

export async function slaGoedkeurInstellingenOp(input: {
  evaVanaf: string | null
  regels: GoedkeurRegel[]
  grootboek: { nummer: string; goedkeurder_id: string }[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { medewerker } = await vereisRecht('inkoopfacturen', 'beheren')

    if (input.evaVanaf && Number.isNaN(Date.parse(input.evaVanaf))) {
      return { ok: false, error: 'De startdatum is geen geldige datum.' }
    }
    for (const r of input.regels) {
      if (r.drempel_excl != null && (!Number.isFinite(r.drempel_excl) || r.drempel_excl < 0)) {
        return { ok: false, error: 'Een drempel moet een bedrag van 0 of meer zijn.' }
      }
    }
    if (input.grootboek.some(g => !isKostenrekening(g.nummer) || !g.goedkeurder_id)) {
      return { ok: false, error: 'Een goedkeurder per grootboek kan alleen bij een 4000-rekening, en vraagt een persoon.' }
    }
    if (new Set(input.grootboek.map(g => g.nummer)).size !== input.grootboek.length) {
      return { ok: false, error: 'Elke grootboekrekening mag maar één keer voorkomen.' }
    }
    if (input.evaVanaf && !input.regels.some(r => r.divisie_bouw7_id == null && r.terugval_goedkeurder_id)) {
      return { ok: false, error: 'Kies eerst een vaste goedkeurder voor facturen zonder projectleider.' }
    }

    // bedrijfsinstellingen.overige is een jsonb-object met meer sleutels: lees-wijzig-schrijf.
    const { data: inst } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
    const overige = { ...((inst?.overige as Record<string, unknown> | null) ?? {}), inkoop_goedkeuring_eva_vanaf: input.evaVanaf }
    const { error: e1 } = await db().from('bedrijfsinstellingen').update({ overige }).eq('id', 1)
    if (e1) return { ok: false, error: e1.message }

    const nu = new Date().toISOString()
    const leeg = (r: GoedkeurRegel) => !r.terugval_goedkeurder_id && r.drempel_excl == null && !r.drempel_goedkeurder_id
    const bewaren = input.regels.filter(r => r.divisie_bouw7_id == null || !leeg(r))

    // Regels die niet meer meekomen (een administratie die weer "standaard" volgt) weghalen.
    const { data: bestaand } = await db().from('inkoop_goedkeur_regels').select('id, divisie_bouw7_id')
    const houden = new Set(bewaren.map(r => r.divisie_bouw7_id ?? -1))
    const weg = (bestaand ?? []).filter(r => !houden.has(r.divisie_bouw7_id ?? -1)).map(r => r.id)
    if (weg.length) await db().from('inkoop_goedkeur_regels').delete().in('id', weg)

    for (const r of bewaren) {
      const rij = {
        terugval_goedkeurder_id: r.terugval_goedkeurder_id || null,
        drempel_excl: r.drempel_excl,
        drempel_goedkeurder_id: r.drempel_goedkeurder_id || null,
        updated_at: nu,
        updated_by: medewerker.id,
      }
      const gevonden = (bestaand ?? []).find(b => (b.divisie_bouw7_id ?? -1) === (r.divisie_bouw7_id ?? -1))
      const { error } = gevonden
        ? await db().from('inkoop_goedkeur_regels').update(rij).eq('id', gevonden.id)
        : await db().from('inkoop_goedkeur_regels').insert({ ...rij, divisie_bouw7_id: r.divisie_bouw7_id })
      if (error) return { ok: false, error: error.message }
    }

    // Grootboek: de lijst is klein; vervangen is eenvoudiger en even veilig als bijwerken.
    const { error: e2 } = await db().from('inkoop_goedkeur_grootboek').delete().neq('grootboek_nummer', '')
    if (e2) return { ok: false, error: e2.message }
    if (input.grootboek.length) {
      const { error: e3 } = await db().from('inkoop_goedkeur_grootboek').insert(input.grootboek.map(g => ({
        grootboek_nummer: g.nummer, goedkeurder_id: g.goedkeurder_id, updated_at: nu, updated_by: medewerker.id,
      })))
      if (e3) return { ok: false, error: e3.message }
    }

    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Opslaan mislukt.' }
  }
}
