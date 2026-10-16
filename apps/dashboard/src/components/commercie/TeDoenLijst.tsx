'use client'

/**
 * De lijst van "Te doen": tegels die filteren, en daaronder de offertes per groep.
 *
 * Bewust een eigen lijst en geen OverzichtTabel. Die tabel is gemaakt voor kolommen kiezen,
 * filteren en exporteren (dat blijft in de weergave Lijst). Hier gaat het om in één oogopslag
 * zien wat er moet gebeuren: per rij de stip, de offerte, de afgesproken stap met wie aan zet
 * is, het laatste contact en het bedrag. Meer niet.
 *
 * Puur weergave: alle gegevens komen binnen via props. Zo rendert de voorbeeldpagina
 * (/auth/offertebewaking-preview) precies hetzelfde scherm met verzonnen gegevens.
 */

import * as React from 'react'
import { cn } from '@everts/ui'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import {
  BAKKEN, AANDACHT_BEDRAG, eur, eurKort, kortDatum,
  type Bak, type LaatsteContact, type TeDoenRij,
} from './te-doen'

type Props = {
  /** De rijen die nu zichtbaar zijn, al gesorteerd (zie sorteerTeDoen). */
  rijen: TeDoenRij[]
  /** Alle rijen binnen "van mij/iedereen", ook die van Later: daaruit tellen de tegels. */
  alleRijen: TeDoenRij[]
  tegel: Bak | null
  onTegel: (bak: Bak | null) => void
  geopendId: string | null
  onOpen: (id: string) => void
  mijnMedewerkerId: string | null
  laatsteContact: Map<string, LaatsteContact>
  /** YYYY-MM-DD; bepaalt of een datum een jaartal nodig heeft. */
  vandaag: string
}

