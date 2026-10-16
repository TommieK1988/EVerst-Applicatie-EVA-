'use client'

/**
 * Het paneel met de offertekaart naast de lijst in "Te doen".
 *
 * Op een breed scherm staat het vast náást de lijst, zodat je de lijst blijft zien terwijl je
 * belt en de volgende offerte meteen in beeld is. Op een smaller scherm past dat niet en
 * schuift het als drawer over de lijst. De inhoud is in beide gevallen OfferteKaart.
 */

import * as React from 'react'
import { X } from 'lucide-react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui/drawer'
import type { DossierRij } from '@/components/dossiers/types'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { getOffertePaneel, getOverigeOffertes, type OffertePaneelData, type OverigeOffertes } from '@/lib/commercie/paneel'
import type { TeDoenRij } from './te-doen'
import { OfferteKaart } from './OfferteKaart'

/** Vanaf deze breedte staat het paneel naast de lijst. */
export const NAAST_DE_LIJST = '(min-width: 1280px)'

type Props = {
  /** De rij uit de werklijst; null = paneel dicht. */
  dossier: DossierRij | null
  mijnMedewerkerId: string | null
  medewerkers: { id: string; naam: string }[]
  /** Vandaag als YYYY-MM-DD in Nederlandse tijd; dezelfde peildatum als de werklijst. */
  vandaag: string
  onSluit: () => void
  /** Na een vastgelegde uitkomst: de lijst verversen en de volgende offerte kiezen. */
  onVastgelegd: () => void
  /** Alle open offertes (ook die niet van mij zijn), om "ook open bij" mee te tonen. */
  alleRijen: TeDoenRij[]
  /** Een andere offerte in het paneel openen. */
  onOpen: (id: string) => void
}

export function OfferteZijpaneel(props: Props) {
  const d = props.dossier
  const naast = useMediaQuery(NAAST_DE_LIJST)
  const [data, setData] = React.useState<OffertePaneelData | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)
  const [overigeIds, setOverigeIds] = React.useState<OverigeOffertes | null>(null)

  // Op het id, niet op het rij-object: na router.refresh() komt dezelfde offerte als nieuw object
  // terug, en opnieuw laden zou een half getypte notitie wissen.
  const dossierId = d?.id ?? null
  React.useEffect(() => {
    if (!dossierId) return
    let actief = true
    setData(null); setFout(null); setOverigeIds(null)
    getOffertePaneel(dossierId)
      .then(r => { if (actief) setData(r) })
      .catch((e: unknown) => { if (actief) setFout(e instanceof Error ? e.message : 'Laden mislukt') })
    // Los en stil: zonder dit blok werkt de kaart gewoon.
    getOverigeOffertes(dossierId)
      .then(r => { if (actief) setOverigeIds(r) })
      .catch(() => {})
    return () => { actief = false }
  }, [dossierId])

  const overige = React.useMemo(() => {
    if (!overigeIds) return undefined
    const perId = new Map(props.alleRijen.map(r => [r.id, r]))
    return {
      partij: overigeIds.partij,
      rijen: overigeIds.dossierIds.map(id => perId.get(id)).filter((r): r is TeDoenRij => r != null),
    }
  }, [overigeIds, props.alleRijen])

  const inhoud = !d ? null
    : fout ? <p className="px-4 py-3 text-sm text-error-700">{fout}</p>
    : !data ? <p className="px-4 py-3 text-sm text-neutral-500">Laden…</p>
    : (
      <OfferteKaart
        dossier={d}
        data={data}
        mijnMedewerkerId={props.mijnMedewerkerId}
        medewerkers={props.medewerkers}
        vandaag={props.vandaag}
        onVastgelegd={props.onVastgelegd}
        overige={overige}
        onOpen={props.onOpen}
      />
    )

  if (naast) {
    return (
      <aside
        aria-label="Offertekaart"
        className="sticky top-4 max-h-[calc(100dvh-96px)] overflow-y-auto rounded-[10px] border border-neutral-200 bg-white"
      >
        {d ? (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold leading-5 text-neutral-900">{d.titel}</h2>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {[d.klant_naam, d.dossiernummer].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={props.onSluit}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Sluiten"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {inhoud}
          </>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Kies een offerte in de lijst. Na het vastleggen opent de volgende vanzelf.
          </p>
        )}
      </aside>
    )
  }

  return (
    <Drawer open={d != null} onOpenChange={open => { if (!open) props.onSluit() }}>
      <DrawerContent width={460}>
        <DrawerHeader>
          <DrawerTitle className="truncate">{d?.titel ?? 'Offerte'}</DrawerTitle>
          <DrawerDescription>{[d?.klant_naam, d?.dossiernummer].filter(Boolean).join(' · ')}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="p-0">{inhoud}</DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
