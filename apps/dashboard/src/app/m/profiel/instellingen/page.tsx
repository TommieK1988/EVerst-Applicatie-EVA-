import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import LocatieAutoToggle from '@/components/mobiel/LocatieAutoToggle'
import ToestemmingenBlok from '@/components/mobiel/ToestemmingenBlok'
import PushMeldingen from '@/components/eva/PushMeldingen'

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

  return (
    <>
      <AppHeader title="Instellingen" backHref="/m/profiel" />
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toestemmingen bewust bóven de toggle: zonder toestemming doet die niets. */}
        <ToestemmingenBlok />
        <PushMeldingen weergave="mobiel" />
        <LocatieAutoToggle />
        {!medewerker && (
          <div style={{ fontSize: 13, color: '#6b757c', lineHeight: 1.5 }}>
            Je account is niet aan een medewerker gekoppeld. De instellingen hierboven
            werken wel; meldingen over taken en dossiers komen pas binnen zodra de
            koppeling gelegd is.
          </div>
        )}
      </div>
    </>
  )
}
