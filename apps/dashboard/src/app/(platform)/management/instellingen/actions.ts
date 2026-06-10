'use server'

import { createClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

export async function slaAKOp({
  jaar, filiaal, bedrag, opmerkingen,
}: {
  jaar: number
  filiaal: string
  bedrag: number
  opmerkingen: string | null
}): Promise<{ ok: boolean; fout?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('management_ak')
    .upsert(
      { jaar, filiaal, bedrag_ak: bedrag, opmerkingen, updated_at: new Date().toISOString() },
      { onConflict: 'jaar,filiaal' }
    )

  if (error) return { ok: false, fout: error.message }

  revalidatePath('/management')
  revalidatePath('/management/instellingen')
  return { ok: true }
}

export async function slaDoelstellingOp({
  jaar, filiaal, projectleider, omzet_doelstelling, resultaat_doelstelling,
}: {
  jaar: number
  filiaal: string | null
  projectleider: string | null
  omzet_doelstelling: number | null
  resultaat_doelstelling: number | null
}): Promise<{ ok: boolean; data?: unknown; fout?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('management_doelstellingen')
    .upsert(
      {
        jaar, filiaal, projectleider,
        omzet_doelstelling, resultaat_doelstelling,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'jaar,filiaal,projectleider' }
    )
    .select()
    .single()

  if (error) return { ok: false, fout: error.message }

  revalidatePath('/management')
  revalidatePath('/management/instellingen')
  return { ok: true, data }
}

export async function verwijderDoelstelling(id: string): Promise<{ ok: boolean; fout?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('management_doelstellingen')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, fout: error.message }

  revalidatePath('/management')
  revalidatePath('/management/instellingen')
  return { ok: true }
}
