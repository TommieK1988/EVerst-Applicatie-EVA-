import { addDays, format, parseISO } from 'date-fns'

import type {
  MedewerkerAfwezigheid, MedewerkerRooster, PlanningItemVerrijkt,
} from '@everts/database/platform-types'
import { berekenPlanUren, werkdagOp } from '@/lib/planning/werkuren'

/**
 * Tijden en uren in de planitem-vensters van de Medewerkerplanning (nieuw en bewerken).
 *
 * De uren rekenen met dezelfde regel als de rest van EVA (`lib/planning/werkuren.ts`): werkdagen
 * in de periode volgens het rooster, de eerste en laatste dag naar de ingevulde tijden. Tot
 * oktober 2026 was het urenveld hier een los getal dat bij het aanpassen van de datums bleef
 * staan — een blok van twee dagen hield zo de 8 uur van één dag.
 */

export const tijdVan = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`

/** Begin en einde van de werkdag volgens het rooster van de medewerker op `datum`. */
export function roosterTijden(medewerker_id: string, datum: string, roosters: MedewerkerRooster[]) {
  const wd = werkdagOp(medewerker_id, datum, roosters)
  return { start_tijd: tijdVan(wd.van), eind_tijd: tijdVan(wd.tot) }
}

type TijdenForm = {
  medewerker_id: string; start_datum: string; start_tijd: string; eind_datum: string; eind_tijd: string
}

/** Geplande uren van wat er in het formulier staat (browser = Nederlandse tijd). */
export function urenVolgensRooster(
  f: TijdenForm,
  roosters: MedewerkerRooster[],
  afwezigheid: MedewerkerAfwezigheid[],
): number {
  if (!f.medewerker_id || !f.start_datum || !f.start_tijd || !f.eind_datum || !f.eind_tijd) return 0
  const start = new Date(`${f.start_datum}T${f.start_tijd}`)
  const eind  = new Date(`${f.eind_datum}T${f.eind_tijd}`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(eind.getTime())) return 0
  return berekenPlanUren(f.medewerker_id, start.toISOString(), eind.toISOString(), roosters, afwezigheid)
}

/**
 * Formulierwaarden van een bestaand planitem. Middernacht is geen werktijd maar "de hele dag"
 * (Bouw7-dagblokken, en blokken die al liepen voordat de sync ze roostertijden gaf): dan toont
 * het venster de roostertijd. Een eind op 00:00 is exclusief en hoort bij de dag ervóór.
 */
export function formVanEntry(entry: PlanningItemVerrijkt, roosters: MedewerkerRooster[]) {
  const startDt = parseISO(entry.start_dt)
  const eindDt  = parseISO(entry.eind_dt)
  const start_datum = format(startDt, 'yyyy-MM-dd')
  let   start_tijd  = format(startDt, 'HH:mm')
  let   eind_datum  = format(eindDt, 'yyyy-MM-dd')
  let   eind_tijd   = format(eindDt, 'HH:mm')
  if (start_tijd === '00:00') start_tijd = roosterTijden(entry.medewerker_id, start_datum, roosters).start_tijd
  if (eind_tijd === '00:00' && eind_datum > start_datum) {
    eind_datum = format(addDays(eindDt, -1), 'yyyy-MM-dd')
    eind_tijd  = roosterTijden(entry.medewerker_id, eind_datum, roosters).eind_tijd
  }
  return {
    medewerker_id: entry.medewerker_id,
    start_datum, start_tijd, eind_datum, eind_tijd,
    uren: String(entry.uren),
  }
}

/** Regel onder het urenveld: waar het getal vandaan komt, en de weg terug naar het rooster. */
export function UrenToelichting({ handmatig, uren, berekend, opgeslagen, onTerug }: {
  handmatig:   boolean
  uren:        number
  berekend:    number
  /** Wat er nu in de database staat (alleen bij bewerken). */
  opgeslagen?: number
  onTerug:     () => void
}) {
  const stijl: React.CSSProperties = { margin: '4px 0 0', fontSize: 11, color: 'var(--fg-muted)' }
  if (handmatig) {
    if (uren === berekend) return null
    return (
      <p style={stijl}>
        Volgens rooster {berekend} u.{' '}
        <button type="button" onClick={onTerug} className="eva-btn-ghost" style={{ padding: 0, fontSize: 11 }}>
          Rooster aanhouden
        </button>
      </p>
    )
  }
  const afwijking = opgeslagen != null && Number(opgeslagen) !== berekend
  return (
    <p style={stijl}>
      Werkdagen volgens het rooster; eerste en laatste dag naar de tijden hierboven.
      {afwijking && ` Stond op ${Number(opgeslagen)} u — opslaan zet het recht.`}
    </p>
  )
}
