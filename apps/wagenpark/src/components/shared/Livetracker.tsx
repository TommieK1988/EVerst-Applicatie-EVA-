import { ExternalLink, MapPin } from 'lucide-react'

const ULU_LIVE_URL = 'https://live.cartracker.nl/live'

export default function Livetracker() {
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-2">
        <MapPin className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700 flex-1">Livetracker</h2>
      </div>

      <a
        href={ULU_LIVE_URL}
        target="_blank"
        rel="noreferrer"
        className="block p-8 text-center bg-gradient-to-br from-slate-50 to-green-50 hover:from-slate-100 hover:to-green-100 transition-colors"
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-600 text-white mb-4 shadow-lg">
          <MapPin className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">
          Open live-kaart in ULU
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">
          Realtime positie en status van alle voertuigen. Opent in een nieuw tabblad —
          log eenmalig in op ULU Cartracker.
        </p>
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium shadow">
          <ExternalLink className="w-4 h-4" />
          live.cartracker.nl/live
        </span>
      </a>
    </div>
  )
}
