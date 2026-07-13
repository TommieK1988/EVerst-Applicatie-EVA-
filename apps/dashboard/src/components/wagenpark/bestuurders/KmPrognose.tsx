import { TrendingUp, CircleCheck, CircleAlert, CircleX } from 'lucide-react'

type Props = {
  km_zakelijk: number
  km_prive: number
  prognose_zakelijk: number
  prognose_prive: number
  target_zakelijk: number
  target_prive: number
  dagen: number
  bijtelling: boolean
  /** Verberg de privé-kaart (voor gebruikers zonder recht op privé-ritten). */
  verbergPrive?: boolean
}

function categoriseerPrognose(prognose: number, target: number): {
  label: string
  kleur: string
  icon: React.ElementType
} {
  const pct = target > 0 ? prognose / target : 0
  if (pct >= 1) return { label: 'Over target', kleur: 'text-red-700 bg-red-50', icon: CircleX }
  if (pct >= 0.8) return { label: 'Bijna over', kleur: 'text-orange-700 bg-orange-50', icon: CircleAlert }
  return { label: 'Onder target', kleur: 'text-green-700 bg-green-50', icon: CircleCheck }
}

export default function KmPrognose({
  km_zakelijk, km_prive,
  prognose_zakelijk, prognose_prive,
  target_zakelijk, target_prive,
  dagen, bijtelling, verbergPrive = false,
}: Props) {
  const prog = Math.round((100 * dagen) / 365)
  const zakCat = categoriseerPrognose(prognose_zakelijk, target_zakelijk)
  const prvCat = categoriseerPrognose(prognose_prive, target_prive)
  const ZakIcon = zakCat.icon
  const PrvIcon = prvCat.icon

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">Prognose huidige jaar</h2>
        <span className="ml-auto text-xs text-slate-500">
          Op basis van {dagen} dagen ({prog}% van het jaar)
        </span>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${verbergPrive ? '' : 'sm:grid-cols-2'}`}>
        {/* Zakelijk */}
        <div className={`rounded border p-4 ${zakCat.kleur.replace('text-', 'border-').replace('-700', '-200')}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1 rounded ${zakCat.kleur}`}>
              <ZakIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-700">Zakelijk</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${zakCat.kleur}`}>{zakCat.label}</span>
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {prognose_zakelijk.toLocaleString('nl-NL')} km
          </div>
          <div className="text-xs text-slate-500 mt-1">
            YTD: {Math.round(km_zakelijk).toLocaleString('nl-NL')} km · Target: {target_zakelijk.toLocaleString('nl-NL')} km/jaar
          </div>
          <ProgressBar value={prognose_zakelijk} max={target_zakelijk} kleur={zakCat.kleur} />
        </div>

        {/* Privé — alleen voor gebruikers met recht op privé-ritten */}
        {!verbergPrive && (
        <div className={`rounded border p-4 ${prvCat.kleur.replace('text-', 'border-').replace('-700', '-200')}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1 rounded ${prvCat.kleur}`}>
              <PrvIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-700">
              Privé {bijtelling ? '(bijtelling)' : '(geen bijtelling)'}
            </span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${prvCat.kleur}`}>{prvCat.label}</span>
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {prognose_prive.toLocaleString('nl-NL')} km
          </div>
          <div className="text-xs text-slate-500 mt-1">
            YTD: {Math.round(km_prive).toLocaleString('nl-NL')} km · Target: {target_prive.toLocaleString('nl-NL')} km/jaar
          </div>
          <ProgressBar value={prognose_prive} max={target_prive} kleur={prvCat.kleur} />
        </div>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-3">
        Extrapolatie is lineair: YTD km × (365/dagen). Niet-werkdagen en vakanties zitten er
        niet in. Betrouwbaar na ~3 maanden data.
      </p>
    </div>
  )
}

function ProgressBar({ value, max, kleur }: { value: number; max: number; kleur: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  const barKleur = kleur.includes('red')
    ? 'bg-red-500'
    : kleur.includes('orange')
    ? 'bg-orange-500'
    : 'bg-green-500'
  return (
    <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className={`h-full ${barKleur} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}
