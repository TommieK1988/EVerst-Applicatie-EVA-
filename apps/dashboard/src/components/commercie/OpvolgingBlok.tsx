'use client'

/**
 * Op de offertekaart: moet deze offerte nagebeld worden, en waarom staat hij stil?
 *
 * Nabellen volgt standaard de bedragklasse (onder € 3k niet, daarboven wel). Per offerte is
 * dat om te zetten: een kleine offerte bij een belangrijke klant wél, een grote die al is
 * afgestemd níet. Wie dat bepaalt komt in de tijdlijn.
 *
 * Elke wijziging slaat meteen op; er is geen opslaan-knop om te vergeten.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { cn } from '@everts/ui'
import { DatePicker } from '@/components/ui/date-picker'
import { datumNaarISO } from '@/lib/dossiers/datum-regels'
import type { Bedragklasse } from '@/lib/commercie/bedragklassen'
import { OPVOLGING_KEUZES, STIL_REDENEN, wordtNagebeld, type Opvolging } from '@/lib/commercie/opvolging'
import { zetOpvolging, zetStilstand } from '@/lib/commercie/opvolging-actions'

type Props = {
  dossierId: string
  klasse: Bedragklasse
  opvolging: Opvolging | null
  stilReden: string | null
  besluitDatum: string | null
}

const naarDatum = (iso: string | null): Date | undefined => {
  if (!iso) return undefined
  const [j, m, d] = iso.slice(0, 10).split('-').map(Number)
  return j && m && d ? new Date(j, m - 1, d) : undefined
}

export function OpvolgingBlok(props: Props) {
  const router = useRouter()
  const [opvolging, setOpvolging] = React.useState(props.opvolging)
  const [reden, setReden] = React.useState(props.stilReden ?? '')
  const [besluit, setBesluit] = React.useState<Date | undefined>(naarDatum(props.besluitDatum))
  const [bezig, setBezig] = React.useState(false)

  // Een andere offerte, of verse gegevens na een refresh: overnemen.
  React.useEffect(() => {
    setOpvolging(props.opvolging)
    setReden(props.stilReden ?? '')
    setBesluit(naarDatum(props.besluitDatum))
  }, [props.dossierId, props.opvolging, props.stilReden, props.besluitDatum])

  async function bewaar(actie: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBezig(true)
    const res = await actie()
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
  }

  const kiesOpvolging = (w: Opvolging | null) => {
    setOpvolging(w)
    void bewaar(() => zetOpvolging(props.dossierId, w))
  }
  const kiesStilstand = (r: string, b: Date | undefined) => {
    setReden(r); setBesluit(b)
    void bewaar(() => zetStilstand(props.dossierId, r || null, b ? datumNaarISO(b) : null))
  }

  const automatisch = wordtNagebeld(props.klasse, null) ? 'nabellen' : 'niet nabellen'

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Nabellen</div>
        <div className="mt-1 inline-flex flex-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-0.5" role="group">
          {OPVOLGING_KEUZES.map(k => (
            <button
              key={k.label}
              type="button"
              disabled={bezig}
              aria-pressed={opvolging === k.waarde}
              title={k.uitleg}
              onClick={() => kiesOpvolging(k.waarde)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition-colors disabled:opacity-60',
                opvolging === k.waarde
                  ? 'bg-white font-semibold text-brand-700 shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                  : 'font-medium text-neutral-500 hover:text-neutral-700',
              )}
            >
              {k.waarde === null ? `Automatisch (${automatisch})` : k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Staat stil omdat</span>
          <select
            className="mt-1 h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
            value={reden}
            disabled={bezig}
            onChange={e => kiesStilstand(e.target.value, besluit)}
          >
            <option value="">Staat niet stil</option>
            {STIL_REDENEN.map(r => <option key={r.sleutel} value={r.sleutel}>{r.label}</option>)}
          </select>
        </label>
        <div className="min-w-0">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Besluit klant</span>
          <DatePicker
            value={besluit}
            onChange={b => kiesStilstand(reden, b)}
            placeholder="Onbekend"
            weergave="kort"
            disabled={bezig}
            className="mt-1 h-8"
          />
        </div>
      </div>
    </div>
  )
}
