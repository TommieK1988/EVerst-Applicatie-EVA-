import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import LocatieAutoToggle from '@/components/mobiel/LocatieAutoToggle'
import ToestemmingenBlok from '@/components/mobiel/ToestemmingenBlok'
import PushMeldingen from '@/components/eva/PushMeldingen'
import TaalKeuze from '@/components/mobiel/TaalKeuze'
import { getAppVertaler } from '@/i18n/server'

export const metadata = { title: 'Instellingen · EVA Mobiel' }

/**
 * App-instellingen, losgetrokken van "Mijn gegevens".
 *
 * Deze schermen doen verschillende dingen: hiernaast staat wat de administratie
 * over je vastgelegd heeft (alleen-lezen), hier staat wat je zelf aan de app kunt
 * veranderen. Alles op één pagina betekende scrollen langs toestemmingen en
 * toggles om je eigen gegevens te zien.
 */
export default async function MobielInstellingenPage() {
  const medewerker = await getCurrentMedewerker()
  const t = await getAppVertaler('profiel')

  return (
    <>
      <AppHeader title={t('instellingen')} backHref="/m/profiel" />
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Taal bovenaan: wie de app niet kan lezen, moet dit als eerste kunnen vinden. */}
        <TaalKeuze />
        {/* Toestemmingen bewust bóven de toggle: zonder toestemming doet die niets. */}
        <ToestemmingenBlok />
        <PushMeldingen weergave="mobiel" />
        <LocatieAutoToggle />
        {!medewerker && (
          <div style={{ fontSize: 13, color: '#6b757c', lineHeight: 1.5 }}>
            {t('instellingenGeenKoppeling')}
          </div>
        )}
      </div>
    </>
  )
}
