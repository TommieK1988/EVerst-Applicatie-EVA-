'use client'

import { addDays, format } from 'date-fns'
import { useMemo } from 'react'
import type { Medewerker, MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { KLEUR, RIJ_HOOGTE, type PlanningLayout } from './layout/index'
import { afwezigenPerDag } from './afwezigheid-teller'

/**
 * Tellerregel "Afwezig" bovenaan de Medewerkerplanning (weergave Kantoor).
 *
 * Kantoorpersoneel heeft geen planitems; wat je daar wilt zien is wie er wanneer weg is, en
 * vooral wanneer dat samenvalt. Per werkdag staat hier hoeveel van de getoonde medewerkers
 * afwezig zijn. Eén persoon is een lichte markering; twee of meer is een overlap en kleurt
 * fel rood. Hover toont de namen.
 *
 * Weekenden, feestdagen en ATV-dagen tellen niet mee: daar is iedereen vrij en een rood vak
 * zou dan niets zeggen.
 */

const EEN_AFWEZIG_BG  = 'rgba(239,68,68,0.14)'
const OVERLAP_BG      = '#dc2626'

export function AfwezigheidTellerLabel() {
  return (
    <div style={{
      height: RIJ_HOOGTE, display: 'flex', alignItems: 'center',
      paddingLeft: 12, borderBottom: `1px solid ${KLEUR.border}`,
      background: KLEUR.bg,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: KLEUR.fgMuted,
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        Afwezig
      </span>
    </div>
  )
}

export function AfwezigheidTellerRij({
  top, dagen, layout, medewerkers, afwezigheidPerMedewerker, vrijeDagen,
}: {
  top:                      number
  dagen:                    Date[]
  layout:                   PlanningLayout
  medewerkers:              Medewerker[]
  afwezigheidPerMedewerker: Record<string, MedewerkerAfwezigheid[]>
  vrijeDagen:               Set<string>
}) {
  const { xVoor, breedteVoor } = layout
  const perDag = useMemo(
    () => afwezigenPerDag(medewerkers, afwezigheidPerMedewerker, vrijeDagen),
    [medewerkers, afwezigheidPerMedewerker, vrijeDagen],
  )

  return (
    <>
      <div style={{
        position: 'absolute', top, left: 0, right: 0, height: RIJ_HOOGTE,
        background: KLEUR.bg, borderBottom: `1px solid ${KLEUR.border}`,
        pointerEvents: 'none',
      }} />
      {dagen.map(dag => {
        const iso      = format(dag, 'yyyy-MM-dd')
        const afwezig  = perDag.get(iso)
        if (!afwezig?.length) return null
        const overlap  = afwezig.length > 1
        const left     = xVoor(iso)
        const width    = breedteVoor(iso, format(addDays(dag, 1), 'yyyy-MM-dd'))
        const titel    = `${format(dag, 'dd-MM-yyyy')} · ${afwezig.length} afwezig\n` +
          afwezig.map(a => `${a.naam}${a.afdeling ? ` (${a.afdeling})` : ''} — ${a.label}`).join('\n')
        return (
          <div
            key={iso}
            title={titel}
            style={{
              position: 'absolute', top: top + 4, height: RIJ_HOOGTE - 8,
              left: left + 1, width: Math.max(2, width - 2),
              borderRadius: 4,
              background: overlap ? OVERLAP_BG : EEN_AFWEZIG_BG,
              color: overlap ? 'white' : KLEUR.fg,
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
              zIndex: 4,
            }}
          >
            {width >= 14 ? afwezig.length : null}
          </div>
        )
      })}
    </>
  )
}
