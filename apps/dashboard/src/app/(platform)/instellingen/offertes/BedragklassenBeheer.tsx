'use client'

/**
 * De grenzen van de bedragklassen in de offertebewaking: klein, middel, groot en mega.
 *
 * Wat ze sturen: klein staat standaard niet in de belronde van Te doen; mega krijgt extra regels
 * (eigenaar projectleider of directie, hercontrole uiterlijk na twee weken). Middel ligt
 * tussen klein en groot en heeft geen eigen grens.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Input } from '@/components/ui'
import { FormField } from '@/components/ui/form-field'
import {
  bedragklasseLabels, grenzenFout, STANDAARD_GRENZEN, type Bedragklassegrenzen,
} from '@/lib/commercie/bedragklassen'
import { setBedragklassegrenzen } from '@/lib/commercie/bedragklassen-actions'

const VELDEN: { sleutel: keyof Bedragklassegrenzen; label: string; uitleg: string }[] = [
  { sleutel: 'kleinTot',   label: 'Klein tot',   uitleg: 'Hieronder: niet in de belronde' },
  { sleutel: 'grootVanaf', label: 'Groot vanaf', uitleg: 'Daartussen: middel' },
  { sleutel: 'megaVanaf',  label: 'Mega vanaf',  uitleg: 'Eigenaar projectleider of directie' },
]

const leesBedrag = (v: string): number => Number(v.replace(/[^0-9]/g, ''))

export default function BedragklassenBeheer({ initial }: { initial: Bedragklassegrenzen }) {
  const router = useRouter()
  const [waarden, setWaarden] = useState<Record<keyof Bedragklassegrenzen, string>>({
    kleinTot: String(initial.kleinTot), grootVanaf: String(initial.grootVanaf), megaVanaf: String(initial.megaVanaf),
  })
  const [busy, setBusy] = useState(false)

  const grenzen: Bedragklassegrenzen = {
    kleinTot: leesBedrag(waarden.kleinTot),
    grootVanaf: leesBedrag(waarden.grootVanaf),
    megaVanaf: leesBedrag(waarden.megaVanaf),
  }
  const fout = grenzenFout(grenzen)

  async function opslaan() {
    if (fout) { toast.error(fout); return }
    setBusy(true)
    const r = await setBedragklassegrenzen(grenzen)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Bedragklassen opgeslagen')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs text-neutral-500">
        Bedragen excl. btw. Ze bepalen welke offertes standaard in de belronde van Te doen staan
        (klein niet) en voor welke offertes de mega-regels gelden. Per offerte blijft het om te
        zetten op de offertekaart.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {VELDEN.map(v => (
          <FormField key={v.sleutel} label={v.label} htmlFor={`bk-${v.sleutel}`} upper helper={v.uitleg}>
            <Input
              id={`bk-${v.sleutel}`}
              inputMode="numeric"
              value={waarden[v.sleutel]}
              onChange={e => setWaarden(w => ({ ...w, [v.sleutel]: e.target.value }))}
            />
          </FormField>
        ))}
      </div>
      {fout ? (
        <p className="m-0 text-xs text-error-700">{fout}</p>
      ) : (
        <p className="m-0 text-xs text-neutral-600">
          {bedragklasseLabels(grenzen).map(l => `${l.label}: ${l.uitleg.replace(', niet nabellen', '')}`).join(' · ')}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={opslaan} disabled={busy || !!fout}>{busy ? 'Opslaan…' : 'Opslaan'}</Button>
        <Button
          variant="ghost"
          onClick={() => setWaarden({
            kleinTot: String(STANDAARD_GRENZEN.kleinTot),
            grootVanaf: String(STANDAARD_GRENZEN.grootVanaf),
            megaVanaf: String(STANDAARD_GRENZEN.megaVanaf),
          })}
        >
          Standaard terugzetten
        </Button>
      </div>
    </div>
  )
}
