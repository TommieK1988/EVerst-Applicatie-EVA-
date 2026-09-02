import type { Metadata } from 'next'

export const metadata: Metadata = {
  // `absolute` op de default, anders plakt de root-layout er nog eens "| EVA"
  // achter — en EVA is een interne naam die een klant niets zegt.
  title: {
    template: '%s | Everts',
    absolute: 'Uw projectomgeving | Everts',
  },
  // Een klantomgeving hoort niet in Google. De inhoud zit achter een login, maar
  // ook de inlogpagina zelf heeft daar niets te zoeken.
  robots: { index: false, follow: false },
}

/**
 * Layout van het klantportaal.
 *
 * Bewust een eigen routegroep, los van (platform) en (public):
 *  - (platform) trekt de EVA-shell, sidebar, rechten en notificaties binnen —
 *    allemaal dingen die een medewerker aangaan en een klant niets;
 *  - (public) is sessieloos en bedoeld voor eenmalige tokenlinks.
 *
 * De kale opzet is hier geen bezuiniging maar een keuze: hoe minder deze pagina
 * met EVA deelt, hoe kleiner de kans dat er ooit per ongeluk interne gegevens
 * doorheen lekken.
 */
export default function PortaalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      {children}
    </div>
  )
}
