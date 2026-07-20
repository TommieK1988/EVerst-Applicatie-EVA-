'use client'

import { useTransition } from 'react'
import { MapPin, CalendarClock, FileBarChart } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  geocodeAdressenAction,
  runDagoverzichtAction,
  runMaandrapportAction,
} from '@/app/(platform)/wagenpark/actions/werktijden'

/**
 * Handmatige triggers voor de werktijd-analyse (Directie/beheer):
 *  - Woon-/werkadressen (her)geocoderen
 *  - Dagoverzicht van gisteren nu versturen
 *  - Maandrapport (vorige maand) nu genereren
 * Handig om te testen zonder op de cron te wachten.
 */
export default function WerktijdenAdminKnoppen() {
  const [pending, startTransition] = useTransition()

  const knop = (fn: () => Promise<void>) => () => startTransition(fn)

  const geocode = knop(async () => {
    try {
      const r = await geocodeAdressenAction()
      toast.success(
        `Geocoding klaar — ${r.medewerkers_ok} woonadressen, ${r.bedrijven_ok} werkadressen ` +
          `(${r.medewerkers_geen_match + r.bedrijven_geen_match} zonder match)`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geocoding mislukt')
    }
  })

  const dag = knop(async () => {
    try {
      const r = await runDagoverzichtAction()
      toast.success(
        `Dagoverzicht ${r.datum}: ${r.te_laat}× te laat, ${r.te_vroeg}× te vroeg ` +
          `→ ${r.ontvangers} melding(en)`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dagoverzicht mislukt')
    }
  })

  const maand = knop(async () => {
    try {
      const r = await runMaandrapportAction()
      toast.success(
        `Maandrapport ${r.maand}-${r.jaar}: ${r.bestuurders} bestuurders, ` +
          `${r.met_signalen} met signalen`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Maandrapport mislukt')
    }
  })

  const base =
    'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border disabled:opacity-50'

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={geocode} disabled={pending} className={`${base} bg-white hover:bg-slate-50`}>
        <MapPin className="w-4 h-4" /> Adressen geocoderen
      </button>
      <button onClick={dag} disabled={pending} className={`${base} bg-white hover:bg-slate-50`}>
        <CalendarClock className="w-4 h-4" /> Dagoverzicht nu
      </button>
      <button
        onClick={maand}
        disabled={pending}
        className={`${base} bg-slate-900 text-white border-slate-900 hover:bg-slate-800`}
      >
        <FileBarChart className="w-4 h-4" /> Maandrapport nu
      </button>
    </div>
  )
}
