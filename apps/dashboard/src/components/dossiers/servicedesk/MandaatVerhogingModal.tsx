'use client'

/**
 * Een hoger mandaat aanvragen, of een toegekende verhoging vastleggen.
 *
 * Eén venster voor beide kanten van dezelfde afspraak: je vraagt een bedrag, en als de
 * opdrachtgever ja zegt leg je datzelfde bedrag vast. Twee losse schermen zouden dezelfde velden
 * twee keer vragen.
 */

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  FormField, Input,
} from '@/components/ui'
import { kenMandaatverhogingToe, vraagMandaatverhogingAan } from '@/lib/dossiers/servicedesk-acties'
// Bestaat al en kent het verschil tussen '1.250,50' en '12.5'; een eigen parser hier zou de
// tweede als 125 lezen. Zie DEVELOPMENT_STANDARDS 1.3: een rekenregel heeft er maar een.
import { parseGetal } from '@/lib/everts-calc/calculations'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

export default function MandaatVerhogingModal({
  dossierId, huidigMandaat, modus, onSluit, onKlaar,
}: {
  dossierId: string
  huidigMandaat: number | null
  /** `aanvragen` = vragen aan de opdrachtgever, `toekennen` = het antwoord vastleggen. */
  modus: 'aanvragen' | 'toekennen'
  onSluit: () => void
  onKlaar: () => void
}) {
  const [bedrag, setBedrag] = useState('')
  const [toelichting, setToelichting] = useState('')
  const [bezig, start] = useTransition()

  const aanvragen = modus === 'aanvragen'
  const waarde = parseGetal(bedrag)
  // parseGetal geeft 0 bij onleesbare invoer, dus dat dekt ook een leeg veld af.
  const geldig = waarde > 0 && (!aanvragen || toelichting.trim().length > 0)

  function verstuur() {
    if (!geldig) return
    start(async () => {
      const res = aanvragen
        ? await vraagMandaatverhogingAan(dossierId, { gevraagdBedrag: waarde, toelichting })
        : await kenMandaatverhogingToe(dossierId, { nieuwMandaat: waarde, toelichting })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(aanvragen ? 'Mandaatverhoging aangevraagd' : `Mandaat staat nu op ${euro(waarde)}`)
      onKlaar()
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {aanvragen ? 'Mandaatverhoging aanvragen' : 'Verhoging toekennen'}
          </DialogTitle>
        </DialogHeader>

        {/* De dialoog hangt in een portal buiten `.eva`; daar bestaan de DS-variabelen niet.
            Vandaar Tailwind-klassen in plaats van tokens. */}
        <DialogBody>
          <div className="flex flex-col gap-3.5">
            <p className="text-[13px] text-neutral-600">
              {huidigMandaat != null && huidigMandaat > 0
                ? <>Het mandaat staat nu op <strong>{euro(huidigMandaat)}</strong>.</>
                : <>Er staat nog geen mandaat op deze bon.</>}
            </p>

            <FormField label={aanvragen ? 'Gevraagd mandaat (excl. btw)' : 'Nieuw mandaat (excl. btw)'}>
              <Input
                value={bedrag}
                onChange={e => setBedrag(e.target.value)}
                placeholder="2.500,00"
                inputMode="decimal"
                autoFocus
              />
            </FormField>

            <FormField
              label="Toelichting"
              helper={aanvragen
                ? 'Komt als notitie op de bon te staan; schrijf op waarom het werk meer vraagt.'
                : 'Optioneel — bijvoorbeeld wie akkoord gaf en wanneer.'}
            >
              <textarea
                value={toelichting}
                onChange={e => setToelichting(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-[13px]
                           outline-none focus:border-brand-500"
                placeholder={aanvragen
                  ? 'Achter het plafond zit meer houtrot dan op de bon stond…'
                  : 'Telefonisch akkoord van…'}
              />
            </FormField>

            {/* Het nieuwe bedrag vervángt het oude; dat is hoe een opdrachtgever het ook zegt. */}
            {geldig && huidigMandaat != null && huidigMandaat > 0 && (
              <p className="text-[12px] text-neutral-500">
                {euro(huidigMandaat)} → <strong>{euro(waarde)}</strong>
                {waarde <= huidigMandaat && ' — dat is niet hoger dan het huidige mandaat.'}
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
          <Button variant="primary" onClick={verstuur} disabled={!geldig || bezig} loading={bezig}>
            {aanvragen ? 'Aanvraag vastleggen' : 'Mandaat bijwerken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
