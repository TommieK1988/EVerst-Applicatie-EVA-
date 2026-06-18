'use client'

import { useState, useTransition } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { stelMaandcijfersVast } from '@/app/(platform)/management/actions'

/** Vorige maand als 'YYYY-MM'. */
function vorigeMaand(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function maandLabel(maand: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(maand)
  if (!m) return maand
  return new Date(Number(m[1]), Number(m[2]) - 1, 1)
    .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

export default function MaandcijfersModal({
  open, onOpenChange, bestaandePeriodes, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  bestaandePeriodes: string[]      // 'YYYY-MM-01'
  onDone: (msg: string) => void
}) {
  const [maand, setMaand]         = useState(vorigeMaand)
  const [opmerking, setOpmerking] = useState('')
  const [fout, setFout]           = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const bestaatAl = bestaandePeriodes.includes(`${maand}-01`)

  function handleVaststellen() {
    setFout(null)
    startTransition(async () => {
      const r = await stelMaandcijfersVast({ periode: maand, opmerking })
      if (r.ok) {
        onOpenChange(false)
        setOpmerking('')
        onDone(`✓ Cijfers ${maandLabel(maand)} vastgesteld`)
      } else {
        setFout(r.fout ?? 'Vaststellen mislukt.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div>
            <DialogTitle>Maandcijfers vaststellen</DialogTitle>
            <DialogDescription>
              Bevries de huidige stand (financieel + verkoop + calculators) als de definitieve cijfers van een maand.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-neutral-700">Maand</span>
            <input
              type="month"
              value={maand}
              onChange={e => setMaand(e.target.value)}
              className="h-9 rounded-md border border-neutral-300 px-3 text-[13px] text-neutral-900 focus:border-brand-400 focus:outline-none focus:ring-[3px] focus:ring-brand-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-neutral-700">Opmerking <span className="font-normal text-neutral-400">(optioneel)</span></span>
            <textarea
              value={opmerking}
              onChange={e => setOpmerking(e.target.value)}
              rows={3}
              placeholder="Bijv. besproken in directieoverleg 17 juni"
              className="rounded-md border border-neutral-300 px-3 py-2 text-[13px] text-neutral-900 focus:border-brand-400 focus:outline-none focus:ring-[3px] focus:ring-brand-100"
            />
          </label>

          {bestaatAl && (
            <div className="flex items-start gap-2 rounded-md bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" />
              <span>Er bestaat al een vastgestelde versie van {maandLabel(maand)}. Opnieuw vaststellen <strong>overschrijft</strong> deze.</span>
            </div>
          )}

          {fout && (
            <div className="rounded-md bg-error-50 px-3 py-2 text-[12px] text-error-700">{fout}</div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="md" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuleren
          </Button>
          <Button variant="primary" size="md" loading={pending} onClick={handleVaststellen}>
            {bestaatAl ? 'Overschrijven' : 'Vaststellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
