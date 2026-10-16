'use client'

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { zoekRelaties } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { maakUitvraagPakket } from '@/lib/dossiers/uitvraag-pakketten'
import { getCalculatieregels, getComponentregels, getGroepen } from '@/lib/everts-calc/local-store'
import { materialenUitSelectie, postenUitSelectie } from '@/lib/everts-calc/uitvraag-weergave'
import { UitvragenDialoog, type UitvraagInvoer } from './UitvragenDialoog'


/**
 * Dunne schil om het venster: zoekt de aangevinkte regels op in het werkgeheugen van de
 * calculatie en legt het pakket vast. `regelIds` leeg = een losse uitvraag.
 */
export function UitvragenDialoogContainer({ dossierId, scenarioId, regelIds, onAangemaakt, onSluit }: {
  dossierId: string
  scenarioId: string
  regelIds: string[]
  /** Na opslaan: de nieuwe uitvraag-ids, en of er meteen gemaild moet worden. */
  onAangemaakt: (uitvraagIds: string[], mailen: boolean) => void
  onSluit: () => void
}) {
  const [bezig, setBezig] = useState(false)
  // Eén keer bij openen: het venster werkt met de selectie zoals hij toen was.
  const { posten, naamVoorstel, materialen } = useMemo(
    () => {
      const regels = getCalculatieregels()
      return {
        ...postenUitSelectie(regelIds, regels, getGroepen(scenarioId)),
        materialen: materialenUitSelectie(regelIds, regels, getComponentregels()),
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function bevestig(invoer: UitvraagInvoer, mailen: boolean) {
    const metRegels = invoer.modus !== 'los'
    const regels = metRegels ? invoer.regels.filter(r => r.omschrijving.trim()) : []
    setBezig(true)
    try {
      const r = await maakUitvraagPakket({
        dossierId,
        naam: invoer.naam.trim(),
        soort: invoer.soort,
        inhoud: invoer.modus === 'materialen' ? 'materialen' : 'posten',
        scenarioId: metRegels ? scenarioId : null,
        posten: regels,
        partijen: invoer.partijen,
        reactieUiterlijk: invoer.reactieUiterlijk,
        projectbezoekOp: invoer.bezoekDatum
          ? new Date(`${invoer.bezoekDatum}T${invoer.bezoekTijd || '09:00'}:00`).toISOString()
          : null,
      })
      if (!r.ok) { toast.error(r.error); return }
      toast.success(mailen ? 'Uitvraag opgeslagen' : 'Uitvraag opgeslagen, nog niet gemaild')
      onAangemaakt(r.data.uitvraagIds, mailen)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uitvraag opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  return (
    <UitvragenDialoog
      posten={posten}
      materialen={materialen}
      naamVoorstel={regelIds.length > 0 ? naamVoorstel : ''}
      beginModus={regelIds.length > 0 ? 'posten' : 'los'}
      zoekPartijen={zoekRelaties}
      bezig={bezig}
      onBevestig={bevestig}
      onSluit={onSluit}
    />
  )
}
