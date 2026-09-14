import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { haalTeKeuren } from '@/lib/mobiel/keuren'
import AppHeader from '@/components/mobiel/AppHeader'
import KeurenClient from '@/components/mobiel/uren/KeurenClient'

export const metadata = { title: 'Fiatteren · EVA Mobiel' }

/** Live uit Bouw7 bij elke weergave — nooit een gecachete goedkeurstand tonen. */
export const dynamic = 'force-dynamic'

/**
 * Mobiel fiatteren van uren: de stapel die op jouw akkoord wacht, als teamleider
 * of projectleider op het dossier waarop de uren geboekt zijn.
 *
 * Bewust géén `MobielPullToRefresh`: dit is een selectiescherm en een refresh zou
 * de aangevinkte regels weggooien. Ververs gebeurt na het fiatteren, en alleen als
 * er iets misging.
 */
export default async function MobielKeurenPage() {
  const medewerker = await getCurrentMedewerker()

  if (!medewerker) {
    return (
      <>
        <AppHeader title="Fiatteren" backHref="/m/uren" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  // Wie op geen enkel dossier teamleider of projectleider is, krijgt hier gewoon een
  // lege lijst: `getMijnTeKeurenUren` deelt de regels uit op de projectrollen, dus
  // een extra poort hier zou dezelfde toets nog eens overdoen.
  const data = await haalTeKeuren()

  return (
    <>
      <AppHeader title="Fiatteren" sub="Uren op jouw akkoord" backHref="/m/uren" />
      <KeurenClient data={data} />
    </>
  )
}
