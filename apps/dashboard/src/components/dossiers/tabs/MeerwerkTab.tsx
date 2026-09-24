'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Input, Badge, useDialogen } from '@/components/ui'
import { meerwerkStatusLabels, type MeerwerkStatus, type MeerwerkAfrekenwijze, type MeerwerkTermijnWijze } from '@everts/database'
import {
  getDossierMeerwerk, maakMeerwerkRegel, updateMeerwerkRegel, setMeerwerkStatus,
  verwijderMeerwerkRegel, maakMeerwerkCalculatie, stuurMeerwerkNaarBouw7,
  type DossierMeerwerkData, type MeerwerkRegelView, type NieuweMeerwerkData,
} from '@/lib/dossiers/meerwerk'
import { getOpdrachtOverzicht, verrekenStelpost } from '@/lib/dossiers/opdracht-onderdelen'
import type { OpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'
import AfrekenstandBlok from './AfrekenstandBlok'
import MeerwerkCalculatie from '@/components/everts-calc/calculatie/MeerwerkCalculatie'
import { parseGetal } from '@/lib/everts-calc/calculations'
import { useDossierReadOnly } from '../DossierReadOnlyContext'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

/** Handmatig getypt getal → number, of null bij een leeg veld. Accepteert komma én punt. */
const naarGetal = (tekst: string): number | null => (tekst.trim() === '' ? null : parseGetal(tekst))

const STATUS_TONE: Record<MeerwerkStatus, 'neutral' | 'info' | 'success' | 'error' | 'brand'> = {
  aangevraagd: 'neutral', offerte_verstuurd: 'info', akkoord: 'success', afgewezen: 'error', voltooid: 'brand',
}

const selectCls =
  'h-8 rounded-md border border-neutral-300 bg-white px-2 text-[12px] text-neutral-800 outline-none focus:border-brand-500'
// Status-dropdown: per status ingekleurd (zelfde tonen als de Badge, zie ui/badge.tsx).
const selectStatusBase = 'h-8 rounded-md border px-2 text-[12px] font-medium outline-none'
const STATUS_SELECT_TONE: Record<MeerwerkStatus, string> = {
  aangevraagd:       'bg-neutral-50 border-neutral-300 text-neutral-700',
  offerte_verstuurd: 'bg-info-50 border-info-300 text-info-700',
  akkoord:           'bg-success-50 border-success-300 text-success-700',
  afgewezen:         'bg-error-50 border-error-300 text-error-700',
  voltooid:          'bg-brand-50 border-brand-300 text-brand-700',
}
const inlineInputCls =
  'w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-[12.5px] text-neutral-800 outline-none focus:border-brand-500'

/**
 * Voorstel voor de koptekst boven het PDF-overzicht. De gebruiker kan hem per keer aanpassen;
 * de tekst gaat als querystring mee naar de PDF-route en wordt nergens bewaard.
 */
const STANDAARD_KOPTEKST =
  'Hieronder vindt u het overzicht van het meerwerk bij dit project, gegroepeerd per status. '
  + 'Per regel staan het bedrag exclusief btw, het btw-tarief en het bedrag inclusief btw vermeld.'

const LEGE_NIEUW: NieuweMeerwerkData = {
  omschrijving: '', afrekenwijze: 'aangenomen', is_stelpost: false, stelpost_grondslag: null,
  bedrag_excl_btw: null, eenheid: null, eenheidsprijs: null, hoeveelheid_werkelijk: null,
  btw_pct: null, factuurreferentie: null,
}

/**
 * De getypte tekst van de bedragvelden staat apart van `nieuw`: zou je elke
 * toetsaanslag meteen door `Number()` halen en teruggeven aan het invoerveld,
 * dan verdwijnt de komma zodra je hem typt ("12," → 12) en kun je nooit een
 * decimaal invoeren. Pas bij Toevoegen worden deze velden omgezet naar getallen.
 */
type RuweBedragen = { btw_pct: string; eenheidsprijs: string; bedrag_excl_btw: string }
const LEGE_RUW: RuweBedragen = { btw_pct: '', eenheidsprijs: '', bedrag_excl_btw: '' }

/** Kleine letters, zonder accenten: "geïsoleerd" vindt je ook met "geisoleerd". */
const normaliseer = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Alles waarop je een meerwerkregel terugvindt, als één zoekbare tekst. Het bedrag staat er
 * zowel geformatteerd ("1.250,00") als kaal ("1250") in, zodat beide schrijfwijzen werken.
 */
function zoektekst(r: MeerwerkRegelView): string {
  return normaliseer([
    `MW${String(r.volgnummer).padStart(2, '0')}`,
    r.bouw7_nummer, r.omschrijving, r.factuurreferentie, r.bewakingscode,
    meerwerkStatusLabels[r.status],
    r.afrekenwijze === 'regie' ? 'regie' : 'aangenomen',
    r.is_stelpost ? 'stelpost' : null,
    r.bron === 'bouw7_line' ? 'uit bouw7' : null,
    r.besluit_door_naam, r.besluit_opmerking,
    fmt(r.effectiefExcl), String(r.effectiefExcl),
  ].filter(Boolean).join(' '))
}

type MeerwerkTabProps = {
  dossierId: string
  naam?: string
  nummer?: string
  clientNaam?: string | null
}

/** Inline geopende meerwerk-calculatie (eigen calculatieproject van een regel). */
type CalcOpen = { projectId: string; regelId: string; omschrijving: string; offerteId: string | null }

export default function MeerwerkTab({ dossierId, naam = 'Meerwerk', nummer = '', clientNaam = null }: MeerwerkTabProps) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [data, setData] = useState<DossierMeerwerkData | null>(null)
  const [bezig, setBezig] = useState(false)
  const { bevestig, vraagTekst } = useDialogen()
  const [formOpen, setFormOpen] = useState(false)
  const [nieuw, setNieuw] = useState<NieuweMeerwerkData>(LEGE_NIEUW)
  const [ruw, setRuw] = useState<RuweBedragen>(LEGE_RUW)
  const [calcOpen, setCalcOpen] = useState<CalcOpen | null>(null)
  /** Opdracht-samenstelling (aanneemsom + stelposten) voor de afrekenstand; null = niet beschikbaar. */
  const [overzicht, setOverzicht] = useState<OpdrachtOverzicht | null>(null)
  const [zoek, setZoek] = useState('')

  /** Elk los woord moet ergens in de regel voorkomen ("dak mw03" → regel MW03 over het dak). */
  const zichtbareRegels = useMemo(() => {
    const regels = data?.regels ?? []
    const woorden = normaliseer(zoek).split(/\s+/).filter(Boolean)
    if (woorden.length === 0) return regels
    return regels.filter(r => { const t = zoektekst(r); return woorden.every(w => t.includes(w)) })
  }, [data, zoek])
  const gefilterd = zoek.trim() !== ''

  function herlaad() {
    getDossierMeerwerk(dossierId).then(setData).catch(() => setData({ regels: [], totalen: { aantal: 0, goedgekeurdAantal: 0, goedgekeurdExcl: 0, goedgekeurdIncl: 0, goedgekeurdAangenomenExcl: 0, goedgekeurdRegieExcl: 0, goedgekeurdNacalculatieExcl: 0 } }))
    // Stelposten en aanneemsom horen bij hetzelfde beeld, maar mogen het meerwerk niet ophouden:
    // dit overzicht raakt Bouw7 aan en is daarom trager dan de meerwerkregels zelf.
    getOpdrachtOverzicht(dossierId).then(setOverzicht).catch(() => setOverzicht(null))
  }
  useEffect(herlaad, [dossierId])

  async function voegToe() {
    if (!nieuw.omschrijving.trim()) { toast.error('Geef een omschrijving op.'); return }
    setBezig(true)
    const r = await maakMeerwerkRegel(dossierId, {
      ...nieuw,
      btw_pct: naarGetal(ruw.btw_pct),
      eenheidsprijs: naarGetal(ruw.eenheidsprijs),
      bedrag_excl_btw: naarGetal(ruw.bedrag_excl_btw),
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Meerwerkregel toegevoegd')
    setNieuw(LEGE_NIEUW); setRuw(LEGE_RUW); setFormOpen(false); herlaad()
  }

  /**
   * Opent het meerwerkoverzicht (PDF) in een nieuw tabblad. De koptekst vragen we vooraf: het
   * overzicht gaat naar de opdrachtgever en verdient een eigen inleiding per project.
   */
  async function pdfOverzicht() {
    const kop = await vraagTekst({
      titel: 'Meerwerkoverzicht als PDF',
      omschrijving: 'De koptekst komt onder de projectgegevens en boven het overzicht. Laat leeg om hem weg te laten.',
      label: 'Koptekst',
      meerregelig: true,
      standaard: STANDAARD_KOPTEKST,
      bevestigLabel: 'Overzicht openen',
    })
    if (kop === null) return
    const url = `/api/dossiers/${dossierId}/meerwerk/pdf?kop=${encodeURIComponent(kop)}`
    // Popupblokkers weren soms een window.open na een dialoog; dan maar in ditzelfde tabblad.
    if (!window.open(url, '_blank', 'noopener')) window.location.href = url
  }

  async function wijzigStatus(regel: MeerwerkRegelView, status: MeerwerkStatus) {
    let afgewezenReden: string | null = null
    if (status === 'afgewezen') {
      const antwoord = await vraagTekst({
        titel: 'Meerwerk afwijzen',
        label: 'Reden van afwijzing (optioneel)',
        meerregelig: true,
        bevestigLabel: 'Afwijzen',
      })
      if (antwoord === null) return
      afgewezenReden = antwoord.trim() || null
    }
    setBezig(true)
    const r = await setMeerwerkStatus(regel.id, status, { afgewezenReden })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 6000 })
    else toast.success(`Status: ${meerwerkStatusLabels[status]}`)
    // Wat er automatisch bij is gebeurd (bedrag uit de offerte, termijnen) apart tonen: dat is
    // geen waarschuwing maar wel iets waarvan je wilt weten dát het gebeurd is.
    if (r.melding) toast(r.melding, { icon: '✅', duration: 8000 })
    herlaad(); router.refresh()
  }

  async function wijzigVeld(id: string, patch: Partial<NieuweMeerwerkData> & { termijn_wijze?: MeerwerkTermijnWijze | null }) {
    const r = await updateMeerwerkRegel(id, patch)
    if (!r.ok) { toast.error(r.error); return }
    if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 6000 })
    if (r.melding) toast(r.melding, { icon: '✅', duration: 8000 })
    herlaad(); router.refresh()
  }

  async function naarBouw7(regel: MeerwerkRegelView) {
    setBezig(true)
    const res = await stuurMeerwerkNaarBouw7(regel.id)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(res.nummer ? `Aangemaakt in Bouw7 (${res.nummer})` : 'Aangemaakt in Bouw7'); herlaad(); router.refresh()
  }

  // Opent (of maakt) de eigen calculatie van dit meerwerk en toont de calculatie-omgeving inline.
  async function calculatie(regel: MeerwerkRegelView) {
    setBezig(true)
    const r = await maakMeerwerkCalculatie(regel.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setCalcOpen({ projectId: r.projectId, regelId: regel.id, omschrijving: regel.omschrijving, offerteId: null })
  }

  // Opent de meerwerk-calculatie meteen op de gekoppelde offerte.
  async function openOfferte(regel: MeerwerkRegelView) {
    setBezig(true)
    const r = await maakMeerwerkCalculatie(regel.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setCalcOpen({ projectId: r.projectId, regelId: regel.id, omschrijving: regel.omschrijving, offerteId: regel.quote_id })
  }

  /** Het verschil tussen stelpost en werkelijk als één meer-/minderwerkregel boeken. */
  async function verreken(onderdeelId: string) {
    setBezig(true)
    const r = await verrekenStelpost(onderdeelId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(`Verrekend: ${fmt(r.saldo)} als ${r.saldo < 0 ? 'minderwerk' : 'meerwerk'}`)
    herlaad(); router.refresh()
  }

  async function verwijder(regel: MeerwerkRegelView) {
    if (!await bevestig({ titel: `Meerwerkregel "${regel.omschrijving}" verwijderen?`, bevestigLabel: 'Verwijderen', destructief: true })) return
    setBezig(true)
    const r = await verwijderMeerwerkRegel(regel.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Verwijderd'); herlaad()
  }

  if (data == null) return <div className="px-8 py-7 text-[13px] text-neutral-500">Meerwerk laden…</div>

  // Inline calculatie-omgeving van één meerwerkregel (scenario in het dossier-project).
  if (calcOpen) {
    return (
      <MeerwerkCalculatie
        projectId={calcOpen.projectId}
        dossierId={dossierId}
        meerwerkRegelId={calcOpen.regelId}
        omschrijving={calcOpen.omschrijving}
        naam={naam}
        nummer={nummer}
        clientNaam={clientNaam}
        initialOfferteId={calcOpen.offerteId}
        onTerug={() => { setCalcOpen(null); herlaad(); router.refresh() }}
      />
    )
  }

  return (
    <div className="px-8 py-7 space-y-5">
      {overzicht && (
        <AfrekenstandBlok
          overzicht={overzicht}
          meerwerkExcl={data.totalen.goedgekeurdExcl}
          readOnly={readOnly}
          bezig={bezig}
          onVerreken={verreken}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex w-full items-center justify-between">
            <span>Meerwerk</span>
            <div className="flex items-center gap-2">
              {/* Ook op een afgesloten dossier: een overzicht opvragen is lezen, geen wijziging. */}
              <Button variant="secondary" onClick={pdfOverzicht} disabled={bezig}>
                Overzicht (PDF)
              </Button>
              {!readOnly && (
                <Button variant="primary" onClick={() => setFormOpen(o => !o)} disabled={bezig}>
                  {formOpen ? 'Annuleren' : 'Nieuwe meerwerkregel'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {formOpen && (
            <div className="mb-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                  Omschrijving
                  <Input value={nieuw.omschrijving} onChange={e => setNieuw({ ...nieuw, omschrijving: e.target.value })} placeholder="Naam van het meerwerk" />
                </label>
                <label className="text-[12px] font-medium text-neutral-700">
                  Afrekenwijze
                  <select className={`${selectCls} mt-1 w-full`} value={nieuw.afrekenwijze}
                    onChange={e => setNieuw({ ...nieuw, afrekenwijze: e.target.value as MeerwerkAfrekenwijze })}>
                    <option value="aangenomen">Aangenomen</option>
                    <option value="regie">Regie</option>
                  </select>
                </label>
                <label className="text-[12px] font-medium text-neutral-700">
                  BTW %
                  <Input inputMode="decimal" value={ruw.btw_pct} placeholder="21"
                    onChange={e => setRuw({ ...ruw, btw_pct: e.target.value })} />
                </label>
                <label className="col-span-2 flex items-center gap-2 text-[12px] font-medium text-neutral-700">
                  <input type="checkbox" checked={nieuw.is_stelpost ?? false}
                    onChange={e => setNieuw({ ...nieuw, is_stelpost: e.target.checked, stelpost_grondslag: e.target.checked ? 'eenheidsprijzen' : null })} />
                  Stelpost
                </label>
                {nieuw.is_stelpost && (
                  <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                    Stelpost-grondslag
                    <select className={`${selectCls} mt-1 w-full`} value={nieuw.stelpost_grondslag ?? 'eenheidsprijzen'}
                      onChange={e => setNieuw({ ...nieuw, stelpost_grondslag: e.target.value as NieuweMeerwerkData['stelpost_grondslag'] })}>
                      <option value="eenheidsprijzen">Op eenheidsprijzen</option>
                      <option value="geboekte_kosten">Op geboekte kosten</option>
                    </select>
                  </label>
                )}
                {nieuw.is_stelpost && nieuw.stelpost_grondslag === 'eenheidsprijzen' ? (
                  <>
                    <label className="text-[12px] font-medium text-neutral-700">
                      Eenheid
                      <Input value={nieuw.eenheid ?? ''} placeholder="m², st, …" onChange={e => setNieuw({ ...nieuw, eenheid: e.target.value || null })} />
                    </label>
                    <label className="text-[12px] font-medium text-neutral-700">
                      Eenheidsprijs (excl. btw)
                      <Input inputMode="decimal" value={ruw.eenheidsprijs}
                        onChange={e => setRuw({ ...ruw, eenheidsprijs: e.target.value })} />
                    </label>
                  </>
                ) : (nieuw.afrekenwijze === 'aangenomen' && !nieuw.is_stelpost) ? (
                  <label className="text-[12px] font-medium text-neutral-700">
                    Bedrag (excl. btw)
                    <Input inputMode="decimal" value={ruw.bedrag_excl_btw}
                      onChange={e => setRuw({ ...ruw, bedrag_excl_btw: e.target.value })} />
                  </label>
                ) : (
                  <div className="text-[11px] text-neutral-500 self-end pb-2">Bedrag wordt live berekend uit geboekte uren/kosten op de bewakingscode.</div>
                )}
                <label className="col-span-2 text-[12px] font-medium text-neutral-700">
                  Factuurreferentie (optioneel)
                  <Input value={nieuw.factuurreferentie ?? ''} onChange={e => setNieuw({ ...nieuw, factuurreferentie: e.target.value || null })} />
                </label>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" onClick={voegToe} disabled={bezig}>Toevoegen</Button>
              </div>
            </div>
          )}

          {data.regels.length > 0 && (
            <div className="mb-3 flex items-center gap-3">
              <div className="w-full max-w-[320px]">
                <Input inputSize="sm" value={zoek} onChange={e => setZoek(e.target.value)}
                  placeholder="Zoek op nummer, omschrijving, referentie, status…"
                  aria-label="Zoeken in meerwerkregels"
                  onKeyDown={e => { if (e.key === 'Escape') setZoek('') }}
                  prefix={<Search size={14} />}
                  suffix={gefilterd ? (
                    <button type="button" className="text-neutral-400 hover:text-neutral-700" onClick={() => setZoek('')} aria-label="Zoekopdracht wissen">
                      <X size={14} />
                    </button>
                  ) : undefined} />
              </div>
              {gefilterd && (
                <span className="text-[12px] text-neutral-500">
                  {zichtbareRegels.length} van {data.regels.length} regels
                </span>
              )}
            </div>
          )}

          {/* Scrollen in plaats van knijpen: de drie keuzelijsten houden hun breedte, dus zonder
              minimumbreedte werd de actiekolom in een smal venster tot onleesbaar samengeperst en
              viel "Uit offerte" buiten de kaart. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 px-2">Omschrijving</th>
                  <th className="py-1.5 px-2">Status</th>
                  <th className="py-1.5 px-2">Afreken.</th>
                  <th className="py-1.5 px-2">Bewakingscode</th>
                  <th className="py-1.5 px-2">Termijn</th>
                  <th className="py-1.5 px-2 text-right">Excl. btw</th>
                  <th className="py-1.5 px-2 text-right">Incl. btw</th>
                  <th className="py-1.5 pl-2 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {/* Nog geen regels: de kolommen blijven staan met een nulregel, zodat zichtbaar
                    is wat een meerwerkregel vastlegt. */}
                {data.regels.length === 0 && (
                  <tr className="border-b border-neutral-100 text-[12.5px] text-neutral-400">
                    <td className="py-2 pr-2">—</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(0)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{fmt(0)}</td>
                    <td className="py-2 pl-2 text-right">—</td>
                  </tr>
                )}
                {gefilterd && zichtbareRegels.length === 0 && (
                  <tr className="border-b border-neutral-100 text-[12.5px] text-neutral-500">
                    <td className="py-3 text-center" colSpan={9}>Geen meerwerkregels gevonden voor “{zoek.trim()}”.</td>
                  </tr>
                )}
                {zichtbareRegels.map(r => {
                  const uitBouw7 = r.bron === 'bouw7_line'
                  const bewerkbaar = !readOnly && !uitBouw7
                  const bedragBewerkbaar = bewerkbaar && r.afrekenwijze === 'aangenomen' && !r.is_stelpost
                  const oudBedrag = r.bedrag_excl_btw != null ? Number(r.bedrag_excl_btw) : null
                  return (
                  <tr key={r.id} className="border-b border-neutral-100 text-[12.5px] align-top">
                    <td className="py-2 pr-2 tabular-nums text-neutral-500">
                      MW{String(r.volgnummer).padStart(2, '0')}
                      {r.bouw7_nummer && <div className="text-[10px] text-success-600" title="Gekoppeld aan Bouw7">↳ {r.bouw7_nummer}</div>}
                      {uitBouw7 && <div className="text-[9.5px] uppercase tracking-wide text-neutral-400">uit Bouw7</div>}
                    </td>
                    <td className="py-2 px-2">
                      {bewerkbaar ? (
                        <div className="space-y-1">
                          <input className={inlineInputCls} defaultValue={r.omschrijving} disabled={bezig}
                            onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.omschrijving) wijzigVeld(r.id, { omschrijving: v }) }} />
                          <input className={`${inlineInputCls} text-[11px]`} defaultValue={r.factuurreferentie ?? ''} placeholder="Factuurreferentie" disabled={bezig}
                            onBlur={e => { const v = e.target.value.trim() || null; if (v !== (r.factuurreferentie ?? null)) wijzigVeld(r.id, { factuurreferentie: v }) }} />
                          {r.is_stelpost && (
                            <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                              stelpost · {r.stelpost_grondslag === 'geboekte_kosten' ? 'geboekte kosten' : 'eenheidsprijzen'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="text-neutral-800">{r.omschrijving}</div>
                          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                            {r.is_stelpost ? `stelpost · ${r.stelpost_grondslag === 'geboekte_kosten' ? 'geboekte kosten' : 'eenheidsprijzen'}` : ''}
                            {r.factuurreferentie ? `${r.is_stelpost ? ' · ' : ''}ref: ${r.factuurreferentie}` : ''}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {readOnly ? (
                        <Badge tone={STATUS_TONE[r.status]} size="sm">{meerwerkStatusLabels[r.status]}</Badge>
                      ) : (
                        <select className={`${selectStatusBase} ${STATUS_SELECT_TONE[r.status]}`} value={r.status} disabled={bezig}
                          onChange={e => { if (e.target.value !== r.status) wijzigStatus(r, e.target.value as MeerwerkStatus) }}>
                          {(Object.keys(meerwerkStatusLabels) as MeerwerkStatus[]).map(s => (
                            <option key={s} value={s}>{meerwerkStatusLabels[s]}</option>
                          ))}
                        </select>
                      )}
                      {/* Wie keurde goed of af, en wanneer. Bij een besluit uit het
                          klantportaal staat hier de naam van de opdrachtgever. */}
                      {r.besluit_op && (
                        <div className="mt-0.5 text-[10.5px] leading-tight text-neutral-400">
                          {r.besluit_door_naam ?? 'onbekend'}
                          <span className="block">
                            {new Date(r.besluit_op).toLocaleString('nl-NL', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {r.besluit_door_soort === 'klant' && ' · via het klantportaal'}
                          </span>
                          {r.besluit_opmerking && (
                            <span className="block italic">{'“'}{r.besluit_opmerking}{'”'}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {readOnly ? (
                        <span className="text-neutral-700">{r.afrekenwijze === 'regie' ? 'Regie' : 'Aangenomen'}</span>
                      ) : (
                      <select className={selectCls} value={r.afrekenwijze} disabled={bezig}
                        onChange={e => wijzigVeld(r.id, { afrekenwijze: e.target.value as MeerwerkAfrekenwijze })}>
                        <option value="aangenomen">Aangenomen</option>
                        <option value="regie">Regie</option>
                      </select>
                      )}
                    </td>
                    <td className="py-2 px-2 text-neutral-700">
                      {r.bewakingscode ?? '—'}
                      {r.bewakingscode && r.bouw7_chapter_id == null && (
                        <span className="ml-1 text-[10px] text-warning-700">(nog niet in Bouw7)</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {readOnly ? (
                        <span className="text-neutral-700">
                          {r.termijn_wijze === 'een_regel' ? 'Volg offerte termijnstaat'
                            : r.termijn_wijze === 'een_termijn' ? '1 termijn 100%'
                            : r.termijn_wijze === 'eigen_termijnstaat' ? 'Eigen termijnstaat' : '—'}
                        </span>
                      ) : (
                      <select className={selectCls} value={r.termijn_wijze ?? ''} disabled={bezig}
                        onChange={e => wijzigVeld(r.id, { termijn_wijze: (e.target.value || null) as MeerwerkTermijnWijze | null })}>
                        <option value="" disabled>—</option>
                        {/* Wijzigen zet de termijnen meteen in de Bouw7-termijnstaat (of herschikt
                            ze), mits het meerwerk akkoord is; zie updateMeerwerkRegel. */}
                        <option value="een_termijn">1 termijn 100%</option>
                        {/* Waarde blijft 'een_regel': het meerwerk volgt het betalingsschema van
                            zijn eigen offerte; dat zijn er vaak meer dan één. */}
                        <option value="een_regel">Volg offerte termijnstaat</option>
                        {/* Niet meer te kiezen, maar oude regels moeten hun waarde blijven tonen. */}
                        {r.termijn_wijze === 'eigen_termijnstaat' && <option value="eigen_termijnstaat" disabled>Eigen termijnstaat</option>}
                      </select>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-neutral-900">
                      {bedragBewerkbaar ? (
                        <input className={`${inlineInputCls} text-right`} inputMode="decimal" defaultValue={r.bedrag_excl_btw ?? ''} disabled={bezig}
                          onBlur={e => { const v = naarGetal(e.target.value); if (v !== oudBedrag) wijzigVeld(r.id, { bedrag_excl_btw: v }) }} />
                      ) : (
                        fmt(r.effectiefExcl)
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-500">{fmt(r.effectiefIncl)}</td>
                    {/*
                      De acties stonden op één regel (`whitespace-nowrap`) met een punt ertussen. In een
                      smal venster kneep de browser deze kolom dan samen tot losse letters die buiten de
                      kaart vielen -- de tabel heeft negen kolommen en drie daarvan zijn keuzelijsten die
                      hun breedte houden. Ze mogen nu afbreken; de scheidingspunten zijn daarmee
                      overbodig en zouden bij een afbreking aan een regeleinde blijven hangen.
                    */}
                    <td className="py-2 pl-2">
                      {readOnly ? (
                        <span className="block text-right text-neutral-300">—</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
                          {!r.bouw7_line_id && (
                            <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig}
                              onClick={() => naarBouw7(r)}>Naar Bouw7</button>
                          )}
                          <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig}
                            onClick={() => calculatie(r)}>
                            Calculatie
                          </button>
                          {r.quote_id && (
                            <button className="text-[11px] font-medium text-brand-600 hover:underline" disabled={bezig}
                              onClick={() => openOfferte(r)}>Open offerte</button>
                          )}
                          <button className="text-[11px] font-medium text-error-600 hover:underline" disabled={bezig}
                            onClick={() => verwijder(r)}>Verwijder</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {/* Het goedgekeurde totaal blijft over het héle dossier gaan; bij een zoekopdracht
                    staat de som van de gevonden regels er apart boven, zodat niemand een deeltotaal
                    voor het dossiertotaal aanziet. */}
                {gefilterd && zichtbareRegels.length > 0 && (
                  <tr className="text-[12.5px] text-neutral-600">
                    <td className="pt-2.5" colSpan={6}>Gevonden regels ({zichtbareRegels.length}), alle statussen</td>
                    <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(zichtbareRegels.reduce((s, r) => s + r.effectiefExcl, 0))}</td>
                    <td className="pt-2.5 px-2 text-right tabular-nums text-neutral-500">{fmt(zichtbareRegels.reduce((s, r) => s + r.effectiefIncl, 0))}</td>
                    <td />
                  </tr>
                )}
                <tr className="text-[12.5px] font-bold text-neutral-900">
                  <td className="pt-2.5" colSpan={6}>Goedgekeurd meerwerk (akkoord + voltooid)</td>
                  <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(data.totalen.goedgekeurdExcl)}</td>
                  <td className="pt-2.5 px-2 text-right tabular-nums text-neutral-500">{fmt(data.totalen.goedgekeurdIncl)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
          {data.regels.length === 0 && (
            <p className="mt-3 text-[12px] text-neutral-500">Nog geen meerwerkregels op dit dossier.</p>
          )}
          <p className="mt-4 text-[11px] text-neutral-500">
            Meerwerkregels uit Bouw7 worden automatisch geïmporteerd (herkenbaar aan “uit Bouw7”). Bij die regels is Bouw7 leidend
            voor omschrijving, bedrag en status; die worden bij elke sync bijgewerkt en zijn hier daarom niet bewerkbaar.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
