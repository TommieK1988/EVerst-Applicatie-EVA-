import { cn } from '@/lib/wagenpark/utils'

type Props = {
  label: string
  waarde: string | number
  icon?: React.ElementType
  kleur?: 'groen' | 'oranje' | 'rood' | 'blauw' | 'grijs'
  subtekst?: string
}

const kleurMap = {
  groen:  'bg-green-50 text-green-700 ring-green-100',
  oranje: 'bg-orange-50 text-orange-700 ring-orange-100',
  rood:   'bg-red-50 text-red-700 ring-red-100',
  blauw:  'bg-blue-50 text-blue-700 ring-blue-100',
  grijs:  'bg-slate-50 text-slate-700 ring-slate-100',
}

export default function StatCard({ label, waarde, icon: Icon, kleur = 'grijs', subtekst }: Props) {
  return (
    <div className="bg-white rounded-lg border p-5 flex items-start gap-4">
      {Icon && (
        <div className={cn('p-2 rounded-md ring-1', kleurMap[kleur])}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-semibold text-slate-900 mt-1">{waarde}</div>
        {subtekst && <div className="text-xs text-slate-400 mt-1">{subtekst}</div>}
      </div>
    </div>
  )
}
