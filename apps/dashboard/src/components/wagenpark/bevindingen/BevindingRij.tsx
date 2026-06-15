'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, AlertCircle, Info, Check, X, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { markeerUitzonderingAction, bevestigOvertredingAction } from '@/app/(platform)/wagenpark/actions/compliance'
import { addAllowanceAction } from '@/app/(platform)/wagenpark/actions/allowances'

const dagNamenKort = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/**
 * Format de feitelijke datum of periode van een bevinding.
 * - Zelfde dag: "ma 17 apr"
 * - Range: "01 apr – 17 apr"
 * - Zonder datum: "—"
 */
function formatPeriode(start: string | null, eind: string | null): string {
  if (!start && !eind) return '—'
  const fmt = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
  }
  const fmtMetDag = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return `${dagNamenKort[d.getDay()]} ${fmt(iso)}`
  }
  if (start && eind && start !== eind) {
    return `${fmt(start)} – ${fmt(eind)}`
  }
  return fmtMetDag(start ?? eind ?? '')
}

type Bevinding = {
  id: string
  regel_code: string
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  omschrijving: string
  status: string
  gegenereerd_op: string
  periode_start: string | null
  periode_eind: string | null
  data: unknown
  voertuig_id: string | null
  medewerker_id: string | null
  bestuurder_naam?: string | null
  kenteken?: string | null
  /** Via trip_id → ulu_trips.user_id_ulu gejoinde fallback. */
  ulu_user_id?: number | null
}

const ernstStyle = {
  overtreding: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Overtreding' },
  waarschuwing: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Waarschuwing' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Info' },
}

