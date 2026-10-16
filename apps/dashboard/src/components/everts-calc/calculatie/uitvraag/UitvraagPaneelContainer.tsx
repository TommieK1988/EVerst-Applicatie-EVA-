'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { markeerOfferteBinnen, zetRekentMet } from '@/lib/dossiers/uitvraag-pakketten'
import type { UitvraagPakket } from '@/lib/dossiers/uitvraag-pakket-types'
import { UitvraagPaneel } from './UitvraagPaneel'

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

/** Dunne schil om het paneel: rekent-met en "Offerte binnen" via de server-acties. */
export function UitvraagPaneelContainer({ open, pakketten, laden, fout, herlaad, focusPakketId, onSluit, onLosseUitvraag, onMail }: {
  open: boolean
  pakketten: UitvraagPakket[]
  laden: boolean
  fout: string | null
  herlaad: () => Promise<void>
  focusPakketId: string | null
  onSluit: () => void
  onLosseUitvraag: () => void
  onMail: (uitvraagId: string) => void
}) {
  const [bezigId, setBezigId] = useState<string | null>(null)

  async function voerUit(id: string, actie: () => Promise<{ ok: true } | { ok: false; error: string }>, gelukt?: string) {
    setBezigId(id)
    try {
      const r = await actie()
      if (!r.ok) { toast.error(r.error); return }
      if (gelukt) toast.success(gelukt)
      await herlaad()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Dat lukte niet')
    } finally {
      setBezigId(null)
    }
  }

  return (
    <UitvraagPaneel
      open={open} pakketten={pakketten} laden={laden} fout={fout}
      focusPakketId={focusPakketId} bezigId={bezigId}
      onSluit={onSluit} onLosseUitvraag={onLosseUitvraag} onMail={onMail}
      onRekentMet={(pakketId, uitvraagId) => voerUit(uitvraagId ?? pakketId, () => zetRekentMet(pakketId, uitvraagId))}
      onOfferteBinnen={(uitvraagId, bestand) => {
        if (!isPdf(bestand)) { toast.error('Kies een pdf-bestand.'); return }
        const fd = new FormData()
        fd.append('bestand', bestand)
        void voerUit(uitvraagId, () => markeerOfferteBinnen(uitvraagId, fd), 'Offerte binnen; de pdf staat bij Bestanden')
      }}
    />
  )
}
