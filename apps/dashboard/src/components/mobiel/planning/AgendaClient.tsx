'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addMonths, isSameMonth, subMonths } from 'date-fns'
import {
  dagSleutel, dedupeItems, indexeerPerDag, maandSleutel, maandUitSleutel,
  sorteerDagItems, type AgendaItem,
} from '@/lib/agenda/agenda-model'
import { haalAgendaMaand } from '@/app/m/planning/actions'
import MaandGrid from './MaandGrid'
import DagLijst from './DagLijst'
import ItemSheet from './ItemSheet'

/**
 * Mobiele agenda — maandrooster boven, dagagenda eronder.
 *
 * De server levert drie maanden mee; verder terug of vooruit laadt dit component
 * bij via de server action. Bewust geen querystring-navigatie: die zou bij elke
 * maandtik de geselecteerde dag en de scrollpositie weggooien, `MobielPullToRefresh`
 * remounten, en een swipe kun je niet aan een routewissel hangen.
 */
export default function AgendaClient({ items, peilMaand, startDag, opgehaaldOp }: {
  items: AgendaItem[]
  /** 'yyyy-MM' van het venster dat de server meegaf. */
  peilMaand: string
  startDag: string
  /** Wisselt bij elke server-render; het sein om bijgeladen maanden te vergeten. */
  opgehaaldOp: string
}) {
  const [peil, setPeil] = useState(() => maandUitSleutel(peilMaand))
  const [geselecteerd, setGeselecteerd] = useState(startDag)
  const [extra, setExtra] = useState<Map<string, AgendaItem[]>>(new Map())
  const [bezigMaand, setBezigMaand] = useState<string | null>(null)
  const [gekozen, setGekozen] = useState<AgendaItem | null>(null)

  const initieleMaanden = useMemo(() => {
    const p = maandUitSleutel(peilMaand)
    return [maandSleutel(subMonths(p, 1)), peilMaand, maandSleutel(addMonths(p, 1))]
  }, [peilMaand])

  const geladenRef = useRef<Set<string>>(new Set(initieleMaanden))
  const lopendRef = useRef<Set<string>>(new Set())
  const vorigeOphaalRef = useRef(opgehaaldOp)

  // Na een pull-to-refresh zijn de server-items vers, maar de bijgeladen maanden oud.
  // Die vergeten we; de effect hieronder haalt de zichtbare maand meteen opnieuw op.
  useEffect(() => {
    if (vorigeOphaalRef.current === opgehaaldOp) return
    vorigeOphaalRef.current = opgehaaldOp
    setExtra(new Map())
    geladenRef.current = new Set(initieleMaanden)
  }, [opgehaaldOp, initieleMaanden])

  const laadMaand = useCallback((sleutel: string, zichtbaar: boolean) => {
    if (geladenRef.current.has(sleutel) || lopendRef.current.has(sleutel)) return
    lopendRef.current.add(sleutel)
    if (zichtbaar) setBezigMaand(sleutel)

    haalAgendaMaand(sleutel)
      .then(nieuwe => {
        geladenRef.current.add(sleutel)
        setExtra(prev => new Map(prev).set(sleutel, nieuwe))
      })
      // Fail-soft: een mislukte maand blijft leeg en wordt opnieuw geprobeerd zodra
      // je er weer naartoe navigeert. Een foutmelding zou hier alleen maar in de weg staan.
      .catch(() => {})
      .finally(() => {
        lopendRef.current.delete(sleutel)
        setBezigMaand(huidig => (huidig === sleutel ? null : huidig))
      })
  }, [])

  // Zichtbare maand eerst, dan de buren: doorswipen voelt dan direct in plaats van leeg.
  useEffect(() => {
    laadMaand(maandSleutel(peil), true)
    laadMaand(maandSleutel(subMonths(peil, 1)), false)
    laadMaand(maandSleutel(addMonths(peil, 1)), false)
  }, [peil, extra, laadMaand])

  const alles = useMemo(
    () => dedupeItems([...items, ...[...extra.values()].flat()]),
    [items, extra],
  )
  const perDag = useMemo(() => indexeerPerDag(alles), [alles])
  const dagItems = useMemo(
    () => sorteerDagItems(perDag.get(geselecteerd) ?? []),
    [perDag, geselecteerd],
  )

  const wisselMaand = useCallback((delta: -1 | 1) => {
    setPeil(vorige => {
      const nieuw = addMonths(vorige, delta)
      // De selectie mee laten verspringen, anders toont de lijst een dag die niet
      // meer in beeld staat. In de huidige maand is vandaag de logische keuze.
      const vandaag = new Date()
      setGeselecteerd(isSameMonth(nieuw, vandaag)
        ? dagSleutel(vandaag)
        : dagSleutel(new Date(nieuw.getFullYear(), nieuw.getMonth(), 1)))
      return nieuw
    })
  }, [])

  const naarVandaag = useCallback(() => {
    const vandaag = new Date()
    setPeil(new Date(vandaag.getFullYear(), vandaag.getMonth(), 1))
    setGeselecteerd(dagSleutel(vandaag))
  }, [])

  return (
    <>
      {/* Sticky, niet fixed: de shell-regel verbiedt `fixed` voor onderbalken binnen
          het scrollgebied, en fixed zou hier bovendien over de AppHeader schuiven. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <MaandGrid
          peil={peil}
          geselecteerd={geselecteerd}
          perDag={perDag}
          bezig={bezigMaand !== null}
          onKiesDag={setGeselecteerd}
          onWisselMaand={wisselMaand}
          onVandaag={naarVandaag}
        />
      </div>

      <DagLijst dag={geselecteerd} items={dagItems} onKies={setGekozen} />

      {gekozen && <ItemSheet item={gekozen} onSluit={() => setGekozen(null)} />}
    </>
  )
}
