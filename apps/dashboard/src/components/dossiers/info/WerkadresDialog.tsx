'use client'

/**
 * Venster om een extra werkadres toe te voegen of te wijzigen. Postcode + huisnummer vullen straat
 * en plaats aan via PDOK, net als bij een nieuwe aanvraag — dan klopt het adres en vindt de
 * geocoder het ook (anders werkt de prikklok er niet).
 */

import React, { useEffect, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Button, Input, FormField, FormRow,
} from '@/components/ui'
import { eersteHuisnummer, zoekAdres } from '@/lib/adres/pdok'
import {
  voegWerkadresToe, wijzigWerkadres, type ExtraWerkadres, type WerkadresInvoer,
} from '@/lib/dossiers/werkadressen-actions'

const LEEG: WerkadresInvoer = {
  naam: '', straat: '', huisnummer: '', postcode: '', stad: '', contact_naam: '', contact_telefoon: '',
}

export default function WerkadresDialog({
  dossierId, bestaand, onOpgeslagen, onSluit,
}: {
  dossierId: string
  /** Leeg = nieuw adres. */
  bestaand: ExtraWerkadres | null
  onOpgeslagen: (w: ExtraWerkadres) => void
  onSluit: () => void
}) {
  const [v, setV] = useState<WerkadresInvoer>(() => bestaand
    ? {
        naam: bestaand.naam ?? '', straat: bestaand.straat ?? '', huisnummer: bestaand.huisnummer ?? '',
        postcode: bestaand.postcode ?? '', stad: bestaand.stad ?? '',
        contact_naam: bestaand.contact_naam ?? '', contact_telefoon: bestaand.contact_telefoon ?? '',
      }
    : LEEG)
  const [adresStatus, setAdresStatus] = useState<'idle' | 'zoeken' | 'gevonden' | 'niet_gevonden'>('idle')
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Postcode + huisnummer waarmee het venster opende: daarop niet opnieuw zoeken. (Een "eerste
  // render"-vlag werkt niet: in de dev-modus draait React elk effect twee keer.)
  const beginSleutel = useRef(`${bestaand?.postcode ?? ''}|${bestaand?.huisnummer ?? ''}`)

  const zet = (k: keyof WerkadresInvoer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV(oud => ({ ...oud, [k]: e.target.value }))

  // Postcode + huisnummer → straat en plaats aanvullen (niet overschrijven wat er al staat).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const pc = (v.postcode ?? '').trim()
    const hn = (v.huisnummer ?? '').trim()
    if (!pc || !hn || `${v.postcode}|${v.huisnummer}` === beginSleutel.current) { setAdresStatus('idle'); return }
    beginSleutel.current = ''
    setAdresStatus('zoeken')
    timer.current = setTimeout(async () => {
      const res = await zoekAdres({ postcode: pc, huisnummer: hn }).catch(() => [])
      const exact = res.find(a => eersteHuisnummer(a.huisnummer) === eersteHuisnummer(hn))
      const gekozen = exact ?? res[0]
      if (!gekozen) { setAdresStatus('niet_gevonden'); return }
      setV(oud => ({
        ...oud,
        straat: (oud.straat ?? '').trim() ? oud.straat : gekozen.straat,
        stad: (oud.stad ?? '').trim() ? oud.stad : gekozen.stad,
        postcode: gekozen.postcode || oud.postcode,
      }))
      setAdresStatus(exact ? 'gevonden' : 'niet_gevonden')
    }, 500)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [v.postcode, v.huisnummer])

  const bewaar = () => startTransition(async () => {
    const res = bestaand ? await wijzigWerkadres(bestaand.id, v) : await voegWerkadresToe(dossierId, v)
    if (!res.ok) { toast.error(res.error); return }
    if (res.werkadres.geocode_status === 'geen_match') {
      toast('Opgeslagen, maar de locatie van dit adres is niet gevonden. Inklokken werkt hier pas als het adres klopt.', { icon: '⚠️' })
    } else {
      toast.success('Werkadres opgeslagen')
    }
    onOpgeslagen(res.werkadres)
  })

  const kanBewaren = !!((v.straat ?? '').trim() || (v.postcode ?? '').trim())

  return (
    <Dialog open onOpenChange={open => !open && !isPending && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{bestaand ? 'Werkadres wijzigen' : 'Werkadres toevoegen'}</DialogTitle>
            <DialogDescription>
              Voor opdrachten op meerdere locaties. De prikklok en navigatie werken op elk adres.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <FormField label="Naam" upper optional helper="Bijv. Vestiging Zwolle of Complex Kerkstraat">
              <Input value={v.naam ?? ''} onChange={zet('naam')} autoFocus />
            </FormField>
            <FormRow cols="2">
              <FormField label="Postcode" upper>
                <Input value={v.postcode ?? ''} onChange={zet('postcode')} placeholder="1234 AB" />
              </FormField>
              <FormField
                label="Huisnummer" upper
                helper={adresStatus === 'zoeken' ? 'Adres zoeken…' : undefined}
                success={adresStatus === 'gevonden' ? 'Adres gevonden' : undefined}
                error={adresStatus === 'niet_gevonden' ? 'Adres niet gevonden — controleer het' : undefined}
              >
                <Input value={v.huisnummer ?? ''} onChange={zet('huisnummer')} />
              </FormField>
            </FormRow>
            <FormRow cols="2">
              <FormField label="Straat" upper>
                <Input value={v.straat ?? ''} onChange={zet('straat')} />
              </FormField>
              <FormField label="Plaats" upper>
                <Input value={v.stad ?? ''} onChange={zet('stad')} />
              </FormField>
            </FormRow>
            <FormRow cols="2">
              <FormField label="Contactpersoon" upper optional>
                <Input value={v.contact_naam ?? ''} onChange={zet('contact_naam')} />
              </FormField>
              <FormField label="Telefoon" upper optional>
                <Input type="tel" value={v.contact_telefoon ?? ''} onChange={zet('contact_telefoon')} />
              </FormField>
            </FormRow>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onSluit} disabled={isPending}>Annuleren</Button>
          <Button type="button" onClick={bewaar} loading={isPending} disabled={!kanBewaren || isPending}>
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
