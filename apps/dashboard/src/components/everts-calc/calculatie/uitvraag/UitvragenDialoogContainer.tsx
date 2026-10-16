'use client'

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { zoekRelaties } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { maakUitvraagPakket } from '@/lib/dossiers/uitvraag-pakketten'
import { getCalculatieregels, getGroepen } from '@/lib/everts-calc/local-store'
import { postenUitSelectie } from '@/lib/everts-calc/uitvraag-weergave'
import { UitvragenDialoog, type UitvraagInvoer } from './UitvragenDialoog'

const zoekOnderaannemers = (term: string) => zoekRelaties(term, 'onderaannemer')

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
  const { posten, naamVoorstel } = useMemo(
    () => postenUitSelectie(regelIds, getCalculatieregels(), getGroepen(scenarioId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function bevestig(invoer: UitvraagInvoer, mailen: boolean) {
    const metPosten = invoer.modus === 'posten' && posten.length > 0
    setBezig(true)
    try {
      const r = await maakUitvraagPakket({
        dossierId,
        naam: invoer.naam.trim(),
        soort: 'onderaannemer',
        scenarioId: metPosten ? scenarioId : null,
        posten: metPosten ? posten : [],
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
      naamVoorstel={regelIds.length > 0 ? naamVoorstel : ''}
      beginModus={regelIds.length > 0 ? 'posten' : 'los'}
      zoekPartijen={zoekOnderaannemers}
      bezig={bezig}
      onBevestig={bevestig}
      onSluit={onSluit}
    />
  )
}
