'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calculator, FileText } from 'lucide-react'
import { cn } from '@everts/ui'
import {
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN,
  getDossierSubstatus, isBouw7Substatus,
  type DossierSectie, type DossierRij,
} from '../types'
import { updateDossierSubstatus, updateDossierRollen, updateDossierInfo, getContactpersonenVoorRelatie } from '@/lib/dossiers/actions'
import { getQuoteTotalenVoorProject } from '@/app/(platform)/everts-calc/actions/quotes'
import CalculatieInstellingenKaarten from '@/components/everts-calc/calculatie/CalculatieInstellingenKaarten'
import C4yDropCard from '@/components/everts-calc/calculatie/C4yDropCard'
import {
  getScenarios, getGroepen,
  getCalculatieregelsVoorScenario, getComponentregelsVoorScenario,
} from '@/lib/everts-calc/local-store'
import {
  berekenScenarioVP, berekenScenarioKostprijs, berekenBtwBreakdown, berekenCalculatieregel,
} from '@/lib/everts-calc/calculations'
import type { Groep } from '@/lib/everts-calc/types'
import OfferteAanmakenModal from '@/components/everts-calc/quotes/OfferteAanmakenModal'
import ActiveerSjabloonDialog from '../ActiveerSjabloonDialog'
import DossierTogglesPaneel from '../DossierTogglesPaneel'
import { DossierVerversKnop } from '../DossierVerversKnop'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import type { Relatie, RelatieFactuuradres } from '@everts/database'
import type { DbTaskList, TaakMetDetails, TaskStatus, TaskPrioriteit } from '@/lib/taken/supabase/database.types'
import type { UrgenteTaak } from '@/lib/taken/supabase/database.types'
import TaakDetailPanel from '@/components/taken/TaakDetailPanel'
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { Combobox } from '@/components/ui/combobox'
import {
  Button, Card, CardHeader, CardBody,
  Input, Textarea,
  FormField, FormRow, FormSection,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  DatePicker,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, PopoverItem,
  Separator,
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui'

/* ─── helpers ─────────────────────────────────────────────────────── */
const alleStatussen = [...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN]
const statusLabel = (s: string) => alleStatussen.find(x => x.key === s)?.label ?? s
const statusKleur = (s: string) =>
  ['verloren', 'vervallen', 'afgewezen'].includes(s) ? '#d9534f' :
  ['gewonnen', 'offerte_gereed', 'financieel_afgesloten'].includes(s) ? '#009439' :
  ['verzonden', 'nabellen', 'in_behandeling', 'mondelinge_toezegging', 'onderhanden', 'uitvoering_gereed'].includes(s) ? 'var(--accent)' :
  'var(--fg-muted)'

const fmtBedrag = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)
const fmtDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

/* ─── client-side calculatietotalen ───────────────────────────────────
   Fallback voor de Financiële-totalen kaart zolang er nog geen offerte in
   Supabase is gegenereerd: bereken verkoop/BTW direct uit de calculatie
   (localStorage) — bijv. meteen na een .c4y-import. */
type CalcTotalen = {
  subtotaal_ex_btw: number
  kostprijs: number
  stelposten_subtotaal: number
  opties_subtotaal: number
  btw_bedrag: number
  totaal_incl_btw: number
  marge_euro: number
  marge_pct: number
  btw_groepen: { pct: number; btw: number }[]
}

function berekenCalcTotalenVoorProject(projectId: string): CalcTotalen | null {
  const scenarios = getScenarios(projectId)
  const scenario = scenarios.find(s => s.is_standaard) ?? scenarios[0]
  if (!scenario) return null

  const groepen = getGroepen(scenario.id)
  const regels = getCalculatieregelsVoorScenario(scenario.id)
  if (regels.length === 0) return null
  const componenten = getComponentregelsVoorScenario(scenario.id)

  // Optionele groepen (en hun nakomelingen) uitsluiten — zoals in CalculatieGrid.
  const optioneelIds = new Set(
    groepen.filter(g => {
      let cur: Groep | undefined = g
      while (cur) {
        if (cur.optioneel) return true
        cur = groepen.find(p => p.id === cur!.parent_id)
      }
      return false
    }).map(g => g.id),
  )
  const nietOptioneel = groepen.filter(g => !optioneelIds.has(g.id))
  const nietOptioneelIds = new Set(nietOptioneel.map(g => g.id))

  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico
  const btwDefault = scenario.btw_pct_default ?? 21

  const subtotaal_ex_btw = berekenScenarioVP(nietOptioneel, regels, componenten, defaultOpslag)
  const kostprijs = berekenScenarioKostprijs(nietOptioneel, regels, componenten)
  const btwGroepen = berekenBtwBreakdown(
    regels.filter(r => nietOptioneelIds.has(r.groep_id)), componenten, defaultOpslag, btwDefault,
  )
  const btw_bedrag = btwGroepen.reduce((s, g) => s + g.btw, 0)

  const vpVan = (r: (typeof regels)[number]) =>
    berekenCalculatieregel(r, componenten, r.opslag_pct ?? defaultOpslag).vp_totaal
  const stelposten_subtotaal = regels
    .filter(r => nietOptioneelIds.has(r.groep_id) && r.is_stelpost)
    .reduce((s, r) => s + vpVan(r), 0)
  const opties_subtotaal = regels
    .filter(r => optioneelIds.has(r.groep_id))
    .reduce((s, r) => s + vpVan(r), 0)

  const marge_euro = subtotaal_ex_btw - kostprijs
  const marge_pct = subtotaal_ex_btw > 0 ? (marge_euro / subtotaal_ex_btw) * 100 : 0

  return {
    subtotaal_ex_btw, kostprijs, stelposten_subtotaal, opties_subtotaal,
    btw_bedrag, totaal_incl_btw: subtotaal_ex_btw + btw_bedrag,
    marge_euro, marge_pct,
    btw_groepen: btwGroepen.map(g => ({ pct: g.pct, btw: g.btw })),
  }
}

