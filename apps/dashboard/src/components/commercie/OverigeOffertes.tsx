'use client'

/**
 * "Ook open bij …": de andere open offertes van wie je aan de lijn hebt.
 *
 * Bij een groot beheerkantoor zijn dat er tientallen, en een lijst van dertig rijen in een
 * zijpaneel is geen hulp maar ruis. Daarom:
 *  - eerst wat telt: dezelfde VvE/opdrachtgever als deze offerte, dan wat het dringendst is,
 *    dan het hoogste bedrag;
 *  - ingeklapt de eerste vijf, met één samenvattingsregel over het geheel;
 *  - uitgeklapt een zoekveld, en kleine offertes (onder € 3k, die we niet nabellen) pas op verzoek.
 *
 * Aanvinken = meebesproken in dit gesprek; de kaart zet de notitie dan ook op die offertes.
 */

import * as React from 'react'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import { eur, eurKort, pastBijZoekterm, sorteerOverige, type TeDoenRij } from './te-doen'

const INGEKLAPT = 5
/** Vanaf zoveel offertes is een zoekveld zinvol. */
const ZOEK_VANAF = 8

type Props = {
  partij: string | null
  rijen: TeDoenRij[]
  /** De klant (VvE) van de offerte die openstaat: die komen bovenaan. */
  eigenKlant: string | null
  mee: Set<string>
  onMee: (id: string, aan: boolean) => void
  onOpen?: (id: string) => void
}

export function OverigeOffertes(props: Props) {
  const [open, setOpen] = React.useState(false)
  const [zoek, setZoek] = React.useState('')
  const [metKlein, setMetKlein] = React.useState(false)

  const gesorteerd = React.useMemo(() => sorteerOverige(props.rijen, props.eigenKlant), [props.rijen, props.eigenKlant])
  const klein = gesorteerd.filter(r => r._klasse === 'klein').length
  const zichtbaar = gesorteerd
    .filter(r => metKlein || r._klasse !== 'klein' || props.mee.has(r.id))
    .filter(r => !open || pastBijZoekterm(r, zoek))
  const getoond = open ? zichtbaar : zichtbaar.slice(0, INGEKLAPT)

  const totaal = props.rijen.reduce((t, r) => t + (r._bedrag ?? 0), 0)
  const verlopen = props.rijen.filter(r => r._bak === 'verlopen').length
  const vvEs = new Set(props.rijen.map(r => r.klant_naam).filter(Boolean)).size

  return (
    <div className="mt-2 flex flex-col">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        Ook open bij {props.partij ?? 'deze klant'}
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        <span className="font-semibold text-neutral-900">{props.rijen.length} open</span>
        {' · '}{eurKort(totaal)}
        {vvEs > 1 && ` · ${vvEs} opdrachtgevers`}
        {verlopen > 0 && <span className="font-semibold text-error-700"> · {verlopen} verlopen</span>}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500">
        Vink aan wat je in dit gesprek meebespreekt; de notitie komt dan ook op die offertes.
      </p>

      {open && props.rijen.length >= ZOEK_VANAF && (
        <input
          type="search"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoek op VvE, adres of nummer"
          aria-label="Zoek in de andere offertes"
          className="mt-2 h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-100"
        />
      )}

      <ul className="mt-1 flex flex-col">
        {getoond.map(o => (
          <li key={o.id} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 border-t border-neutral-100 py-2 first:border-t-0">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--brand-500)]"
              checked={props.mee.has(o.id)}
              onChange={e => props.onMee(o.id, e.target.checked)}
              aria-label={`${o.titel} meebespreken`}
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-neutral-900">{o.titel}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_PRESENTATIE[o._status].cssKleur }} aria-hidden />
                <span className="truncate">
                  {o.klant_naam ? `${o.klant_naam} · ` : ''}{o._stap ?? 'Nog niets afgesproken'}
                </span>
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[13px] font-semibold tabular-nums text-neutral-900">{eur(o._bedrag)}</span>
              {props.onOpen && (
                <button type="button" onClick={() => props.onOpen?.(o.id)} className="text-xs font-semibold text-brand-700 underline underline-offset-2">
                  Openen
                </button>
              )}
            </span>
          </li>
        ))}
        {open && getoond.length === 0 && (
          <li className="py-2 text-xs text-neutral-500">Niets gevonden.</li>
        )}
      </ul>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {!open && zichtbaar.length > INGEKLAPT && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-700 underline underline-offset-2">
            Toon alle {zichtbaar.length}
          </button>
        )}
        {open && (
          <button type="button" onClick={() => { setOpen(false); setZoek('') }} className="text-xs font-semibold text-brand-700 underline underline-offset-2">
            Minder tonen
          </button>
        )}
        {klein > 0 && (
          <button type="button" onClick={() => setMetKlein(v => !v)} className="text-xs text-neutral-500 underline underline-offset-2">
            {metKlein ? 'Kleine offertes verbergen' : `+ ${klein} kleine (onder € 3k)`}
          </button>
        )}
      </div>
    </div>
  )
}
