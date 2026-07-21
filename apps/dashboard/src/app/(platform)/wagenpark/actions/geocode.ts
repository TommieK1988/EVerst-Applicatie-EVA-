'use server'

import { revalidatePath } from 'next/cache'
import { GeenToegangError } from '@/lib/auth/rechten'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { geocodeReferentieadressen } from '@/lib/wagenpark/geocode'

/**
 * Zet de woonadressen van medewerkers en de adressen van de bedrijfsvestigingen
 * om naar coördinaten (`adres_lat`/`adres_lng`), met caching in
 * `public.geocode_cache`.
 *
 * Nominatim staat ongeveer één bevraging per seconde toe, dus een koude run kapt
 * af op een tijdsbudget en geeft terug hoeveel adressen er nog wachten — vandaar
 * dat de knop meerdere keren ingedrukt mag worden.
 *
 * De actie is AVG-gevoelig (woonadressen) en daarom voorbehouden aan
 * Directie/beheer: dezelfde poort als de privéritten.
 */
export async function geocodeAdressenAction() {
  if (!(await magPriveRittenZien())) {
    throw new GeenToegangError('Alleen Directie/beheer mag adressen geocoderen.')
  }
  const res = await geocodeReferentieadressen()
  revalidatePath('/wagenpark/instellingen')
  return res
}
