'use client'

/**
 * "Te doen": de werklijst van de offertebewaking, met de offertekaart ernaast.
 *
 * Het bord beantwoordt "waar staat de pijplijn?", deze lijst beantwoordt "wat moet ik vandaag
 * doen?". Dat is een andere vraag en dus een andere ordening: op urgentie, niet op fase. Wie hier
 * bovenaan begint en naar beneden werkt, heeft aan het eind van de dag niets laten liggen.
 *
 * Dit bestand is de regie: filters, welke offerte openstaat, de belronde. Het rekenwerk staat in
 * te-doen.ts, de weergave in TeDoenLijst en OfferteKaart.
 *
 * Wat hier bewust NIET in staat: offertes die pas over weken spelen en slapende (uitgestelde)
 * kansen. Die staan achter "Ook wat later speelt" (of de tegel Later). Zonder die afbakening
 * wordt de lijst een tweede dossieroverzicht en verliest hij zijn functie.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@everts/ui'
import type { DossierRij } from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { vandaagNL } from '@/lib/wagenpark/periode'
import { getMedewerkers } from '@/lib/dossiers/actions'
import { getLaatsteContacten } from '@/lib/commercie/paneel'
import { maakTeDoenRij, sorteerTeDoen, type Bak, type LaatsteContact } from './te-doen'
import { TeDoenLijst, TeDoenTegels } from './TeDoenLijst'
import { OfferteZijpaneel } from './OfferteZijpaneel'

type Props = {
  dossiers: DossierRij[]
  /** Niet meer gebruikt sinds de eigen lijst; blijft in de signatuur voor DossierViewSwitcher. */
  layouts?: GebruikerLayout[]
  user_id?: string | null
  /** Medewerker-id van de ingelogde gebruiker; draagt "alleen van mij" en "jij bent aan zet". */
  mijnMedewerkerId: string | null
  viewToggle?: React.ReactNode
  extraActies?: React.ReactNode
}

/** Per gebruiker onthouden: wie "alleen van mij" uitzet, wil dat de volgende keer ook. */
const OPSLAG_MIJ = 'offerte-tedoen-alleen-van-mij'
const OPSLAG_LATER = 'offerte-tedoen-ook-later'

function leesVlag(sleutel: string, standaard: boolean): boolean {
  try {
    const v = localStorage.getItem(sleutel)
    return v == null ? standaard : v === '1'
  } catch { return standaard }
}
function schrijfVlag(sleutel: string, waarde: boolean) {
  try { localStorage.setItem(sleutel, waarde ? '1' : '0') } catch { /* privémodus: niet onthouden */ }
}

