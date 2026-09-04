import { createClient, createAdminClient } from '@everts/database/server'
import { telMijnOpenTaken } from '@/lib/taken/services/taken'
import { getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { FEATURES } from '@/lib/features'
import MobielHome from '@/components/mobiel/MobielHome'

export const metadata = { title: 'EVA Mobiel' }

/** Alleen tellen, geen rijen: dit is het eerste scherm dat laadt. */
async function telOngelezenMeldingen(userId: string): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from('notificaties')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('gelezen', false)
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function MobielHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [openTaken, medewerker, ongelezenMeldingen] = await Promise.all([
    user ? telMijnOpenTaken(user.id).catch(() => 0) : Promise.resolve(0),
    getCurrentMedewerker().catch(() => null),
    user ? telOngelezenMeldingen(user.id) : Promise.resolve(0),
  ])

  // Wie de Materieel-tegel ziet, bepaalt het recht `materieelbeheer` (niveau
  // 'lezen'). Toevoegen vraagt 'schrijven'; dat checkt het scherm zelf, zodat
  // iemand die alleen mag kijken de tegel wél houdt.
  const rechten = medewerker ? await getEffectieveRechten(medewerker) : {}
  const magMaterieel =
    FEATURES.materieelbeheer && heeftModuleToegang(rechten, 'materieelbeheer', 'lezen')

  return (
    <MobielHome
      naam={medewerker?.voornaam ?? null}
      openTaken={openTaken}
      ongelezenMeldingen={ongelezenMeldingen}
      magMaterieel={magMaterieel}
    />
  )
}
