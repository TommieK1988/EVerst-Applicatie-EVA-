import type { Metadata } from 'next'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import MedewerkersOverzicht from './MedewerkersOverzicht'

export const metadata: Metadata = { title: 'Medewerkers' }

export default async function MedewerkersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, email, telefoon, functie, afdeling, extern, actief, uurtarief_verkoop, uurtarief_kostprijs, cao_schaal, in_dienst_vanaf')
    .order('achternaam', { ascending: true })

  // Haal user_id op voor layout-beheer
  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [layouts, functiesRes] = await Promise.all([
    user_id ? laadLayouts(user_id, 'medewerkers') : Promise.resolve([]),
    supabase.from('medewerker_functies').select('id, naam').eq('actief', true).order('volgorde').order('naam'),
  ])

  return (
    <MedewerkersOverzicht
      medewerkers={data ?? []}
      layouts={layouts}
      user_id={user_id}
      functies={(functiesRes.data ?? []) as { id: string; naam: string }[]}
    />
  )
}
