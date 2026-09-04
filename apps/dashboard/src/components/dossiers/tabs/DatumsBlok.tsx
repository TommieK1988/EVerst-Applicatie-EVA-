'use client'
import * as React from 'react'
import { cn } from '@everts/ui'
import { DatePicker, InklapbareCard } from '@/components/ui'
import {
  dagenTussenKalender, datumNaarISO, formatDatumNL, formatDelta,
  type DossierDatumRegel,
} from '@/lib/dossiers/datum-regels'

export type DatumVeld = 'aanvraagdatum' | 'deadline' | 'voorlopige_start' | 'voorlopige_eind'

/** De twee procesdatums die je zelf zet; de rest houdt EVA bij vanuit het proces. */
const ZELF_TE_ZETTEN: Record<string, DatumVeld | undefined> = {
  aanvraagdatum: 'aanvraagdatum',
  deadline:      'deadline',
}

/* ─── één regel ───────────────────────────────────────────────────── */
function Regel({ label, chip, delta, children }: {
  label: string
  chip?: string
  delta?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="flex items-baseline gap-1.5 text-[11px] text-neutral-500">
        {label}
        {chip && (
          <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
            {chip}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 text-right">
        {delta && <span className="text-[10px] tabular-nums text-neutral-400">{delta}</span>}
        {children}
      </span>
    </div>
  )
}

const Waarde = ({ children, toon = true, urgent }: {
  children: React.ReactNode; toon?: boolean; urgent?: boolean
}) => (
  <span className={cn(
    'py-[3px] text-[13px] font-medium tabular-nums',
    !toon ? 'text-neutral-400' : urgent ? 'text-warning-700' : 'text-neutral-800',
  )}>
    {children}
  </span>
)

/* ─── datumkiezer in de regel zelf ──────────────────────────────────
   Ziet er in rust uit als de waarde ernaast; de rand komt pas bij hover of
   focus. Kiezen slaat meteen op — er is geen bewerkmodus meer. */
function InlineDatum({ waarde, onKies, urgent }: {
  waarde: string
  onKies: (iso: string) => void
  urgent?: boolean
}) {
  return (
    <DatePicker
      value={waarde ? new Date(`${waarde}T12:00:00`) : undefined}
      onChange={d => onKies(datumNaarISO(d))}
      placeholder="—"
      weergave="kort"
      className={cn(
        'h-auto w-auto gap-1.5 border-transparent bg-transparent px-1.5 py-[3px] text-[13px] font-medium tabular-nums',
        '-mr-1.5 hover:border-neutral-300 hover:bg-white',
        urgent ? 'text-warning-700' : 'text-neutral-800',
      )}
    />
  )
}

/* ─── voorlopige planning ─────────────────────────────────────────────
   Bewust géén negende sleutel in DOSSIER_DATUM_VOLGORDE: bouwDatumRegels()
   rekent een deltaketen over de gevulde datums heen, en een voorlopige — dus
   meestal toekomstige — datum daartussen zou de "+N dagen" van de startdatum,
   einddatum én opleverdatum vervuilen. Deze regel staat naast de keten. */
function VoorlopigeRegel({ start, eind, bewerkbaar, onBewaar }: {
  start: string
  eind: string
  bewerkbaar: boolean
  onBewaar: (veld: DatumVeld, waarde: string) => void
}) {
  // Kalenderdagen inclusief begin- én einddag: een klus van maandag t/m vrijdag is
  // "5 dagen", niet 4. Bij een omgekeerde periode (eind vóór start) tonen we niets —
  // die staat wordt bij het kiezen al geweigerd; een "−20 dagen" erbij is alleen ruis.
  const dagen = start && eind ? dagenTussenKalender(start, eind) : null
  const duur = dagen != null && dagen >= 0 ? dagen : null
  const tekst =
    start && eind ? `${formatDatumNL(start)} → ${formatDatumNL(eind)}`
    : start        ? `vanaf ${formatDatumNL(start)}`
    : eind         ? `tot ${formatDatumNL(eind)}`
    : '—'
  return (
    <Regel
      label="Voorlopige planning"
      chip="voorlopig"
      delta={duur != null ? `${duur + 1} ${duur === 0 ? 'dag' : 'dagen'}` : null}
    >
      {bewerkbaar ? (
        <span className="flex items-center gap-0.5">
          <InlineDatum waarde={start} onKies={v => onBewaar('voorlopige_start', v)} />
          <span className="text-[12px] text-neutral-400">→</span>
          <InlineDatum waarde={eind} onKies={v => onBewaar('voorlopige_eind', v)} />
        </span>
      ) : (
        <Waarde toon={!!(start || eind)}>{tekst}</Waarde>
      )}
    </Regel>
  )
}

/* ─── het blok ────────────────────────────────────────────────────── */
export default function DatumsBlok({
  regels, deadlineUrgent, bewerkbaar, form, onBewaar,
}: {
  regels: DossierDatumRegel[]
  deadlineUrgent: boolean
  /** Alleen-lezen dossiers tonen de datums als tekst. */
  bewerkbaar: boolean
  form: Record<DatumVeld, string>
  /** Wordt direct weggeschreven; er is geen "Opslaan" meer. */
  onBewaar: (veld: DatumVeld, waarde: string) => void
}) {
  // De voorlopige planning hoort tussen de opdrachtdatum en de (echte) startdatum:
  // dat is het moment in het proces waarop je hem afspreekt.
  const knip = regels.findIndex(r => r.sleutel === 'startdatum')
  const voor = knip === -1 ? regels : regels.slice(0, knip)
  const na   = knip === -1 ? []     : regels.slice(knip)

  const datumRegel = (regel: DossierDatumRegel) => {
    const heeftWaarde = regel.waarde != null
    const urgent = regel.sleutel === 'deadline' && deadlineUrgent && heeftWaarde
    const veld = ZELF_TE_ZETTEN[regel.sleutel]
    return (
      <Regel key={regel.sleutel} label={regel.label} delta={formatDelta(regel.delta)}>
        {bewerkbaar && veld ? (
          <InlineDatum waarde={form[veld]} onKies={v => onBewaar(veld, v)} urgent={urgent} />
        ) : (
          <Waarde toon={heeftWaarde} urgent={urgent}>
            {heeftWaarde ? formatDatumNL(regel.waarde!) : '—'}
          </Waarde>
        )}
      </Regel>
    )
  }

  return (
    <InklapbareCard titel="Datums">
      <div className="divide-y divide-neutral-100">
        {voor.map(datumRegel)}
        <VoorlopigeRegel
          start={form.voorlopige_start}
          eind={form.voorlopige_eind}
          bewerkbaar={bewerkbaar}
          onBewaar={onBewaar}
        />
        {na.map(datumRegel)}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-neutral-400">
        Aanvraagdatum, deadline en de voorlopige planning zet je hier zelf. De overige datums
        houdt EVA bij: de offertedatum volgt uit het verzenden van de offerte, start- en einddatum
        uit de planning, de opleverdatum uit de oplevering, en opdracht- en financieel-gereed-datum
        uit de fasewissel.
      </p>
    </InklapbareCard>
  )
}
