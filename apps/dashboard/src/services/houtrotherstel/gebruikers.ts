import { createClient } from '@/lib/houtrotherstel/supabase/client'
import type { Profile, ProfileForm, UserRole } from '@/lib/houtrotherstel/types'

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

// Let op: houtrot kent géén eigen gebruikersbeheer meer. Accounts en rollen lopen
// via het EVA-gebruikersbeheer (medewerkers + gebruiker_type/rechten). De oude
// `createGebruikerViaServiceRole` + /api/admin/create-user-route zijn verwijderd.
// `getCurrentProfile` blijft tot de cutover de identiteit voor houtrot-writes
// (profiles.id == auth user id); daarna vervangen door getCurrentMedewerker.

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