/* ─── form state ──────────────────────────────────────────────────── */
type FormValues = {
  calculator_id: string
  uiterlijkeIndiendatum: string
  categorie: string
  referentie: string
  opmerkingen: string
  interne_opmerkingen: string
  contactpersoon_id: string
  verwacht_startdatum: string
  verwacht_einddatum: string
  werkadres_naam: string
  werkadres_telefoon: string
  werkadres_email: string
  werkadres_straat: string
  werkadres_postcode: string
  werkadres_stad: string
  betalingstermijn: string
  factuurreferentie: string
  datum_offerte_verzonden: string
  opdrachtdatum: string
  aanneemsom: string
  projectleider_id: string
  teamleider_id: string
  werkvoorbereider_id: string
  uitvoerder_id: string
  controller_id: string
  opdracht_referentie: string
  factuuradres_id: string
}

const DEFAULT_CATEGORIEEN = ['Schilderwerk', 'Houtrotherstel', 'Stukadoorwerk', 'Gevelrenovatie', 'Binnenwerk', 'Overig']

/* ─── read-only veld ──────────────────────────────────────────────── */
function InfoVeld({
  label, waarde, mono, numeric, urgentie,
}: {
  label: string
  waarde?: string | null
  mono?: boolean
  numeric?: boolean
  urgentie?: boolean
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
        {heeftWaarde ? waarde : '—'}
      </div>
    </div>
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
    parent_task_id:          null,
    geschatte_uren:          null,
    volgorde:                0,
    aangemaakt_door:         null,
    assignee_type:           'direct',
    dossier_rollen:          [],
    max_doorlooptijd_dagen:  null,
    deadline_offset_dagen:   null,
    blocked_by_task_id:      null,
    formulier_template_id:   null,
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
      } catch {
        // optimistisch — bij fout terugdraaien
        setAfgevinkt(prev => { const n = new Set(prev); n.delete(id); return n })
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <span>Taken · {openTaken.length} open</span>
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
                  Nieuwe taak
                </button>
              }
            />
          </div>
        </CardHeader>
        <CardBody className="py-3">
          {openTaken.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
              <span className="text-[22px] opacity-35">☑</span>
              <span className="text-xs font-medium text-neutral-500">Geen openstaande taken</span>
              {sjablonen.length > 0 && (
                <span className="text-[11px] text-neutral-400">Activeer een sjabloon om taken aan te maken</span>
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
                    onClick={() => vinkAf(t.id)}
                    title="Taak afvinken"
                    className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-neutral-300 bg-transparent text-white outline-none transition-colors hover:border-brand-500 hover:bg-brand-50"
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
                Alle taken →
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

/* ─── offerte preview ─────────────────────────────────────────────── */
const A4_W = 794
const A4_H = 1123

type Versie = { nr: number; datum: string; status: 'verzonden' | 'concept' }

function OffertePreview({ dossier }: { dossier: DossierRij }) {
  const containerRef              = React.useRef<HTMLDivElement>(null)
  const [scale, setScale]         = React.useState(1)
  const [versies, setVersies]     = React.useState<Versie[]>([{ nr: 1, datum: dossier.created_at, status: 'verzonden' }])
  const [actief, setActief]       = React.useState(0)
  const huidig = versies[actief]

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const bereken = () => {
      const { width, height } = el.getBoundingClientRect()
      const pad = 24
      setScale(Math.min((width - pad * 2) / A4_W, (height - pad * 2) / A4_H))
    }
    bereken()
    const ro = new ResizeObserver(bereken)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scaledW = Math.round(A4_W * scale)
  const scaledH = Math.round(A4_H * scale)

  const bedrag      = dossier.bedrag_excl_btw ?? 0
  const arbeid      = Math.round(bedrag * 0.58)
  const materiaal   = Math.round(bedrag * 0.28)
  const onderaannem = Math.round(bedrag * 0.10)
  const overig      = bedrag - arbeid - materiaal - onderaannem
  const btw         = Math.round(bedrag * 0.21)
  const inclBtw     = bedrag + btw

  function kopieer() {
    const nieuw: Versie = { nr: versies.length + 1, datum: new Date().toISOString().slice(0, 10), status: 'concept' }
    setVersies(p => [...p, nieuw])
    setActief(versies.length)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>Verstuurde offerte</span>
          {versies.length > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {versies.map((v, i) => (
                <button key={i} onClick={() => setActief(i)} style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  border: i === actief ? 'none' : '1px solid var(--border)',
                  background: i === actief ? 'var(--accent)' : 'transparent',
                  color: i === actief ? 'white' : 'var(--fg-muted)',
                }}>v{v.nr}{v.status === 'concept' ? ' ✎' : ''}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={kopieer} style={{
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: 'var(--bg-active)', border: '1px solid var(--border)', color: 'var(--fg)', whiteSpace: 'nowrap',
        }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="10" height="12" rx="1.5" /><path d="M4 14V4h10" />
          </svg>
          Kopiëren naar nieuwe versie
        </button>
      </div>

      {huidig.status === 'concept' && (
        <div style={{ padding: '7px 16px', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>
          ✎ Concept — nog niet verzonden
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: '#ddd8cc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: scaledW, height: scaledH, position: 'relative', flexShrink: 0 }}>
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: A4_W, height: A4_H,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            background: 'white', boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
            padding: '56px 60px', fontFamily: 'var(--font-ui)', fontSize: 12,
            color: '#1a1a1a', lineHeight: 1.5, boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.06em', color: '#009439' }}>EVERTS.</div>
                <div style={{ fontSize: 10, color: '#777', marginTop: 4, lineHeight: 1.7 }}>
                  Everts Groep BV<br />Enschede · info@everts.nl<br />KVK 12345678 · BTW NL000000000B01
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em', color: '#333' }}>OFFERTE</div>
                <div style={{ fontSize: 10, color: '#777', marginTop: 6, lineHeight: 1.8 }}>
                  Referentie: {dossier.dossiernummer}<br />Versie: {huidig.nr}<br />Datum: {fmtDatum(huidig.datum)}
                  {huidig.status === 'concept' && <><br /><span style={{ color: '#e67e22', fontWeight: 700 }}>CONCEPT</span></>}
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: '#009439', marginBottom: 28 }} />
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{dossier.klant_naam}</div>
              <div style={{ color: '#555', lineHeight: 1.7, marginTop: 2 }}>t.a.v. contactpersoon<br />Straat 1<br />1234 AB Stad</div>
            </div>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Betreft: <span style={{ fontWeight: 400 }}>{dossier.titel}</span></div>
            <div style={{ marginBottom: 28, color: '#444', fontSize: 11 }}>Naar aanleiding van uw aanvraag brengen wij u hierbij vrijblijvend offerte uit voor de hierna omschreven werkzaamheden.</div>
            {dossier.bedrag_excl_btw != null && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 20 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #009439' }}>
                      <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 700, color: '#009439' }}>Omschrijving</th>
                      <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 700, color: '#009439', whiteSpace: 'nowrap' }}>Bedrag (excl. BTW)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[['Arbeid (loon incl. sociale lasten)', arbeid], ['Materiaal', materiaal], ['Onderaanneming', onderaannem], ['Overig / stelposten', overig]].map(([lbl, val]) => (
                      <tr key={lbl as string} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '7px 4px' }}>{lbl}</td>
                        <td style={{ padding: '7px 4px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtBedrag(val as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginLeft: 'auto', width: 280, borderTop: '2px solid #009439', paddingTop: 10 }}>
                  {[['Totaal excl. BTW', bedrag], ['BTW 21%', btw]].map(([lbl, val]) => (
                    <div key={lbl as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                      <span>{lbl}</span><span style={{ fontFamily: 'monospace' }}>{fmtBedrag(val as number)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', marginTop: 6, borderTop: '1px solid #ddd', fontWeight: 700, fontSize: 13 }}>
                    <span>Totaal incl. BTW</span><span style={{ fontFamily: 'monospace' }}>{fmtBedrag(inclBtw)}</span>
                  </div>
                </div>
              </>
            )}
            <div style={{ position: 'absolute', bottom: 56, left: 60, right: 60, fontSize: 9, color: '#888', borderTop: '1px solid #eee', paddingTop: 12, lineHeight: 1.7 }}>
              <strong style={{ color: '#555' }}>Voorwaarden: </strong>
              Op al onze aanbiedingen, opdrachten en overeenkomsten zijn de algemene leveringsvoorwaarden van Everts Groep BV van toepassing. Geldigheidsduur offerte: 30 dagen na offertedatum.
            </div>
          </div>
        </div>
      </div>
    </div>
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
}

export function InformatieTab({
  dossier, sectie, medewerkers = [], factuuradressen = [],
  relatie = null, sjablonen = [], urgenteTaken = [], categorieen,
}: Props) {
  const router = useRouter()
  const [editMode, setEditMode]     = React.useState(false)
  const [substatus, setSubstatus]   = React.useState<string>(getDossierSubstatus(dossier))
  const [finDialoogOpen, setFinDialoogOpen] = React.useState(false)

  const beschikbareStatussen =
    sectie === 'aanvraag' ? AANVRAAG_STATUSSEN :
    sectie === 'offerte'  ? OFFERTE_STATUSSEN  : OPDRACHT_STATUSSEN

  // Velden die uit Bouw7 komen zijn niet bewerkbaar in EVA (geen terugschrijven naar Bouw7).
  // Geldt alleen voor dossiers die daadwerkelijk uit Bouw7 komen.
  const bouw7Vergrendeld = (dossier as any).bouw7_id != null
  const bouw7Url = bouw7Vergrendeld
    ? `https://start.bouw7.nl/project/view?id=${(dossier as any).bouw7_id}#/`
    : null
  // Fase-gating: alleen EVA-eigen substatussen zijn kiesbaar; Bouw7-eigen statussen blijven
  // zichtbaar als huidige waarde maar zijn niet selecteerbaar.
  const kiesbareStatussen = beschikbareStatussen.filter(
    s => !bouw7Vergrendeld || !isBouw7Substatus(sectie, s.key) || s.key === substatus
  )

  const [contactpersoonOpties, setContactpersoonOpties] = React.useState<{
    id: string; naam: string; email: string | null; telefoon: string | null
  }[]>([])

  React.useEffect(() => {
    if (!relatie?.id) return
    getContactpersonenVoorRelatie(relatie.id).then(setContactpersoonOpties).catch(() => {})
  }, [relatie?.id])

  const [form, setForm] = React.useState<FormValues>({
    calculator_id:           (dossier as any).calculator_id      ?? '',
    uiterlijkeIndiendatum:   '',
    categorie:               (dossier as any).categorie           ?? '',
    referentie:              dossier.referentie           ?? '',
    opmerkingen:             (dossier as any).opmerkingen          ?? '',
    interne_opmerkingen:     (dossier as any).interne_opmerkingen ?? '',
    contactpersoon_id:       (dossier as any).contactpersoon_id  ?? '',
    verwacht_startdatum:     dossier.verwacht_startdatum         ?? '',
    verwacht_einddatum:      dossier.verwacht_einddatum          ?? '',
    werkadres_naam:          (dossier as any).werkadres_naam      ?? '',
    werkadres_telefoon:      (dossier as any).werkadres_telefoon  ?? '',
    werkadres_email:         (dossier as any).werkadres_email     ?? '',
    werkadres_straat:        (dossier as any).werkadres_straat    ?? '',
    werkadres_postcode:      (dossier as any).werkadres_postcode  ?? '',
    werkadres_stad:          (dossier as any).werkadres_stad      ?? '',
    betalingstermijn:        '',
    factuurreferentie:       '',
    datum_offerte_verzonden: '',
    opdrachtdatum:           '',
    aanneemsom:              dossier.bedrag_excl_btw != null ? String(dossier.bedrag_excl_btw) : '',
    projectleider_id:        dossier.project_manager_id  ?? '',
    teamleider_id:           dossier.teamleider_id        ?? '',
    werkvoorbereider_id:     dossier.werkvoorbereider_id  ?? '',
    uitvoerder_id:           dossier.uitvoerder_id        ?? '',
    controller_id:           dossier.controller_id        ?? '',
    opdracht_referentie:     dossier.opdracht_referentie  ?? '',
    factuuradres_id:         dossier.factuuradres_id      ?? '',
  })
  const [opgeslagen, setOpgeslagen] = React.useState<FormValues>(form)

  const [projectId,    setProjectId]    = useState<string | null>(null)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [modalType,    setModalType]    = useState<QuoteType>('verkoopofferte')
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('aanvraag_project_ids')
      const map: Record<string, string> = raw ? JSON.parse(raw) : {}
      setProjectId(map[dossier.id] ?? null)
    } catch { /* localStorage niet beschikbaar */ }
  }, [dossier.id, importTick])

  useEffect(() => {
    if (!projectId) { setQuoteTotalen(null); return }
    getQuoteTotalenVoorProject(projectId).then(setQuoteTotalen).catch(() => {})
  }, [projectId, importTick])

  useEffect(() => {
    if (!projectId) { setCalcTotalen(null); return }
    try { setCalcTotalen(berekenCalcTotalenVoorProject(projectId)) } catch { setCalcTotalen(null) }
  }, [projectId, importTick])

  const set = (key: keyof FormValues) => (v: string) => setForm(p => ({ ...p, [key]: v }))

  function opslaan() {
    setOpgeslagen(form)
    setEditMode(false)
    // Fase alleen wegschrijven als de gekozen substatus EVA-stuurbaar is (gating in de dropdown
    // voorkomt al een Bouw7-eigen keuze, maar dubbel afdekken kan geen kwaad).
    if (!bouw7Vergrendeld || !isBouw7Substatus(sectie, substatus)) {
      updateDossierSubstatus(dossier.id, substatus as any).catch(() => {})
    }
    // Rollen: voor Bouw7-dossiers alleen de EVA-eigen rollen (teamleider/controller) wegschrijven;
    // de Bouw7-rollen blijven onaangeroerd.
    updateDossierRollen(dossier.id, bouw7Vergrendeld ? {
      teamleider_id:       form.teamleider_id       || null,
      controller_id:       form.controller_id       || null,
    } : {
      project_manager_id:  form.projectleider_id   || null,
      teamleider_id:       form.teamleider_id       || null,
      werkvoorbereider_id: form.werkvoorbereider_id || null,
      calculator_id:       form.calculator_id       || null,
      uitvoerder_id:       form.uitvoerder_id       || null,
      controller_id:       form.controller_id       || null,
    }).catch(() => {})
    // Inhoudsvelden: EVA-eigen velden altijd; Bouw7-bron-velden alleen voor niet-Bouw7-dossiers.
    updateDossierInfo(dossier.id, {
      referentie:           form.referentie           || null,
      opdracht_referentie:  form.opdracht_referentie  || null,
      werkadres_naam:       form.werkadres_naam       || null,
      werkadres_telefoon:   form.werkadres_telefoon   || null,
      werkadres_email:      form.werkadres_email      || null,
      interne_opmerkingen:  form.interne_opmerkingen  || null,
      ...(bouw7Vergrendeld ? {} : {
        categorie:            form.categorie            || null,
        contactpersoon_id:    form.contactpersoon_id    || null,
        verwacht_startdatum:  form.verwacht_startdatum  || null,
        verwacht_einddatum:   form.verwacht_einddatum   || null,
        werkadres_straat:     form.werkadres_straat     || null,
        werkadres_postcode:   form.werkadres_postcode   || null,
        werkadres_stad:       form.werkadres_stad       || null,
      }),
    }).catch(() => {})
  }
  function annuleer() { setForm(opgeslagen); setEditMode(false) }

  const heeftCalcKnoppen      = sectie === 'aanvraag' && projectId != null
  const geselecteerdFa        = factuuradressen.find(fa => fa.id === form.factuuradres_id) ?? null
  // Voorkeur: gegenereerde offerte (Supabase) → anders live calculatietotalen → anders Bouw7.
  const T                     = quoteTotalen ?? calcTotalen
  const finAanneemsom         = T?.subtotaal_ex_btw ?? dossier.bedrag_excl_btw ?? null
  const finKostprijs          = T?.kostprijs        ?? dossier.kostprijs_excl_btw ?? null
  // Marge alleen te bepalen als kostprijs én verkoopprijs bekend zijn — anders niet tonen.
  const finMargeEuro          = T?.marge_euro
    ?? (finAanneemsom != null && finKostprijs != null ? finAanneemsom - finKostprijs : null)
  const finMargePct           = T?.marge_pct
    ?? (finMargeEuro != null && finAanneemsom ? (finMargeEuro / finAanneemsom) * 100 : null)
  const finStelposten         = T?.stelposten_subtotaal ?? 0
  const finOptioneel          = T?.opties_subtotaal     ?? 0
  // Totaal incl. BTW komt uit de calculatie of uit Bouw7 (bedrag_incl_btw) — nooit zelf 21% schatten,
  // want er zijn ook 9%- en BTW-verlegd-projecten. BTW = incl − excl.
  const finTotaalIncl         = T?.totaal_incl_btw ?? dossier.bedrag_incl_btw ?? null
  const finBtw                = T?.btw_bedrag
    ?? (finTotaalIncl != null && finAanneemsom != null
        ? Math.round((finTotaalIncl - finAanneemsom) * 100) / 100
        : null)
  // BTW-splitsing per tarief: uit de live calculatie (per tarief) of anders uit de Bouw7-offerte.
  const finBtwSplitsing       =
    (!quoteTotalen && calcTotalen?.btw_groepen?.length)
      ? calcTotalen.btw_groepen.map(g => ({ label: `BTW ${g.pct}%`, percentage: g.pct, bedrag: g.btw }))
      : (!quoteTotalen && dossier.btw_splitsing?.length ? dossier.btw_splitsing : null)
  const margeKleur            = (finMargePct ?? 0) >= 20 ? '#009439' : (finMargePct ?? 0) >= 10 ? '#d97706' : '#d9534f'

  const medewerkersOpties  = medewerkers.map(m => ({ value: m.id, label: m.naam }))
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
            {bouw7Url && (
              <a
                href={bouw7Url}
                target="_blank"
                rel="noopener noreferrer"
                title="Openen in Bouw7"
                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-neutral-500 opacity-40 transition-opacity hover:opacity-100"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            )}
            {bouw7Vergrendeld && <DossierVerversKnop dossierId={dossier.id} />}
          </div>
          <h1 className="m-0 text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-neutral-900">
            {dossier.titel}
          </h1>
          <div className="mt-2 flex items-center gap-2.5">
            <Popover>
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
                      onClick={() => { setSubstatus(s.key); updateDossierSubstatus(dossier.id, s.key as any) }}
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
            <span className="text-[12px] font-medium text-neutral-500">{dossier.klant_naam}</span>
          </div>
        </div>

        {/* Acties rechts */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {heeftCalcKnoppen && (
            <>
              <Button variant="ghost" asChild>
                <Link href={`/aanvragen/${dossier.id}/calculatie`}>
                  <Calculator className="h-3.5 w-3.5" />
                  Calculatie openen
                </Link>
              </Button>
              <Button variant="ghost" onClick={() => { setModalType('verkoopofferte'); setModalOpen(true) }}>
                <FileText className="h-3.5 w-3.5" />
                Offerte aanmaken
              </Button>
              <Button variant="ghost" onClick={() => { setModalType('interne_calculatie'); setModalOpen(true) }}>
                <FileText className="h-3.5 w-3.5" />
                Interne begroting
              </Button>
              <div className="h-6 w-px shrink-0 bg-neutral-200" />
            </>
          )}
          {sectie === 'opdracht' && substatus === 'uitvoering_gereed' && (
            <>
              <AlertDialog open={finDialoogOpen} onOpenChange={setFinDialoogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </svg>
                    Financieel gereed melden
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Financieel gereed melden</AlertDialogTitle>
                  <AlertDialogDescription>
                    Weet je zeker dat je alle kosten binnen hebt en alle verkoopfacturen verstuurd zijn?
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuleren</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => {
                      await updateDossierSubstatus(dossier.id, 'financieel_gereed' as any)
                      setSubstatus('financieel_gereed')
                      setFinDialoogOpen(false)
                      router.refresh()
                    }}>
                      Ja, melden
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <div className="h-6 w-px shrink-0 bg-neutral-200" />
            </>
          )}
          {editMode ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={opslaan}>Opslaan</Button>
              <Button variant="ghost" onClick={annuleer}>Annuleer</Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setEditMode(true)}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17l-4 1 1-4L14.5 2.5z" />
              </svg>
              Bewerken
            </Button>
          )}
        </div>
      </div>

      {/* ── Kaarten grid ── */}
      <div className="grid grid-cols-2 gap-3.5">

        {/* Projectinformatie */}
        <Card>
          <CardHeader>Projectinformatie</CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <InfoVeld label="Dossiernummer"  waarde={dossier.dossiernummer} mono />
              <InfoVeld label="Opdrachtgever"  waarde={dossier.klant_naam} />
              <InfoVeld label="Projectnaam"    waarde={dossier.titel} />
              <InfoVeld label="Fase"           waarde={statusLabel(substatus)} />
              <InfoVeld
                label="Deadline"
                waarde={form.uiterlijkeIndiendatum || null}
                urgentie={!!form.uiterlijkeIndiendatum && (new Date(form.uiterlijkeIndiendatum).getTime() - Date.now()) < 86_400_000 * 7}
              />
              <InfoVeld label="Begindatum" waarde={form.verwacht_startdatum ? fmtDatum(form.verwacht_startdatum) : null} />
              <InfoVeld label="Einddatum"  waarde={form.verwacht_einddatum  ? fmtDatum(form.verwacht_einddatum)  : null} />
              <InfoVeld label="Categorie (Bouw7)" waarde={(dossier as any).bouw7_categorie_naam ?? null} />
              <InfoVeld label="Categorie" waarde={form.categorie || null} />
              <InfoVeld label="Referentie" waarde={form.referentie || null} />
              {sectie === 'opdracht' && (
                <InfoVeld label="Opdracht referentie" waarde={form.opdracht_referentie || null} />
              )}
            </div>

            {/* Rollen — altijd zichtbaar (lege rollen tonen "—"). */}
            {!editMode && (
              <>
                <Separator className="my-3" />
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Rollen</p>
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <InfoVeld label="Projectleider"    waarde={dossier.projectleider_naam} />
                  <InfoVeld label="Werkvoorbereider" waarde={dossier.werkvoorbereider_naam} />
                  <InfoVeld label="Uitvoerder"       waarde={dossier.uitvoerder_naam} />
                  <InfoVeld label="Calculator"       waarde={dossier.calculator_naam} />
                  <InfoVeld label="Teamleider"       waarde={dossier.teamleider_naam} />
                  <InfoVeld label="Controller"       waarde={dossier.controller_naam} />
                </div>
              </>
            )}

            {!editMode && (
              <>
                <Separator className="my-3" />
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Werkadres</p>
                <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                  <div className="col-span-2"><InfoVeld label="Straat + nummer" waarde={form.werkadres_straat || null} /></div>
                  <InfoVeld label="Postcode" waarde={form.werkadres_postcode || null} />
                  <InfoVeld label="Stad"     waarde={form.werkadres_stad     || null} />
                </div>
              </>
            )}

            {!editMode && (
              <>
                <Separator className="my-3" />
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Opmerkingen</p>
                <div className="grid grid-cols-1 gap-y-3">
                  <InfoVeld label="Bouw7" waarde={(dossier as any).opmerkingen || null} />
                  <InfoVeld label="Intern (EVA)" waarde={form.interne_opmerkingen || null} />
                </div>
              </>
            )}

            {editMode && (
              <div className="mt-4">
                {bouw7Vergrendeld && (
                  <p className="mb-3 rounded-md bg-neutral-50 px-3 py-2 text-[11px] leading-snug text-neutral-500">
                    Velden uit Bouw7 zijn alleen-lezen en worden in Bouw7 beheerd. EVA-eigen velden
                    (teamleider, controller, werkadres-contact, referenties, datums, interne opmerkingen) blijven bewerkbaar.
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
                    <FormField upper label="Referentie">
                      <Input value={form.referentie} onChange={e => set('referentie')(e.target.value)} placeholder="kenmerk van opdrachtgever" />
                    </FormField>
                    {sectie === 'opdracht' && (
                      <FormField upper label="Opdracht referentie">
                        <Input value={form.opdracht_referentie} onChange={e => set('opdracht_referentie')(e.target.value)} placeholder="Referentie opdrachtgever" />
                      </FormField>
                    )}
                  </FormRow>
                </FormSection>

                <FormSection title="Datums">
                  <FormRow cols="2">
                    {(sectie === 'offerte' || sectie === 'opdracht') && (
                      <FormField upper label="Datum offerte verzonden">
                        <DatePicker
                          value={form.datum_offerte_verzonden ? new Date(form.datum_offerte_verzonden) : undefined}
                          onChange={d => set('datum_offerte_verzonden')(d ? d.toISOString().slice(0, 10) : '')}
                        />
                      </FormField>
                    )}
                    {sectie === 'opdracht' && (
                      <FormField upper label="Opdrachtdatum">
                        <DatePicker
                          value={form.opdrachtdatum ? new Date(form.opdrachtdatum) : undefined}
                          onChange={d => set('opdrachtdatum')(d ? d.toISOString().slice(0, 10) : '')}
                        />
                      </FormField>
                    )}
                    {sectie === 'aanvraag' && (
                      <FormField upper label="Uiterlijke indiendatum">
                        <DatePicker
                          value={form.uiterlijkeIndiendatum ? new Date(form.uiterlijkeIndiendatum) : undefined}
                          onChange={d => set('uiterlijkeIndiendatum')(d ? d.toISOString().slice(0, 10) : '')}
                        />
                      </FormField>
                    )}
                    {bouw7Vergrendeld ? (
                      <>
                        <InfoVeld label="Begindatum" waarde={form.verwacht_startdatum ? fmtDatum(form.verwacht_startdatum) : null} />
                        <InfoVeld label="Einddatum"  waarde={form.verwacht_einddatum  ? fmtDatum(form.verwacht_einddatum)  : null} />
                      </>
                    ) : (
                      <>
                        <FormField upper label="Begindatum">
                          <DatePicker
                            value={form.verwacht_startdatum ? new Date(form.verwacht_startdatum) : undefined}
                            onChange={d => set('verwacht_startdatum')(d ? d.toISOString().slice(0, 10) : '')}
                          />
                        </FormField>
                        <FormField upper label="Einddatum">
                          <DatePicker
                            value={form.verwacht_einddatum ? new Date(form.verwacht_einddatum) : undefined}
                            onChange={d => set('verwacht_einddatum')(d ? d.toISOString().slice(0, 10) : '')}
                          />
                        </FormField>
                      </>
                    )}
                  </FormRow>
                </FormSection>

                <FormSection title="Rollen">
                  <FormRow cols="2">
                    {bouw7Vergrendeld ? (
                      <>
                        <InfoVeld label="Projectleider"    waarde={dossier.projectleider_naam} />
                        <InfoVeld label="Werkvoorbereider" waarde={dossier.werkvoorbereider_naam} />
                        <InfoVeld label="Uitvoerder"       waarde={dossier.uitvoerder_naam} />
                        <InfoVeld label="Calculator"       waarde={dossier.calculator_naam} />
                      </>
                    ) : (
                      <>
                        <FormField upper label="Projectleider">
                          <RolSelect value={form.projectleider_id} onChange={set('projectleider_id')} options={medewerkersOpties} placeholder="Selecteer projectleider" />
                        </FormField>
                        <FormField upper label="Werkvoorbereider">
                          <RolSelect value={form.werkvoorbereider_id} onChange={set('werkvoorbereider_id')} options={medewerkersOpties} placeholder="Selecteer werkvoorbereider" />
                        </FormField>
                        <FormField upper label="Uitvoerder">
                          <RolSelect value={form.uitvoerder_id} onChange={set('uitvoerder_id')} options={medewerkersOpties} placeholder="Selecteer uitvoerder" />
                        </FormField>
                        {sectie === 'opdracht' && (
                          <FormField upper label="Calculator">
                            <RolSelect value={form.calculator_id} onChange={set('calculator_id')} options={medewerkersOpties} placeholder="Selecteer calculator" />
                          </FormField>
                        )}
                      </>
                    )}
                    {/* Teamleider & Controller zijn EVA-eigen → altijd bewerkbaar. */}
                    <FormField upper label="Teamleider">
                      <RolSelect value={form.teamleider_id} onChange={set('teamleider_id')} options={medewerkersOpties} placeholder="Selecteer teamleider" />
                    </FormField>
                    <FormField upper label="Controller">
                      <RolSelect value={form.controller_id} onChange={set('controller_id')} options={medewerkersOpties} placeholder="Selecteer controller" />
                    </FormField>
                  </FormRow>
                </FormSection>

                <FormSection title="Opmerkingen">
                  {bouw7Vergrendeld && (dossier as any).opmerkingen && (
                    <div className="mb-3">
                      <InfoVeld label="Bouw7 (alleen-lezen)" waarde={(dossier as any).opmerkingen} />
                    </div>
                  )}
                  <FormField upper label="Interne opmerkingen (EVA)">
                    <Textarea value={form.interne_opmerkingen} onChange={e => set('interne_opmerkingen')(e.target.value)} placeholder="Interne aanvullingen — worden nooit door de Bouw7-sync overschreven" />
                  </FormField>
                </FormSection>

                <FormSection title="Werkadres">
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
                </FormSection>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Taken */}
        <div>
          <TakenBlok dossierId={dossier.id} dossierTitel={dossier.titel} sectie={sectie} sjablonen={sjablonen} urgenteTaken={urgenteTaken} />
        </div>

        {/* Dossier-toggles */}
        <DossierTogglesPaneel dossierId={dossier.id} />

        {/* Opdrachtgever */}
        <Card>
          <CardHeader>Opdrachtgever</CardHeader>
          <CardBody className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {relatie ? (
                <>
                  <div className="col-span-2"><InfoVeld label="Naam"       waarde={relatie.naam} /></div>
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
                  <InfoVeld label="Naam"     waarde={naam} />
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

        {/* Financiële totalen */}
        <Card>
          <CardHeader>Financiële totalen</CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <InfoVeld label="Aanneemsom excl. BTW"   waarde={finAanneemsom != null ? fmtBedrag(finAanneemsom) : null} numeric />
              {finKostprijs != null ? (
                <InfoVeld label="Gecalculeerde kostprijs" waarde={fmtBedrag(finKostprijs)} numeric />
              ) : (
                <div>
                  <div className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Gecalculeerde kostprijs</div>
                  <div className="text-[13px] italic text-neutral-400">Geen kostprijs berekend</div>
                </div>
              )}
              {finMargePct != null && finMargeEuro != null && (
                <div className="col-span-2">
                  <div className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Marge</div>
                  <div className="flex items-center gap-2.5">
                    <span className="tabular-nums text-[13px] font-bold" style={{ color: margeKleur }}>
                      {finMargePct.toFixed(1)}%
                    </span>
                    <span className="tabular-nums text-[12px] text-neutral-400">
                      ({fmtBedrag(finMargeEuro)})
                    </span>
                  </div>
                </div>
              )}
              <InfoVeld label="Totaal Stelposten" waarde={fmtBedrag(finStelposten)} numeric />
              <InfoVeld label="Totaal Optioneel"  waarde={fmtBedrag(finOptioneel)}  numeric />
              {finBtwSplitsing ? (
                finBtwSplitsing.map(t => (
                  <InfoVeld
                    key={t.label}
                    label={t.percentage > 0
                      ? `BTW ${t.percentage}%`
                      : t.label.toLowerCase().includes('verlegd') ? 'BTW verlegd' : 'BTW 0%'}
                    waarde={fmtBedrag(t.bedrag)}
                    numeric
                  />
                ))
              ) : (
                <InfoVeld label="BTW" waarde={finBtw != null ? fmtBedrag(finBtw) : null} numeric />
              )}
            </div>
            <div className="mt-3 flex items-center justify-between border-t-2 border-neutral-200 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">Totaal incl. BTW</span>
              <span className="tabular-nums text-[18px] font-bold text-neutral-900">
                {finTotaalIncl != null ? fmtBedrag(finTotaalIncl) : '—'}
              </span>
            </div>
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

        {/* Calculatie importeren (.c4y) — sleep een Calc4You-werkbegroting hierheen */}
        <div className="col-span-2">
          <C4yDropCard
            dossierId={dossier.id}
            sectie={sectie}
            naam={dossier.titel}
            nummer={dossier.dossiernummer ?? ''}
            onImported={() => setImportTick(t => t + 1)}
          />
        </div>

        {/* Calculatie-instellingen — alleen voor aanvraag met gekoppeld project */}
        {heeftCalcKnoppen && (
          <div className="col-span-2">
            <CalculatieInstellingenKaarten projectId={projectId!} />
          </div>
        )}

      </div>
    </div>
  )

  const modal = projectId && modalOpen && (
    <OfferteAanmakenModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      projectId={projectId}
      projectNaam={dossier.titel}
      clientNaam={dossier.klant_naam ?? ''}
      projectNummer={dossier.dossiernummer ?? ''}
      type={modalType}
    />
  )

  if (sectie === 'offerte') {
    return (
      <>
        <div style={{ display: 'flex', height: 'calc(100dvh - 56px)', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>{inhoud}</div>
          <div style={{ width: 460, flexShrink: 0 }}>
            <OffertePreview dossier={dossier} />
          </div>
        </div>
        {modal}
      </>
    )
  }

  return <>{inhoud}{modal}</>
}
