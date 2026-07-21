'use client'

import { useTransition } from 'react'
import { MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { geocodeAdressenAction } from '@/app/(platform)/wagenpark/actions/geocode'

/**
 * Woon- en vestigingsadressen omzetten naar coördinaten. Nominatim laat maar
 * ongeveer één adres per seconde toe, dus een koude run kapt af op een
 * tijdsbudget; de melding vertelt dan hoeveel adressen er nog wachten en de
 * knop mag opnieuw ingedrukt worden.
 */
export default function GeocodeKnop() {
  const [pending, startTransition] = useTransition()

  const geocode = () =>
    startTransition(async () => {
      try {
        const r = await geocodeAdressenAction()
        const gedaan = r.medewerkers_ok + r.bedrijven_ok
        const mislukt = r.medewerkers_geen_match + r.bedrijven_geen_match
        if (r.resterend > 0) {
          toast.success(
            `${gedaan} adres(sen) gegeocodeerd${mislukt ? `, ${mislukt} zonder match` : ''}. ` +
              `Nog ${r.resterend} te gaan — klik nogmaals.`,
            { duration: 6000 },
          )
        } else {
          toast.success(
            `Geocoding compleet — ${gedaan} adres(sen) klaar` +
              `${mislukt ? `, ${mislukt} zonder match` : ''}.`,
          )
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Geocoding mislukt')
      }
    })

  return (
    <button
      onClick={geocode}
      disabled={pending}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border bg-white hover:bg-slate-50 disabled:opacity-50"
    >
      <MapPin className="w-4 h-4" /> {pending ? 'Bezig…' : 'Adressen geocoderen'}
    </button>
  )
}
