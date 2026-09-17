'use client'

/**
 * Eén dialoog voor "dit dossier gaat niet door".
 *
 * Hij wordt getoond zodra een dossier naar een afsluitende status gaat — gesleept op het bord of
 * gekozen in de statuslijst — en stelt daar drie dingen tegelijk aan de orde:
 *
 *  1. **Bevestiging.** Daarna is het dossier overal alleen-lezen en gaat de status naar Bouw7;
 *     een misslag met de muis is niet meer terug te draaien.
 *  2. **De reden.** Verloren en vervallen zijn níét hetzelfde: verloren betekent dat iemand
 *     anders het werk doet, vervallen dat het werk niet doorgaat. Ze door elkaar halen maakt de
 *     verkooprapportage waardeloos, dus elke afsluiting krijgt zijn eigen redenenlijst. Vragen
 *     kost vijf seconden; achteraf reconstrueren lukt niet meer (van de 44 verliesovergangen
 *     vóór deze module had er geen één een reden).
 *  3. **Wat er overblijft.** Een verloren of vervallen offerte is zelden het einde van de
 *     relatie. De knop "Verkoopkans aanmaken" bewaart dat restje mét een houder en een datum,
 *     zodat het niet met het dossier in de alleen-lezen-stapel verdwijnt.
 *
 * Gedeeld door het bord en het Informatie-tab: twee schermen die hetzelfde afsluiten horen
 * dezelfde vragen te stellen, anders komen er twee soorten antwoorden in dezelfde kolom.
 */

import * as React from 'react'
import toast from 'react-hot-toast'
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { getMedewerkers } from '@/lib/dossiers/actions'
import {
  redenenVoorAfsluiten, redenVraagVoorAfsluiten, verkoopkansCompleet,
  LEGE_VERKOOPKANS, type VerkoopkansInvoer,
} from '@/lib/commercie/types'
import { legAfsluitRedenVastActie } from '@/lib/commercie/actions'
import { maakVerkoopkans } from '@/lib/commercie/verkoopkansen'
import { VerkoopkansVelden, type MedewerkerKeuze } from './VerkoopkansVelden'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** De afsluitende substatus, bv. 'verloren' of 'vervallen'. */
  substatus: string
  /** Het label zoals de gebruiker het op het bord ziet. */
  label: string
  dossierId: string
  /** "2026-123 — Schilderwerk complex Zuid", of leeg. */
  dossierOmschrijving?: string | null
  /**
   * Vraagt deze afsluiting om een reden en biedt hij een verkoopkans aan? Waar is dat zo voor
   * offertes; een aanvraag die vervalt heeft nog geen commercieel traject gehad.
   */
  commercieel: boolean
  /** Voert de eigenlijke statuswijziging uit. Moet klaar zijn vóór de reden wordt weggeschreven. */
  onBevestigd: () => Promise<void>
}

export function AfsluitenDialoog(props: Props) {
  const [reden, setReden] = React.useState('')
  const [toelichting, setToelichting] = React.useState('')
  const [kansOpen, setKansOpen] = React.useState(false)
  const [kans, setKans] = React.useState<VerkoopkansInvoer>(LEGE_VERKOOPKANS)
  const [medewerkers, setMedewerkers] = React.useState<MedewerkerKeuze[]>([])
  const [bezig, setBezig] = React.useState(false)

  const opties = redenenVoorAfsluiten(props.substatus)

  // Schoon beginnen bij elke opening: een half ingevulde kans van de vorige keer zou bij het
  // volgende dossier terechtkomen.
  React.useEffect(() => {
    if (props.open) return
    setReden(''); setToelichting(''); setKansOpen(false); setKans(LEGE_VERKOOPKANS)
  }, [props.open])

  // De collega-lijst pas ophalen als iemand een kans gaat aanmaken; de meeste afsluitingen
  // hebben hem niet nodig.
  React.useEffect(() => {
    if (!kansOpen || medewerkers.length > 0) return
    getMedewerkers().then(setMedewerkers).catch(() => {})
  }, [kansOpen, medewerkers.length])

  const kansCompleet = verkoopkansCompleet(kans)
  const geblokkeerd =
    bezig
    || (props.commercieel && !reden)
    || (kansOpen && !kansCompleet)

  async function bevestig() {
    setBezig(true)
    try {
      await props.onBevestigd()

      // Pas ná de statuswijziging: de DB-trigger moet de historierij hebben geschreven,
      // anders is er niets om de reden op aan te vullen.
      if (reden) {
        await legAfsluitRedenVastActie(props.dossierId, props.substatus, reden, toelichting || null)
      }

      if (kansOpen && kansCompleet) {
        const res = await maakVerkoopkans({ ...kans, bronDossierId: props.dossierId })
        if (res.ok) toast.success('Verkoopkans vastgelegd')
        else toast.error(`Dossier afgesloten, maar de verkoopkans niet: ${res.error}`)
      }

      props.onOpenChange(false)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={o => { if (!bezig) props.onOpenChange(o) }}>
      <DialogContent size="md">
        {/* Titel en omschrijving in één div: DialogHeader is `flex justify-between` en zet losse
            kinderen naast elkaar, met de titel in een smalle kolom als gevolg. */}
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Dossier op &ldquo;{props.label}&rdquo; zetten?</DialogTitle>
            <DialogDescription>
              {props.dossierOmschrijving ? `${props.dossierOmschrijving} — ` : ''}
              wordt hiermee afgesloten en is daarna overal alleen-lezen; je kunt dit niet meer
              ongedaan maken in EVA. De status wordt ook naar Bouw7 teruggeschreven.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {props.commercieel && (
            <div className="space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-700">
                  {redenVraagVoorAfsluiten(props.substatus)}
                </span>
                <select
                  className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px]"
                  value={reden}
                  onChange={e => setReden(e.target.value)}
                >
                  <option value="">Kies een reden…</option>
                  {opties.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>

              {reden === 'Anders' && (
                <Input
                  placeholder="Licht kort toe"
                  value={toelichting}
                  onChange={e => setToelichting(e.target.value)}
                />
              )}
            </div>
          )}

          {props.commercieel && (
            kansOpen ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-neutral-900">Verkoopkans</span>
                  <button
                    type="button"
                    className="text-xs text-neutral-500 underline"
                    onClick={() => { setKansOpen(false); setKans(LEGE_VERKOOPKANS) }}
                  >
                    Toch niet
                  </button>
                </div>
                <VerkoopkansVelden waarde={kans} onChange={setKans} medewerkers={medewerkers} />
                <p className="mt-2 text-xs text-neutral-500">
                  De kans blijft aan dit dossier gekoppeld en staat op het Aanvragen-tab onder
                  &ldquo;Verkoopkansen&rdquo;. Laat je de klant leeg, dan nemen we de
                  opdrachtgever van dit dossier over.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 px-3 py-2.5">
                <p className="text-xs text-neutral-600">
                  Komt dit werk later terug? Leg het nu vast, anders verdwijnt het met dit dossier.
                </p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setKansOpen(true)}>
                  Verkoopkans aanmaken
                </Button>
              </div>
            )
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" disabled={bezig} onClick={() => props.onOpenChange(false)}>
            Annuleren
          </Button>
          <Button disabled={geblokkeerd} onClick={bevestig}>
            {bezig ? 'Bezig…' : 'Ja, afsluiten'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
