'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import toast from 'react-hot-toast'
import { laadBehandelingen, haalCombinaties, haalSchilderDropdownData } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderBehandeling, SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'
import type { Calculatieregel, Componentregel } from '@/lib/everts-calc/types'
import {
  getComponentregels, getMeetregelAggregaten, slaCalculatieregelOp,
} from '@/lib/everts-calc/local-store'
import { heeftBibliotheekNormen, planKoppeling } from '@/lib/everts-calc/behandeling-koppelen'
import { vervangNormenUitCombinatie } from '@/lib/everts-calc/normen-uit-combinatie'

/**
 * De schilderwerkbibliotheek voor het hele rekenblad: één keer geladen, gedeeld door
 * alle regels. Koppelen op één regel loopt via dezelfde planKoppeling als "Behandeling
 * per code", zodat beide precies hetzelfde doen.
 */
export interface BehandelingKoppeling {
  behandelingen: SchilderBehandeling[]
  /** Onderdeel uit de meetstaat ("Boeideel hout"), of null bij een handmatige regel. */
  onderdeelVan: (regel: Calculatieregel) => string | null
  /** Heeft de bibliotheek normen voor deze behandeling op het type van de regel? */
  heeftNormen: (regel: Calculatieregel, behandelingId: string) => boolean | null
  /**
   * Koppelt (of wist, bij `null`) de behandeling. Met `normenOvernemen` vervangen de
   * bibliotheeknormen de normen van de regel; de vraag óf dat mag stelt de rij zelf.
   */
  koppel: (regel: Calculatieregel, behandeling: SchilderBehandeling | null, normenOvernemen: boolean) => Promise<void>
}

const Ctx = createContext<BehandelingKoppeling>({
  behandelingen: [],
  onderdeelVan: () => null,
  heeftNormen: () => null,
  koppel: async () => {},
})

export const BehandelingProvider = Ctx.Provider
export const useBehandelingKoppeling = () => useContext(Ctx)

export function useBehandelingBibliotheek({ regels, setRegels, setComponenten, duwSnapshot, onWijziging }: {
  regels: Calculatieregel[]
  setRegels: Dispatch<SetStateAction<Calculatieregel[]>>
  setComponenten: Dispatch<SetStateAction<Componentregel[]>>
  duwSnapshot: () => void
  onWijziging: () => void
}): BehandelingKoppeling {
  const [behandelingen, setBehandelingen] = useState<SchilderBehandeling[]>([])
  const [combinaties, setCombinaties] = useState<{ type_id: string; behandeling_id: string }[] | null>(null)
  useEffect(() => {
    laadBehandelingen().then(setBehandelingen).catch(() => setBehandelingen([]))
    haalSchilderDropdownData().then(d => setCombinaties(d.combinaties)).catch(() => setCombinaties(null))
  }, [])

  // Aggregaten veranderen alleen bij een meetstaat-sync, en die herlaadt de regels.
  const aggPerId = useMemo(
    () => new Map(getMeetregelAggregaten().map(a => [a.id, a])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regels],
  )
  const aggVan = useCallback((r: Calculatieregel) =>
    r.meetstaat_aggregaat_id ? aggPerId.get(r.meetstaat_aggregaat_id) : undefined, [aggPerId])

  const onderdeelVan = useCallback((r: Calculatieregel) => aggVan(r)?.onderdeel?.trim() || null, [aggVan])
  const heeftNormen = useCallback((r: Calculatieregel, behId: string) =>
    heeftBibliotheekNormen(aggVan(r)?.type_id, behId, combinaties), [aggVan, combinaties])

  const koppel = useCallback(async (regel: Calculatieregel, b: SchilderBehandeling | null, normenOvernemen: boolean) => {
    if (!b) {
      duwSnapshot()
      const nieuw = { ...regel, schilderbehandeling_id: undefined, schilderbehandeling: undefined }
      slaCalculatieregelOp(nieuw)
      setRegels(prev => prev.map(r => r.id === regel.id ? nieuw : r))
      onWijziging()
      return
    }
    const typeId = aggVan(regel)?.type_id
    const perType = new Map<string, SchilderCombinatie[]>()
    if (normenOvernemen && typeId) perType.set(typeId, await haalCombinaties(typeId).catch(() => []))
    const [stap] = planKoppeling([regel], getMeetregelAggregaten(), perType, { id: b.id, naam: b.naam })

    duwSnapshot()
    slaCalculatieregelOp(stap.nieuw)
    if (normenOvernemen && stap.combinatie) {
      vervangNormenUitCombinatie(regel.id, stap.combinatie)
      setComponenten(prev => [...prev.filter(c => c.calculatieregel_id !== regel.id), ...getComponentregels(regel.id)])
    }
    setRegels(prev => prev.map(r => r.id === regel.id ? stap.nieuw : r))
    onWijziging()
    if (normenOvernemen && typeId && !stap.combinatie) {
      toast(`${b.code || b.naam}: geen normen in de bibliotheek voor dit onderdeel. De normen blijven zoals ze waren.`)
    }
  }, [aggVan, duwSnapshot, onWijziging, setRegels, setComponenten])

  return useMemo(() => ({ behandelingen, onderdeelVan, heeftNormen, koppel }),
    [behandelingen, onderdeelVan, heeftNormen, koppel])
}
