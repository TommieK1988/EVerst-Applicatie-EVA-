'use server'

import { getCurrentMedewerker } from '@/lib/auth/rechten'

/**
 * Identiteit voor houtrot-schrijfacties. Sinds de cutover wijzen de eigenaar-FK's
 * (`repair_registrations.user_id`, `projects.created_by`, ...) naar `medewerkers`,
 * niet meer naar het oude houtrot-eigen `profiles`. Dit is een server action zodat
 * de houtrot-client components (die geen server-only code mogen importeren) er toch
 * bij kunnen.
 */
export async function getHuidigeMedewerker(): Promise<{ id: string; naam: string } | null> {
  const m = await getCurrentMedewerker()
  if (!m) return null

  return {
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || 'Onbekend',
  }
}
