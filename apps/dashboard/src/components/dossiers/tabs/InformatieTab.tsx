'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { cn } from '@everts/ui'
import {
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_STATUSSEN,
  getDossierSubstatus, isBouw7Substatus, isAfsluitendeSubstatus,
  type DossierSectie, type DossierRij,
} from '../types'
import { updateServicedeskSubstatus, updateDossierRollen, updateDossierInfo, getContactpersonenVoorRelatie } from '@/lib/dossiers/actions'
import { wijzigSubstatusMetConflict } from '../substatus-wijzigen'
import { useDialogen } from '@/components/ui/dialogen'
import { leidWerkmaatschappijAf, type WerkmaatschappijOptie } from '@/lib/dossiers/werkmaatschappij'
import { kiesAanneemsom } from '@/lib/dossiers/aanneemsom'
import {
  bouwDatumRegels, formatDelta, LEGE_DOSSIER_DATUMS,
  type DossierDatumRegel, type DossierDatums,
} from '@/lib/dossiers/datum-regels'
import { getQuoteTotalenVoorProject } from '@/app/(platform)/everts-calc/actions/quotes'
import C4yDropCard from '@/components/everts-calc/calculatie/C4yDropCard'
import { DossierVerversKnop } from '../DossierVerversKnop'
import { berekenCalcTotalen, type CalcTotalen } from '@/lib/everts-calc/calc-totalen'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import type { OpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'
import {
  zetOptieInOpdracht, wijsStelpostBewakingscodesToe,
  maakStelpost, verwijderStelpost, verrekenStelpost,
} from '@/lib/dossiers/opdracht-onderdelen'
import ServicedeskInfoPaneel from './ServicedeskInfoPaneel'
import OffertePaneel from './OffertePaneel'
import DossierNotitiesBlok from './DossierNotitiesBlok'
import type { DossierNotitie } from '@/lib/dossiers/notities-actions'
import FinancieelGereedDialog from '../FinancieelGereedDialog'
import ActiveerSjabloonDialog from '../ActiveerSjabloonDialog'
import DossierTogglesPaneel from '../DossierTogglesPaneel'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import ObjectKoppeling from '@/components/objecten/ObjectKoppeling'
import type { Relatie, RelatieFactuuradres } from '@everts/database'
import type { DbTaskList, TaakMetDetails, TaskStatus, TaskPrioriteit } from '@/lib/taken/supabase/database.types'
import type { UrgenteTaak } from '@/lib/taken/supabase/database.types'
import TaakDetailPanel from '@/components/taken/TaakDetailPanel'
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { Combobox } from '@/components/ui/combobox'
import {
  Button, Card, CardHeader, CardBody,
  Input,
  FormField, FormRow, FormSection,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  DatePicker,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverItem,
  Separator,
  AlertDialog, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogAction, AlertDialogCancel,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from '@/components/ui'

/* ─── helpers ─────────────────────────────────────────────────────── */
const alleStatussen = [...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN, ...SERVICEDESK_STATUSSEN]
const statusLabel = (s: string) => alleStatussen.find(x => x.key === s)?.label ?? s
const statusKleur = (s: string) =>
  ['verloren', 'vervallen', 'afgewezen'].includes(s) ? '#d9534f' :
  ['gewonnen', 'offerte_gereed', 'financieel_afgesloten', 'financieel_gereed'].includes(s) ? '#009439' :
  ['verzonden', 'nabellen', 'in_behandeling', 'mondelinge_toezegging', 'onderhanden', 'uitvoering_gereed',
   'loopt', 'uitgevoerd', 'ingepland', 'offerte_uitgebracht', 'kosten_compleet'].includes(s) ? 'var(--accent)' :
  'var(--fg-muted)'

const fmtBedrag = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)
// timeZone expliciet: de procesdatums zijn deels timestamptz (opdrachtdatum,
// verzonden_op, planning-blokken). Zonder dit valt een mutatie van 23:00 NL op de vorige dag.
const fmtDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam',
  })

/**
 * DatePicker-waarde → 'YYYY-MM-DD' voor een date-kolom, in lokale tijd.
 * Bewust niet `toISOString().slice(0,10)`: die rekent naar UTC, waardoor een in
 * de zomertijd gekozen 1 juli (00:00 CEST = 30 juni 22:00 UTC) als 30 juni opslaat.
 */
const datumNaarISO = (d: Date | undefined | null): string => {
  if (!d) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/* ─── form state ──────────────────────────────────────────────────── */
type FormValues = {
  calculator_id: string
  categorie: string
  referentie: string
  opmerkingen: string
  contactpersoon_id: string
  werkadres_naam: string
  werkadres_telefoon: string
  werkadres_email: string
  werkadres_straat: string
  werkadres_postcode: string
  werkadres_stad: string
  betalingstermijn: string
  factuurreferentie: string
  projectleider_id: string
  teamleider_id: string
  werkvoorbereider_id: string
  uitvoerder_id: string
  controller_id: string
  opdracht_referentie: string
  factuuradres_id: string
  werkmaatschappij_id: string
  aanvraagdatum: string
  deadline: string
  vve_code: string
}

const DEFAULT_CATEGORIEEN = ['Schilderwerk', 'Houtrotherstel', 'Stukadoorwerk', 'Gevelrenovatie', 'Binnenwerk', 'Overig']

/* ─── read-only veld ──────────────────────────────────────────────── */
function InfoVeld({
  label, waarde, mono, numeric, urgentie, href, hrefTitel,
}: {
  label: string
  waarde?: string | null
  mono?: boolean
  numeric?: boolean
  urgentie?: boolean
  /** Maakt de waarde klikbaar, bv. naar de relatie- of contactpersoonpagina. */
  href?: string | null
  hrefTitel?: string
}) {
  const heeftWaarde = waarde != null && waarde !== ''
  return (
    <div>
      <div className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </div>
      <div className={cn(
        'text-[13px]',
        mono    ? ' font-medium'         : null,
        numeric ? 'tabular-nums font-bold'        : null,
        !mono && !numeric ? 'font-medium'         : null,
        heeftWaarde
          ? urgentie ? 'text-warning-700' : 'text-neutral-800'
          : 'text-neutral-400',
      )}>
        {heeftWaarde
          ? href
            ? (
              <Link
                href={href}
                title={hrefTitel}
                className="text-brand-600 no-underline hover:underline"
              >
                {waarde}
              </Link>
            )
            : waarde
          : '—'}
      </div>
    </div>
  )
}

/* ─── datumlijst ──────────────────────────────────────────────────────
   De acht procesdatums onder elkaar in vaste procesvolgorde, met per regel
   het aantal dagen sinds de vorige gevulde datum. Lege datums blijven als
   streepje staan: dat een opdrachtdatum ontbreekt is zelf ook informatie. */
function DatumLijst({ regels, deadlineUrgent }: {
  regels: DossierDatumRegel[]
  deadlineUrgent: boolean
}) {
  return (
    <div className="mt-4 border-t border-neutral-100 pt-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        Datums
      </div>
      <div className="divide-y divide-neutral-100">
        {regels.map(regel => {
          const heeftWaarde = regel.waarde != null
          const delta       = formatDelta(regel.delta)
          const urgent      = regel.sleutel === 'deadline' && deadlineUrgent && heeftWaarde
          return (
            <div key={regel.sleutel} className="flex items-baseline justify-between gap-3 py-[5px]">
              <span className="text-[11px] text-neutral-500">{regel.label}</span>
              <span className="flex items-baseline gap-2 text-right">
                {delta && (
                  <span className="text-[10px] tabular-nums text-neutral-400">{delta}</span>
                )}
                <span className={cn(
                  'text-[13px] font-medium tabular-nums',
                  !heeftWaarde ? 'text-neutral-400' : urgent ? 'text-warning-700' : 'text-neutral-800',
                )}>
                  {heeftWaarde ? fmtDatum(regel.waarde!) : '—'}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── nieuwe-stelpost-formulier ─────────────────────────────────────────
   Wijs een deel van de aanneemsom aan als stelpost. "In de aanneemsom" is de
   normale keuze: dan herclassificeer je een deel van de bestaande som en gaat
   het contracttotaal níet omhoog. "Apart factureren" is extra omzet. */
function NieuweStelpostRegel({ onOpslaan, pending }: {
  onOpslaan: (invoer: {
    omschrijving: string; bedrag_excl_btw: number; in_aanneemsom: boolean
    begroot_excl_btw: number | null; grondslag: 'vast' | 'geboekte_kosten'
  }) => void
  pending: boolean
}) {
  const [open, setOpen]         = React.useState(false)
  const [oms, setOms]           = React.useState('')
  const [bedrag, setBedrag]     = React.useState('')
  const [inSom, setInSom]       = React.useState(true)
  const [begroot, setBegroot]   = React.useState('')
  const [grondslag, setGrondslag] = React.useState<'vast' | 'geboekte_kosten'>('geboekte_kosten')

  const getal = (s: string): number | null => {
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const bedragNum = getal(bedrag)
  const geldig = oms.trim().length > 0 && bedragNum != null && bedragNum > 0

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
      >
        + Stelpost aanwijzen
      </button>
    )
  }
  const inputCls = 'w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-800 outline-none focus:border-brand-400'
  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 block">
          <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Omschrijving</span>
          <input className={inputCls} value={oms} onChange={e => setOms(e.target.value)} placeholder="bijv. Stelpost houtrotherstel" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Bedrag excl. BTW</span>
          <input className={inputCls} value={bedrag} onChange={e => setBedrag(e.target.value)} placeholder="0,00" inputMode="decimal" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400" title="Kostprijs-budget voor de bewakingscode. Bewust niet het stelpostbedrag: dat is omzet inclusief AK en winst.">
            Begroot (kostprijs)
          </span>
          <input className={inputCls} value={begroot} onChange={e => setBegroot(e.target.value)} placeholder="optioneel" inputMode="decimal" />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-neutral-700">
          <input type="checkbox" checked={inSom} onChange={e => setInSom(e.target.checked)} />
          <span title="Aan: deel van de aanneemsom (contracttotaal blijft gelijk). Uit: valt erbuiten en wordt apart gefactureerd.">
            Zit in de aanneemsom
          </span>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Afrekenen op</span>
          <select
            className={inputCls}
            value={grondslag}
            onChange={e => setGrondslag(e.target.value as 'vast' | 'geboekte_kosten')}
          >
            <option value="geboekte_kosten">Geboekte kosten (verrekenen)</option>
            <option value="vast">Vast bedrag</option>
          </select>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!geldig || pending}
          onClick={() => {
            onOpslaan({
              omschrijving: oms.trim(),
              bedrag_excl_btw: bedragNum as number,
              in_aanneemsom: inSom,
              begroot_excl_btw: getal(begroot),
              grondslag,
            })
            setOms(''); setBedrag(''); setBegroot(''); setInSom(true); setOpen(false)
          }}
          className="rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          Toevoegen
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setOms(''); setBedrag(''); setBegroot('') }}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          Annuleren
        </button>
      </div>
    </div>
  )
}

/* ─── regel in de opbouw van de opdracht ────────────────────────────────
   Eén regel van de rekensom: label links, bedrag rechts. `soort` bepaalt het
   gewicht — 'post' telt mee in de optelling, 'waarvan' is een uitsplitsing van de
   regel erboven (telt dus NIET mee), 'subtotaal' en 'eind' sluiten af. Met
   `onClick` wordt de regel een knop die de specificatie opent. */
function RekenRegel({ label, bedrag, soort = 'post', aantal, onClick, bedragKleur, titel }: {
  label: string
  bedrag: string
  soort?: 'post' | 'waarvan' | 'btw' | 'subtotaal' | 'eind'
  aantal?: number
  onClick?: () => void
  bedragKleur?: string
  titel?: string
}) {
  const isEind      = soort === 'eind'
  const isSubtotaal = soort === 'subtotaal'
  const isWaarvan   = soort === 'waarvan'
  const inhoud = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn(
          'truncate',
          isEind      ? 'text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500'
          : isSubtotaal ? 'text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500'
          : isWaarvan   ? 'text-[11.5px] text-neutral-400'
          : 'text-[12.5px] text-neutral-700',
        )}>
          {label}
        </span>
        {aantal != null && aantal > 0 && (
          <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[9.5px] font-semibold text-neutral-500">
            {aantal}
          </span>
        )}
        {onClick && (
          <svg
            width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-neutral-300"
          >
            <path d="M7 5l5 5-5 5" />
          </svg>
        )}
      </span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          isEind ? 'text-[18px] font-bold text-neutral-900'
          : isSubtotaal ? 'text-[13px] font-bold text-neutral-800'
          : isWaarvan ? 'text-[11.5px] text-neutral-400'
          : 'text-[12.5px] font-semibold text-neutral-800',
        )}
        style={bedragKleur ? { color: bedragKleur } : undefined}
      >
        {bedrag}
      </span>
    </>
  )
  const basis = cn(
    'flex w-full items-baseline justify-between gap-3 py-[5px]',
    isWaarvan && 'pl-3',
    isEind && 'border-t-2 border-neutral-200 pt-2.5 mt-1',
    isSubtotaal && 'border-t border-neutral-200 pt-2 mt-1',
  )
  if (!onClick) return <div className={basis} title={titel}>{inhoud}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      title={titel ?? 'Klik voor de specificatie'}
      className={cn(basis, '-mx-1.5 w-[calc(100%+0.75rem)] rounded px-1.5 text-left transition-colors hover:bg-neutral-50')}
    >
      {inhoud}
    </button>
  )
}

