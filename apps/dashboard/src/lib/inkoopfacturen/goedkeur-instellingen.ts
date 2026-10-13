'use server'

/**
 * Instellingen van de EVA-goedkeuring van inkoopfacturen: vanaf wanneer EVA nieuwe facturen
 * overneemt, en de route per administratie (vaste goedkeurder, drempel, drempelgoedkeurder).
 * Alleen met `inkoopfacturen: beheren`.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type { GoedkeurRegel } from './goedkeur-route'

const db = () => createAdminClient()

export type GoedkeurInstellingen = {
  /** ISO-moment; facturen die daarna in Bouw7 zijn aangemaakt keurt EVA goed. Null = uit. */
  evaVanaf: string | null
  regels: GoedkeurRegel[]
  administraties: { id: number; naam: string }[]
  medewerkers: { id: string; naam: string; afdeling: string | null }[]
}

export async function getGoedkeurInstellingen(): Promise<GoedkeurInstellingen> {
  await vereisRecht('inkoopfacturen', 'beheren')
  const [{ data: inst }, { data: regels }, { data: ms }, facturen] = await Promise.all([
    db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle(),
    db().from('inkoop_goedkeur_regels').select('divisie_bouw7_id, terugval_goedkeurder_id, drempel_excl, drempel_goedkeurder_id'),
    db().from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam, afdeling')
      .eq('actief', true).not('auth_user_id', 'is', null).order('voornaam').limit(500),
    haalAlleRijen<{ divisie_bouw7_id: number | null; divisie_naam: string | null }>((van, tot) =>
      db().from('inkoopfacturen').select('divisie_bouw7_id, divisie_naam')
        .not('divisie_bouw7_id', 'is', null).order('id').range(van, tot)),
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
  }
}

export async function slaGoedkeurInstellingenOp(input: {
  evaVanaf: string | null
  regels: GoedkeurRegel[]
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

    revalidatePath('/inkoop/facturen')
    return { ok: true }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : 'Opslaan mislukt.' }
  }
}
