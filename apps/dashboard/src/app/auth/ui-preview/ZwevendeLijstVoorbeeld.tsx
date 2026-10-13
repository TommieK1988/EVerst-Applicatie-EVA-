'use client'
import React from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { ZwevendeLijst } from '@/components/ui/zwevende-lijst'

const OPTIES = ['OHD 03 · Dekkend buiten hout', 'OHD 05 · Transparant buiten hout', 'OSD 08 · Betonband buiten',
  'OSD 54 · Muurverf binnen', 'NSD55 · Latex plafond', 'OHD 53 · Plaatselijk verwijderen', 'OHD 61 · Onderhoudsbeurt']

/**
 * Zoekveld onderaan een venster: precies de plek waar een keuzelijst vroeger achter de
 * rand van het venster verdween. `?lijst=open` opent venster én lijst meteen, voor een
 * screenshot zonder klikken.
 */
export default function ZwevendeLijstVoorbeeld() {
  const startOpen = useSearchParams().get('lijst') === 'open'
  const [zoek, setZoek] = React.useState(startOpen ? 'o' : '')
  const [open, setOpen] = React.useState(startOpen)
  const [gekozen, setGekozen] = React.useState<string | null>(null)
  const gevonden = OPTIES.filter(o => o.toLowerCase().includes(zoek.toLowerCase()))

  return (
    <Dialog defaultOpen={startOpen}>
      <DialogTrigger asChild><Button variant="outline">Zoeklijst in modal</Button></DialogTrigger>
      <DialogContent size="md">
        <DialogHeader><div><DialogTitle>Behandeling kiezen</DialogTitle><DialogDescription>De lijst valt over de rand van het venster heen.</DialogDescription></div></DialogHeader>
        <DialogBody>
          <p className="mb-3">Gekozen: {gekozen ?? '—'}</p>
          <ZwevendeLijst
            open={open && gevonden.length > 0}
            onSluit={() => setOpen(false)}
            className="py-1"
            anker={
              <div>
                <input
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[13px]"
                  value={zoek}
                  placeholder="Zoek behandeling…"
                  onChange={e => { setZoek(e.target.value); setOpen(true) }}
                  onFocus={() => setOpen(true)}
                />
              </div>
            }
          >
            {gevonden.map(o => (
              <button key={o} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-neutral-100"
                onMouseDown={() => { setGekozen(o); setOpen(false) }}>
                {o}
              </button>
            ))}
          </ZwevendeLijst>
        </DialogBody>
        <DialogFooter><Button variant="outline">Annuleren</Button><Button>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