/** Welke specificatie er in het pop-upvenster staat. */
type OpdrachtDetailSoort = 'stelposten' | 'meerwerk' | 'opties'

/* ─── specificatie-venster ──────────────────────────────────────────────
   De opbouw in het Financiële-totalen-blok toont alleen bedragen; klikken op een
   regel opent hier de onderliggende posten. Stelposten: met bewakingscode,
   begroot/werkelijk, verrekening en het aanwijzen van een nieuwe stelpost.
   Read-only respecteert afgesloten dossiers. */
function OpdrachtDetailDialog({
  soort, onClose, overzicht, readOnly, onToggleOptie, onWijsCodes, onNieuweStelpost,
  onVerwijderStelpost, onVerreken, pending,
}: {
  soort: OpdrachtDetailSoort | null
  onClose: () => void
  overzicht: OpdrachtOverzicht
  readOnly: boolean
  onToggleOptie: (id: string, aan: boolean) => void
  onWijsCodes: () => void
  onNieuweStelpost: (invoer: {
    omschrijving: string; bedrag_excl_btw: number; in_aanneemsom: boolean
    begroot_excl_btw: number | null; grondslag: 'vast' | 'geboekte_kosten'
  }) => void
  onVerwijderStelpost: (id: string) => void
  onVerreken: (id: string) => void
  pending: boolean
}) {
  const { stelposten, opties, meerwerken } = overzicht
  const titel = soort === 'meerwerk' ? 'Goedgekeurd meerwerk'
    : soort === 'opties' ? 'Opties'
    : 'Stelposten'
  const totaal = soort === 'meerwerk' ? overzicht.meerwerkTotaal
    : soort === 'opties' ? overzicht.gekozenOptiesTotaal
    : overzicht.stelpostenTotaal
  return (
    <Dialog open={soort != null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="mb-2 flex items-baseline justify-between border-b border-neutral-200 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
              Totaal excl. BTW
            </span>
            <span className="tabular-nums text-[14px] font-bold text-neutral-900">{fmtBedrag(totaal)}</span>
          </div>

        {soort === 'stelposten' && (
        <div className="space-y-3">
          {overzicht.overschrijding && (
            <div
              className="rounded-md px-2 py-1.5 text-[11px] font-semibold"
              style={{ background: 'var(--danger-50, #fef2f2)', color: 'var(--danger-800, #991b1b)' }}
            >
              De stelposten in de aanneemsom ({fmtBedrag(overzicht.overschrijding.carveOuts)}) zijn samen hoger dan de
              aanneemsom ({fmtBedrag(overzicht.overschrijding.aanneemsom)}). Corrigeer een bedrag of zet een stelpost
              buiten de aanneemsom.
            </div>
          )}
          {overzicht.aanneemsomDrift && (
            <div
              className="rounded-md px-2 py-1.5 text-[11px]"
              style={{ background: 'var(--warning-50, #fff7ed)', color: 'var(--warning-800, #9a3412)' }}
            >
              De aanneemsom is gewijzigd van {fmtBedrag(overzicht.aanneemsomDrift.snapshot)} naar{' '}
              {fmtBedrag(overzicht.aanneemsomDrift.actueel)} nadat deze stelposten zijn aangewezen. Controleer of de
              bedragen nog kloppen — EVA past ze bewust niet zelf aan.
            </div>
          )}
          <div>
          {stelposten.length === 0 ? (
            <div className="text-[12px] italic text-neutral-400">Nog geen stelposten aangewezen.</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {stelposten.map(sp => (
                <div key={sp.id} className="py-[5px] first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-700">{sp.omschrijving}</span>
                    <span className="shrink-0 tabular-nums text-[12px] font-semibold text-neutral-800">
                      {sp.bedrag_excl_btw != null ? fmtBedrag(sp.bedrag_excl_btw) : '—'}
                    </span>
                    {!readOnly && sp.bron === 'handmatig' && !sp.verrekendMeerwerkId && (
                      <button
                        type="button"
                        onClick={() => onVerwijderStelpost(sp.id)}
                        disabled={pending}
                        title="Stelpost verwijderen"
                        className="shrink-0 rounded px-1 text-[11px] font-semibold text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Kenmerken op een eigen regel — in een smalle kolom past dat niet naast de omschrijving. */}
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                    {sp.bewakingscode && (
                      <span className="rounded bg-neutral-100 px-1 py-px font-mono text-[10px] text-neutral-500">{sp.bewakingscode}</span>
                    )}
                    {sp.in_aanneemsom ? (
                      <span
                        className="rounded-full bg-neutral-100 px-1.5 py-px text-[9.5px] font-semibold text-neutral-500"
                        title="Zit in de aanneemsom — verlaagt de basisscope, telt niet extra mee in het contracttotaal."
                      >
                        in aanneemsom
                      </span>
                    ) : (
                      <span
                        className="rounded-full px-1.5 py-px text-[9.5px] font-semibold"
                        style={{ background: 'var(--warning-50, #fff7ed)', color: 'var(--warning-800, #9a3412)' }}
                        title="Valt buiten de aanneemsom — apart factureren, telt bij het contracttotaal op."
                      >
                        apart factureren
                      </span>
                    )}
                    {sp.begroot != null && (
                      <span
                        className="tabular-nums text-[10px]"
                        style={{ color: (sp.geboekt ?? 0) > sp.begroot ? '#d9534f' : 'var(--fg-muted)' }}
                        title="Geboekt / begroot (kostprijs)"
                      >
                        {fmtBedrag(sp.geboekt ?? 0)} / {fmtBedrag(sp.begroot)}
                      </span>
                    )}
                  </div>
                  {/* Verrekening: werkelijk vs. stelpost. Het verschil landt als één meer-/minderwerkregel. */}
                  {sp.verrekenSaldo != null && (
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[10.5px] text-neutral-400">
                        werkelijk {fmtBedrag(sp.werkelijkVerkoop ?? 0)} ·{' '}
                        <span style={{ color: sp.verrekenSaldo > 0 ? '#d97706' : sp.verrekenSaldo < 0 ? '#009439' : undefined }}>
                          {sp.verrekenSaldo > 0 ? 'meerwerk' : 'minderwerk'} {fmtBedrag(Math.abs(sp.verrekenSaldo))}
                        </span>
                      </span>
                      {sp.verrekendMeerwerkId ? (
                        <span className="shrink-0 text-[10px] font-semibold text-neutral-400">verrekend</span>
                      ) : (!readOnly && sp.verrekenSaldo !== 0 && (
                        <button
                          type="button"
                          onClick={() => onVerreken(sp.id)}
                          disabled={pending}
                          title="Maak van het verschil één meer-/minderwerkregel (status Aangevraagd, dus via klantakkoord)."
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
                        >
                          Verrekenen
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly && stelposten.some(sp => !sp.bewakingscode) && (
            <button
              type="button"
              onClick={onWijsCodes}
              disabled={pending}
              className="mt-1.5 mr-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-50"
              title="Geef elke stelpost een eigen bewakingscode (SP01, SP02…) en maak die in Bouw7 aan."
            >
              Codes toewijzen
            </button>
          )}
          {!readOnly && overzicht.handmatigMogelijk && (
            <NieuweStelpostRegel onOpslaan={onNieuweStelpost} pending={pending} />
          )}
          {stelposten.some(sp => sp.bewakingscode) && (
            <p className="mt-2 text-[10px] italic text-neutral-400">
              Gebruik deze codes als kostengroep in de werkbegroting; begroot/werkelijk verschijnt zodra de begroting naar Bouw7 is gestuurd.
            </p>
          )}
          </div>
        </div>
        )}

        {soort === 'meerwerk' && (
        <div>
          {meerwerken.length === 0 ? (
            <div className="text-[12px] italic text-neutral-400">Geen goedgekeurd meerwerk.</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {meerwerken.map(mw => (
                <div key={mw.id} className="py-[5px] first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-700">{mw.omschrijving}</span>
                    <span className="shrink-0 tabular-nums text-[12px] font-semibold text-neutral-800">{fmtBedrag(mw.bedrag_excl_btw)}</span>
                  </div>
                  {mw.opdrachtOnderdeelId && (
                    <span
                      className="mt-0.5 inline-block rounded-full bg-neutral-100 px-1.5 py-px text-[9.5px] font-semibold text-neutral-500"
                      title="Dit is de verrekening van een stelpost — het verschil telt hier één keer mee."
                    >
                      verrekening
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {soort === 'opties' && (
          <div className="divide-y divide-neutral-100">
            {opties.map(op => (
              <div key={op.id} className="flex items-baseline justify-between gap-3 py-[5px]">
                <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-700">{op.omschrijving}</span>
                {readOnly ? (
                  <span className={cn(
                    'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
                    op.in_opdracht ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-500',
                  )}>
                    {op.in_opdracht ? 'In opdracht' : 'Niet gekozen'}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleOptie(op.id, !op.in_opdracht)}
                    disabled={pending}
                    title={op.in_opdracht ? 'Klik om uit de opdracht te halen' : 'Klik om in de opdracht op te nemen'}
                    className={cn(
                      'shrink-0 cursor-pointer rounded-full px-1.5 py-px text-[10px] font-semibold transition-colors disabled:opacity-50',
                      op.in_opdracht ? 'bg-brand-50 text-brand-600 hover:bg-brand-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
                    )}
                  >
                    {op.in_opdracht ? 'In opdracht' : 'Niet gekozen'}
                  </button>
                )}
                <span className={cn(
                  'shrink-0 tabular-nums text-[12px] font-semibold',
                  op.in_opdracht ? 'text-neutral-800' : 'text-neutral-400',
                )}>
                  {op.bedrag_excl_btw != null ? fmtBedrag(op.bedrag_excl_btw) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/* ─── DS select helper ────────────────────────────────────────────── */
function DsSelect({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{placeholder ?? '— Selecteer —'}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/* ─── Rol-select (zoekbare single-select) ─────────────────────────── */
function RolSelect({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <Combobox
      options={[{ value: '', label: '— Geen —' }, ...options]}
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? '— Selecteer —'}
      searchPlaceholder="Zoek medewerker…"
      emptyText="Geen medewerker gevonden."
    />
  )
}

/* ─── taken blok ──────────────────────────────────────────────────── */
function urgenteTaakNaarDetails(t: UrgenteTaak): TaakMetDetails {
  return {
    id:                      t.id,
    titel:                   t.titel,
    omschrijving:            null,
    status:                  t.status as TaskStatus,
    prioriteit:              t.prioriteit as TaskPrioriteit,
    deadline:                t.deadline,
    lijst_id:                null,
    dossier_id:              null,
    medewerker_id:           null,
    parent_task_id:          null,
    geschatte_uren:          null,
    volgorde:                0,
    aangemaakt_door:         null,
    assignee_type:           'direct',
    dossier_rollen:          [],
    deadline_basis:          'geen',
    deadline_dagen:          null,
    deadline_handmatig:      false,
    herhaling_interval:      'geen',
    herhaling_bron_taak_id:  null,
    herhaling_index:         null,
    blocked_by_task_id:      null,
    formulier_template_id:   null,
    kwaliteit_ronde:         false,
    created_at:              '',
    updated_at:              '',
    assignees:               [],
    subtaken:                [],
    comments_count:          0,
    attachments_count:       0,
  }
}

function deadlineKleur(d: string | null): string {
  if (!d) return 'var(--fg-muted)'
  const diff = new Date(d).getTime() - Date.now()
  if (diff < 0)              return '#d9534f'
  if (diff < 86_400_000 * 3) return '#f0ad4e'
  return 'var(--fg-muted)'
}

function fmtDeadline(d: string | null): string {
  if (!d) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dt    = new Date(d); dt.setHours(0, 0, 0, 0)
  const diff  = Math.round((dt.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)   return 'Verlopen'
  if (diff === 0) return 'Vandaag'
  if (diff === 1) return 'Morgen'
  return dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

const STATUS_DOT: Record<string, string> = {
  open:           'var(--fg-muted)',
  in_behandeling: 'var(--accent)',
  wacht_op:       '#f0ad4e',
}

function TakenBlok({
  dossierId, dossierTitel, sectie, sjablonen, urgenteTaken,
}: {
  dossierId: string
  dossierTitel: string
  sectie: string
  sjablonen: DbTaskList[]
  urgenteTaken: UrgenteTaak[]
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [geselecteerd, setGeselecteerd] = React.useState<TaakMetDetails | null>(null)
  const [afgevinkt, setAfgevinkt] = React.useState<Set<string>>(new Set())
  const [, startTransition] = React.useTransition()

  const takenTabHref = `/${
    sectie === 'aanvraag' ? 'aanvragen' :
    sectie === 'offerte'  ? 'offertes'  : 'opdrachten'
  }/${dossierId}/taken`

  const openTaken = urgenteTaken.filter(t => !afgevinkt.has(t.id))

  function vinkAf(id: string) {
    setAfgevinkt(prev => new Set(prev).add(id))
    startTransition(async () => {
      try {
        await updateTaakStatus(id, 'gereed')
        router.refresh()
      } catch (e) {
        // optimistisch — bij fout terugdraaien, en zeggen waaróm: een actie met een doorloop
        // (formulier, kwaliteitsronde, toolbox) sluit alleen via die doorloop.
        setAfgevinkt(prev => { const n = new Set(prev); n.delete(id); return n })
        toast.error(e instanceof Error ? e.message : 'Fout bij afvinken')
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <span>Acties · {openTaken.length} open</span>
          {!readOnly && (
            <div className="flex items-center gap-1.5">
              {sjablonen.length > 0 && (
                <ActiveerSjabloonDialog dossier_id={dossierId} sjablonen={sjablonen} compact />
              )}
              <NieuweTaakDialog
                defaultDossier={{ id: dossierId, titel: dossierTitel }}
                onSuccess={() => router.refresh()}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
                  >
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M10 4v12M4 10h12" />
                    </svg>
                    Nieuwe actie
                  </button>
                }
              />
            </div>
          )}
        </CardHeader>
        <CardBody className="py-3">
          {openTaken.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
              <span className="text-[22px] opacity-35">☑</span>
              <span className="text-xs font-medium text-neutral-500">Geen openstaande acties</span>
              {sjablonen.length > 0 && (
                <span className="text-[11px] text-neutral-400">Activeer een sjabloon om acties aan te maken</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {openTaken.map((t, i) => (
                <div
                  key={t.id}
                  className="flex w-full items-center gap-2.5 py-[7px]"
                  style={{
                    borderBottom: i < openTaken.length - 1 ? '1px solid var(--neutral-200, #e3e8ea)' : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { if (!readOnly) vinkAf(t.id) }}
                    disabled={readOnly}
                    title={readOnly ? 'Alleen-lezen' : 'Actie afvinken'}
                    className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-neutral-300 bg-transparent text-white outline-none transition-colors enabled:hover:border-brand-500 enabled:hover:bg-brand-50 disabled:cursor-default"
                  />
                  <button
                    onClick={() => setGeselecteerd(urgenteTaakNaarDetails(t))}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 bg-transparent text-left outline-none"
                    style={{ border: 'none' }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_DOT[t.status] ?? 'var(--fg-muted)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-neutral-900">
                        {t.titel}
                      </div>
                      {t.assignee_naam && (
                        <span className="mt-0.5 inline-block rounded-full bg-neutral-100 px-[5px] py-px text-[10px] font-semibold text-neutral-600">
                          {t.assignee_naam}
                        </span>
                      )}
                    </div>
                    {t.deadline && (
                      <span
                        className="shrink-0 text-[10px] font-semibold"
                        style={{ color: deadlineKleur(t.deadline) }}
                      >
                        {fmtDeadline(t.deadline)}
                      </span>
                    )}
                  </button>
                </div>
              ))}
              <Link
                href={takenTabHref}
                className="mt-2.5 block text-xs font-semibold text-brand-600 no-underline"
              >
                Alle acties →
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      {geselecteerd && (
        <div
          className="fixed inset-0 z-[1000] flex items-start justify-end bg-black/45 p-6 pt-16"
          onClick={e => { if (e.target === e.currentTarget) setGeselecteerd(null) }}
        >
          <TaakDetailPanel
            taak={geselecteerd}
            onSluit={() => setGeselecteerd(null)}
            isTemplate={false}
            takenInLijst={[]}
          />
        </div>
      )}
    </>
  )
}

/* ─── hoofd component ─────────────────────────────────────────────── */
type Props = {
  dossier: DossierRij
  sectie: DossierSectie
  medewerkers?: { id: string; naam: string }[]
  factuuradressen?: RelatieFactuuradres[]
  relatie?: Relatie | null
  sjablonen?: DbTaskList[]
  urgenteTaken?: UrgenteTaak[]
  categorieen?: string[]
  /** Goedgekeurd meerwerk (excl. btw), live uit Bouw7; 0 indien geen/ongekoppeld. */
  meerwerk?: number
  /** Dossiernotities (nieuwste eerst), getoond in het Notities-blok rechts. */
  notities?: DossierNotitie[]
  /** Ingelogde medewerker — bepaalt welke notities verwijderbaar zijn. */
  currentMedewerkerId?: string | null
  /** Werkmaatschappijen (bedrijfsgegevens) voor de werkmaatschappij-dropdown. */
  werkmaatschappijen?: WerkmaatschappijOptie[]
  /** Procesdatums (aanvraag → financieel gereed); server-side samengesteld. */
  datums?: DossierDatums
  /** Opdracht-samenstelling (stelposten/opties + bewaking); alleen gevuld voor opdracht-dossiers. */
  opdrachtOverzicht?: OpdrachtOverzicht | null
}

export function InformatieTab({
  dossier, sectie, medewerkers = [], factuuradressen = [],
  relatie = null, sjablonen = [], urgenteTaken = [], categorieen, meerwerk = 0,
  notities = [], currentMedewerkerId = null, werkmaatschappijen = [],
  datums = LEGE_DOSSIER_DATUMS, opdrachtOverzicht = null,
}: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [editModeRaw, setEditMode]  = React.useState(false)
  // Bij een afgesloten (alleen-lezen) dossier kan de bewerkmodus nooit actief zijn.
  const editMode = editModeRaw && !readOnly
  const [substatus, setSubstatus]   = React.useState<string>(
    // Servicedesk gebruikt servicedesk_substatus; getDossierSubstatus kent alleen aanvraag/offerte/opdracht
    // en zou anders terugvallen op aanvraag_substatus ('nieuw').
    sectie === 'servicedesk' ? ((dossier as any).servicedesk_substatus ?? 'nieuw') : getDossierSubstatus(dossier)
  )
  /** Gereedmeld-dialoog met de vier compleetheidscontroles. */
  const [finDialoogOpen, setFinDialoogOpen] = React.useState(false)
  /** De statuskeuze staat gecontroleerd zodat hij kan sluiten vóór de gereedmeld-dialoog opent. */
  const [statusPopoverOpen, setStatusPopoverOpen] = React.useState(false)
  /** Gezet zodra er een afsluitende status gekozen is; de dialoog bevestigt of annuleert. */
  const [afsluitBevestiging, setAfsluitBevestiging] = React.useState<string | null>(null)

  const beschikbareStatussen =
    sectie === 'aanvraag'    ? AANVRAAG_STATUSSEN :
    sectie === 'offerte'     ? OFFERTE_STATUSSEN  :
    sectie === 'servicedesk' ? SERVICEDESK_STATUSSEN : OPDRACHT_STATUSSEN

  // Velden die uit Bouw7 komen zijn niet bewerkbaar in EVA (geen terugschrijven naar Bouw7).
  // Geldt alleen voor dossiers die daadwerkelijk uit Bouw7 komen.
  const bouw7Vergrendeld = (dossier as any).bouw7_id != null
  const bouw7Url = bouw7Vergrendeld
    ? `https://start.bouw7.nl/project/view?id=${(dossier as any).bouw7_id}#/`
    : null

  // Werkadres-kwaliteit: Opdracht- en Servicedesk-dossiers hebben een CONCREET
  // werkadres nodig (straat + plaats). Daarop varen de planning, de werkbon en de
  // monteur die er naartoe moet. Een leeg adres of een aanduiding als "Diverse
  // adressen" / "nader te bepalen" telt niet als concreet.
  const werkStraat = String((dossier as any).werkadres_straat ?? '').trim()
  const werkStad = String((dossier as any).werkadres_stad ?? '').trim()
  const werkadresNietConcreet =
    !werkStraat ||
    !werkStad ||
    /divers|nader te bepalen|n\.?t\.?b\.?|onbekend|n\.?v\.?t\.?/i.test(`${werkStraat} ${werkStad}`)
  // Fase-gating. Opdracht-dossiers zijn two-way: hun Bouw7-eigen opdracht-statussen zijn selecteerbaar
  // (worden teruggeschreven naar Bouw7), behalve financieel_afgesloten (definitieve afsluiting). Voor
  // aanvraag/offerte blijven Bouw7-eigen substatussen alleen-lezen (zichtbaar als huidige waarde).
  const kiesbareStatussen = beschikbareStatussen.filter(s => {
    if (s.key === substatus) return true
    if (sectie === 'opdracht') return s.key !== 'financieel_afgesloten'
    return !bouw7Vergrendeld || !isBouw7Substatus(sectie, s.key)
  })

  // Statuswijziging vanuit de detail-view: EVA bijwerken en — voor opdrachten — terugschrijven naar Bouw7.
  async function voerSubstatusUit(next: string) {
    const vorige = substatus
    setSubstatus(next)
    if (sectie === 'servicedesk') {
      const res = await updateServicedeskSubstatus(dossier.id, next)
      if (!res.ok) toast.error(res.error ?? 'Bijwerken mislukt')
      return
    }
    // Two-way: opdracht naar de projectstatus, aanvraag/offerte naar het gedeelde maatwerkveld
    // "Offerte Sub-status". Botst dat met de tweede Bouw7-app, dan legt de gedeelde helper de
    // keuze voor (Bouw7 volgen of tóch overschrijven) in plaats van alleen te melden dat het niet kan.
    const res = await wijzigSubstatusMetConflict({ dossierId: dossier.id, substatus: next as any, sectie, bevestig })
    if (!res.ok) setSubstatus(vorige)
    router.refresh()
  }

  /**
   * Afsluitende status (Afgewezen/Vervallen/Verloren) eerst laten bevestigen: het dossier wordt
   * daarna overal alleen-lezen en in Bouw7 kan het project op "08. Afgewezen" komen — niet meer
   * terug te draaien via de UI.
   */
  async function zetSubstatus(next: string) {
    if (isAfsluitendeSubstatus(sectie, next)) {
      setAfsluitBevestiging(next)
      return
    }
    // Financieel gereed loopt altijd langs de compleetheidscontrole — ook als de status via de
    // keuzelijst wordt gezet in plaats van via de knop. Anders is de controle met twee klikken
    // te omzeilen. De dialoog roept daarna `voerSubstatusUit` aan, niet `zetSubstatus`.
    if (sectie === 'opdracht' && next === 'financieel_gereed' && !readOnly) {
      setStatusPopoverOpen(false)
      setFinDialoogOpen(true)
      return
    }
    await voerSubstatusUit(next)
  }

  const [contactpersoonOpties, setContactpersoonOpties] = React.useState<{
    id: string; naam: string; email: string | null; telefoon: string | null
  }[]>([])

  React.useEffect(() => {
    if (!relatie?.id) return
    getContactpersonenVoorRelatie(relatie.id).then(setContactpersoonOpties).catch(() => {})
  }, [relatie?.id])

  const [form, setForm] = React.useState<FormValues>({
    calculator_id:           (dossier as any).calculator_id      ?? '',
    categorie:               (dossier as any).categorie           ?? '',
    referentie:              dossier.referentie           ?? '',
    opmerkingen:             (dossier as any).opmerkingen          ?? '',
    contactpersoon_id:       (dossier as any).contactpersoon_id  ?? '',
    werkadres_naam:          (dossier as any).werkadres_naam      ?? '',
    werkadres_telefoon:      (dossier as any).werkadres_telefoon  ?? '',
    werkadres_email:         (dossier as any).werkadres_email     ?? '',
    werkadres_straat:        (dossier as any).werkadres_straat    ?? '',
    werkadres_postcode:      (dossier as any).werkadres_postcode  ?? '',
    werkadres_stad:          (dossier as any).werkadres_stad      ?? '',
    betalingstermijn:        '',
    factuurreferentie:       '',
    projectleider_id:        dossier.project_manager_id  ?? '',
    teamleider_id:           dossier.teamleider_id        ?? '',
    werkvoorbereider_id:     dossier.werkvoorbereider_id  ?? '',
    uitvoerder_id:           dossier.uitvoerder_id        ?? '',
    controller_id:           dossier.controller_id        ?? '',
    opdracht_referentie:     dossier.opdracht_referentie  ?? '',
    factuuradres_id:         dossier.factuuradres_id      ?? '',
    // Handmatige keuze wint; anders afgeleid uit dossiernummer/bouw7_filiaal.
    werkmaatschappij_id:     (dossier as any).werkmaatschappij_id
                               ?? leidWerkmaatschappijAf(dossier.dossiernummer, (dossier as any).bouw7_filiaal, werkmaatschappijen),
    aanvraagdatum:           (dossier as any).aanvraagdatum ?? '',
    deadline:                (dossier as any).deadline      ?? '',
    vve_code:                (dossier as any).vve_code      ?? '',
  })
  const [opgeslagen, setOpgeslagen] = React.useState<FormValues>(form)

  const [projectId,    setProjectId]    = useState<string | null>(null)
  const [quoteTotalen, setQuoteTotalen] = useState<{
    subtotaal_ex_btw: number
    stelposten_subtotaal: number
    opties_subtotaal: number
    btw_bedrag: number
    totaal_incl_btw: number
    kostprijs: number
    marge_euro: number
    marge_pct: number
  } | null>(null)
  const [calcTotalen, setCalcTotalen] = useState<CalcTotalen | null>(null)
  const [importTick,  setImportTick]  = useState(0)

  // Het gekoppelde calculatieproject komt van het dossier zelf; na een import
  // ververst de router de props (importTick trapt de afgeleide totalen aan).
  useEffect(() => {
    setProjectId(dossier.everts_calc_project_id ?? null)
  }, [dossier.everts_calc_project_id])

  useEffect(() => {
    if (!projectId) { setQuoteTotalen(null); return }
    getQuoteTotalenVoorProject(projectId).then(setQuoteTotalen).catch(() => {})
  }, [projectId, importTick])

  // Totalen uit de gedeelde calculatie in Supabase, zodat ze op elk apparaat gelijk zijn.
  useEffect(() => {
    if (!projectId) { setCalcTotalen(null); return }
    let actief = true
    laadCalculatieSnapshot(projectId)
      .then(snap => { if (actief) setCalcTotalen(berekenCalcTotalen(snap)) })
      .catch(() => { if (actief) setCalcTotalen(null) })
    return () => { actief = false }
  }, [projectId, importTick])

  const set = (key: keyof FormValues) => (v: string) => setForm(p => ({ ...p, [key]: v }))

  function opslaan() {
    setOpgeslagen(form)
    setEditMode(false)
    // Fase wegschrijven — altijd langs `voerSubstatusUit`, dus mét terugschrijven naar Bouw7. Deze
    // tak schreef voor aanvraag/offerte alleen in EVA: daardoor liep EVA vooruit op het gedeelde
    // maatwerkveld en strandde elke vólgende wijziging op een conflict dat niet meer op te lossen was.
    // Voor aanvraag/offerte alleen wanneer de substatus EVA-stuurbaar is (Bouw7-eigen statussen
    // blijven daar alleen-lezen).
    if (sectie === 'servicedesk') {
      updateServicedeskSubstatus(dossier.id, substatus).catch(() => {})
    } else if (sectie === 'opdracht' || !bouw7Vergrendeld || !isBouw7Substatus(sectie, substatus)) {
      // Direct wegschrijven, niet via `zetSubstatus`: Opslaan bevestigt de al gekozen status en
      // mag niet opnieuw de gereedmeld-dialoog openen bij een dossier dat al financieel gereed is.
      voerSubstatusUit(substatus).catch(() => toast.error('Substatus opslaan mislukt'))
    }
    // Rollen zijn nu volledig bewerkbaar en worden bij Bouw7-dossiers direct teruggeschreven naar Bouw7
    // (projectleider→projectLeader, calculator→workPlanner, uitvoerder→executor, controller→custom attr
    // "Eindverantwoordelijke offerte"). Teamleider is EVA-eigen. `calculator_id` wordt server-side naar
    // `werkvoorbereider_id` gemirrord (Calculator ≡ Werkvoorbereider / Bouw7 workPlanner).
    updateDossierRollen(dossier.id, {
      project_manager_id:  form.projectleider_id  || null,
      calculator_id:       form.calculator_id     || null,
      uitvoerder_id:       form.uitvoerder_id     || null,
      teamleider_id:       form.teamleider_id     || null,
      controller_id:       form.controller_id     || null,
    }, { schrijfBouw7: bouw7Vergrendeld })
      .then(res => {
        if (res.ok && res.bouw7 && !res.bouw7.ok) {
          toast.error(`Rollen opgeslagen in EVA, maar terugschrijven naar Bouw7 mislukt: ${res.bouw7.error}`)
        }
      })
      .catch(() => {})
    // Inhoudsvelden: EVA-eigen velden altijd; Bouw7-bron-velden alleen voor niet-Bouw7-dossiers.
    updateDossierInfo(dossier.id, {
      referentie:           form.referentie           || null,
      opdracht_referentie:  form.opdracht_referentie  || null,
      werkadres_naam:       form.werkadres_naam       || null,
      werkadres_telefoon:   form.werkadres_telefoon   || null,
      werkadres_email:      form.werkadres_email      || null,
      // Werkmaatschappij is een EVA-eigen classificatie → altijd bewerkbaar.
      werkmaatschappij_id:  form.werkmaatschappij_id  || null,
      // Aanvraagdatum, deadline en VvE-code zijn EVA-eigen velden → altijd bewerkbaar.
      aanvraagdatum:        form.aanvraagdatum        || null,
      deadline:             form.deadline             || null,
      vve_code:             form.vve_code             || null,
      ...(bouw7Vergrendeld ? {} : {
        categorie:            form.categorie            || null,
        contactpersoon_id:    form.contactpersoon_id    || null,
        werkadres_straat:     form.werkadres_straat     || null,
        werkadres_postcode:   form.werkadres_postcode   || null,
        werkadres_stad:       form.werkadres_stad       || null,
      }),
    }).catch(() => {})
  }
  function annuleer() { setForm(opgeslagen); setEditMode(false) }

  /* ─── procesdatums ───────────────────────────────────────────────────
     De server levert de acht datums; aanvraagdatum en deadline komen uit het
     formulier zodat de lijst in de bewerkmodus meteen meebeweegt. Een lege
     aanvraagdatum valt terug op de serverwaarde (= created_at). */
  const datumRegels = React.useMemo(() => bouwDatumRegels({
    ...datums,
    aanvraagdatum: form.aanvraagdatum || datums.aanvraagdatum,
    deadline:      form.deadline      || null,
  }), [datums, form.aanvraagdatum, form.deadline])

  // De deadline is het moment waarop de offerte verzonden had moeten zijn; zodra
  // die eruit is, valt er niets meer te halen en kleurt hij dus niet meer.
  const deadlineUrgent = !!form.deadline
    && datums.offertedatum == null
    && (new Date(form.deadline).getTime() - Date.now()) < 86_400_000 * 7

  const geselecteerdFa        = factuuradressen.find(fa => fa.id === form.factuuradres_id) ?? null
  // De EVA-kant van de totalen: gegenereerde offerte (Supabase) → anders de live calculatie.
  // Of die kant überhaupt de aanneemsom levert beslist `kiesAanneemsom` hieronder.
  const T                     = quoteTotalen ?? calcTotalen
  /* Welke bron de aanneemsom levert is fase-afhankelijk — zie lib/dossiers/aanneemsom.ts. In de
     opdrachtfase wint het Bouw7-contractbedrag, want dát is wat gefactureerd wordt (en wat de
     Verkoop- en Financieel-tab al toonden). Alles wat bij de aanneemsom hoort — btw, splitsing,
     stelpost- en optie-aggregaten — moet dan uit diezelfde bron komen; anders staan er getallen
     uit twee verschillende offertes onder elkaar in één kolom. */
  const aanneemsomKeuze       = kiesAanneemsom({
    hoofdstatus:       dossier.hoofdstatus,
    bouw7ExclBtw:      dossier.bedrag_excl_btw != null ? Number(dossier.bedrag_excl_btw) : null,
    evaOfferteExclBtw: T?.subtotaal_ex_btw ?? null,
  })
  const finAanneemsom         = aanneemsomKeuze.aanneemsom
  const finUitEva             = aanneemsomKeuze.bron === 'eva'
  // Kostprijs en marge staan bewust NIET in dit blok: het toont de opbouw van de opdracht en dus
  // alleen verkoopbedragen. De marge leeft op het Financieel-tab, bij de bewaking.
  const finStelposten         = finUitEva ? (T?.stelposten_subtotaal ?? 0) : 0
  const finOptioneel          = finUitEva ? (T?.opties_subtotaal     ?? 0) : 0
  // Totaal incl. BTW komt uit de calculatie of uit Bouw7 (bedrag_incl_btw) — nooit zelf 21% schatten,
  // want er zijn ook 9%- en BTW-verlegd-projecten. BTW = incl − excl.
  const finTotaalIncl         = (finUitEva ? T?.totaal_incl_btw ?? null : null)
    ?? dossier.bedrag_incl_btw ?? null
  const finBtw                = (finUitEva ? T?.btw_bedrag ?? null : null)
    ?? (finTotaalIncl != null && finAanneemsom != null
        ? Math.round((finTotaalIncl - finAanneemsom) * 100) / 100
        : null)
  // BTW-splitsing per tarief hoort bij de bron van de aanneemsom: de live calculatie (per tarief)
  // wanneer die de som levert, anders de uit Bouw7 gesynchroniseerde splitsing.
  const finBtwSplitsing       = finUitEva
    ? (!quoteTotalen && calcTotalen?.btw_groepen?.length
        ? calcTotalen.btw_groepen.map(g => ({ label: `BTW ${g.pct}%`, percentage: g.pct, bedrag: g.btw }))
        : null)
    : (dossier.btw_splitsing?.length ? dossier.btw_splitsing : null)
  // Goedgekeurd meerwerk verandert de opdrachtwaarde. Excl. btw rechtstreeks bijtellen; voor incl. btw
  // het effectieve btw-tarief van dit dossier hergebruiken (incl/excl-verhouding), anders 21%.
  // Een negatief bedrag (per saldo minderwerk) telt net zo goed mee en verlaagt het contracttotaal.
  const heeftMeerwerk         = meerwerk !== 0
  const btwFactor             = (finTotaalIncl != null && finAanneemsom)
    ? finTotaalIncl / finAanneemsom
    : 1.21
  const finTotaalInclMeerwerk = heeftMeerwerk && finTotaalIncl != null
    ? Math.round((finTotaalIncl + meerwerk * btwFactor) * 100) / 100
    : finTotaalIncl

  // Opdracht-samenstelling: gekozen opties tellen mee in het contracttotaal (excl. eigen bewakingscode).
  const finGekozenOpties = opdrachtOverzicht?.gekozenOptiesTotaal ?? 0
  const [detailSoort, setDetailSoort] = React.useState<OpdrachtDetailSoort | null>(null)
  // Stelposten die BUITEN de aanneemsom vallen zijn extra omzet en moeten er bij op. Stelposten
  // ín de aanneemsom zijn carve-outs: die zitten al in finAanneemsom en mogen hier niet nog eens
  // meegeteld worden — dat zou dubbeltelling zijn.
  const finStelpostenApart = opdrachtOverzicht?.stelpostenApartTotaal ?? 0
  const finContractIncl = finTotaalInclMeerwerk != null
    ? Math.round((finTotaalInclMeerwerk + (finGekozenOpties + finStelpostenApart) * btwFactor) * 100) / 100
    : finTotaalInclMeerwerk
  const heeftContractExtra = heeftMeerwerk || finGekozenOpties > 0 || finStelpostenApart > 0
  // Itemized opbouw tonen zodra er iets in staat, én op een bewerkbaar opdracht-dossier met
  // aanneemsom (anders is er geen ingang om de eerste stelpost aan te wijzen).
  const heeftOpdrachtItems = !!opdrachtOverzicht
    && (opdrachtOverzicht.stelposten.length > 0 || opdrachtOverzicht.opties.length > 0
        || opdrachtOverzicht.meerwerken.length > 0)
  const toonOpdrachtOpbouw = heeftOpdrachtItems
    || (!!opdrachtOverzicht && opdrachtOverzicht.handmatigMogelijk && !readOnly)
  // De aggregaten uit de calculatie blijven staan zolang er niets itemized is én ze iets zeggen.
  const toonAggregaten = !heeftOpdrachtItems && (finStelposten > 0 || finOptioneel > 0)

  /* ─── opbouw van de opdracht als rekensom ────────────────────────────
     Alleen verkoopbedragen, van boven naar beneden optellend. De posten die
     meetellen zijn de aanneemsom + meerwerk + stelposten búiten de som + gekozen
     opties; stelposten ín de aanneemsom zijn een uitsplitsing en tellen dus niet
     nog eens mee. De btw-regels worden zo opgebouwd dat subtotaal + btw exact op
     het contracttotaal uitkomt — anders klopt de kolom zichtbaar niet. */
  const finSubtotaalExcl = finAanneemsom == null ? null
    : Math.round((finAanneemsom + (heeftMeerwerk ? meerwerk : 0) + finStelpostenApart + finGekozenOpties) * 100) / 100
  const btwTeVerdelen = (finContractIncl != null && finSubtotaalExcl != null)
    ? Math.round((finContractIncl - finSubtotaalExcl) * 100) / 100
    : null
  // De splitsing uit de calculatie/Bouw7 dekt alleen de aanneemsom. Wat er daarna bij is gekomen
  // (meerwerk, opties, aparte stelposten) krijgt een eigen restregel, zodat de optelling sluit.
  const btwUitSplitsing = finBtwSplitsing
    ? Math.round(finBtwSplitsing.reduce((s, t) => s + (Number(t.bedrag) || 0), 0) * 100) / 100
    : null
  const btwRest = (btwTeVerdelen != null && btwUitSplitsing != null)
    ? Math.round((btwTeVerdelen - btwUitSplitsing) * 100) / 100
    : null
  const [optiePending, startOptieTransition] = React.useTransition()
  function toggleOptie(id: string, aan: boolean) {
    startOptieTransition(async () => {
      const res = await zetOptieInOpdracht(id, aan)
      if (!res.ok) { toast.error(res.error); return }
      router.refresh()
    })
  }
  function wijsCodesToe() {
    startOptieTransition(async () => {
      const res = await wijsStelpostBewakingscodesToe(dossier.id)
      if (!res.ok) { toast.error(res.error); return }
      if (res.aantal > 0) toast.success(`${res.aantal} bewakingscode${res.aantal === 1 ? '' : 's'} toegewezen`)
      if (res.waarschuwing) toast.error(res.waarschuwing)
      router.refresh()
    })
  }
  function nieuweStelpost(invoer: {
    omschrijving: string; bedrag_excl_btw: number; in_aanneemsom: boolean
    begroot_excl_btw: number | null; grondslag: 'vast' | 'geboekte_kosten'
  }) {
    startOptieTransition(async () => {
      const res = await maakStelpost(dossier.id, invoer)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Stelpost aangewezen')
      router.refresh()
    })
  }
  function verwijderStelpostRegel(id: string) {
    startOptieTransition(async () => {
      const res = await verwijderStelpost(id)
      if (!res.ok) { toast.error(res.error); return }
      router.refresh()
    })
  }
  function verrekenStelpostRegel(id: string) {
    startOptieTransition(async () => {
      const res = await verrekenStelpost(id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(
        `${res.saldo > 0 ? 'Meerwerk' : 'Minderwerk'} van ${fmtBedrag(Math.abs(res.saldo))} aangemaakt — `
        + 'staat op Aangevraagd, dus loopt via klantakkoord.',
      )
      router.refresh()
    })
  }

  const medewerkersOpties  = medewerkers.map(m => ({ value: m.id, label: m.naam }))
  const werkmaatschappijOpties = werkmaatschappijen.map(w => ({ value: w.id, label: w.naam }))
  const werkmaatschappijNaam   = werkmaatschappijen.find(w => w.id === form.werkmaatschappij_id)?.naam ?? null
  const categorieOpties    = (categorieen?.length ? categorieen : DEFAULT_CATEGORIEEN).map(c => ({ value: c, label: c }))
  const factuuradresOpties = factuuradressen.map(fa => ({
    value: fa.id,
    label: `${fa.label}${fa.plaats ? ` — ${fa.plaats}` : ''}`,
  }))

  const inhoud = (
    <div className="px-8 py-7">

      {/* ── Pagina header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <span className=" text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">
              {dossier.dossiernummer}
            </span>
          </div>
          <h1 className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900">
            {dossier.titel}
          </h1>
          <div className="mt-2 flex items-center gap-2.5">
            {readOnly ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb,${statusKleur(substatus)} 12%,transparent)`,
                  color: statusKleur(substatus),
                  border: `1px solid color-mix(in srgb,${statusKleur(substatus)} 30%,transparent)`,
                }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusKleur(substatus) }} />
                {statusLabel(substatus)}
              </span>
            ) : (
            <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: `color-mix(in srgb,${statusKleur(substatus)} 12%,transparent)`,
                    color: statusKleur(substatus),
                    border: `1px solid color-mix(in srgb,${statusKleur(substatus)} 30%,transparent)`,
                  }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusKleur(substatus) }} />
                  {statusLabel(substatus)}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="ml-0.5">
                    <path d="M2 4l3 3 3-3" />
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[200px]">
                <PopoverBody>
                  {kiesbareStatussen.map(s => (
                    <PopoverItem
                      key={s.key}
                      active={s.key === substatus}
                      onClick={() => { zetSubstatus(s.key) }}
                    >
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: statusKleur(s.key) }} />
                      {s.label}
                      {s.key === substatus && (
                        <svg className="ml-auto text-brand-500" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </PopoverItem>
                  ))}
                </PopoverBody>
              </PopoverContent>
            </Popover>
            )}
            {dossier.klant_id && dossier.klant_naam ? (
              <Link
                href={`/relaties/${dossier.klant_id}`}
                title="Open de relatiegegevens"
                className="text-[12px] font-medium text-neutral-500 no-underline hover:text-brand-600 hover:underline"
              >
                {dossier.klant_naam}
              </Link>
            ) : (
              <span className="text-[12px] font-medium text-neutral-500">{dossier.klant_naam}</span>
            )}
          </div>
        </div>

        {/* Bevestiging vóór een afsluitende status: daarna is het dossier alleen-lezen. */}
        <AlertDialog
          open={afsluitBevestiging != null}
          onOpenChange={open => { if (!open) setAfsluitBevestiging(null) }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>
              Dossier op &ldquo;
              {beschikbareStatussen.find(s => s.key === afsluitBevestiging)?.label ?? afsluitBevestiging}
              &rdquo; zetten?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dit dossier wordt hiermee afgesloten en is daarna <strong>overal alleen-lezen</strong>;
              je kunt dit niet meer ongedaan maken in EVA. De status wordt ook naar Bouw7
              teruggeschreven.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const next = afsluitBevestiging
                  setAfsluitBevestiging(null)
                  if (next) await voerSubstatusUit(next)
                }}
              >
                Ja, afsluiten
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Gereedmelden met compleetheidscontrole. Staat buiten de knop-render: de statuskeuze
            hierboven opent dezelfde dialoog, ook vanuit een andere substatus. */}
        {sectie === 'opdracht' && !readOnly && (
          <FinancieelGereedDialog
            dossierId={dossier.id}
            dossierHref={`/opdrachten/${dossier.id}`}
            open={finDialoogOpen}
            onOpenChange={setFinDialoogOpen}
            onBevestigd={() => voerSubstatusUit('financieel_gereed')}
          />
        )}

        {/* Acties rechts */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {bouw7Url && (
            <>
              <Button variant="ghost" asChild>
                <a href={bouw7Url} target="_blank" rel="noopener noreferrer" title="Openen in Bouw7">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Open in Bouw7
                </a>
              </Button>
              <DossierVerversKnop dossierId={dossier.id} laatsteSync={dossier.bouw7_laatst_sync ?? null} />
              <div className="h-6 w-px shrink-0 bg-neutral-200" />
            </>
          )}
          {sectie === 'opdracht' && substatus === 'uitvoering_gereed' && !readOnly && (
            <>
              <Button variant="ghost" onClick={() => setFinDialoogOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                Financieel gereed melden
              </Button>
              <div className="h-6 w-px shrink-0 bg-neutral-200" />
            </>
          )}
          {editMode ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={opslaan}>Opslaan</Button>
              <Button variant="ghost" onClick={annuleer}>Annuleer</Button>
            </div>
          ) : !readOnly ? (
            <Button variant="primary" onClick={() => setEditMode(true)}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17l-4 1 1-4L14.5 2.5z" />
              </svg>
              Bewerken
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Actie-indicatoren projectleider (bewaking-vlaggen uit Bouw7-sync) ── */}
      {(sectie === 'opdracht' || sectie === 'servicedesk')
        && (dossier.bouw7_uren_overschrijding || dossier.bouw7_bestelregels_afwijking || dossier.wb_ongeaccordeerde_wijzigingen) && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 8,
          background: 'var(--warning-50, #fff7ed)', border: '1px solid var(--warning-200, #fed7aa)',
          color: 'var(--warning-800, #9a3412)', fontSize: 13,
        }}>
          <strong>⚠ Actie projectleider</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
            {dossier.wb_ongeaccordeerde_wijzigingen && (
              <li><strong>WB!</strong> — de werkbegroting bevat niet-geaccordeerde wijzigingen. Laat de werkbegroting opnieuw accorderen voordat je bestelt of de prognose verstuurt.</li>
            )}
            {dossier.bouw7_bestelregels_afwijking && (
              <li>Bestelregels sluiten niet aan op de prognose — laat de werkbegroting goedkeuren of werk de bestelregels bij.</li>
            )}
            {dossier.bouw7_uren_overschrijding && (
              <li>Een arbeid-bewakingscode overschrijdt op 100% de prognose-uren — controleer de urenraming.</li>
            )}
          </ul>
        </div>
      )}

      {/* ── Werkadres verplicht bij Opdracht/Servicedesk ── */}
      {(sectie === 'opdracht' || sectie === 'servicedesk') && werkadresNietConcreet && (
        <div style={{
          marginBottom: 14, padding: '12px 16px', borderRadius: 8,
          background: 'var(--warning-50, #fff7ed)', border: '1px solid var(--warning-200, #fed7aa)',
          color: 'var(--warning-800, #9a3412)', fontSize: 13,
        }}>
          <strong>⚠ Concreet werkadres vereist</strong>
          <div style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
            Vul voor dit {sectie === 'servicedesk' ? 'servicedesk-' : 'opdracht'}dossier een concreet
            werkadres in (straat + huisnummer, postcode en plaats). Dit adres komt terug op de
            planning en de werkbon, en is waar de monteur naartoe rijdt; met een leeg adres of een
            aanduiding als “Diverse adressen” kan hij niets.
            {bouw7Vergrendeld && bouw7Url && (
              <> Dit dossier komt uit Bouw7 — pas het werkadres aan in{' '}
                <a href={bouw7Url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Bouw7</a>.
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Kaarten grid ── */}
      <div className="grid grid-cols-2 gap-3.5">

        {/* Servicedesk-paneel: mandaat, facturatiemethode, doorlooptijd, offerte-acties */}
        {sectie === 'servicedesk' && (
          <ServicedeskInfoPaneel
            dossierId={dossier.id}
            titel={dossier.titel}
            createdAt={dossier.bouw7_aanmaakdatum ?? dossier.created_at ?? null}
            initieelMandaat={dossier.mandaat_bedrag ?? null}
            initieleFacturatiemethode={(dossier.facturatiemethode as 'regie' | 'termijnen') ?? 'regie'}
            heeftCalculatie={!!dossier.everts_calc_project_id || projectId != null}
          />
        )}

        {/* Projectinformatie */}
        <Card>
          <CardHeader>Projectinformatie</CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <InfoVeld label="Dossiernummer"  waarde={dossier.dossiernummer} mono />
              <InfoVeld
                label="Opdrachtgever"
                waarde={dossier.klant_naam}
                href={dossier.klant_id ? `/relaties/${dossier.klant_id}` : null}
                hrefTitel="Open de relatiegegevens"
              />
              <InfoVeld label="Projectnaam"    waarde={dossier.titel} />
              <InfoVeld label="Fase"           waarde={statusLabel(substatus)} />
              <InfoVeld label="Categorie (Bouw7)" waarde={(dossier as any).bouw7_categorie_naam ?? null} />
              <InfoVeld label="Categorie" waarde={form.categorie || null} />
              <InfoVeld label="Referentie" waarde={form.referentie || null} />
              <InfoVeld label="VvE-code" waarde={form.vve_code || null} />
              <InfoVeld label="Werkmaatschappij" waarde={werkmaatschappijNaam} />
              {sectie === 'opdracht' && (
                <InfoVeld label="Opdracht referentie" waarde={form.opdracht_referentie || null} />
              )}
            </div>

            <DatumLijst regels={datumRegels} deadlineUrgent={deadlineUrgent} />

            {editMode && (
              <div className="mt-4">
                {bouw7Vergrendeld && (
                  <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-[11px] leading-snug text-neutral-500">
                    Overige velden uit Bouw7 zijn alleen-lezen en worden in Bouw7 beheerd. Rollen worden
                    bij opslaan direct in Bouw7 bijgewerkt; EVA-eigen velden (referenties, datums,
                    werkadres-contact, interne opmerkingen) blijven bewerkbaar.
                  </p>
                )}
                <FormSection title="Identificatie">
                  <FormRow cols="2">
                    <FormField upper label="Fase">
                      <DsSelect
                        value={substatus}
                        onChange={v => setSubstatus(v)}
                        options={kiesbareStatussen.map(s => ({ value: s.key, label: s.label }))}
                        placeholder="Selecteer fase"
                      />
                    </FormField>
                    {bouw7Vergrendeld
                      ? <InfoVeld label="Categorie" waarde={form.categorie || null} />
                      : (
                        <FormField upper label="Categorie">
                          <DsSelect value={form.categorie} onChange={set('categorie')} options={categorieOpties} placeholder="bijv. Schilderwerk" />
                        </FormField>
                      )}
                    {bouw7Vergrendeld
                      ? <InfoVeld label="Referentie" waarde={form.referentie || null} />
                      : (
                        <FormField upper label="Referentie">
                          <Input value={form.referentie} onChange={e => set('referentie')(e.target.value)} placeholder="kenmerk van opdrachtgever" />
                        </FormField>
                      )}
                    <FormField upper label="Werkmaatschappij">
                      <DsSelect
                        value={form.werkmaatschappij_id}
                        onChange={set('werkmaatschappij_id')}
                        options={werkmaatschappijOpties}
                        placeholder="— Kies werkmaatschappij —"
                      />
                    </FormField>
                    <FormField upper label="VvE-code">
                      <Input value={form.vve_code} onChange={e => set('vve_code')(e.target.value)} placeholder="bijv. VVE-1234" />
                    </FormField>
                    {sectie === 'opdracht' && (
                      <FormField upper label="Opdracht referentie">
                        <Input value={form.opdracht_referentie} onChange={e => set('opdracht_referentie')(e.target.value)} placeholder="Referentie opdrachtgever" />
                      </FormField>
                    )}
                  </FormRow>
                </FormSection>

                <FormSection title="Datums">
                  <p className="mb-3 text-[11px] leading-snug text-neutral-500">
                    De overige datums houdt EVA zelf bij: de offertedatum volgt uit het verzenden
                    van de offerte, start- en einddatum uit de planning, de opleverdatum uit de
                    oplevering, en opdracht- en financieel-gereed-datum uit de fasewissel.
                  </p>
                  <FormRow cols="2">
                    <FormField upper label="Aanvraagdatum">
                      <DatePicker
                        value={form.aanvraagdatum ? new Date(form.aanvraagdatum) : undefined}
                        onChange={d => set('aanvraagdatum')(datumNaarISO(d))}
                      />
                    </FormField>
                    <FormField upper label="Deadline">
                      <DatePicker
                        value={form.deadline ? new Date(form.deadline) : undefined}
                        onChange={d => set('deadline')(datumNaarISO(d))}
                      />
                    </FormField>
                  </FormRow>
                </FormSection>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Rechterkolom: Taken + Notities. De cel stretcht naar de hoogte van Projectinformatie;
            het Notities-blok vult met flex-1 de resterende ruimte (interne scroll). */}
        <div className="flex flex-col gap-3.5">
          <TakenBlok dossierId={dossier.id} dossierTitel={dossier.titel} sectie={sectie} sjablonen={sjablonen} urgenteTaken={urgenteTaken} />
          <DossierNotitiesBlok
            dossierId={dossier.id}
            notities={notities}
            currentMedewerkerId={currentMedewerkerId}
            className="min-h-[220px] flex-1"
          />
        </div>

        {/* Rollen — eigen blok. Bewerkbaar (ook voor Bouw7-dossiers): rollen worden bij opslaan
            direct naar Bouw7 teruggeschreven. Calculator ≡ Bouw7 "Werkvoorbereider" (workPlanner),
            Controller → custom attribute "Eindverantwoordelijke offerte". */}
        <Card>
          <CardHeader>Rollen</CardHeader>
          <CardBody>
            {editMode ? (
              <FormRow cols="2">
                <FormField upper label="Projectleider">
                  <RolSelect value={form.projectleider_id} onChange={set('projectleider_id')} options={medewerkersOpties} placeholder="Selecteer projectleider" />
                </FormField>
                <FormField upper label="Calculator">
                  <RolSelect value={form.calculator_id} onChange={set('calculator_id')} options={medewerkersOpties} placeholder="Selecteer calculator" />
                </FormField>
                <FormField upper label="Uitvoerder">
                  <RolSelect value={form.uitvoerder_id} onChange={set('uitvoerder_id')} options={medewerkersOpties} placeholder="Selecteer uitvoerder" />
                </FormField>
                <FormField upper label="Teamleider">
                  <RolSelect value={form.teamleider_id} onChange={set('teamleider_id')} options={medewerkersOpties} placeholder="Selecteer teamleider" />
                </FormField>
                <FormField upper label="Controller">
                  <RolSelect value={form.controller_id} onChange={set('controller_id')} options={medewerkersOpties} placeholder="Selecteer controller" />
                </FormField>
              </FormRow>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <InfoVeld label="Projectleider" waarde={dossier.projectleider_naam} />
                <InfoVeld label="Calculator"    waarde={dossier.calculator_naam} />
                <InfoVeld label="Uitvoerder"    waarde={dossier.uitvoerder_naam} />
                <InfoVeld label="Teamleider"    waarde={dossier.teamleider_naam} />
                <InfoVeld label="Controller"    waarde={dossier.controller_naam} />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Werkadres — eigen blok, alle velden zichtbaar. */}
        <Card>
          <CardHeader>Werkadres</CardHeader>
          <CardBody>
            {/* Objectkoppeling (VvE/complex). Vult zichzelf; staat los van het formulier omdat
                koppelen meteen wegschrijft en niet op "Opslaan" hoort te wachten. */}
            <div className="mb-4 border-b border-[var(--border)] pb-3">
              <ObjectKoppeling dossierId={dossier.id} readOnly={readOnly} />
            </div>
            {editMode ? (
              <FormRow cols="2">
                <FormField upper label="Naam" className="col-span-2">
                  <Input value={form.werkadres_naam} onChange={e => set('werkadres_naam')(e.target.value)} />
                </FormField>
                <FormField upper label="Telefoon">
                  <Input value={form.werkadres_telefoon} onChange={e => set('werkadres_telefoon')(e.target.value)} />
                </FormField>
                <FormField upper label="E-mail">
                  <Input type="email" value={form.werkadres_email} onChange={e => set('werkadres_email')(e.target.value)} />
                </FormField>
                {bouw7Vergrendeld ? (
                  <>
                    <div className="col-span-2"><InfoVeld label="Straat + nummer" waarde={form.werkadres_straat || null} /></div>
                    <InfoVeld label="Postcode" waarde={form.werkadres_postcode || null} />
                    <InfoVeld label="Stad"     waarde={form.werkadres_stad     || null} />
                  </>
                ) : (
                  <>
                    <FormField upper label="Straat + nummer" className="col-span-2">
                      <Input value={form.werkadres_straat} onChange={e => set('werkadres_straat')(e.target.value)} />
                    </FormField>
                    <FormField upper label="Postcode">
                      <Input value={form.werkadres_postcode} onChange={e => set('werkadres_postcode')(e.target.value)} />
                    </FormField>
                    <FormField upper label="Stad">
                      <Input value={form.werkadres_stad} onChange={e => set('werkadres_stad')(e.target.value)} />
                    </FormField>
                  </>
                )}
              </FormRow>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <div className="col-span-2"><InfoVeld label="Naam" waarde={form.werkadres_naam || null} /></div>
                <InfoVeld label="Telefoon" waarde={form.werkadres_telefoon || null} mono />
                <InfoVeld label="E-mail"   waarde={form.werkadres_email    || null} />
                <div className="col-span-2"><InfoVeld label="Straat + nummer" waarde={form.werkadres_straat || null} /></div>
                <InfoVeld label="Postcode" waarde={form.werkadres_postcode || null} />
                <InfoVeld label="Stad"     waarde={form.werkadres_stad     || null} />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Opdrachtgever */}
        <Card>
          <CardHeader>Opdrachtgever</CardHeader>
          <CardBody className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {relatie ? (
                <>
                  <div className="col-span-2">
                    <InfoVeld
                      label="Naam"
                      waarde={relatie.naam}
                      href={`/relaties/${relatie.id}`}
                      hrefTitel="Open de relatiegegevens"
                    />
                  </div>
                  <InfoVeld label="KvK nummer" waarde={relatie.kvk_nummer} />
                  <InfoVeld label="BTW nummer" waarde={relatie.btw_nummer} />
                  <InfoVeld label="Telefoon"   waarde={relatie.telefoon} />
                  <InfoVeld label="E-mail"     waarde={relatie.email} />
                  {(relatie.adres_straat || relatie.adres_postcode || relatie.adres_plaats) && (
                    <div className="col-span-2">
                      <InfoVeld
                        label="Adres"
                        waarde={[
                          relatie.adres_straat,
                          [relatie.adres_postcode, relatie.adres_plaats].filter(Boolean).join('  '),
                        ].filter(Boolean).join(', ')}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="col-span-2"><InfoVeld label="Naam" waarde={dossier.klant_naam} /></div>
              )}
            </div>

            <Separator />
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Contactpersoon
            </p>
            {editMode && !bouw7Vergrendeld ? (
              <FormField upper label="Contactpersoon">
                <DsSelect
                  value={form.contactpersoon_id}
                  onChange={set('contactpersoon_id')}
                  options={contactpersoonOpties.map(cp => ({ value: cp.id, label: cp.naam }))}
                  placeholder="Selecteer contactpersoon"
                />
              </FormField>
            ) : (() => {
              const geselecteerd = contactpersoonOpties.find(cp => cp.id === form.contactpersoon_id)
              const naam     = geselecteerd?.naam     ?? (dossier as any).contactpersoon_naam     ?? null
              const telefoon = geselecteerd?.telefoon ?? (dossier as any).contactpersoon_telefoon ?? null
              const email    = geselecteerd?.email    ?? (dossier as any).contactpersoon_email    ?? null
              return (
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <InfoVeld
                    label="Naam"
                    waarde={naam}
                    href={form.contactpersoon_id ? `/relaties/contactpersonen/${form.contactpersoon_id}` : null}
                    hrefTitel="Open de contactpersoongegevens"
                  />
                  <InfoVeld label="Telefoon" waarde={telefoon} mono />
                  <div className="col-span-2">
                    <InfoVeld label="E-mail" waarde={email} />
                  </div>
                </div>
              )
            })()}

            <Separator />
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Afwijkend factuuradres
            </p>
            {editMode ? (
              <FormField upper label="Factuuradres">
                <DsSelect
                  value={form.factuuradres_id}
                  onChange={set('factuuradres_id')}
                  options={factuuradresOpties}
                  placeholder="Zelfde als werkadres"
                />
              </FormField>
            ) : (
              <div>
                <InfoVeld
                  label="Factuuradres"
                  waarde={geselecteerdFa
                    ? `${geselecteerdFa.label}${geselecteerdFa.plaats ? ` — ${geselecteerdFa.plaats}` : ''}`
                    : null}
                />
                {geselecteerdFa && (
                  <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-neutral-500">
                    {[
                      geselecteerdFa.straat,
                      [geselecteerdFa.postcode, geselecteerdFa.plaats].filter(Boolean).join('  '),
                      geselecteerdFa.land !== 'Nederland' ? geselecteerdFa.land : null,
                    ].filter(Boolean).join('\n')}
                  </p>
                )}
                {!geselecteerdFa && factuuradressen.length === 0 && (
                  <p className="mt-1 text-[12px] italic text-neutral-400">
                    Geen factuuradressen beschikbaar.{' '}
                    {dossier.klant_naam
                      ? <Link href="/relaties" className="text-brand-600 no-underline">Voeg toe in Relatiebeheer</Link>
                      : 'Voeg toe via Relatiebeheer'
                    }.
                  </p>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Dossier-toggles */}
        <DossierTogglesPaneel dossierId={dossier.id} />

        {/* Financiële totalen — niet voor servicedesk (regie/termijnen leeft op het Financieel-tab) */}
        {sectie !== 'servicedesk' && (
        <Card>
          <CardHeader>Financiële totalen</CardHeader>
          <CardBody>
            {/* Opbouw van de opdracht — alleen verkoopbedragen, van boven naar beneden optellend.
                Klikken op stelposten/meerwerk/opties opent de specificatie in een venster. */}
            <div>
              <RekenRegel
                label="Aanneemsom excl. BTW"
                bedrag={finAanneemsom != null ? fmtBedrag(finAanneemsom) : '—'}
              />
              {toonOpdrachtOpbouw && opdrachtOverzicht && (
                <RekenRegel
                  soort="waarvan"
                  label="waarvan stelposten"
                  aantal={opdrachtOverzicht.stelposten.filter(sp => sp.in_aanneemsom).length}
                  bedrag={fmtBedrag(opdrachtOverzicht.stelpostenInAanneemsomTotaal)}
                  onClick={() => setDetailSoort('stelposten')}
                  titel="Deel van de aanneemsom dat als stelpost is aangewezen — klik voor de specificatie."
                />
              )}
              {finStelpostenApart > 0 && (
                <RekenRegel
                  label="Stelposten buiten de aanneemsom"
                  bedrag={fmtBedrag(finStelpostenApart)}
                  onClick={() => setDetailSoort('stelposten')}
                  titel="Apart te factureren stelposten — tellen bij het contracttotaal op."
                />
              )}
              {heeftMeerwerk && (
                <RekenRegel
                  label={meerwerk < 0 ? 'Goedgekeurd minderwerk' : 'Goedgekeurd meerwerk'}
                  aantal={opdrachtOverzicht?.meerwerken.length}
                  bedrag={fmtBedrag(meerwerk)}
                  bedragKleur={meerwerk < 0 ? '#009439' : undefined}
                  onClick={opdrachtOverzicht ? () => setDetailSoort('meerwerk') : undefined}
                  titel={meerwerk < 0 ? 'Per saldo minderwerk — verlaagt het contracttotaal.' : undefined}
                />
              )}
              {finGekozenOpties > 0 && (
                <RekenRegel
                  label="Gekozen opties"
                  bedrag={fmtBedrag(finGekozenOpties)}
                  onClick={opdrachtOverzicht ? () => setDetailSoort('opties') : undefined}
                />
              )}
              {toonAggregaten && (
                <>
                  <RekenRegel soort="waarvan" label="waarvan stelposten (calculatie)" bedrag={fmtBedrag(finStelposten)} />
                  <RekenRegel soort="waarvan" label="optioneel (calculatie)"          bedrag={fmtBedrag(finOptioneel)} />
                </>
              )}

              <RekenRegel
                soort="subtotaal"
                label="Subtotaal excl. BTW"
                bedrag={finSubtotaalExcl != null ? fmtBedrag(finSubtotaalExcl) : '—'}
              />

              {finBtwSplitsing ? (
                <>
                  {finBtwSplitsing.map(t => (
                    <RekenRegel
                      key={t.label}
                      soort="btw"
                      label={t.percentage > 0
                        ? `BTW ${t.percentage}%`
                        : t.label.toLowerCase().includes('verlegd') ? 'BTW verlegd' : 'BTW 0%'}
                      bedrag={fmtBedrag(t.bedrag)}
                    />
                  ))}
                  {btwRest != null && Math.abs(btwRest) >= 0.01 && (
                    <RekenRegel
                      soort="btw"
                      label="BTW over meerwerk en opties"
                      bedrag={fmtBedrag(btwRest)}
                      titel="De btw-splitsing uit de calculatie dekt alleen de aanneemsom; dit is de btw over wat er daarna bij is gekomen."
                    />
                  )}
                </>
              ) : (
                <RekenRegel
                  soort="btw"
                  label="BTW"
                  bedrag={(btwTeVerdelen ?? finBtw) != null ? fmtBedrag((btwTeVerdelen ?? finBtw) as number) : '—'}
                />
              )}

              <RekenRegel
                soort="eind"
                label={heeftContractExtra ? 'Contracttotaal incl. BTW' : 'Totaal incl. BTW'}
                bedrag={finContractIncl != null ? fmtBedrag(finContractIncl) : '—'}
              />
            </div>

            {/* Er hangt een EVA-offerte aan dit dossier die de aanneemsom niet levert en er
                materieel van afwijkt. Stil laten liggen zou de eigenlijke vraag verbergen —
                waarom staat hier een offerte van een heel ander bedrag dan de opdracht? */}
            {aanneemsomKeuze.afwijkendeEvaOfferte != null && (
              <div
                className="mt-3 rounded-md px-2 py-1.5 text-[11px]"
                style={{ background: 'var(--warning-50, #fff7ed)', color: 'var(--warning-800, #9a3412)' }}
              >
                De EVA-offerte bij dit dossier is {fmtBedrag(aanneemsomKeuze.afwijkendeEvaOfferte)} en wijkt af van de
                aanneemsom hierboven. De aanneemsom komt uit Bouw7 — dat is het bedrag dat gefactureerd wordt.
                Controleer of de offerte bij deze opdracht hoort.
              </div>
            )}

            {toonOpdrachtOpbouw && opdrachtOverzicht && (
              <>
                <Link
                  href={`/opdrachten/${dossier.id}/bestanden`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 no-underline"
                  title="Naar Bestanden → Document opstellen → Opdrachtbevestiging"
                >
                  Opdrachtbevestiging opstellen
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 5l5 5-5 5" /></svg>
                </Link>
                <OpdrachtDetailDialog
                  soort={detailSoort}
                  onClose={() => setDetailSoort(null)}
                  overzicht={opdrachtOverzicht}
                  readOnly={readOnly}
                  onToggleOptie={toggleOptie}
                  onWijsCodes={wijsCodesToe}
                  onNieuweStelpost={nieuweStelpost}
                  onVerwijderStelpost={verwijderStelpostRegel}
                  onVerreken={verrekenStelpostRegel}
                  pending={optiePending}
                />
              </>
            )}
            <Separator className="my-3" />
            {editMode ? (
              <FormRow cols="2">
                <FormField upper label="Betalingstermijn">
                  <Input value={form.betalingstermijn} onChange={e => set('betalingstermijn')(e.target.value)} placeholder="bijv. 30 dagen" />
                </FormField>
                <FormField upper label="Factuurreferentie">
                  <Input value={form.factuurreferentie} onChange={e => set('factuurreferentie')(e.target.value)} />
                </FormField>
              </FormRow>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <InfoVeld label="Betalingstermijn"  waarde={form.betalingstermijn  || null} />
                <InfoVeld label="Factuurreferentie" waarde={form.factuurreferentie || null} />
              </div>
            )}
          </CardBody>
        </Card>
        )}

        {/* Calculatie importeren (.c4y) — niet voor servicedesk, niet bij alleen-lezen */}
        {sectie !== 'servicedesk' && !readOnly && (
        <div className="col-span-2">
          <C4yDropCard
            dossierId={dossier.id}
            sectie={sectie}
            naam={dossier.titel}
            nummer={dossier.dossiernummer ?? ''}
            projectId={projectId}
            onImported={pid => { setProjectId(pid); setImportTick(t => t + 1) }}
          />
        </div>
        )}

      </div>
    </div>
  )

  if (sectie === 'offerte') {
    return (
      <div style={{ display: 'flex', height: 'calc(100dvh - 56px)', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>{inhoud}</div>
        <div style={{ width: 460, flexShrink: 0 }}>
          <OffertePaneel dossierId={dossier.id} />
        </div>
      </div>
    )
  }

  return inhoud
}
