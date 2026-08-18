'use client'

import { useEffect } from 'react'
import { herstelPushAbonnement } from '@/lib/push/client'

/**
 * Houdt pushmeldingen aan zonder dat iemand er iets voor hoeft te doen.
 *
 * Een apparaat dat toestemming heeft gegeven kan zijn abonnement alsnog kwijtraken:
 * iOS ruimt het op als de app een tijd niet gebruikt is, een vernieuwde service
 * worker kan het vervangen, en EVA gooit zelf endpoints weg die de pushdienst als
 * verlopen afwijst. De toestemming blijft dan gewoon staan — voor de gebruiker
 * lijkt het of de meldingen vanzelf uitgaan.
 *
 * Dit component draait bij elke keer dat de app opent en meldt in dat geval stil
 * opnieuw aan. Het vraagt nooit zelf om toestemming: dat mag alleen na een tik van
 * de gebruiker (Safari eist dat), en een ongevraagde toestemmingsvraag bij het
 * opstarten is bovendien precies wat je niet wilt.
 *
 * Rendert niets.
 */
export default function PushHersteller() {
  useEffect(() => {
    // Niet in de weg lopen bij het opstarten: dit mag wachten tot het scherm staat.
    const id = setTimeout(() => { void herstelPushAbonnement() }, 1500)
    return () => clearTimeout(id)
  }, [])

  return null
}