export default function BevindingRij({ bevinding }: { bevinding: Bevinding }) {
  const [pending, startTransition] = useTransition()
  const [toelichtingOpen, setToelichtingOpen] = useState<null | 'accept' | 'reject' | 'allow'>(null)
  const [toelichting, setToelichting] = useState('')
  const [uitlegOpen, setUitlegOpen] = useState(false)
  const [allowScope, setAllowScope] = useState<'categorie' | 'regel'>('categorie')

  const stijl = ernstStyle[bevinding.ernst]
  const Icon = stijl.icon
  const data = (bevinding.data ?? {}) as Record<string, unknown>
  const uitlegRegel = typeof data.uitleg_regel === 'string' ? data.uitleg_regel : null
  const heeftExtraData = Object.keys(data).some(
    (k) => !['uitleg_regel', 'label'].includes(k),
  )
  const userIdFromData =
    typeof data.user_id_ulu === 'number' ? (data.user_id_ulu as number) : null
  const userId = userIdFromData ?? bevinding.ulu_user_id ?? null
  const categorie =
    typeof data.reden_prive === 'string'
      ? (data.reden_prive as string)
      : typeof data.categorie === 'string'
      ? (data.categorie as string)
      : null
  // "Altijd toestaan" heeft een naam + user-id nodig om zinvol te zijn
  const kanAltijdToestaan = !!bevinding.bestuurder_naam && userId != null

  function submitAction(actie: 'accept' | 'reject' | 'allow') {
    startTransition(async () => {
      try {
        if (actie === 'accept') {
          await markeerUitzonderingAction(bevinding.id, toelichting)
          toast.success('Gemarkeerd als uitzondering')
        } else if (actie === 'reject') {
          await bevestigOvertredingAction(bevinding.id, toelichting)
          toast.success('Bevinding bevestigd')
        } else {
          // 'allow' = persistente allowance voor deze bestuurder + regel (+ categorie)
          const res = await addAllowanceAction({
            bevinding_id: bevinding.id,
            ulu_user_id: userId,
            regel_code: bevinding.regel_code,
            categorie: allowScope === 'categorie' ? categorie : null,
            reden: toelichting || null,
          })
          if (res.ok) {
            const scope =
              allowScope === 'categorie' && categorie
                ? `${bevinding.regel_code} / ${categorie}`
                : bevinding.regel_code
            toast.success(
              `Toegestaan voor ${bevinding.bestuurder_naam} — ${scope}. Vergelijkbare bevindingen automatisch geaccepteerd.`,
            )
          } else {
            toast.error(res.error ?? 'Fout')
          }
        }
        setToelichtingOpen(null)
        setToelichting('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fout')
      }
    })
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded ${stijl.bg} flex-shrink-0 mt-0.5`}>
          <Icon className={`w-4 h-4 ${stijl.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className=" font-semibold text-slate-700">{bevinding.regel_code}</span>
            <span>•</span>
            <span>{stijl.label}</span>
            {bevinding.bestuurder_naam && (
              <>
                <span>•</span>
                <span className="font-medium text-slate-700">{bevinding.bestuurder_naam}</span>
              </>
            )}
            {bevinding.kenteken && (
              <>
                <span>•</span>
                <span className="">{bevinding.kenteken}</span>
              </>
            )}
            <span>•</span>
            <span title={`Gegenereerd: ${new Date(bevinding.gegenereerd_op).toLocaleDateString('nl-NL')}`}>
              {formatPeriode(bevinding.periode_start, bevinding.periode_eind)}
            </span>
            {bevinding.status !== 'open' && (
              <span className="ml-auto px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {bevinding.status.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-800 mt-1">{bevinding.omschrijving}</p>

          {(uitlegRegel || heeftExtraData) && (
            <button
              type="button"
              onClick={() => setUitlegOpen(!uitlegOpen)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              {uitlegOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {uitlegOpen ? 'Minder' : 'Waarom is dit een bevinding?'}
            </button>
          )}

          {uitlegOpen && (
            <div className="mt-2 bg-slate-50 rounded p-3 text-xs space-y-2">
              {uitlegRegel && (
                <div>
                  <div className="font-semibold text-slate-700 mb-1">Regel-uitleg</div>
                  <p className="text-slate-600 leading-relaxed">{uitlegRegel}</p>
                </div>
              )}
              {heeftExtraData && <UitlegData data={data} />}
            </div>
          )}

          {bevinding.status === 'open' && !toelichtingOpen && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                onClick={() => setToelichtingOpen('accept')}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <Check className="w-3 h-3" />
                Eenmalige uitzondering
              </button>
              {kanAltijdToestaan && (
                <button
                  onClick={() => setToelichtingOpen('allow')}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-green-50 hover:bg-green-100 text-green-700"
                  title="Maakt persistente regel: toekomstige vergelijkbare bevindingen worden automatisch geaccepteerd"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Altijd toestaan voor {bevinding.bestuurder_naam}
                </button>
              )}
              <button
                onClick={() => setToelichtingOpen('reject')}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700"
              >
                <X className="w-3 h-3" />
                Bevestig overtreding
              </button>
            </div>
          )}

          {toelichtingOpen && (
            <div className="mt-3 space-y-2">
              {toelichtingOpen === 'allow' && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-xs space-y-2">
                  <div className="font-medium text-green-900">
                    Persistente allowance voor {bevinding.bestuurder_naam}
                  </div>
                  <div className="text-green-800">
                    Reikwijdte:
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="allow-scope"
                      checked={allowScope === 'categorie'}
                      onChange={() => setAllowScope('categorie')}
                      disabled={!categorie}
                    />
                    <span>
                      Alleen deze categorie ({bevinding.regel_code}
                      {categorie ? ` / ${categorie}` : ' / geen specifieke categorie beschikbaar'})
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="allow-scope"
                      checked={allowScope === 'regel'}
                      onChange={() => setAllowScope('regel')}
                    />
                    <span>Hele regel {bevinding.regel_code} (alle categorieën)</span>
                  </label>
                </div>
              )}
              <textarea
                value={toelichting}
                onChange={(e) => setToelichting(e.target.value)}
                placeholder={
                  toelichtingOpen === 'allow'
                    ? 'Reden voor allowance (bv. "werkt structureel in weekend", "mag privé rijden volgens afspraak")…'
                    : 'Toelichting (wordt opgeslagen als leermoment)…'
                }
                rows={2}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submitAction(toelichtingOpen)}
                  disabled={pending}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {pending ? 'Opslaan…' : 'Bevestigen'}
                </button>
                <button
                  onClick={() => { setToelichtingOpen(null); setToelichting('') }}
                  className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Render de data jsonb als leesbare lijst (kv-pairs + speciale behandeling breakdown). */
function UitlegData({ data }: { data: Record<string, unknown> }) {
  const breakdown = data.breakdown as Record<string, number> | undefined
  const label = (k: string): string => {
    const map: Record<string, string> = {
      prive_km: 'Privé-km',
      zakelijk_km: 'Zakelijk-km',
      limiet: 'Limiet',
      drempel: 'Drempel',
      drempel_overtreding: 'Drempel overtreding',
      drempel_waarschuwing: 'Drempel waarschuwing',
      afstand_km: 'Afstand',
      score: 'Rijscore',
      start_tijd: 'Starttijd',
      start_datum: 'Startdatum',
      dag: 'Dag',
      reden_prive: 'Reden privé',
      rit_type_ulu: 'ULU-markering',
      adres_start: 'Vertrek',
      adres_stop: 'Bestemming',
      kenteken: 'Kenteken',
      locatie: 'Locatie',
      duur_uur: 'Duur (uren)',
      duur_min: 'Duur (min)',
      bijtelling: 'Bijtelling',
      verwacht_jaar: 'Verwacht/jaar',
      zakelijk_km_periode: 'Zakelijk (periode)',
      prognose_jaar: 'Prognose jaar',
      totaal_kosten: 'Totale kosten',
      maand: 'Maand',
      bestuurder: 'Bestuurder',
    }
    return map[k] ?? k
  }
  const format = (v: unknown): string => {
    if (v == null) return '—'
    if (typeof v === 'number') {
      return Number.isInteger(v) ? v.toLocaleString('nl-NL') : v.toFixed(1)
    }
    if (typeof v === 'boolean') return v ? 'ja' : 'nee'
    return String(v)
  }
  const skip = new Set(['uitleg_regel', 'label', 'breakdown', 'user_id_ulu', 'type_limiet'])

  return (
    <div>
      <div className="font-semibold text-slate-700 mb-1">Details</div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-slate-600">
        {Object.entries(data)
          .filter(([k]) => !skip.has(k))
          .slice(0, 20)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{label(k)}:</dt>
              <dd>{format(v)}</dd>
            </div>
          ))}
      </dl>
      {breakdown && (
        <div className="mt-2">
          <div className="font-semibold text-slate-700 mb-1">Privé-km opbouw</div>
          <table className="text-slate-600 text-xs">
            <tbody>
              {breakdown.weekend_km > 0 && (
                <tr>
                  <td className="pr-3 text-slate-500">Weekend</td>
                  <td className="pr-3 text-right">{breakdown.weekend_km.toFixed(0)} km</td>
                  <td className="text-slate-400">({breakdown.weekend_ritten} ritten)</td>
                </tr>
              )}
              {breakdown.avond_km > 0 && (
                <tr>
                  <td className="pr-3 text-slate-500">Avond (17-22u)</td>
                  <td className="pr-3 text-right">{breakdown.avond_km.toFixed(0)} km</td>
                  <td className="text-slate-400">({breakdown.avond_ritten} ritten)</td>
                </tr>
              )}
              {breakdown.nacht_km > 0 && (
                <tr>
                  <td className="pr-3 text-slate-500">Nacht (22-05u)</td>
                  <td className="pr-3 text-right">{breakdown.nacht_km.toFixed(0)} km</td>
                  <td className="text-slate-400">({breakdown.nacht_ritten} ritten)</td>
                </tr>
              )}
              {breakdown.vroeg_km > 0 && (
                <tr>
                  <td className="pr-3 text-slate-500">Vroeg (voor 07u)</td>
                  <td className="pr-3 text-right">{breakdown.vroeg_km.toFixed(0)} km</td>
                  <td className="text-slate-400">({breakdown.vroeg_ritten} ritten)</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
