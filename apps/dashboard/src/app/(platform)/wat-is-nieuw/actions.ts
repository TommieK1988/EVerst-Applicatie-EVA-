'use server'

import { createClient, createAdminClient } from '@everts/database/server'

export type ChangelogCategorie = 'nieuw' | 'verbeterd' | 'opgelost'

export type ChangelogItem = {
  id: string
  datum: string
  titel: string
  omschrijving: string
  categorie: ChangelogCategorie
  module: string | null
  aangemaakt_op: string
}

/** Alle gepubliceerde changelog-items, nieuwste eerst. */
export async function getChangelog(): Promise<ChangelogItem[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('changelog')
      .select('id, datum, titel, omschrijving, categorie, module, aangemaakt_op')
      .eq('gepubliceerd', true)
      .order('datum', { ascending: false })
      .order('aangemaakt_op', { ascending: false })
    return (data ?? []) as ChangelogItem[]
  } catch {
    return []
  }
}

/** Het moment tot waar de huidige gebruiker de changelog gezien heeft (epoch als nooit). */
async function gezienOp(userId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('changelog_gezien')
    .select('gezien_op')
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.gezien_op as string | undefined) ?? '1970-01-01T00:00:00Z'
}

/** Aantal items dat nieuwer is dan het laatste bezoek van de gebruiker. */
export async function telOngelezenUpdates(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const drempel = await gezienOp(user.id)
    const admin = createAdminClient()
    const { count } = await admin
      .from('changelog')
      .select('id', { count: 'exact', head: true })
      .eq('gepubliceerd', true)
      .gt('aangemaakt_op', drempel)
    return count ?? 0
  } catch {
    return 0 // tabel bestaat mogelijk nog niet
  }
}

/** De ongelezen items zelf (voor de inlog-popup). */
export async function getOngelezenUpdates(limit = 5): Promise<ChangelogItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const drempel = await gezienOp(user.id)
    const admin = createAdminClient()
    const { data } = await admin
      .from('changelog')
      .select('id, datum, titel, omschrijving, categorie, module, aangemaakt_op')
      .eq('gepubliceerd', true)
      .gt('aangemaakt_op', drempel)
      .order('aangemaakt_op', { ascending: false })
      .limit(limit)
    return (data ?? []) as ChangelogItem[]
  } catch {
    return []
  }
}

/** Markeer de changelog als gezien tot nu (wist de badge). */
export async function markeerUpdatesGezien(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const admin = createAdminClient()
    await admin
      .from('changelog_gezien')
      .upsert(
        { user_id: user.id, gezien_op: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
  } catch {
    /* stil — niet kritiek */
  }
}
