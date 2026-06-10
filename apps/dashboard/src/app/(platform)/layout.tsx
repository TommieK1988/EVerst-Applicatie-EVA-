import { createClient, createAdminClient } from '@everts/database/server'
import PlatformShell from '@/components/eva/PlatformShell'
import ToastProvider from '@/components/taken/shared/ToastProvider'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  /* Medewerker-record ophalen voor echte naam en functie */
  const medewerker = user
    ? await supabase
        .from('medewerkers')
        .select('voornaam, tussenvoegsel, achternaam, functie, afdeling, foto_url')
        .eq('auth_user_id', user.id)
        .eq('actief', true)
        .maybeSingle()
        .then(r => r.data)
    : null

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

  /* Notificaties — ongelezen teller */
  let aantalOngelezen = 0
  if (user) {
    try {
      const admin = createAdminClient()
      const { count } = await admin
        .from('notificaties')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('gelezen', false)
      aantalOngelezen = count ?? 0
    } catch { /* tabel bestaat mogelijk nog niet */ }
  }

  return (
    <PlatformShell
      userName={fullName}
      userInitials={initials}
      userSub={userSub}
      userFotoUrl={medewerker?.foto_url}
      aantalOngelezen={aantalOngelezen}
    >
      {children}
      <ToastProvider />
    </PlatformShell>
  )
}
