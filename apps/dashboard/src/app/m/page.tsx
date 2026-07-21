import { createClient } from '@everts/database/server'
import { getMijnTaken } from '@/lib/taken/services/taken'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import MobielHome from '@/components/mobiel/MobielHome'

export const metadata = { title: 'EVA Mobiel' }

export default async function MobielHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [taken, medewerker] = await Promise.all([
    user ? getMijnTaken(user.id).catch(() => []) : Promise.resolve([]),
    getCurrentMedewerker().catch(() => null),
  ])

  return <MobielHome naam={medewerker?.voornaam ?? null} openTaken={taken.length} />
}
