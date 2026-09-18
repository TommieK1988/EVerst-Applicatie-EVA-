'use client'

import { useState } from 'react'
import { Boxes, Trash2 } from 'lucide-react'
import type { MeetstaatElement } from '@/lib/everts-calc/types'
import { getMeetstaatElementen, verwijderMeetstaatElement } from '@/lib/everts-calc/local-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useDialogen } from '@/components/ui/dialogen'

interface Props {
  meetstaatId: string
  groepNaam: string
  onKies: (element: MeetstaatElement, aantal: number) => void
  /** Na verwijderen: de meetstaat is gewijzigd en moet opnieuw worden opgeslagen. */
  onWijziging: () => void
  onSluit: () => void
}

/** Kiest een binnen deze meetstaat bewaard element om in de huidige groep te plakken. */
export default function ElementKiezerDialog({
  meetstaatId, groepNaam, onKies, onWijziging, onSluit,
}: Props) {
  const { bevestig } = useDialogen()
  const [teller, setTeller] = useState(0)
  // Hoe vaak het element in deze groep voorkomt. Een element is de maatvoering van
  // één stuk; dit aantal komt op de ingevoegde regels te staan.
  const [aantal, setAantal] = useState('1')
  void teller // herteken na verwijderen

  const aantalGetal = Math.max(1, Math.round(parseFloat(aantal.replace(',', '.')) || 1))

  const elementen = getMeetstaatElementen(meetstaatId)
    .sort((a, b) => b.aangepast_op.localeCompare(a.aangepast_op))

  const verwijder = async (el: MeetstaatElement) => {
    const akkoord = await bevestig({
      titel: `Element "${el.naam}" verwijderen?`,
      omschrijving: 'Het verdwijnt uit deze meetstaat. Al ingevoegde regels blijven staan.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!akkoord) return
    verwijderMeetstaatElement(el.id)
    onWijziging()
    setTeller(n => n + 1)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSluit() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Element toevoegen aan {groepNaam}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3 max-h-80 py-4">
          {elementen.length > 0 && (
            <div className="flex items-center gap-3">
              <label htmlFor="element-aantal" className="text-xs font-medium text-slate-500">
                Hoe vaak komt dit element voor?
              </label>
              <input
                id="element-aantal"
                type="number" min="1" step="1"
                value={aantal}
                onChange={e => setAantal(e.target.value)}
                className="w-20 text-sm text-right px-2 py-1 rounded-lg border border-slate-200
                           focus:border-everts/40 focus:outline-none focus:ring-1 focus:ring-everts/20"
              />
              <span className="text-xs text-slate-400">× komt als aantal op de regels</span>
            </div>
          )}

          {elementen.length === 0 ? (
            <EmptyState
              icon={<Boxes className="w-6 h-6" />}
              title="Nog geen elementen"
              description="Vink meetregels aan en kies 'Element opslaan' om er een te maken"
              tone="neutral"
              size="sm"
            />
          ) : (
            elementen.map(el => (
              <div
                key={el.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 hover:border-everts/40 hover:bg-everts/5"
              >
                <Button
                  variant="ghost"
                  onClick={() => onKies(el, aantalGetal)}
                  className="flex-1 h-auto flex items-start gap-3 px-4 py-3 text-left justify-start hover:bg-transparent"
                >
                  <Boxes className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{el.naam}</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {el.regels.length} {el.regels.length === 1 ? 'regel' : 'regels'}
                      {aantalGetal > 1 && ` · ${aantalGetal}×`} ·{' '}
                      {new Date(el.aangemaakt_op).toLocaleDateString('nl-NL', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                </Button>
                <button
                  onClick={() => void verwijder(el)}
                  title="Element verwijderen"
                  className="flex-shrink-0 p-2 mr-2 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onSluit}>Annuleren</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