export function TeDoenTegels(props: Pick<Props, 'alleRijen' | 'tegel' | 'onTegel'>) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
      {BAKKEN.map(b => {
        const rijen = props.alleRijen.filter(r => r._bak === b.bak)
        const som = rijen.reduce((t, r) => t + (r._bedrag ?? 0), 0)
        const aan = props.tegel === b.bak
        return (
          <button
            key={b.bak}
            type="button"
            aria-pressed={aan}
            onClick={() => props.onTegel(aan ? null : b.bak)}
            title={aan ? 'Klik om het filter op te heffen' : `Toon alleen: ${b.label}`}
            className={cn(
              'flex flex-col gap-1 rounded-[10px] border bg-white px-4 py-3 text-left transition-colors',
              aan ? 'border-brand-500 ring-1 ring-brand-500' : 'border-neutral-200 hover:border-neutral-300',
            )}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-neutral-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.kleur }} aria-hidden />
              {b.label}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[22px] font-bold leading-7 tabular-nums text-neutral-900">{rijen.length}</span>
              <span className="text-xs tabular-nums text-neutral-500">{eurKort(som)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Gedeelde kolommen van kop en rij, zodat ze nooit uit de pas lopen. */
const KOLOMMEN = 'md:grid md:grid-cols-[16px_minmax(0,2fr)_minmax(0,2.4fr)_148px_96px] md:items-center md:gap-3'

export function TeDoenLijst(props: Props) {
  if (props.rijen.length === 0) {
    return (
      <div className="rounded-[10px] border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
        {props.tegel
          ? 'Niets in deze groep. Klik de tegel nog eens om alles te zien.'
          : 'Niets te doen. Zet "Van iedereen" of "Ook wat later speelt" aan om meer te zien.'}
      </div>
    )
  }

  // Groepen in vaste volgorde; de rijen komen al gesorteerd binnen.
  const groepen = BAKKEN
    .map(b => ({ ...b, rijen: props.rijen.filter(r => r._bak === b.bak) }))
    .filter(g => g.rijen.length > 0)

  return (
    <div className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white">
      <div className={cn('hidden border-b border-neutral-200 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500', KOLOMMEN)}>
        <span />
        <span>Offerte</span>
        <span>Volgende stap · aan zet</span>
        <span>Laatste contact</span>
        <span className="text-right">Bedrag</span>
      </div>

      {groepen.map((g, gi) => (
        <section key={g.bak} aria-label={g.label}>
          <div className={cn(
            'flex flex-wrap items-baseline gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs',
            gi > 0 && 'border-t',
          )}>
            <span className="font-semibold text-neutral-900">{g.label}</span>
            <span className="text-neutral-500">{g.uitleg}</span>
            <span className="ml-auto tabular-nums text-neutral-500">
              {g.rijen.length} · {eurKort(g.rijen.reduce((t, r) => t + (r._bedrag ?? 0), 0))}
            </span>
          </div>
          {g.rijen.map(r => (
            <Rij
              key={r.id}
              rij={r}
              geselecteerd={props.geopendId === r.id}
              onOpen={props.onOpen}
              mijnId={props.mijnMedewerkerId}
              contact={props.laatsteContact.get(r.id) ?? null}
              vandaag={props.vandaag}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

const Rij = React.memo(function Rij(props: {
  rij: TeDoenRij
  geselecteerd: boolean
  onOpen: (id: string) => void
  mijnId: string | null
  contact: LaatsteContact | null
  vandaag: string
}) {
  const r = props.rij
  const pres = STATUS_PRESENTATIE[r._status]
  const ikAanZet = props.mijnId != null && r.bewaking_actiehouder_id === props.mijnId

  return (
    <button
      type="button"
      onClick={() => props.onOpen(r.id)}
      aria-current={props.geselecteerd ? 'true' : undefined}
      className={cn(
        'grid w-full grid-cols-[16px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-neutral-100 px-4 py-2 text-left last:border-b-0',
        KOLOMMEN,
        props.geselecteerd
          ? 'bg-brand-50 shadow-[inset_3px_0_0_var(--brand-500)]'
          : 'hover:bg-neutral-50',
      )}
    >
      <span className="mt-1.5 h-2 w-2 self-start rounded-full md:mt-0 md:self-center" style={{ background: pres.cssKleur }} title={pres.label} />

      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-neutral-900">{r.titel}</span>
        <span className="block truncate text-xs text-neutral-500">
          {[r.klant_naam, r.dossiernummer].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className="col-start-2 row-start-2 flex min-w-0 flex-col gap-1 md:col-start-auto md:row-start-auto">
        <span className={cn('truncate text-[13px]', r._status === 'verlopen' ? 'font-semibold text-error-700' : 'text-neutral-700')}>
          {r._stap ?? <span className="text-neutral-400">Nog niets afgesproken</span>}
          <span className="font-normal text-neutral-400">
            {' · '}
            {ikAanZet
              ? <strong className="font-semibold text-brand-700">jij</strong>
              : (r.bewaking_actiehouder ?? 'niemand')}
          </span>
        </span>
        {/* Wie er wacht staat al in de staptekst; de chips zeggen wat de tekst niet zegt. */}
        {(r.bewaking_stap_bron === 'actie' || r._openDagen != null) && (
          <span className="flex flex-wrap gap-1">
            {r.bewaking_stap_bron === 'actie' && <Chip>uit de actielijst</Chip>}
            {r._openDagen != null && <Chip>{r._openDagen} dagen open</Chip>}
          </span>
        )}
      </span>

      <span className="hidden min-w-0 text-xs text-neutral-500 md:block">
        {props.contact ? (
          <>
            <span className="block truncate">{kortDatum(props.contact.op, props.vandaag)}{props.contact.door ? ` · ${props.contact.door}` : ''}</span>
            <span className="block truncate text-neutral-700">{props.contact.kop}</span>
          </>
        ) : 'Nog geen contact'}
      </span>

      <span className="col-start-3 row-start-1 text-right text-[13px] font-semibold tabular-nums text-neutral-900 md:col-start-auto md:row-start-auto">
        {eur(r._bedrag)}
        {r._aandacht && (
          <span className="ml-1 text-warning-700" title={`Vanaf ${eur(AANDACHT_BEDRAG)} zonder eigenaar of vervolgstap`}>!</span>
        )}
      </span>
    </button>
  )
})

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full border border-neutral-200 bg-neutral-50 px-2 py-px text-[11px] font-semibold text-neutral-600">
      {children}
    </span>
  )
}
