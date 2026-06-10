'use server'

import { createClient, createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

export type Notificatie = {
  id: string
  type: string
  titel: string
  body: string | null
  url: string | null
  gelezen: boolean
  aangemaakt_op: string
}

export async function getNotificaties(limit = 10): Promise<{ notificaties: Notificatie[]; ongelezen: number }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { notificaties: [], ongelezen: 0 }

    const admin = createAdminClient()
    const [lijstResult, telResult] = await Promise.all([
      admin
        .from('notificaties')
        .select('*')
        .eq('user_id', user.id)
        .order('aangemaakt_op', { ascending: false })
        .limit(limit),
      admin
        .from('notificaties')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('gelezen', false),
    ])

    return {
      notificaties: (lijstResult.data ?? []) as Notificatie[],
      ongelezen: telResult.count ?? 0,
    }
  } catch {
    return { notificaties: [], ongelezen: 0 }
  }
}

export async function markeerAlsGelezen(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('notificaties').update({ gelezen: true }).eq('id', id)
}

export async function markeerAlleAlsGelezen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('notificaties').update({ gelezen: true }).eq('user_id', user.id)
  revalidatePath('/', 'layout')
}

/** Aanmaken van een notificatie (door server-side logica) */
export async function maakNotificatie(input: {
  user_id: string
  type: string
  titel: string
  body?: string
  url?: string
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('notificaties').insert({
    user_id:      input.user_id,
    type:         input.type,
    titel:        input.titel,
    body:         input.body ?? null,
    url:          input.url  ?? null,
    gelezen:      false,
  })
}
