'use client'

import { useState, type ReactNode } from 'react'
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, FormField, Input,
} from '@/components/ui'
import { cn } from '@/lib/everts-calc/utils'
import type { RelatieRef } from '@/lib/everts-calc/types'
import type { UitvraagPartijKeuze, UitvraagPost } from '@/lib/dossiers/uitvraag-pakket-types'
import type { UitvraagSoort } from '@everts/database'
import { isoDatum, standaardReactieUiterlijk } from '@/lib/everts-calc/uitvraag-weergave'
import { PartijChips } from './PartijChips'
import { UitvraagRegels } from './UitvraagRegels'

export type UitvraagModus = 'posten' | 'materialen' | 'los'

export interface UitvraagInvoer {
  soort: UitvraagSoort
  modus: UitvraagModus
  /** De regels zoals ze meegaan (bij posten of materialen), na eventuele aanpassingen. */
  regels: UitvraagPost[]
  naam: string
  partijen: UitvraagPartijKeuze[]
  /** yyyy-mm-dd */
  reactieUiterlijk: string | null
  /** yyyy-mm-dd en hh:mm; samen het projectbezoek, of leeg. */
  bezoekDatum: string | null
  bezoekTijd: string
}

/**
 * Venster "Uitvragen bij onderaannemer" / "Aanvragen bij leverancier". Bij een leverancier
 * (groothandel) gaat meestal de materiaallijst uit de normen mee in plaats van de posten. Alleen weergave en invoer: wat er met de invoer
 * gebeurt (opslaan, mailen) beslist de container via `onBevestig`. Monteer hem per keer
 * opnieuw (de container doet dat), dan begint het formulier altijd bij de voorstellen.
 */
export function UitvragenDialoog({ posten, materialen, naamVoorstel, beginModus, zoekPartijen, bezig, onBevestig, onSluit }: {
  posten: UitvraagPost[]
  /** De materialen uit de normen van dezelfde posten, al samengevoegd. */
  materialen: UitvraagPost[]
  naamVoorstel: string
  beginModus: UitvraagModus
  zoekPartijen: (term: string, soort: UitvraagSoort) => Promise<RelatieRef[]>
  bezig?: boolean
  onBevestig: (invoer: UitvraagInvoer, mailen: boolean) => void
  onSluit: () => void
}) {
  const [invoer, setInvoer] = useState<UitvraagInvoer>({
    soort: 'onderaannemer',
    modus: posten.length === 0 ? 'los' : beginModus,
    regels: posten,
    naam: naamVoorstel,
    partijen: [],
    reactieUiterlijk: standaardReactieUiterlijk(),
    bezoekDatum: null,
    bezoekTijd: '09:00',
  })
  const zet = (patch: Partial<UitvraagInvoer>) => setInvoer(i => ({ ...i, ...patch }))
  const kies = (modus: UitvraagModus) =>
    zet({ modus, regels: modus === 'materialen' ? materialen : modus === 'posten' ? posten : [] })
  // Andere soort: andere partijen, en bij een leverancier standaard de materiaallijst.
  const kiesSoort = (soort: UitvraagSoort) => {
    if (soort === invoer.soort) return
    const modus: UitvraagModus = soort === 'leverancier'
      ? (materialen.length > 0 ? 'materialen' : invoer.modus)
      : (invoer.modus === 'materialen' ? (posten.length > 0 ? 'posten' : 'los') : invoer.modus)
    setInvoer(i => ({ ...i, soort, partijen: [], modus, regels: modus === 'materialen' ? materialen : modus === 'posten' ? posten : [] }))
  }
  const zoek = (term: string) => zoekPartijen(term, invoer.soort)
  const n = invoer.partijen.length
  const metRegels = invoer.modus !== 'los'
  const kanOpslaan = !bezig && invoer.naam.trim().length > 0 && n > 0
    && (!metRegels || invoer.regels.some(r => r.omschrijving.trim()))
  const leverancier = invoer.soort === 'leverancier'

  return (
    <Dialog open onOpenChange={o => { if (!o && !bezig) onSluit() }}>
      <DialogContent size="lg">
        <DialogHeader className="border-b border-neutral-200 pb-4">
          <DialogTitle>{leverancier ? 'Aanvragen bij leverancier' : 'Uitvragen bij onderaannemer'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <FormField upper label="Bij wie vraag je het">
            <div className="inline-flex w-fit rounded-md bg-neutral-100 p-0.5">
              <ModusKnop actief={!leverancier} onClick={() => kiesSoort('onderaannemer')}>Onderaannemer</ModusKnop>
              <ModusKnop actief={leverancier} onClick={() => kiesSoort('leverancier')}>Leverancier of groothandel</ModusKnop>
            </div>
          </FormField>

          <div>
            <FormField upper label="Wat vraag je">
              <div className="inline-flex w-fit flex-wrap rounded-md bg-neutral-100 p-0.5">
                {leverancier && (
                  <ModusKnop actief={invoer.modus === 'materialen'} disabled={materialen.length === 0} onClick={() => kies('materialen')}>
                    {materialen.length} materia{materialen.length === 1 ? 'al' : 'len'} uit de normen
                  </ModusKnop>
                )}
                <ModusKnop actief={invoer.modus === 'posten'} disabled={posten.length === 0} onClick={() => kies('posten')}>
                  {posten.length} geselecteerde post{posten.length === 1 ? '' : 'en'}
                </ModusKnop>
                <ModusKnop actief={invoer.modus === 'los'} onClick={() => kies('los')}>
                  Los, zonder posten
                </ModusKnop>
              </div>
            </FormField>
            {metRegels ? (
              <>
                <div className="mt-2">
                  <UitvraagRegels
                    regels={invoer.regels} onWijzig={regels => zet({ regels })}
                    kanToevoegen={invoer.modus === 'materialen'} disabled={bezig}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  {invoer.modus === 'materialen'
                    ? 'Uit de materiaalnormen van de posten: norm × hoeveelheid, gelijke materialen opgeteld. Kijk omschrijving en eenheid na; die staan niet bij elke norm. Prijzen gaan niet mee.'
                    : 'Omschrijving en hoeveelheden gaan mee in de mail, prijzen niet. Je kunt ze hier nog aanpassen.'}
                </p>
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
            <PartijChips
              key={invoer.soort} partijen={invoer.partijen} onWijzig={partijen => zet({ partijen })} zoek={zoek} disabled={bezig}
              placeholder={leverancier ? '+ Leverancier zoeken…' : undefined}
            />
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
          <p className="mr-auto self-center text-xs text-neutral-500">
            Je ziet per partij eerst de mail; die verstuur je zelf.
          </p>
          <Button variant="outline" disabled={!kanOpslaan} onClick={() => onBevestig(invoer, false)}>
            Opslaan, nog niet mailen
          </Button>
          <Button
            disabled={!kanOpslaan} loading={bezig} onClick={() => onBevestig(invoer, true)}
            className="border-calc-oa bg-calc-oa hover:border-calc-oa hover:bg-calc-oa/90 active:bg-calc-oa disabled:border-calc-oa/40 disabled:bg-calc-oa/40"
          >
            {n === 0 ? 'Mail opstellen…' : `Mail opstellen (${n} ${n === 1 ? 'partij' : 'partijen'})…`}
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
