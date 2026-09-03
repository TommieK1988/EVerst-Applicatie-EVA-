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
 */

import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui'
import { bewaarCodeInstelling, type CodeRegelView } from '@/lib/dossiers/servicedesk'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

const getal = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const alsTekst = (v: number | null) => (v != null ? String(v).replace('.', ',') : '')

export default function FactuurRegelVenster({ dossierId, code, tarieven, readOnly, onSluit, onBewaard }: {
  dossierId: string
  code: CodeRegelView | null
  tarieven: BtwTariefKeuze[]
  /** Afgesloten dossier: alles alleen-lezen, net als elders. */
  readOnly?: boolean
  onSluit: () => void
  onBewaard: () => void
}) {
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

  const label = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400'
  const berekendMetOpslag = getal(opslag) != null

  return (
    <Dialog open={code != null} onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>Factuurregel — {code.bewakingscode}</DialogTitle>
        </DialogHeader>

        {opslot && (
          <div className="mb-3 rounded-md px-3 py-2 text-[12px]"
               style={{ background: 'var(--warning-50, #fff7ed)', color: 'var(--warning-800, #9a3412)' }}>
            Deze post is al volledig gefactureerd en ligt daarmee vast. Corrigeren gaat via een
            creditnota in Bouw7.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <span className={label}>Omschrijving op de factuur</span>
            <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)} disabled={opslot} />
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50/60 p-2.5 text-[12px]">
            <div className="flex justify-between"><span className="text-neutral-500">Geboekte kosten</span>
              <span className="tabular-nums">{fmt(code.inkoop)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Arbeid (verkoop)</span>
              <span className="tabular-nums">{fmt(code.urenBedrag)}{code.urenAantal ? ` · ${code.urenAantal} uur` : ''}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Materiaal en overige</span>
              <span className="tabular-nums">{fmt(code.kostenBedrag)}</span></div>
            <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-semibold">
              <span>Berekend</span><span className="tabular-nums">{fmt(code.berekend)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Opslag %</span>
              <Input
                value={opslag} onChange={e => setOpslag(e.target.value)}
                inputMode="decimal" placeholder="standaard" disabled={opslot}
              />
              <p className="mt-1 text-[10.5px] leading-snug text-neutral-500">
                Op de geboekte kosten. Beweegt mee als er nog werk bij komt.
              </p>
            </div>
            <div>
              <span className={label}>Bedrag excl. btw</span>
              <Input
                value={bedrag} onChange={e => setBedrag(e.target.value)}
                inputMode="decimal" placeholder={fmt(code.berekend)} disabled={opslot}
              />
              <p className="mt-1 text-[10.5px] leading-snug text-neutral-500">
                Vast bedrag. Laat leeg om het berekende bedrag te volgen.
              </p>
            </div>
          </div>

          {getal(bedrag) != null && berekendMetOpslag && (
            <p className="text-[11px]" style={{ color: 'var(--warning-800, #9a3412)' }}>
              Er staat een vast bedrag ingevuld; de opslag telt dan niet mee in wat er gefactureerd wordt.
            </p>
          )}

          <div>
            <span className={label}>Btw op deze regel</span>
            <select
              value={btw ?? ''}
              onChange={e => setBtw(e.target.value ? Number(e.target.value) : null)}
              disabled={opslot}
              className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[13px] text-neutral-800 outline-none focus:border-brand-400 disabled:opacity-50"
            >
              <option value="">Volg de keuze voor de hele factuur</option>
              {tarieven.map(t => (
                <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2 text-[12.5px] text-neutral-700">
            <input type="checkbox" checked={uitsplitsen} disabled={opslot}
                   onChange={e => setUitsplitsen(e.target.checked)} className="mt-0.5" />
            <span>
              Arbeid en materiaal als aparte factuurregels
              <span className="block text-[10.5px] text-neutral-500">
                Vervalt zodra er een vast bedrag staat — dat valt niet te verdelen.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-[12.5px] text-neutral-700">
            <input type="checkbox" checked={meefactureren} disabled={opslot}
                   onChange={e => setMee(e.target.checked)} className="mt-0.5" />
            <span>
              Meenemen op de factuur
              <span className="block text-[10.5px] text-neutral-500">
                Uit = deze post blijft staan voor een volgende keer.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onSluit}>{opslot ? 'Sluiten' : 'Annuleren'}</Button>
          {!opslot && (
            <Button variant="primary" onClick={bewaar} disabled={bezig}>
              {bezig ? 'Opslaan…' : 'Opslaan'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
