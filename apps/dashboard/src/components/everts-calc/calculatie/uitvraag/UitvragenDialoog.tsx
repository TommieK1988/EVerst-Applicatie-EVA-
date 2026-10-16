'use client'

import { useState, type ReactNode } from 'react'
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, FormField, Input,
} from '@/components/ui'
import { cn } from '@/lib/everts-calc/utils'
import type { RelatieRef } from '@/lib/everts-calc/types'
import type { UitvraagPartijKeuze, UitvraagPost } from '@/lib/dossiers/uitvraag-pakket-types'
import { hoeveelheidTekst, isoDatum, standaardReactieUiterlijk } from '@/lib/everts-calc/uitvraag-weergave'
import { PartijChips } from './PartijChips'

export type UitvraagModus = 'posten' | 'los'

export interface UitvraagInvoer {
  modus: UitvraagModus
  naam: string
  partijen: UitvraagPartijKeuze[]
  /** yyyy-mm-dd */
  reactieUiterlijk: string | null
  /** yyyy-mm-dd en hh:mm; samen het projectbezoek, of leeg. */
  bezoekDatum: string | null
  bezoekTijd: string
}

/**
 * Venster "Uitvragen bij onderaannemer". Alleen weergave en invoer: wat er met de invoer
 * gebeurt (opslaan, mailen) beslist de container via `onBevestig`. Monteer hem per keer
 * opnieuw (de container doet dat), dan begint het formulier altijd bij de voorstellen.
 */
export function UitvragenDialoog({ posten, naamVoorstel, beginModus, zoekPartijen, bezig, onBevestig, onSluit }: {
  posten: UitvraagPost[]
  naamVoorstel: string
  beginModus: UitvraagModus
  zoekPartijen: (term: string) => Promise<RelatieRef[]>
  bezig?: boolean
  onBevestig: (invoer: UitvraagInvoer, mailen: boolean) => void
  onSluit: () => void
}) {
  const [invoer, setInvoer] = useState<UitvraagInvoer>({
    modus: posten.length === 0 ? 'los' : beginModus,
    naam: naamVoorstel,
    partijen: [],
    reactieUiterlijk: standaardReactieUiterlijk(),
    bezoekDatum: null,
    bezoekTijd: '09:00',
  })
  const zet = (patch: Partial<UitvraagInvoer>) => setInvoer(i => ({ ...i, ...patch }))
  const n = invoer.partijen.length
  const kanOpslaan = !bezig && invoer.naam.trim().length > 0 && n > 0

  return (
    <Dialog open onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="lg">
        <DialogHeader className="border-b border-neutral-200 pb-4">
          <DialogTitle>Uitvragen bij onderaannemer</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <div>
            <FormField upper label="Wat vraag je uit">
              <div className="inline-flex w-fit rounded-md bg-neutral-100 p-0.5">
                <ModusKnop actief={invoer.modus === 'posten'} disabled={posten.length === 0} onClick={() => zet({ modus: 'posten' })}>
                  {posten.length} geselecteerde post{posten.length === 1 ? '' : 'en'}
                </ModusKnop>
                <ModusKnop actief={invoer.modus === 'los'} onClick={() => zet({ modus: 'los' })}>
                  Los, zonder posten
                </ModusKnop>
              </div>
            </FormField>
            {invoer.modus === 'posten' ? (
              <>
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-neutral-200">
                  {posten.map(p => (
                    <li key={p.calculatieregel_id} className="flex items-center gap-4 border-b border-neutral-100 px-3 py-1.5 text-[13px] last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-neutral-800" title={p.omschrijving}>{p.omschrijving}</span>
                      <span className="flex-shrink-0 tabular-nums text-neutral-700">{hoeveelheidTekst(p)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-neutral-500">Omschrijving en hoeveelheden gaan mee in de mail, prijzen niet.</p>
              </>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">
                Zonder posten uit de calculatie, bijvoorbeeld voor een inmeter. Wat je vraagt, schrijf je in de mail.
              </p>
            )}
          </div>

          <FormField upper label="Naam van de uitvraag" htmlFor="uitvraag-naam">
            <Input
              id="uitvraag-naam" value={invoer.naam} onChange={e => zet({ naam: e.target.value })}
              placeholder="Bijvoorbeeld: Voegwerk gevel achter"
            />
          </FormField>

          <FormField upper label="Bij wie">
            <PartijChips partijen={invoer.partijen} onWijzig={partijen => zet({ partijen })} zoek={zoekPartijen} disabled={bezig} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField upper label="Reactie uiterlijk">
              <DatePicker
                weergave="kort"
                value={invoer.reactieUiterlijk ? new Date(`${invoer.reactieUiterlijk}T12:00:00`) : undefined}
                onChange={d => zet({ reactieUiterlijk: d ? isoDatum(d) : null })}
              />
            </FormField>
            <FormField upper label="Projectbezoek (optioneel)">
              <div className="flex gap-2">
                <DatePicker
                  weergave="kort" placeholder="Geen bezoek"
                  value={invoer.bezoekDatum ? new Date(`${invoer.bezoekDatum}T12:00:00`) : undefined}
                  onChange={d => zet({ bezoekDatum: d ? isoDatum(d) : null })}
                />
                <Input
                  type="time" aria-label="Tijd van het projectbezoek" className="w-32 flex-shrink-0"
                  value={invoer.bezoekTijd} disabled={!invoer.bezoekDatum}
                  onChange={e => zet({ bezoekTijd: e.target.value })}
                />
              </div>
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-neutral-200">
          <Button variant="outline" disabled={!kanOpslaan} onClick={() => onBevestig(invoer, false)}>
            Opslaan, nog niet mailen
          </Button>
          <Button
            disabled={!kanOpslaan} loading={bezig} onClick={() => onBevestig(invoer, true)}
            className="border-calc-oa bg-calc-oa hover:border-calc-oa hover:bg-calc-oa/90 active:bg-calc-oa disabled:border-calc-oa/40 disabled:bg-calc-oa/40"
          >
            {n === 0 ? 'Mailen…' : `Mail naar ${n} ${n === 1 ? 'partij' : 'partijen'}…`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModusKnop({ actief, disabled, onClick, children }: {
  actief: boolean; disabled?: boolean; onClick: () => void; children: ReactNode
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-pressed={actief}
      className={cn(
        'h-8 rounded-md px-3 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        actief ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900',
      )}
    >
      {children}
    </button>
  )
}
