import { createClient, createAdminClient } from '@everts/database/server'
import PlatformShell from '@/components/eva/PlatformShell'
import ToastProvider from '@/components/taken/shared/ToastProvider'
import MobileRedirect from '@/components/mobiel/MobileRedirect'
import { getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { getOngelezenNotificaties } from '@/app/(platform)/notificaties/actions'
import { telOngelezenUpdates, getOngelezenUpdates } from '@/app/(platform)/wat-is-nieuw/actions'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /* Ongelezen-teller parallel aan het medewerker-record ophalen (draait bij elke
     navigatie; niet meer sequentieel achter de rechten aan). */
  const telOngelezen = async (): Promise<number> => {
    if (!user) return 0
    try {
      const admin = createAdminClient()
      const { count } = await admin
        .from('notificaties')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('gelezen', false)
      return count ?? 0
    } catch {
      return 0 // tabel bestaat mogelijk nog niet
    }
  }

  /* Medewerker-record + notificatie-teller/-lijst + changelog-teller/-lijst parallel */
  const [medewerker, aantalOngelezen, ongelezenNotificaties, aantalNieuweUpdates, nieuweUpdates] = await Promise.all([
    getCurrentMedewerker(),
    telOngelezen(),
    getOngelezenNotificaties(8),
    telOngelezenUpdates(),
    getOngelezenUpdates(5),
  ])
  const rechten = await getEffectieveRechten(medewerker)

  /* Naam: medewerker-record heeft prioriteit boven auth metadata */
  const fullName = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Gebruiker'

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')

  /* Onderschrift in het gebruikersblok */
  const userSub = [medewerker?.functie, medewerker?.afdeling].filter(Boolean).join(' · ') || 'Everts Team'

  return (
    <PlatformShell
      userName={fullName}
      userInitials={initials}
      userSub={userSub}
      userFotoUrl={medewerker?.foto_url}
      aantalOngelezen={aantalOngelezen}
      ongelezenNotificaties={ongelezenNotificaties}
      aantalNieuweUpdates={aantalNieuweUpdates}
      nieuweUpdates={nieuweUpdates}
      rechten={rechten}
    >
      <MobileRedirect />
      {children}
      <ToastProvider />
    </PlatformShell>
  )
}
