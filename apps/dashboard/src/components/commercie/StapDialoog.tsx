'use client'

/**
 * "Stap aanpassen": de volgende stap, kans en verwachte opdracht handmatig zetten, zonder dat er
 * een klantcontact aan voorafging. Voor na een gesprek is er de uitkomst; dit is voor de
 * uitzonderingen (een datum verschuiven, de stap aan een collega geven).
 *
 * De eigenaar staat hier bewust niet in: die wijzig je op de kaart zelf. Twee plekken voor
 * hetzelfde veld gaven eerder twee waarheden.
 */

import * as React from 'react'
import toast from 'react-hot-toast'
import { cn } from '@everts/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { FormField } from '@/components/ui/form-field'
import { MedewerkerKiezer } from '@/components/ui/medewerker-kiezer'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { datumNaarISO } from '@/lib/dossiers/datum-regels'
import { slaStapOp } from '@/lib/commercie/actions'
import type { BewakingKaart } from '@/lib/commercie/types'

/** Stappen van 5%; 0 en 100 horen erbij als bewuste uitersten. */
const KANS_STAPPEN = Array.from({ length: 21 }, (_, i) => i * 5)

const SELECT = 'h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900'

export function StapDialoog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dossierId: string
  kaart: BewakingKaart | null
  medewerkers: { id: string; naam: string }[]
  onOpgeslagen: () => void
}) {
  const k = props.kaart
  const [actiehouder, setActiehouder] = React.useState('')
  const [stapSoort, setStapSoort] = React.useState<'actie' | 'wachten'>('actie')
  const [stapTekst, setStapTekst] = React.useState('')
  const [wachtOp, setWachtOp] = React.useState<'klant' | 'intern' | 'extern'>('klant')
  const [datum, setDatum] = React.useState<Date | undefined>()
  const [kans, setKans] = React.useState('')
  const [verwacht, setVerwacht] = React.useState('')
  const [bezig, setBezig] = React.useState(false)

  React.useEffect(() => {
    if (!props.open) return
    setActiehouder(k?.actiehouder_id ?? '')
    setStapSoort(k?.stap_soort ?? 'actie')
    setStapTekst(k?.stap_tekst ?? '')
    setWachtOp(k?.wacht_op ?? 'klant')
    setDatum(k?.stap_datum ? new Date(`${k.stap_datum}T12:00:00`) : undefined)
    setKans(k?.kans_pct != null ? String(k.kans_pct) : '')
    setVerwacht(k?.verwachte_opdracht ? k.verwachte_opdracht.slice(0, 7) : '')
  }, [props.open, k])

  async function opslaan() {
    if (!stapTekst.trim() || !datum || !actiehouder) {
      toast.error('Een volgende stap heeft een omschrijving, een datum en iemand die hem oppakt.')
      return
    }
    setBezig(true)
    const res = await slaStapOp(props.dossierId, {
      actiehouderId: actiehouder,
      stapSoort,
      stapTekst: stapTekst.trim(),
      stapDatum: datumNaarISO(datum),
      wachtOp: stapSoort === 'wachten' ? wachtOp : null,
      kansPct: kans === '' ? null : Number(kans),
      // Maandprecisie: de database bewaart de eerste van de maand.
      verwachteOpdracht: verwacht ? `${verwacht}-01` : null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Opgeslagen')
    props.onOpenChange(false)
    props.onOpgeslagen()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Stap aanpassen</DialogTitle>
            <DialogDescription>
              Na een klantcontact gebruik je de uitkomst. Dit is voor de uitzonderingen.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <FormField label="Wie is aan zet?" upper>
            <div className="grid grid-cols-2 gap-2">
              {(['actie', 'wachten'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={stapSoort === s}
                  onClick={() => setStapSoort(s)}
                  className={cn('rounded-md border px-2 py-1.5 text-xs',
                    stapSoort === s
                      ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                      : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50')}
                >
                  {s === 'actie' ? 'Wij' : 'Een ander, wij wachten'}
                </button>
              ))}
            </div>
          </FormField>

          {stapSoort === 'wachten' && (
            <FormField label="Bij wie ligt de bal?" htmlFor="stap-wachtop" upper>
              <select id="stap-wachtop" className={SELECT} value={wachtOp} onChange={e => setWachtOp(e.target.value as typeof wachtOp)}>
                <option value="klant">De klant</option>
                <option value="intern">Een collega</option>
                <option value="extern">Een derde partij</option>
              </select>
            </FormField>
          )}

          <FormField label={stapSoort === 'wachten' ? 'Waar wachten we op?' : 'Wat moet er gebeuren?'} htmlFor="stap-tekst" upper>
            <Input id="stap-tekst" value={stapTekst} onChange={e => setStapTekst(e.target.value)} />
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={stapSoort === 'wachten' ? 'Controleren op' : 'Uiterlijk op'} upper>
              <DatePicker value={datum} onChange={setDatum} />
            </FormField>
            <FormField label={stapSoort === 'wachten' ? 'Wie controleert' : 'Wie pakt het op'} upper>
              <MedewerkerKiezer medewerkers={props.medewerkers} value={actiehouder} onChange={setActiehouder} className="h-9" />
            </FormField>
          </div>

          {/* Kans en verwachte opdracht voeden de gewogen pijplijn onder Management → Verkoop. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Kans op opdracht" htmlFor="stap-kans" upper optional>
              <select id="stap-kans" className={SELECT} value={kans} onChange={e => setKans(e.target.value)}>
                <option value="">Onbekend</option>
                {KANS_STAPPEN.map(p => <option key={p} value={String(p)}>{p}%</option>)}
              </select>
            </FormField>
            <FormField label="Verwachte opdracht" htmlFor="stap-verwacht" upper optional>
              <Input id="stap-verwacht" type="month" value={verwacht} onChange={e => setVerwacht(e.target.value)} />
            </FormField>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Annuleren</Button>
          <Button disabled={bezig} onClick={opslaan}>{bezig ? 'Bezig…' : 'Opslaan'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
