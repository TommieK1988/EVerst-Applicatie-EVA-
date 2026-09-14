'use client'

import { Toaster } from 'react-hot-toast'

/**
 * Toast-uitgang voor de mobiele omgeving (`/m`).
 *
 * Dit ontbrak: `<Toaster>` stond alleen in de platform-layout, terwijl de mobiele
 * schermen (weekstaat, verlof, onkosten, projectbezoek, fiatteren) wél
 * `toast.error(...)` aanroepen. Zonder deze mount verdween elke melding stilletjes
 * in het niets — een mislukte urenregel gaf dan geen enkel signaal.
 *
 * `top-center` en niet `top-right` zoals op de desktop: rechtsboven zit op elk
 * `/m`-scherm de meldingen- of terugknop, en een toast eroverheen blokkeert precies
 * de knop die je daarna wilt indrukken.
 *
 * De offset van 84px zet hem nét onder de AppHeader: die is 74px hoog met een
 * terugknop en 76px zonder, plus de statusbalk — de app draait als PWA met
 * `black-translucent`, dus bovenaan het scherm zit de klok. Meet je de header ooit
 * anders op, pas dit dan mee aan; een toast over de titelbalk leest als een fout
 * in plaats van als een melding.
 */
export default function MobielToasts() {
  return (
    <Toaster
      position="top-center"
      containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 84px)' }}
      toastOptions={{
        duration: 3500,
        style: {
          fontFamily: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
          fontSize: '13px',
          lineHeight: 1.4,
          borderRadius: '12px',
          maxWidth: '92vw',
          boxShadow: '0 6px 20px rgba(16,24,40,.16)',
        },
        success: { iconTheme: { primary: '#009439', secondary: '#fff' } },
        error: { duration: 6000 },
      }}
    />
  )
}
