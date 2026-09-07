'use client'

/**
 * Popup om één bewakingscode aan te passen zoals hij op de factuur komt.
 *
 * Bedrag en opslag zijn bewust twee losse velden. Een opslag beweegt mee met de geboekte kosten —
 * loopt het werk door, dan loopt het factuurbedrag mee. Een bedrag zet dat juist stil, omdat er
 * iets anders is afgesproken. Die twee in één veld persen maakt achteraf onnavolgbaar of een
 * bedrag berekend was of afgesproken.
 *
 * Een code die al volledig gefactureerd is staat op slot: wat op een verstuurde factuur staat ligt
 * vast, en corrigeren gaat via een creditnota in Bouw7.
 *
 * Opmaak volgt het DS-modelpatroon: DialogHeader / DialogBody / DialogFooter. De body levert de
 * padding en het scrollgedrag — inhoud die los in DialogContent hangt plakt tegen de vensterrand.
 */

import React, { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { Lock } from 'lucide-react'
import {
  Button, Input, Checkbox,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { bewaarCodeInstelling, type CodeRegelView } from '@/lib/dossiers/servicedesk'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)
/** Zonder euroteken — het bedragveld zet er zelf al een voor. */
const fmtGetal = (v: number) =>
  new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2 }).format(v)

const getal = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const alsTekst = (v: number | null) => (v != null ? String(v).replace('.', ',') : '')

/** Regel in het kostenoverzicht boven de velden. */
function Bedragregel({ naam, toelichting, waarde }: {
  naam: string
  toelichting?: string
  waarde: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-600">
        {naam}
        {toelichting && <span className="ml-1.5 text-neutral-400">{toelichting}</span>}
      </dt>
      <dd className="shrink-0 font-medium tabular-nums text-neutral-800">{waarde}</dd>
    </div>
  )
}

/** Aanvinkregel met uitleg eronder; de tekst is als label aan het vinkje gekoppeld. */
function Optie({ id, aan, disabled, onZet, titel, uitleg }: {
  id: string
  aan: boolean
  disabled: boolean
  onZet: (v: boolean) => void
  titel: string
  uitleg: string
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border border-neutral-200 px-4 py-3.5 transition-colors ${
      disabled ? 'opacity-60' : 'hover:border-neutral-300 hover:bg-neutral-50'
    }`}>
      <Checkbox
        id={id}
        checked={aan}
        disabled={disabled}
        onCheckedChange={v => onZet(v === true)}
        className="mt-0.5"
      />
      <label htmlFor={id} className={`min-w-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="block text-[14px] font-medium text-neutral-800">{titel}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-neutral-500">{uitleg}</span>
      </label>
    </div>
  )
}

