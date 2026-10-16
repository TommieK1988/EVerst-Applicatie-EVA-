'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  Alert, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, FormField, Textarea,
} from '@/components/ui'
import { trekGoedkeuringIn } from '@/lib/uren/bouw7-goedkeuring'
import UurregelAanpassen from './UurregelAanpassen'
import UurregelSplitsen from './UurregelSplitsen'
import { toonUren, useUursoorten } from './uurregel-velden'

/**
 * Het venster achter een klik op een urenregel in /uren: aanpassen, splitsen, of -- bij een
 * goedgekeurde regel -- eerst de goedkeuring intrekken.
 *
 * Afkeuren bestaat niet: Bouw7 kent alleen goedgekeurd of niet, en een regel heen en weer sturen
 * kost alleen tijd. De goedkeurder zet het hier recht en de medewerker krijgt daar bericht van.
 *
 * Wie dit venster te zien krijgt beslist `bewerkrecht` (lib/uren/bewerkrecht.ts), op het scherm én
 * opnieuw op de server. Een goedgekeurde regel ligt vast; alleen wie het eindakkoord gaf kan het
 * intrekken, en dan is de regel hier meteen weer aan te passen.
 */

export type TeBewerkenRegel = {
  hourLogId: number
  medewerkerNaam: string
  datum: string
  uren: number
  uursoort: string | null
  /** Bouw7 hourType-id van de huidige uursoort; null als Bouw7 hem niet meegaf. */
  hourTypeId: number | null
  dossierId: string | null
  dossierLabel: string | null
  bewakingscode: string | null
  opmerking: string | null
  /** Goedgekeurd: het venster begint dan bij het intrekken. */
  goedgekeurd: boolean
}

type Modus = 'aanpassen' | 'splitsen'

export default function UurregelBewerken({ regel, onSluit, onKlaar }: {
  regel: TeBewerkenRegel
  onSluit: () => void
  onKlaar: () => void
}) {
  const [goedgekeurd, setGoedgekeurd] = useState(regel.goedgekeurd)
  const [modus, setModus] = useState<Modus>('aanpassen')
  const uursoorten = useUursoorten()

  const titel = goedgekeurd ? 'Goedgekeurde uren' : modus === 'splitsen' ? 'Regel splitsen of toevoegen' : 'Uren aanpassen'

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent size="md">
        <DialogHeader>
          <div>
            <DialogTitle>{titel}</DialogTitle>
            <DialogDescription>
              {regel.medewerkerNaam} · {regel.datum} · {toonUren(regel.uren)} u{regel.uursoort ? ` · ${regel.uursoort}` : ''}
            </DialogDescription>
          </div>
        </DialogHeader>

        {goedgekeurd ? (
          <Intrekken
            regel={regel}
            onSluit={onSluit}
            onIngetrokken={() => { setGoedgekeurd(false); onKlaar() }}
          />
        ) : (
          <>
            <div className="px-6 pt-4">
              <ModusKnoppen modus={modus} onKies={setModus} />
            </div>
            {modus === 'aanpassen'
              ? <UurregelAanpassen regel={regel} uursoorten={uursoorten} onSluit={onSluit} onKlaar={onKlaar} />
              : <UurregelSplitsen regel={regel} uursoorten={uursoorten} onSluit={onSluit} onKlaar={onKlaar} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ModusKnoppen({ modus, onKies }: { modus: Modus; onKies: (m: Modus) => void }) {
  const knop = (m: Modus, label: string) => (
    <button
      type="button" role="tab" aria-selected={modus === m} onClick={() => onKies(m)}
      className={`h-7 cursor-pointer rounded-md border-0 px-3 text-[12.5px] font-semibold transition-colors ${
        modus === m ? 'bg-white text-neutral-900 shadow-sm' : 'bg-transparent text-neutral-600 hover:text-neutral-900'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-lg bg-neutral-100 p-1">
      {knop('aanpassen', 'Aanpassen')}
      {knop('splitsen', 'Splitsen / regel erbij')}
    </div>
  )
}

/**
 * Een goedgekeurde regel ligt vast. Wie het eindakkoord gaf kan het hier intrekken, met een reden
 * die als melding naar de medewerker gaat. Daarna begint de goedkeuring opnieuw -- eerst bij de
 * teamleider, als het dossier er een heeft -- en is de regel meteen aan te passen.
 */
function Intrekken({ regel, onSluit, onIngetrokken }: {
  regel: TeBewerkenRegel
  onSluit: () => void
  onIngetrokken: () => void
}) {
  const [reden, setReden] = useState('')
  const [bezig, setBezig] = useState(false)

  async function trekIn() {
    if (!reden.trim()) { toast.error('Geef aan waarom je de goedkeuring intrekt.'); return }
    setBezig(true)
    const r = await trekGoedkeuringIn(regel.hourLogId, reden.trim())
      .catch(() => ({ ok: false as const, error: 'Bouw7 is niet bereikbaar.' }))
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Goedkeuring ingetrokken. Je kunt de regel nu aanpassen.')
    onIngetrokken()
  }

  return (
    <>
      <DialogBody>
        <div className="flex flex-col gap-4">
          <Alert tone="info" title="Deze regel is al goedgekeurd">
            Om hem aan te passen of te splitsen trek je eerst de goedkeuring in. De medewerker krijgt
            je reden als melding, en de regel moet daarna opnieuw goedgekeurd worden.
          </Alert>
          <FormField label="Reden" upper required>
            <Textarea
              value={reden} onChange={e => setReden(e.target.value)} rows={2} autoFocus
              placeholder="bv. dag moet verdeeld worden over twee dossiers"
            />
          </FormField>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleren</Button>
        <Button variant="destructive" onClick={trekIn} loading={bezig} disabled={bezig || !reden.trim()}>
          Goedkeuring intrekken
        </Button>
      </DialogFooter>
    </>
  )
}
