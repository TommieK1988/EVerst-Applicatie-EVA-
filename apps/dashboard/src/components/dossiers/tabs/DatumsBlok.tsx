'use client'
import * as React from 'react'
import { cn } from '@everts/ui'
import { DatePicker, FormField, FormRow, FormSection, InklapbareCard } from '@/components/ui'
import {
  dagenTussenKalender, datumNaarISO, formatDatumNL, formatDelta,
  type DossierDatumRegel,
} from '@/lib/dossiers/datum-regels'

export type DatumVeld = 'aanvraagdatum' | 'deadline' | 'voorlopige_start' | 'voorlopige_eind'

/* ─── één regel ───────────────────────────────────────────────────── */
function Regel({ label, chip, delta, children }: {
  label: string
  chip?: string
  delta?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className="flex items-baseline gap-1.5 text-[11px] text-neutral-500">
        {label}
        {chip && (
          <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
            {chip}
          </span>
        )}
      </span>
      <span className="flex items-baseline gap-2 text-right">
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
    'text-[13px] font-medium tabular-nums',
    !toon ? 'text-neutral-400' : urgent ? 'text-warning-700' : 'text-neutral-800',
  )}>
    {children}
  </span>
)

/* ─── voorlopige planning ─────────────────────────────────────────────
   Bewust géén negende sleutel in DOSSIER_DATUM_VOLGORDE: bouwDatumRegels()
   rekent een deltaketen over de gevulde datums heen, en een voorlopige — dus
   meestal toekomstige — datum daartussen zou de "+N dagen" van de startdatum,
   einddatum én opleverdatum vervuilen. Deze regel staat naast de keten. */
function VoorlopigeRegel({ start, eind }: { start: string; eind: string }) {
  // Kalenderdagen inclusief begin- én einddag: een klus van maandag t/m vrijdag is
  // "5 dagen", niet 4. Bij een omgekeerde periode (eind vóór start) tonen we niets —
  // die staat is ongeldig en wordt door de validatie in de bewerkmodus gemeld; een
  // "−20 dagen" erbij is alleen maar ruis.
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
      <Waarde toon={!!(start || eind)}>{tekst}</Waarde>
    </Regel>
  )
}

/* ─── het blok ────────────────────────────────────────────────────── */
export default function DatumsBlok({
  regels, deadlineUrgent, editMode, form, onSet, periodeFout,
}: {
  regels: DossierDatumRegel[]
  deadlineUrgent: boolean
  editMode: boolean
  form: Record<DatumVeld, string>
  onSet: (veld: DatumVeld) => (waarde: string) => void
  periodeFout: string | null
}) {
  // De voorlopige planning hoort tussen de opdrachtdatum en de (echte) startdatum:
  // dat is het moment in het proces waarop je hem afspreekt.
  const knip = regels.findIndex(r => r.sleutel === 'startdatum')
  const voor = knip === -1 ? regels : regels.slice(0, knip)
  const na   = knip === -1 ? []     : regels.slice(knip)

  const datumRegel = (regel: DossierDatumRegel) => {
    const heeftWaarde = regel.waarde != null
    return (
      <Regel key={regel.sleutel} label={regel.label} delta={formatDelta(regel.delta)}>
        <Waarde
          toon={heeftWaarde}
          urgent={regel.sleutel === 'deadline' && deadlineUrgent && heeftWaarde}
        >
          {heeftWaarde ? formatDatumNL(regel.waarde!) : '—'}
        </Waarde>
      </Regel>
    )
  }

  const picker = (veld: DatumVeld) => (
    <DatePicker
      value={form[veld] ? new Date(`${form[veld]}T12:00:00`) : undefined}
      onChange={d => onSet(veld)(datumNaarISO(d))}
    />
  )

  return (
    <InklapbareCard titel="Datums" altijdOpen={editMode}>
      <div className="divide-y divide-neutral-100">
        {voor.map(datumRegel)}
        <VoorlopigeRegel start={form.voorlopige_start} eind={form.voorlopige_eind} />
        {na.map(datumRegel)}
      </div>

      {editMode && (
        <div className="mt-4">
          <FormSection title="Bewerkbare datums">
            <p className="mb-3 text-[11px] leading-snug text-neutral-500">
              De overige datums houdt EVA zelf bij: de offertedatum volgt uit het verzenden
              van de offerte, start- en einddatum uit de planning, de opleverdatum uit de
              oplevering, en opdracht- en financieel-gereed-datum uit de fasewissel.
            </p>
            <FormRow cols="2">
              <FormField upper label="Aanvraagdatum">{picker('aanvraagdatum')}</FormField>
              <FormField upper label="Deadline">{picker('deadline')}</FormField>
            </FormRow>
            <FormRow cols="2">
              <FormField upper label="Voorlopige startdatum">{picker('voorlopige_start')}</FormField>
              <FormField upper label="Voorlopige einddatum">{picker('voorlopige_eind')}</FormField>
            </FormRow>
            {periodeFout && (
              <p className="mt-1 text-[11px] font-medium text-error-700">{periodeFout}</p>
            )}
          </FormSection>
        </div>
      )}
    </InklapbareCard>
  )
}
