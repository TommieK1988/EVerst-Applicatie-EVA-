'use client'

import { useState } from 'react'
import type { Meetregel, MeetstaatElement, MeetstaatElementRegel } from '@/lib/everts-calc/types'
import { slaMeetstaatElementOp } from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import { berekenHoeveelheid } from '@/lib/everts-calc/meetstaat-utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface Props {
  meetstaatId: string
  /** De aangevinkte regels, in de volgorde waarin ze in het rekenblad staan. */
  regels: Meetregel[]
  /** Terugvalnaam als geen van de regels een element-label draagt. */
  standaardNaam: string
  onOpgeslagen: () => void
  onSluit: () => void
}

/**
 * Bewaart de aangevinkte meetregels als herbruikbaar element binnen déze meetstaat.
 * De regels worden gekopieerd, niet gerefereerd: het element blijft wat het was,
 * ook als de oorspronkelijke regels daarna veranderen of verdwijnen.
 */
export default function ElementOpslaanDialog({
  meetstaatId, regels, standaardNaam, onOpgeslagen, onSluit,
}: Props) {
  const [naam, setNaam] = useState(regels.find(r => r.element?.trim())?.element?.trim() || standaardNaam)

  const opslaan = () => {
    const schoon = naam.trim()
    if (!schoon) { toast.error('Geef het element een naam'); return }

    const nu = new Date().toISOString()
    const element: MeetstaatElement = {
      id: nieuweId(),
      meetstaat_id: meetstaatId,
      naam: schoon,
      regels: regels.map(stripRegel),
      aangemaakt_op: nu,
      aangepast_op: nu,
    }
    slaMeetstaatElementOp(element)
    toast.success(`Element "${schoon}" opgeslagen (${regels.length} ${regels.length === 1 ? 'regel' : 'regels'})`)
    onOpgeslagen()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSluit() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Element opslaan</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4 py-4">
          <div>
            <label htmlFor="element-naam" className="block text-xs font-medium text-slate-500 mb-1">
              Naam van het element
            </label>
            <input
              id="element-naam"
              autoFocus
              value={naam}
              onChange={e => setNaam(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); opslaan() } }}
              placeholder="bijv. Kozijn type A"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200
                         focus:border-everts/40 focus:outline-none focus:ring-1 focus:ring-everts/20"
            />
          </div>

          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {regels.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="flex-1 min-w-0 truncate text-slate-700">
                  {[r.onderdeel, r.type, r.behandeling].filter(Boolean).join(' · ') || 'Regel zonder onderdeel'}
                </span>
                <span className="flex-shrink-0 font-semibold text-slate-500">
                  {berekenHoeveelheid({ ...r, aantal: 1 }).toFixed(2)} {r.eenheid}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400">
            Het element wordt bewaard als één stuk: de maten blijven zoals ze er nu staan,
            het aantal gaat naar 1. Bij het invoegen vraagt EVA hoe vaak het stuk voorkomt.
            Het blijft binnen deze meetstaat en is daarna in elke groep in te voegen.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onSluit}>Annuleren</Button>
          <Button size="sm" onClick={opslaan}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Haalt de plaatsgebonden velden eraf: die krijgt de regel bij het invoegen opnieuw.
 * Bewust wegstrepen in plaats van overnemen wat we kennen — zo reist een later
 * toegevoegd meetregelveld vanzelf mee in het element.
 *
 * Het aantal gaat altijd naar 1: een element is de maatvoering van één stuk. Hoe
 * vaak dat stuk voorkomt hoort bij de plek waar je het invoegt, niet bij het element
 * zelf — daar wordt bij het toevoegen om gevraagd.
 */
function stripRegel(r: Meetregel): MeetstaatElementRegel {
  const kopie: Partial<Meetregel> = { ...r, aantal: 1 }
  // Het rekenblad plakt zijn debounce-timer op de regel; die hoort niet in een element.
  delete (kopie as { _saveTimer?: unknown })._saveTimer
  delete kopie.id
  delete kopie.meetstaat_id
  delete kopie.groep_id
  delete kopie.volgorde
  delete kopie.is_leeg
  delete kopie.aangepast_op
  return kopie as MeetstaatElementRegel
}
