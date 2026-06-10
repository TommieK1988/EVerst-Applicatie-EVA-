'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/everts-calc/supabase/server'

// ─── Project aanmaken ─────────────────────────────────────────────────────────

export async function maakProject(formData: FormData): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name:        formData.get('naam') as string,
      client_name: (formData.get('opdrachtgever') as string) || null,
      description: (formData.get('omschrijving') as string)  || null,
      status:      (formData.get('status') as string) || 'concept',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken project: ${error.message}`)

  revalidatePath('/projecten')
  redirect(`/aanvragen/${project.id}`)
}

// ─── Project bijwerken ────────────────────────────────────────────────────────

export async function updateProject(id: string, formData: FormData): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .update({
      name:        formData.get('naam') as string,
      client_name: (formData.get('opdrachtgever') as string) || null,
      description: (formData.get('omschrijving') as string)  || null,
      status:      (formData.get('status') as string) || 'concept',
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken project: ${error.message}`)

  revalidatePath(`/projecten/${id}`)
  revalidatePath('/projecten')
  redirect(`/aanvragen/${id}`)
}

// ─── Project aanmaken vanuit aanvraag (geen redirect) ────────────────────────

export async function maakProjectVanAanvraag(naam: string, klantNaam: string): Promise<{ id: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name:        naam,
      client_name: klantNaam || null,
      status:      'aanvraag',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken project: ${error.message}`)

  revalidatePath('/aanvragen')
  return { id: project.id }
}

// ─── Project status bijwerken (geen redirect) ────────────────────────────────

export async function setProjectStatus(id: string, status: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Fout bij bijwerken status: ${error.message}`)
  revalidatePath(`/aanvragen/${id}`)
}

// ─── Project verwijderen ──────────────────────────────────────────────────────

export async function verwijderProject(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Fout bij verwijderen project: ${error.message}`)

  revalidatePath('/projecten')
  redirect('/aanvragen')
}
