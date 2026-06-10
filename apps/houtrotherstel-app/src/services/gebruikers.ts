import { createClient } from '@/lib/supabase/client'
import type { Profile, ProfileForm, UserRole } from '@/lib/types'

export async function getGebruikers(): Promise<Profile[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getGebruiker(id: string): Promise<Profile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

export async function updateGebruiker(
  id: string,
  form: Partial<ProfileForm>
): Promise<Profile> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .update(form)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function toggleGebruikerActief(
  id: string,
  active: boolean
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function updateGebruikerRol(
  id: string,
  role: UserRole
): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// Gebruiker aanmaken via Supabase Auth (alleen admin via server action)
export async function createGebruikerViaServiceRole(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
): Promise<void> {
  // Dit moet via een server action / API route met service role key
  const response = await fetch('/api/admin/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName, role }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Aanmaken gebruiker mislukt')
  }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}
