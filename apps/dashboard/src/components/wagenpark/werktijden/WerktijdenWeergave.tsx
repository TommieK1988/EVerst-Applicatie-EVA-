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
import MedewerkerDetail from '@/components/wagenpark/werktijden/MedewerkerDetail'

export type Weergave = 'dag' | 'medewerker'

/**
 * Schil om de drie weergaven heen.
 *
 * "Per dag" is de detaillijst met weekgroepen; "Per medewerker" vat dezelfde
 * periode samen tot één regel per persoon met maandkolommen; klik je daar op
 * iemand, dan sta je in zijn eigen lijst met alle gemarkeerde dagen (de
 * `medewerker`-parameter). De eerste twee voeden de tel-kaarten met hun eigen
 * gefilterde rijen, zodat de totalen boven de pagina altijd hetzelfde tellen als
 * wat er in de tabel staat; de derde toont zijn eigen, uitgebreidere cijfers.
 *
 * De keuze staat in de URL zodat hij een periodewissel overleeft en deelbaar is.
 */
export default function WerktijdenWeergave({
  data,
  periode,
  weergave,
  medewerker,
  medewerkerNaam,
  layoutsDag,
  layoutsSamenvatting,
  layoutsMedewerker,
  user_id,
}: {
  data: WerktijdRij[]
  periode: Periode
  weergave: Weergave
  /** ULU-id van de medewerker waarop is ingezoomd, of null voor het overzicht. */
  medewerker: string | null
  medewerkerNaam: string | null
  layoutsDag: GebruikerLayout[]
  layoutsSamenvatting: GebruikerLayout[]
  layoutsMedewerker: GebruikerLayout[]
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

  // Ingezoomd op één persoon: dat filter gaat vóór alles, ook vóór het
  // open/afgehandeld-vinkje.
  const vanMedewerker = useMemo(
    () => (medewerker ? data.filter((r) => r.user_id_ulu === medewerker) : data),
    [data, medewerker],
  )

  const zichtbaar = useMemo(
    () => (alleenOpen ? vanMedewerker.filter((r) => r.status === 'open') : vanMedewerker),
    [vanMedewerker, alleenOpen],
  )
  const afgehandeld = vanMedewerker.length - zichtbaar.length

  // Stabiele referentie: OverzichtTabel roept dit vanuit een effect aan, dus een
  // nieuwe functie per render zou een extra renderronde per tabelupdate geven.
  const onTotalen = useCallback((t: Totalen) => setTotalen(t), [])

  /** Bouwt een URL met dezelfde periode, maar andere weergave/medewerker. */
  const gaNaar = useCallback(
    (next: { weergave?: Weergave; medewerker?: string | null }) => {
      const q = new URLSearchParams(params.toString())

      if (next.weergave !== undefined) {
        if (next.weergave === 'dag') q.delete('weergave')
        else q.set('weergave', next.weergave)
      }
      if (next.medewerker !== undefined) {
        if (next.medewerker) q.set('medewerker', next.medewerker)
        else q.delete('medewerker')
      }

      router.push(`/wagenpark/werktijden?${q.toString()}`)
    },
    [params, router],
  )

  return (
    <>
      <PeriodeKiezer periode={periode} />

      {medewerker ? (
        <MedewerkerDetail
          medewerkerId={medewerker}
          naam={medewerkerNaam ?? vanMedewerker[0]?.bestuurder ?? 'Medewerker'}
          /* Bewust álles, ook de verklaarde dagen: die staan doorgestreept in de
             lijst en tellen nergens in mee, maar in een gesprek wil je kunnen
             laten zien wát er is weggestreept. Zelfde keuze als in de PDF. */
          data={vanMedewerker}
          periode={periode}
          layouts={layoutsMedewerker}
          user_id={user_id}
          onTerug={() => gaNaar({ weergave: 'medewerker', medewerker: null })}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 w-fit">
              <WeergaveKnop
                actief={weergave === 'dag'}
                icon={CalendarDays}
                label="Per dag"
                onKlik={() => gaNaar({ weergave: 'dag' })}
              />
              <WeergaveKnop
                actief={weergave === 'medewerker'}
                icon={Users}
                label="Per medewerker"
                onKlik={() => gaNaar({ weergave: 'medewerker' })}
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

            {weergave === 'medewerker' && (
              <span className="text-xs text-slate-400">
                Klik op een medewerker voor al zijn dagen en de uitdraai.
              </span>
            )}
          </div>

          <TelKaarten totalen={totalen} />

          {weergave === 'medewerker' ? (
            // De maandkolommen horen bij de gekozen periode. Ze zijn `vast`, maar
            // de bewaarde kolomstand wordt alleen bij het opbouwen van de tabel
            // toegepast — zonder deze sleutel blijft een al gemonteerde tabel de
            // maanden van de vorige periode tonen.
            <SamenvattingTabel
              key={`${periode.van}|${periode.tot}`}
              data={zichtbaar}
              layouts={layoutsSamenvatting}
              user_id={user_id}
              periode={periode}
              onTotalen={onTotalen}
              onMedewerkerKlik={(rij) => gaNaar({ medewerker: rij.id })}
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