export default function FactuurRegelVenster({ dossierId, code, tarieven, readOnly, onSluit, onBewaard }: {
  dossierId: string
  code: CodeRegelView | null
  tarieven: BtwTariefKeuze[]
  /** Afgesloten dossier: alles alleen-lezen, net als elders. */
  readOnly?: boolean
  onSluit: () => void
  onBewaard: () => void
}) {
  const veld = useId()
  const [omschrijving, setOmschrijving] = useState('')
  const [opslag, setOpslag] = useState('')
  const [bedrag, setBedrag] = useState('')
  const [uitsplitsen, setUitsplitsen] = useState(false)
  const [btw, setBtw] = useState<number | null>(null)
  const [meefactureren, setMee] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [geladenVoor, setGeladenVoor] = useState<string | null>(null)

  // Velden vullen zodra er een andere code wordt geopend.
  if (code && geladenVoor !== code.bewakingscode) {
    setGeladenVoor(code.bewakingscode)
    setOmschrijving(code.omschrijving)
    setOpslag(alsTekst(code.opslagPct))
    setBedrag(alsTekst(code.bedragOverride))
    setUitsplitsen(code.uitsplitsen)
    setBtw(code.btwTariefBouw7Id)
    setMee(code.meefactureren)
  }

  if (!code) return null
  const opslot = code.vergrendeld || !!readOnly

  async function bewaar() {
    if (!code) return
    setBezig(true)
    const r = await bewaarCodeInstelling(dossierId, code.bewakingscode, {
      omschrijving,
      opslag_pct: getal(opslag),
      bedrag_excl_btw: getal(bedrag),
      uitsplitsen,
      btw_tarief_bouw7_id: btw,
      meefactureren,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error, { duration: 8000 }); return }
    toast.success('Opgeslagen')
    onBewaard()
    onSluit()
  }

  const labelStijl = 'mb-1.5 block text-[13px] font-semibold text-neutral-700'
  const hintStijl = 'mt-1.5 text-[12.5px] leading-relaxed text-neutral-500'
  const vastBedrag = getal(bedrag) != null
  const eigenOpslag = getal(opslag) != null

  // Onder de titel: waar deze regel vandaan komt en hoe hij ervoor staat.
  const herkomst = [
    code.bron === 'stelpost' ? 'Stelpost' : 'Meerwerk (regie)',
    code.aantalBoekingen > 0
      ? `${code.aantalBoekingen} boeking${code.aantalBoekingen === 1 ? '' : 'en'} te factureren`
      : 'geen openstaande boekingen',
    ...(code.aantalGefactureerd > 0 ? [`${code.aantalGefactureerd} al gefactureerd`] : []),
    ...(code.inBouw7 ? [] : ['nog niet in Bouw7']),
  ].join(' · ')

  return (
    <Dialog open={code != null} onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="pr-8">
            <DialogTitle>Factuurregel — {code.bewakingscode}</DialogTitle>
            <DialogDescription>{herkomst}</DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {opslot && (
            <div className="flex gap-3 rounded-lg border border-warning-300 bg-warning-50 px-4 py-3.5 text-[13px] leading-relaxed text-warning-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {code.vergrendeld
                  ? 'Deze post is al volledig gefactureerd en ligt daarmee vast. Corrigeren gaat via een creditnota in Bouw7.'
                  : 'Dit dossier is afgesloten. De factuurregel is alleen nog in te zien.'}
              </p>
            </div>
          )}

          <div>
            <label htmlFor={`${veld}-oms`} className={labelStijl}>Omschrijving op de factuur</label>
            <Input
              id={`${veld}-oms`}
              inputSize="lg"
              value={omschrijving}
              onChange={e => setOmschrijving(e.target.value)}
              disabled={opslot}
            />
            <p className={hintStijl}>Deze tekst leest de klant terug op zijn factuur.</p>
          </div>

          <section className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4">
            <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-neutral-500">
              Wat er op deze code geboekt staat
            </h3>
            <dl className="space-y-2 text-[14px]">
              <Bedragregel naam="Geboekte kosten" toelichting="kostprijs" waarde={fmt(code.inkoop)} />
              <Bedragregel
                naam="Arbeid"
                toelichting={code.urenAantal ? `verkoop · ${code.urenAantal} uur` : 'verkoop'}
                waarde={fmt(code.urenBedrag)}
              />
              <Bedragregel naam="Materiaal en overige" waarde={fmt(code.kostenBedrag)} />
              <div className="flex items-baseline justify-between gap-4 border-t border-neutral-200 pt-3 text-[16px] font-semibold text-neutral-900">
                <dt>Berekend</dt>
                <dd className="shrink-0 tabular-nums">{fmt(code.berekend)}</dd>
              </div>
            </dl>
          </section>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${veld}-opslag`} className={labelStijl}>Opslag %</label>
              <Input
                id={`${veld}-opslag`}
                inputSize="lg"
                suffix={<span className="text-[13px]">%</span>}
                value={opslag}
                onChange={e => setOpslag(e.target.value)}
                inputMode="decimal"
                placeholder="standaard"
                disabled={opslot}
              />
              <p className={hintStijl}>Op de geboekte kosten. Beweegt mee als er nog werk bij komt.</p>
            </div>
            <div>
              <label htmlFor={`${veld}-bedrag`} className={labelStijl}>Vast bedrag excl. btw</label>
              <Input
                id={`${veld}-bedrag`}
                inputSize="lg"
                prefix={<span className="text-[13px]">€</span>}
                value={bedrag}
                onChange={e => setBedrag(e.target.value)}
                inputMode="decimal"
                placeholder={fmtGetal(code.berekend)}
                disabled={opslot}
              />
              <p className={hintStijl}>Laat leeg om het berekende bedrag te volgen.</p>
            </div>
          </div>

          {vastBedrag && eigenOpslag && (
            <p className="rounded-lg border border-warning-300 bg-warning-50 px-4 py-3 text-[13px] leading-relaxed text-warning-900">
              Er staat een vast bedrag ingevuld; de opslag telt dan niet mee in wat er gefactureerd wordt.
            </p>
          )}

          <div>
            <label htmlFor={`${veld}-btw`} className={labelStijl}>Btw op deze regel</label>
            <select
              id={`${veld}-btw`}
              value={btw ?? ''}
              onChange={e => setBtw(e.target.value ? Number(e.target.value) : null)}
              disabled={opslot}
              className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400"
            >
              <option value="">Volg de keuze voor de hele factuur</option>
              {tarieven.map(t => (
                <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <Optie
              id={`${veld}-uitsplitsen`}
              aan={uitsplitsen && !vastBedrag}
              // Een vast bedrag valt niet over arbeid en materiaal te verdelen; de keuze is dan dood.
              disabled={opslot || vastBedrag}
              onZet={setUitsplitsen}
              titel="Arbeid en materiaal als aparte factuurregels"
              uitleg={vastBedrag
                ? 'Vervalt nu er een vast bedrag staat — dat valt niet te verdelen.'
                : 'De klant ziet uren en materiaal dan apart op zijn factuur staan.'}
            />
            <Optie
              id={`${veld}-mee`}
              aan={meefactureren}
              disabled={opslot}
              onZet={setMee}
              titel="Meenemen op de factuur"
              uitleg="Uit = deze post blijft staan voor een volgende keer."
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="lg" onClick={onSluit}>{opslot ? 'Sluiten' : 'Annuleren'}</Button>
          {!opslot && (
            <Button variant="primary" size="lg" onClick={bewaar} disabled={bezig}>
              {bezig ? 'Opslaan…' : 'Opslaan'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