export function BewakingWerklijst(props: Props) {
  const router = useRouter()
  // Standaard alleen je eigen offertes: dit is een werklijst, geen pijplijnoverzicht.
  const [alleenVanMij, setAlleenVanMij] = React.useState(true)
  const [toonLater, setToonLater] = React.useState(false)
  React.useEffect(() => {
    setAlleenVanMij(leesVlag(OPSLAG_MIJ, true))
    setToonLater(leesVlag(OPSLAG_LATER, false))
  }, [])
  const zetVanMij = (v: boolean) => { setAlleenVanMij(v); schrijfVlag(OPSLAG_MIJ, v) }
  const zetLater = (v: boolean) => { setToonLater(v); schrijfVlag(OPSLAG_LATER, v) }

  const [tegel, setTegel] = React.useState<Bak | null>(null)
  const vandaag = React.useMemo(() => vandaagNL(), [])

  // Afgesloten offertes (de terugblik op gewonnen/verloren) horen niet in een werklijst.
  const alle = React.useMemo(
    () => props.dossiers.map(d => maakTeDoenRij(d, vandaag)).filter(r => r._status !== 'afgerond'),
    [props.dossiers, vandaag],
  )
  const vanMij = React.useMemo(
    () => alleenVanMij && props.mijnMedewerkerId
      ? alle.filter(r => r.bewaking_actiehouder_id === props.mijnMedewerkerId
          || r.bewaking_eigenaar_id === props.mijnMedewerkerId
          // Wat nog niemand heeft opgepakt, is van iedereen: anders ziet niemand het.
          || r._bak === 'ongetrieerd')
      : alle,
    [alle, alleenVanMij, props.mijnMedewerkerId],
  )
  const zichtbaar = React.useMemo(
    () => vanMij
      .filter(r => (tegel ? r._bak === tegel : toonLater || r._bak !== 'later'))
      .sort(sorteerTeDoen),
    [vanMij, toonLater, tegel],
  )

  // Laatste contact per offerte: zit niet in de dossierlijst, dus los en achteraf geladen.
  const [laatsteContact, setLaatsteContact] = React.useState<Map<string, LaatsteContact>>(new Map())
  const idSleutel = React.useMemo(() => alle.map(r => r.id).sort().join(','), [alle])
  React.useEffect(() => {
    const ids = idSleutel ? idSleutel.split(',') : []
    if (ids.length === 0) return
    let actief = true
    getLaatsteContacten(ids)
      .then(regels => { if (actief) setLaatsteContact(new Map(regels.map(r => [r.dossierId, r]))) })
      .catch(() => { /* de kolom blijft dan leeg; de lijst werkt gewoon */ })
    return () => { actief = false }
  }, [idSleutel])

  /** De offerte die in het paneel openstaat. */
  const [geopendId, setGeopendId] = React.useState<string | null>(null)
  const [medewerkers, setMedewerkers] = React.useState<{ id: string; naam: string }[]>([])
  React.useEffect(() => {
    if (!geopendId || medewerkers.length > 0) return
    getMedewerkers().then(setMedewerkers).catch(() => {})
  }, [geopendId, medewerkers.length])

  const geopend = React.useMemo(
    () => props.dossiers.find(d => d.id === geopendId) ?? null,
    [props.dossiers, geopendId],
  )

  // Belronde: na een vastgelegde uitkomst opent de volgende offerte uit de lijst zoals je hem ziet.
  const naVastleggen = React.useCallback(() => {
    const ids = zichtbaar.map(r => r.id)
    const i = geopendId ? ids.indexOf(geopendId) : -1
    setGeopendId(i >= 0 && i + 1 < ids.length ? ids[i + 1] : null)
    router.refresh()
  }, [geopendId, zichtbaar, router])

  const kiesTegel = (b: Bak | null) => {
    setTegel(b)
    if (b === 'later' && !toonLater) zetLater(true)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segment
            opties={[
              { waarde: true, label: 'Van mij', uit: !props.mijnMedewerkerId },
              { waarde: false, label: 'Van iedereen' },
            ]}
            gekozen={alleenVanMij && !!props.mijnMedewerkerId}
            onKies={zetVanMij}
          />
          <button
            type="button"
            aria-pressed={toonLater}
            onClick={() => zetLater(!toonLater)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              toonLater
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50',
            )}
          >
            Ook wat later speelt
          </button>
        </div>
        <div className="flex items-center gap-2">{props.extraActies}{props.viewToggle}</div>
      </div>

      <TeDoenTegels alleRijen={vanMij} tegel={tegel} onTegel={kiesTegel} />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TeDoenLijst
          rijen={zichtbaar}
          alleRijen={vanMij}
          tegel={tegel}
          onTegel={kiesTegel}
          geopendId={geopendId}
          onOpen={setGeopendId}
          mijnMedewerkerId={props.mijnMedewerkerId}
          laatsteContact={laatsteContact}
          vandaag={vandaag}
        />
        <OfferteZijpaneel
          dossier={geopend}
          mijnMedewerkerId={props.mijnMedewerkerId}
          medewerkers={medewerkers}
          vandaag={vandaag}
          onSluit={() => setGeopendId(null)}
          onVastgelegd={naVastleggen}
        />
      </div>
    </div>
  )
}

function Segment<T>({ opties, gekozen, onKies }: {
  opties: { waarde: T; label: string; uit?: boolean }[]
  gekozen: T
  onKies: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5" role="group">
      {opties.map(o => (
        <button
          key={o.label}
          type="button"
          disabled={o.uit}
          aria-pressed={gekozen === o.waarde}
          onClick={() => onKies(o.waarde)}
          className={cn(
            'rounded-md px-3 py-1 text-xs transition-colors disabled:opacity-40',
            gekozen === o.waarde
              ? 'bg-white font-semibold text-brand-700 shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
              : 'font-medium text-neutral-500 hover:text-neutral-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
