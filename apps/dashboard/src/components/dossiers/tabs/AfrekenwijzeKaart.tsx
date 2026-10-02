'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardBody, FormField, Input, Switch, useBevestig } from '@/components/ui'
import { zetAfrekenwijzeOpdracht, type AfrekenwijzeStand } from '@/lib/dossiers/afrekenwijze'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import MandaatIndicator from './MandaatIndicator'

const alsTekst = (n: number | null) =>
  n == null ? '' : n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "5.000,50", "5000,50" en "5000.50" zijn allemaal vijfduizend en een halve euro. */
function leesBedrag(tekst: string): number | null {
  const t = tekst.trim().replace(/[€\s]/g, '')
  if (t === '') return null
  const genormaliseerd = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '')
  return Number(genormaliseerd)
}

/**
 * De schakelaar "Regieopdracht" bovenaan de Verkoop-tab van een opdracht.
 *
 * Eén schakelaar en geen twee knoppen: een opdracht is óf aangenomen óf regie, nooit allebei.
 * Op slot zodra er gefactureerd is — de reden staat er dan bij. Het mandaat is een plafond, geen
 * bedrag dat gefactureerd wordt; het verschijnt alleen op regie.
 */
export default function AfrekenwijzeKaart({ dossierId, stand, geboekt }: {
  dossierId: string
  stand: AfrekenwijzeStand
  /** Geboekte verkoopwaarde van het regiewerk (incl. al gefactureerd), voor de mandaatmeter. */
  geboekt: number
}) {
  const router = useRouter()
  const bevestig = useBevestig()
  const alleenLezen = useDossierReadOnly()
  const [bezig, start] = useTransition()
  const [regie, setRegie] = useState(stand.regie)
  const [mandaat, setMandaat] = useState(alsTekst(stand.mandaat))

  const opSlot = alleenLezen || stand.slot != null

  function opslaan(nieuwRegie: boolean, mandaatTekst: string) {
    const bedrag = leesBedrag(mandaatTekst)
    if (bedrag != null && !(bedrag >= 0)) {
      toast.error('Vul het mandaat in als bedrag, bijvoorbeeld 5000 of 5.000,00.')
      return
    }
    start(async () => {
      const res = await zetAfrekenwijzeOpdracht(dossierId, { regie: nieuwRegie, mandaat: bedrag })
      if (!res.ok) {
        setRegie(stand.regie)
        toast.error(res.error)
        return
      }
      if (res.waarschuwing) toast.error(res.waarschuwing, { duration: 8000 })
      else toast.success(nieuwRegie === stand.regie ? 'Mandaat opgeslagen' : `Opdracht staat nu op ${nieuwRegie ? 'regie' : 'aangenomen'}`)
      router.refresh()
    })
  }

  async function wissel(nieuwRegie: boolean) {
    const ok = await bevestig({
      titel: nieuwRegie ? 'Opdracht op regie zetten?' : 'Opdracht weer aangenomen maken?',
      omschrijving: nieuwRegie
        ? <>
            De aanneemsom vervalt: in EVA én in Bouw7 komt hij op nul. Alles wat op deze opdracht
            geboekt wordt, wordt op nacalculatie gefactureerd via Regiewerkzaamheden.
            {stand.aantalTermijnen > 0 && (
              <><br /><br />Er {stand.aantalTermijnen === 1 ? 'staat 1 termijn' : `staan ${stand.aantalTermijnen} termijnen`} in
                de termijnstaat. De termijnstaat blijft in Bouw7 staan; verwijder de termijnen daar als ze
                niet meer kloppen.</>
            )}
          </>
        : 'De aanneemsom van de offerte gaat weer naar Bouw7 en de opdracht wordt via termijnen gefactureerd.',
      bevestigLabel: nieuwRegie ? 'Op regie zetten' : 'Aangenomen maken',
    })
    if (!ok) return
    setRegie(nieuwRegie)
    opslaan(nieuwRegie, nieuwRegie ? mandaat : '')
  }

  const mandaatGetal = stand.mandaat

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="flex min-w-[240px] flex-1 items-start gap-3">
            <Switch
              id={`regie-${dossierId}`}
              checked={regie}
              disabled={opSlot || bezig}
              onCheckedChange={wissel}
              className="mt-0.5"
            />
            <div>
              <label htmlFor={`regie-${dossierId}`} className="text-[13px] font-semibold text-neutral-800">
                Regieopdracht
              </label>
              <p className="mt-1 text-[12px] leading-snug text-neutral-500">
                {stand.slot
                  ?? (regie
                    ? 'Geen aanneemsom: alles wat geboekt is wordt op nacalculatie gefactureerd.'
                    : 'Uit: de opdracht wordt tegen de aanneemsom via termijnen gefactureerd.')}
              </p>
            </div>
          </div>
          {regie && (
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Mandaat" upper helper="Plafond, excl. btw" htmlFor={`mandaat-${dossierId}`} className="w-[160px]">
                <Input
                  id={`mandaat-${dossierId}`}
                  inputMode="decimal"
                  placeholder="Geen"
                  value={mandaat}
                  disabled={alleenLezen || bezig}
                  onChange={e => setMandaat(e.target.value)}
                  onBlur={() => {
                    if (mandaat.trim() !== alsTekst(stand.mandaat)) opslaan(true, mandaat)
                  }}
                />
              </FormField>
              {mandaatGetal != null && mandaatGetal > 0 && (
                <div className="pb-2">
                  <MandaatIndicator mandaat={mandaatGetal} geboekt={geboekt} toonMandaat={false} />
                </div>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
