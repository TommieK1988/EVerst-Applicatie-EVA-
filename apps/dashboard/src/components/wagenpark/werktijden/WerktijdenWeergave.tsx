'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Users } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import type { Periode } from '@/lib/wagenpark/periode'
import PeriodeKiezer from '@/components/wagenpark/werktijden/PeriodeKiezer'
import TelKaarten, { LEGE_TOTALEN, type Totalen } from '@/components/wagenpark/werktijden/TelKaarten'
import WerktijdenTabel, {
  type WerktijdRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'
import SamenvattingTabel from '@/components/wagenpark/werktijden/SamenvattingTabel'

export type Weergave = 'dag' | 'medewerker'

/**
 * Schil om de twee weergaven heen.
 *
 * "Per dag" is de detaillijst met weekgroepen; "Per medewerker" vat dezelfde
 * periode samen tot één regel per persoon met maandkolommen. Beide voeden de
 * tel-kaarten met hun eigen gefilterde rijen, zodat de totalen boven de pagina
 * altijd hetzelfde tellen als wat er in de tabel staat.
 *
 * De keuze staat in de URL zodat hij een periodewissel overleeft en deelbaar is.
 */
export default function WerktijdenWeergave({
  data,
  periode,
  weergave,
  layoutsDag,
  layoutsSamenvatting,
  user_id,
}: {
  data: WerktijdRij[]
  periode: Periode
  weergave: Weergave
  layoutsDag: GebruikerLayout[]
  layoutsSamenvatting: GebruikerLayout[]
  user_id: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [totalen, setTotalen] = useState<Totalen>(LEGE_TOTALEN)
  // Standaard staat álles in beeld, ook de afgehandelde dagen. Een verklaarde
  // dag telt nergens in mee (zie teltMee in lib/wagenpark/werktijd.ts) maar
  // blijft doorgestreept zichtbaar, zodat je kunt zien wat er is weggestreept en
  // waarom. Wil je puur je werklijst, dan zet je dit vinkje aan.
  const [alleenOpen, setAlleenOpen] = useState(false)

  const zichtbaar = useMemo(
    () => (alleenOpen ? data.filter((r) => r.status === 'open') : data),
    [data, alleenOpen],
  )
  const afgehandeld = data.length - zichtbaar.length

  // Stabiele referentie: OverzichtTabel roept dit vanuit een effect aan, dus een
  // nieuwe functie per render zou een extra renderronde per tabelupdate geven.
  const onTotalen = useCallback((t: Totalen) => setTotalen(t), [])

  function kiesWeergave(next: Weergave) {
    const q = new URLSearchParams(params.toString())
    if (next === 'dag') q.delete('weergave')
    else q.set('weergave', next)
    router.push(`/wagenpark/werktijden?${q.toString()}`)
  }

  return (
    <>
      <PeriodeKiezer periode={periode} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 w-fit">
          <WeergaveKnop
            actief={weergave === 'dag'}
            icon={CalendarDays}
            label="Per dag"
            onKlik={() => kiesWeergave('dag')}
          />
          <WeergaveKnop
            actief={weergave === 'medewerker'}
            icon={Users}
            label="Per medewerker"
            onKlik={() => kiesWeergave('medewerker')}
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={alleenOpen}
            onChange={(e) => setAlleenOpen(e.target.checked)}
            className="rounded border-slate-300 text-green-600 focus:ring-green-600"
          />
          Verberg afgehandelde dagen
          {afgehandeld > 0 && (
            <span className="text-slate-400">({afgehandeld} afgehandeld)</span>
          )}
        </label>
      </div>

      <TelKaarten totalen={totalen} />

      {weergave === 'medewerker' ? (
        <SamenvattingTabel
          data={zichtbaar}
          layouts={layoutsSamenvatting}
          user_id={user_id}
          periode={periode}
          onTotalen={onTotalen}
          onMedewerkerKlik={() => kiesWeergave('dag')}
        />
      ) : (
        <WerktijdenTabel
          data={zichtbaar}
          layouts={layoutsDag}
          user_id={user_id}
          onTotalen={onTotalen}
        />
      )}
    </>
  )
}

function WeergaveKnop({
  actief,
  icon: Icon,
  label,
  onKlik,
}: {
  actief: boolean
  icon: React.ElementType
  label: string
  onKlik: () => void
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
        actief ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}
