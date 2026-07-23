'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { Loader2, ChevronLeft, Clock, ClipboardCheck, Send, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import {
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie,
  getWerkbegrotingRegels, getWerkbegrotingComponenten,
  getWerkbegrotingWijzigingen, hydrateWerkbegroting,
  slaWerkbegrotingOp, slaWerkbegrotingComponentOp, getScenarios,
} from '@/lib/everts-calc/local-store'
import { previewWerkbegrotingPrognoseBouw7, resolveBewakingscodes, getProjectHoofdstukken, syncWerkbegrotingNaarSupabase, accordeerWerkbegroting, getWerkbegrotingGoedkeuringStatus, laadWerkbegrotingSnapshot, magPrognoseSturen, laadPrognoseDoelHoofdstuk, bewaarPrognoseDoelHoofdstuk, getVergrendeldeBewakingscodes, previewWerkbegrotingBestelregelsBouw7, stuurWerkbegrotingBestelEnPrognoseBouw7, type PrognoseResultaat, type PrognoseRegel, type WerkbegrotingPrognoseTotalen, type WerkbegrotingCodeTotaal, type Hoofdstuk, type WerkbegrotingPayload, type BestelregelPreviewResultaat, type BestelregelPlanRegel, type BestelEnPrognoseResultaat } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { vraagGoedkeuringAan, getGoedkeuring } from '@/lib/goedkeuring/actions'
import type { Werkbegroting } from '@/lib/everts-calc/types'
import WerkbegrotingGrid from './WerkbegrotingGrid'
import GoedkeuringPaneel from '@/components/goedkeuring/GoedkeuringPaneel'
import BestellingenPaneel from './BestellingenPaneel'
import { X, ClipboardCheck as ClipboardIcon, Package } from 'lucide-react'

interface Props {
  projectId: string
  projectNaam: string
  projectNummer: string
  projectStatus: string
  /** Dossier-id van de opdracht — nodig om bij goedkeuring een controletaak aan te maken. */
  dossierId?: string
  ingesloten?: boolean
}

export default function WerkbegrotingHoofdscherm({ projectId, projectNaam, projectNummer, projectStatus, dossierId, ingesloten = false }: Props) {
  const [wb, setWb] = useState<Werkbegroting | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  /** True zolang de gedeelde werkbegroting uit Supabase wordt geladen. */
  const [initBezig, setInitBezig] = useState(true)
  /** Mag de ingelogde gebruiker de prognose naar Bouw7 sturen (controller/directie)? */
  const [magPrognose, setMagPrognose] = useState(false)
  const [refreshTeller, setRefreshTeller] = useState(0)
  const [goedkeuringOpen, setGoedkeuringOpen] = useState(false)
  const [bestellingenOpen, setBestellingenOpen] = useState(false)
  /** Aantal actieve regels dat (nog) niet geaccordeerd is (server-side berekend). */
  const [nietGeaccordeerd, setNietGeaccordeerd] = useState<number>(0)
  /** True als alle actieve regels onder de laatste accordering vallen (server-side berekend). Gate voor de prognose. */
  const [volledigGoedgekeurd, setVolledigGoedgekeurd] = useState(false)
  /** True als er een open goedkeuringsaanvraag is die de ingelogde gebruiker mag accorderen (controller/Directie). */
  const [magGoedkeuren, setMagGoedkeuren] = useState(false)
  /**
   * Status van de actuele goedkeuringsronde uit Supabase (null = nog nooit aangevraagd).
   * Dit is de waarheid voor de header — `wb.status` is client-lokaal en blijft op andere
   * apparaten op 'definitief' staan omdat de accordering die kolom niet terugschrijft.
   */
  const [goedkeuringStatus, setGoedkeuringStatus] = useState<string | null>(null)
  /** Eén gecombineerde "Naar Bouw7"-modal: stuurt bestelregels én prognose in één keer. */
  const [bouw7Open, setBouw7Open] = useState(false)
  const [bouw7Bezig, setBouw7Bezig] = useState(false)
  const [prognosePreview, setPrognosePreview] = useState<PrognoseResultaat | null>(null)
  /** Bouw7-bewakingscodes van het gekoppelde project (null = niet gekoppeld / nog niet geladen). */
  const [bewakingscodes, setBewakingscodes] = useState<{ code: string; naam: string | null }[] | null>(null)
  /** Bestaande Bouw7-hoofdstukken + het gekozen doelhoofdstuk voor nieuwe codes (onthouden per dossier). */
  const [hoofdstukken, setHoofdstukken] = useState<Hoofdstuk[]>([])
  const [doelHoofdstukId, setDoelHoofdstukId] = useState<number | null>(null)
  /** Kale bewakingscodes waarop al inkoop verbruikt is → regels in de grid worden read-only. */
  const [vergrendeldeCodes, setVergrendeldeCodes] = useState<string[]>([])
  const [bestelPreview, setBestelPreview] = useState<BestelregelPreviewResultaat | null>(null)

  /** Directe (niet-gedebouncede) sync van een vers/lokaal aangemaakte WB → meteen gedeeld. */
  const syncWbNu = useCallback(async (w: Werkbegroting) => {
    if (!dossierId) return
    const regels = getWerkbegrotingRegels(w.id)
    const regelIds = new Set(regels.map(r => r.id))
    const componenten = getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id))
    const wijzigingen = getWerkbegrotingWijzigingen().filter(x => x.werkbegroting_id === w.id)
    await syncWerkbegrotingNaarSupabase({ wb: w, regels, componenten, wijzigingen, dossierId }).catch(() => {})
  }, [dossierId])

  // Laden: de werkbegroting is gedeeld — Supabase is de bron van waarheid. Op een
  // apparaat zonder de lokale calculatie wordt hij uit Supabase gehydrateerd; bestaat
  // er nog geen gedeelde WB, dan wordt hij lokaal uit de calculatie aangemaakt en
  // meteen gesynct zodat collega's hem ook zien.
  useEffect(() => {
    const toegestaneStatussen = ['gewonnen', 'opdracht', 'uitvoering', 'afgerond']
    if (!toegestaneStatussen.includes(projectStatus)) { setInitBezig(false); return }

    let actief = true
    setInitBezig(true)
    ;(async () => {
      if (dossierId) {
        try {
          const snap = await laadWerkbegrotingSnapshot(dossierId)
          if (!actief) return
          if (snap) {
            hydrateWerkbegroting(snap)
            setScenarioId(snap.wb.scenario_id)
            setWb(snap.wb)
            setInitBezig(false)
            return
          }
        } catch { /* val terug op lokaal aanmaken */ }
        if (!actief) return
      }

      // Nog geen gedeelde WB → lokaal uit de calculatie (vereist de calculatie op dit apparaat).
      const scenarios = getScenarios(projectId)
      const standaard = scenarios.find(s => s.is_standaard) ?? scenarios[0]
      if (!standaard) { setInitBezig(false); return }
      setScenarioId(standaard.id)
      const bestaand = getWerkbegrotingVoorScenario(standaard.id)
      const w = bestaand ?? maakWerkbegrotingVanCalculatie(projectId, standaard.id)
      setWb(w)
      setInitBezig(false)
      void syncWbNu(w)
    })()

    return () => { actief = false }
  }, [projectId, projectStatus, dossierId, syncWbNu])

  // Prognose-recht (controller/directie) bepalen voor de knop-zichtbaarheid.
  useEffect(() => {
    if (!dossierId) { setMagPrognose(false); return }
    let actief = true
    magPrognoseSturen(dossierId)
      .then(m => { if (actief) setMagPrognose(m) })
      .catch(() => { if (actief) setMagPrognose(false) })
    return () => { actief = false }
  }, [dossierId])

  // Bewakingscodes van het gekoppelde Bouw7-project ophalen → kostengroep-picker + prognose-match.
  useEffect(() => {
    if (!dossierId) { setBewakingscodes(null); return }
    let actief = true
    resolveBewakingscodes(dossierId)
      .then(res => { if (actief) setBewakingscodes(res.ok ? res.codes.map(c => ({ code: c.code, naam: c.naam })) : null) })
      .catch(() => { if (actief) setBewakingscodes(null) })
    return () => { actief = false }
  }, [dossierId])

  // Vergrendelde (bestelde) bewakingscodes ophalen → grid maakt die regels read-only.
  useEffect(() => {
    if (!dossierId) { setVergrendeldeCodes([]); return }
    let actief = true
    getVergrendeldeBewakingscodes(dossierId)
      .then(res => { if (actief) setVergrendeldeCodes(res.ok ? res.codes : []) })
      .catch(() => { if (actief) setVergrendeldeCodes([]) })
    return () => { actief = false }
  }, [dossierId])

  /** Volledige client-toestand van de werkbegroting opbouwen voor sync + gates. */
  const bouwPayload = useCallback((): WerkbegrotingPayload | null => {
    if (!wb) return null
    const regels = getWerkbegrotingRegels(wb.id)
    const regelIds = new Set(regels.map(r => r.id))
    const componenten = getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id))
    const wijzigingen = getWerkbegrotingWijzigingen().filter(w => w.werkbegroting_id === wb.id)
    return { wb, regels, componenten, wijzigingen, dossierId: dossierId ?? null }
  }, [wb, dossierId])

  /** Regel-goedkeuringsstatus verversen (badges + headerteller). */
  const verversStatus = useCallback(async () => {
    if (!wb) return
    try {
      const status = await getWerkbegrotingGoedkeuringStatus(wb.id)
      setNietGeaccordeerd(status.regels.filter(r => !r.goedgekeurd).length)
      setVolledigGoedgekeurd(status.volledigGoedgekeurd)
    } catch { /* stil */ }
    try {
      const overzicht = await getGoedkeuring('werkbegroting', wb.id)
      setGoedkeuringStatus(overzicht.actueel?.status ?? null)
      setMagGoedkeuren(overzicht.actueel?.status === 'aangevraagd' && overzicht.magBeoordelen)
    } catch { /* stil */ }
  }, [wb])

  // Debounced sync na wijzigingen — houdt Supabase (bron voor de gates) actueel.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleWijziging = useCallback(() => {
    setRefreshTeller(t => t + 1)
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      const payload = bouwPayload()
      if (payload) { await syncWerkbegrotingNaarSupabase(payload); await verversStatus() }
    }, 2000)
  }, [bouwPayload, verversStatus])

  useEffect(() => { verversStatus() }, [verversStatus, wb])

  const totaalBedrag = useMemo(() => {
    if (!wb) return 0
    const regels = getWerkbegrotingRegels(wb.id)
    const regelIds = new Set(regels.map(r => r.id))
    const componenten = getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id) && !c.is_verwijderd)
    return componenten.reduce((sum, comp) => {
      const regel = regels.find(r => r.id === comp.werkbegroting_regel_id)
      if (!regel) return sum
      return sum + regel.hoeveelheid * comp.norm_hoeveelheid * comp.tarief
    }, 0)
  }, [wb, refreshTeller])

  /**
   * Wat de goedkeuringsknop en de statuschip tonen. Afgeleid van de goedkeuringsronde in
   * Supabase (plus de regel-hashes), niet van de lokale `wb.status` — die loopt achter.
   */
  const goedkeuringWeergave = useMemo(() => {
    if (goedkeuringStatus === 'aangevraagd') {
      return { label: 'Ter beoordeling', chip: 'Ter beoordeling', chipCls: 'bg-blue-100 text-blue-700',
        knopCls: 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' }
    }
    if (goedkeuringStatus === 'goedgekeurd') {
      return volledigGoedgekeurd
        ? { label: 'Goedgekeurd', chip: 'Goedgekeurd', chipCls: 'bg-green-100 text-green-700',
            knopCls: 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100' }
        : { label: 'Gewijzigd na goedkeuring', chip: 'Gewijzigd na goedkeuring', chipCls: 'bg-amber-100 text-amber-700',
            knopCls: 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' }
    }
    if (goedkeuringStatus === 'afgekeurd') {
      return { label: 'Teruggestuurd', chip: 'Teruggestuurd', chipCls: 'bg-red-100 text-red-700',
        knopCls: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100' }
    }
    return { label: 'Goedkeuring aanvragen', chip: 'Nog niet aangevraagd', chipCls: 'bg-slate-100 text-slate-600',
      knopCls: 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50' }
  }, [goedkeuringStatus, volledigGoedgekeurd])

  /** Werkbegroting-totalen per bewakingscode (= regel.kostengroep), gesplitst per component-type. */
  const berekenPrognoseTotalen = useCallback((): WerkbegrotingPrognoseTotalen => {
    if (!wb) return []
    const regels = getWerkbegrotingRegels(wb.id)
    const regelById = new Map(regels.map(r => [r.id, r]))
    const regelIds = new Set(regels.map(r => r.id))
    const componenten = getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id) && !c.is_verwijderd)
    const perCode = new Map<string, WerkbegrotingCodeTotaal>()
    const ensure = (code: string, naam: string | null): WerkbegrotingCodeTotaal => {
      const key = `${code}${naam ?? ''}`
      let t = perCode.get(key)
      if (!t) { t = { code, naam }; perCode.set(key, t) }
      return t
    }
    for (const comp of componenten) {
      const regel = regelById.get(comp.werkbegroting_regel_id)
      if (!regel) continue
      const code = bareCode(regel.kostengroep)
      const naam = kgNaam(regel.kostengroep)
      const hoeveelheid = regel.hoeveelheid * comp.norm_hoeveelheid
      const bedrag = hoeveelheid * comp.tarief
      const t = ensure(code, naam)
      if (comp.type === 'arbeid') { t.arbeid = t.arbeid ?? { bedrag: 0, uren: 0 }; t.arbeid.bedrag += bedrag; t.arbeid.uren += hoeveelheid }
      else if (comp.type === 'onderaanneming') { t.onderaanneming = t.onderaanneming ?? { bedrag: 0 }; t.onderaanneming.bedrag += bedrag }
      else if (comp.type === 'materieel') { t.materieel = t.materieel ?? { bedrag: 0 }; t.materieel.bedrag += bedrag }
    }
    return [...perCode.values()]
  }, [wb])

  /**
   * Bestelregel-koppelingen (bouw7_line_id) lokaal + gedeeld bijwerken na een push. Óók bij een
   * halve mislukking: regels die vóór de fout zijn aangemaakt staan al in Bouw7, dus hun id moet
   * bewaard blijven — anders schrijft de volgende sync het oude/lege id terug en ontstaan duplicaten.
   */
  const patchBestelLineIds = useCallback(async (bestel: BestelEnPrognoseResultaat['bestelregels']) => {
    if (!bestel) return
    const comps = getWerkbegrotingComponenten()
    let gewijzigd = false
    for (const [compId, lineId] of Object.entries(bestel.lineIdPerComponent)) {
      const c = comps.find(x => x.id === compId)
      if (c && c.bouw7_line_id !== lineId) { slaWerkbegrotingComponentOp({ ...c, bouw7_line_id: lineId }); gewijzigd = true }
    }
    for (const compId of bestel.gewisteComponenten) {
      const c = comps.find(x => x.id === compId)
      if (c && c.bouw7_line_id != null) { slaWerkbegrotingComponentOp({ ...c, bouw7_line_id: undefined }); gewijzigd = true }
    }
    if (gewijzigd) { const p = bouwPayload(); if (p) await syncWerkbegrotingNaarSupabase(p) }
  }, [bouwPayload])

  // ─── Naar Bouw7: bestelregels ("verwachte kosten") + prognose ("niet/anders begroot") ────────
  const openBouw7 = useCallback(async () => {
    if (!dossierId) return
    const payload = bouwPayload()
    if (!payload) return
    setBouw7Open(true)
    setBestelPreview(null)
    setPrognosePreview(null)
    setBouw7Bezig(true)
    try {
      const [bestel, prognose, hs, opgeslagen] = await Promise.all([
        previewWerkbegrotingBestelregelsBouw7(dossierId, payload),
        previewWerkbegrotingPrognoseBouw7(dossierId, berekenPrognoseTotalen()),
        getProjectHoofdstukken(dossierId),
        laadPrognoseDoelHoofdstuk(dossierId),
      ])
      setBestelPreview(bestel)
      setPrognosePreview(prognose)
      if (hs.ok) {
        setHoofdstukken(hs.hoofdstukken)
        const geldig = opgeslagen != null && hs.hoofdstukken.some(h => h.id === opgeslagen)
        const wbHs = hs.hoofdstukken.find(h => h.naam.trim().toUpperCase() === 'WB')
        setDoelHoofdstukId(geldig ? opgeslagen : (wbHs?.id ?? hs.hoofdstukken[0]?.id ?? null))
      }
    } finally {
      setBouw7Bezig(false)
    }
  }, [dossierId, bouwPayload, berekenPrognoseTotalen])

  const verstuurBouw7 = useCallback(async () => {
    if (!dossierId) return
    const payload = bouwPayload()
    if (!payload) return
    setBouw7Bezig(true)
    try {
      if (doelHoofdstukId != null) await bewaarPrognoseDoelHoofdstuk(dossierId, doelHoofdstukId)
      const res = await stuurWerkbegrotingBestelEnPrognoseBouw7(dossierId, payload, doelHoofdstukId)
      await patchBestelLineIds(res.bestelregels)
      if (res.ok) {
        toast.success(`Naar Bouw7: ${res.melding}`)
        if (res.fouten.length) toast(`Let op: ${res.fouten[0]}${res.fouten.length > 1 ? ` (+${res.fouten.length - 1} meer)` : ''}`, { icon: '⚠️' })
        // Vergrendelde codes kunnen veranderd zijn (nieuwe inkoop) — verversen.
        getVergrendeldeBewakingscodes(dossierId).then(r => { if (r.ok) setVergrendeldeCodes(r.codes) }).catch(() => {})
        setBouw7Open(false)
      } else {
        toast.error(`Naar Bouw7 mislukt: ${res.fouten.join(' · ') || res.melding}`)
      }
    } finally {
      setBouw7Bezig(false)
    }
  }, [dossierId, bouwPayload, doelHoofdstukId, patchBestelLineIds])

  // Goedkeuring aanvragen: eerst de payload syncen zodat de aanvraag op echte data slaat.
  const handleAanvragen = useCallback(async (toelichting?: string) => {
    if (!wb) return { ok: false, error: 'Geen werkbegroting geladen.' }
    const payload = bouwPayload()
    if (payload) await syncWerkbegrotingNaarSupabase(payload)
    const res = await vraagGoedkeuringAan({ objectType: 'werkbegroting', objectId: wb.id, dossierId: dossierId ?? null, toelichting })
    if (res.ok) {
      const bij: Werkbegroting = { ...wb, status: 'definitief', bijgewerkt_op: new Date().toISOString() }
      slaWerkbegrotingOp(bij); setWb(bij)
    }
    return res.ok ? { ok: true } : { ok: false, error: res.error }
  }, [wb, dossierId, bouwPayload])

  // Accorderen: payload + snapshot via de server-action, dan lokaal 'geaccordeerd' markeren.
  const handleAccorderen = useCallback(async (goedkeuringId: string, opmerking?: string) => {
    if (!wb) return { ok: false, error: 'Geen werkbegroting geladen.' }
    const payload = bouwPayload()
    if (!payload) return { ok: false, error: 'Kon werkbegroting niet opbouwen.' }
    const doelHoofdstukId = dossierId ? await laadPrognoseDoelHoofdstuk(dossierId) : null
    const res = await accordeerWerkbegroting(goedkeuringId, payload, opmerking, doelHoofdstukId)
    if (res.ok) {
      const bij: Werkbegroting = { ...wb, status: 'geaccordeerd', bijgewerkt_op: new Date().toISOString() }
      slaWerkbegrotingOp(bij); setWb(bij)
      await verversStatus()
      // Auto naar Bouw7 (bestelregels + prognose) — alleen bij accorderen door controller/directie.
      if (res.bouw7) {
        if (res.bouw7.ok) toast.success(`Naar Bouw7: ${res.bouw7.melding}`)
        else toast(`Naar Bouw7: ${res.bouw7.melding}`, { icon: '⚠️' })
        if (res.bouw7.fouten.length) toast(`Let op: ${res.bouw7.fouten[0]}${res.bouw7.fouten.length > 1 ? ` (+${res.bouw7.fouten.length - 1} meer)` : ''}`, { icon: '⚠️' })
        await patchBestelLineIds(res.bouw7.bestelregels)
      }
      return { ok: true }
    }
    return res
  }, [wb, bouwPayload, verversStatus, dossierId, patchBestelLineIds])

  const toegestaneStatussen = ['gewonnen', 'opdracht', 'uitvoering', 'afgerond']
  const magAanmaken = toegestaneStatussen.includes(projectStatus)

  if (!magAanmaken) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-500">
        <Clock className="w-10 h-10 text-slate-300" />
        <div className="text-center">
          <p className="font-semibold text-slate-700">Werkbegroting nog niet beschikbaar</p>
          <p className="text-sm mt-1">De werkbegroting kan pas aangemaakt worden nadat de offerte gewonnen is.</p>
        </div>
        <Link href="/aanvragen" className="text-sm text-everts hover:underline">
          Terug naar aanvragen
        </Link>
      </div>
    )
  }

  if (!wb || !scenarioId) {
    if (initBezig) {
      return (
        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Werkbegroting laden…
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <Clock className="w-10 h-10 text-slate-300" />
        <div className="text-center">
          <p className="font-semibold text-slate-700">Nog geen werkbegroting</p>
          <p className="text-sm mt-1">Er is voor dit dossier nog geen werkbegroting aangemaakt. De calculator maakt deze aan vanuit de calculatie.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={ingesloten ? 'flex flex-col h-full overflow-hidden bg-slate-50' : 'fixed inset-x-0 top-14 bottom-0 flex flex-col z-30 bg-slate-50'}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        {!ingesloten && (
          <Link
            href="/aanvragen"
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Terug naar aanvragen"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 ">{projectNummer}</p>
          <h1 className="text-sm font-semibold text-slate-800 truncate">{projectNaam} — Werkbegroting</h1>
        </div>
        {nietGeaccordeerd > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700" title="Aantal regels met niet-geaccordeerde wijzigingen">
            {nietGeaccordeerd} niet geaccordeerd
          </span>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${goedkeuringWeergave.chipCls}`}>
          {goedkeuringWeergave.chip}
        </span>
        {magGoedkeuren ? (
          <button
            onClick={() => setGoedkeuringOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-green-600 text-white border border-green-600 hover:bg-green-700 shadow-sm"
            title="Deze werkbegroting goedkeuren"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            WB goedkeuren
          </button>
        ) : (
          <button
            onClick={() => setGoedkeuringOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${goedkeuringWeergave.knopCls}`}
            title="Goedkeuringsproces beheren"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            {goedkeuringWeergave.label}
          </button>
        )}
        <button
          onClick={() => setBestellingenOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          title="Bestellingen klaarzetten en verzenden"
        >
          <Package className="w-3.5 h-3.5" />
          Bestellingen
        </button>
        {magPrognose && (
          <button
            onClick={openBouw7}
            disabled={!dossierId || !volledigGoedgekeurd}
            title={
              !dossierId
                ? 'Geen dossier gekoppeld'
                : !volledigGoedgekeurd
                ? 'Eerst de werkbegroting (opnieuw) laten goedkeuren'
                : 'Stuur bestelregels (verwachte kosten) én prognose (niet/anders begroot) naar Bouw7'
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
              border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Naar Bouw7
          </button>
        )}
      </div>

      {/* Grid + totalen panel */}
      <div className="flex-1 overflow-hidden">
        <WerkbegrotingGrid
          werkbegrotingId={wb.id}
          scenarioId={scenarioId}
          onWijziging={handleWijziging}
          bewakingscodes={bewakingscodes}
          dossierId={dossierId}
          vergrendeldeCodes={vergrendeldeCodes}
        />
      </div>

      {goedkeuringOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setGoedkeuringOpen(false) }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <ClipboardIcon className="h-5 w-5 text-blue-700" />
                <h2 className="text-base font-bold text-gray-900">Goedkeuring werkbegroting</h2>
              </div>
              <button onClick={() => setGoedkeuringOpen(false)} className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
              <GoedkeuringPaneel
                objectType="werkbegroting"
                objectId={wb.id}
                dossierId={dossierId ?? null}
                totaalBedrag={totaalBedrag}
                aanvragen={handleAanvragen}
                accordeer={handleAccorderen}
                wijzigingsInfo={{ ongewijzigdSindsGoedkeuring: volledigGoedgekeurd, aantalGewijzigd: nietGeaccordeerd }}
                onVeranderd={verversStatus}
              />
            </div>
          </div>
        </div>
      )}

      {bestellingenOpen && (
        <BestellingenPaneel wb={wb} dossierId={dossierId ?? null} onSluit={() => setBestellingenOpen(false)} />
      )}

      {bouw7Open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !bouw7Bezig) setBouw7Open(false) }}
        >
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700">
                <Upload className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Naar Bouw7</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="mb-4 text-sm text-gray-600">
                In één handeling worden twee dingen naar Bouw7 geschreven: de <strong>bestelregels
                (&ldquo;verwachte kosten&rdquo;)</strong> per regel, en de <strong>prognose (&ldquo;niet/anders
                begroot&rdquo;)</strong> per bewakingscode. Dit zijn twee losse kolommen in Bouw7. Controleer
                hieronder vóór verzenden.
              </p>

              {/* Doelhoofdstuk voor nieuwe codes — gedeeld door beide helften. */}
              {((bestelPreview?.ok && bestelPreview.regels.some(r => r.actie === 'aanmaken')) ||
                (prognosePreview?.ok && prognosePreview.regels.some(r => r.actie === 'aanmaken' && r.nieuweCode))) && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                  <span className="text-xs font-medium text-amber-800">Nieuwe codes plaatsen onder hoofdstuk:</span>
                  <select
                    value={doelHoofdstukId ?? ''}
                    onChange={(e) => setDoelHoofdstukId(e.target.value ? Number(e.target.value) : null)}
                    className="rounded border border-amber-300 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    {hoofdstukken.length === 0 && <option value="">— geen hoofdstukken gevonden —</option>}
                    {hoofdstukken.map((h) => <option key={h.id} value={h.id}>{h.naam || `Hoofdstuk ${h.id}`}</option>)}
                  </select>
                </div>
              )}

              {bouw7Bezig && !bestelPreview && !prognosePreview && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Vergelijken met Bouw7…
                </div>
              )}

              {/* ── Bestelregels ("verwachte kosten") ── */}
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
                <Upload className="h-3.5 w-3.5" /> Bestelregels — verwachte kosten
              </h3>
              {bestelPreview && !bestelPreview.ok && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{bestelPreview.error}</div>
              )}
              {bestelPreview?.ok && (
                <div className="mb-5 overflow-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500">
                        <th className="py-1.5 pl-2">Regel</th>
                        <th className="py-1.5 text-right">Aantal</th>
                        <th className="py-1.5 text-right">Stukprijs</th>
                        <th className="py-1.5 text-right">Bedrag</th>
                        <th className="py-1.5 pr-2 text-right">Actie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groepeerBestelPerCode(bestelPreview.regels).map(([code, rs]) => (
                        <Fragment key={code || '∅'}>
                          <tr className="bg-gray-50">
                            <td colSpan={5} className="py-1 px-2 text-xs font-semibold text-gray-600">
                              {code ? code : 'Zonder bewakingscode'}
                              {rs[0]?.codeNaam && <span className="ml-1 font-normal text-gray-400">— {rs[0].codeNaam}</span>}
                              {rs[0]?.vergrendeld && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">🔒 besteld</span>}
                            </td>
                          </tr>
                          {rs.map((r) => (
                            <tr key={r.componentId} className={`border-b border-gray-100 ${r.actie === 'skip' ? 'text-gray-400' : 'text-gray-800'}`}>
                              <td className="py-1.5 pl-2">
                                <span className="text-gray-700">{r.omschrijving || r.label}</span>
                                <span className="ml-1 text-[11px] text-gray-400">({r.label})</span>
                                {r.actie === 'skip' && r.reden && <span className="ml-1 text-[11px] text-gray-400">— {r.reden}</span>}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{r.aantal}</td>
                              <td className="py-1.5 text-right tabular-nums">{euro(r.prijs)}</td>
                              <td className="py-1.5 text-right tabular-nums">{euro(r.bedrag)}</td>
                              <td className="py-1.5 pr-2 text-right">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${bestelActieStijl(r.actie)}`}>
                                  {bestelActieLabel(r.actie)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Prognose ("niet/anders begroot") ── */}
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <Send className="h-3.5 w-3.5" /> Prognose — niet/anders begroot
              </h3>
              {prognosePreview && !prognosePreview.ok && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{prognosePreview.error}</div>
              )}
              {prognosePreview?.ok && (
                <div className="overflow-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500">
                        <th className="py-1.5 pl-2">Kostensoort</th>
                        <th className="py-1.5 text-right">Begroot</th>
                        <th className="py-1.5 text-right">Meerwerk</th>
                        <th className="py-1.5 text-right">Werkbegroting</th>
                        <th className="py-1.5 pr-2 text-right">Niet/anders begroot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groepeerPerCode(prognosePreview.regels).map(([code, rs]) => (
                        <Fragment key={code || '∅'}>
                          <tr className="bg-gray-50">
                            <td colSpan={5} className="py-1 px-2 text-xs font-semibold text-gray-600">
                              {code ? code : 'Zonder bewakingscode'}
                              {rs[0]?.codeNaam && <span className="ml-1 font-normal text-gray-400">— {rs[0].codeNaam}</span>}
                            </td>
                          </tr>
                          {rs.map((r) => (
                            <tr key={`${code}-${r.type}`} className={`border-b border-gray-100 ${r.actie === 'skip' ? 'text-gray-400' : 'text-gray-800'}`}>
                              <td className="py-1.5 pl-2">
                                {r.label}
                                {r.actie === 'aanmaken' && (
                                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    {r.nieuweCode ? 'nieuwe code' : 'nieuw'}
                                  </span>
                                )}
                                {r.actie === 'skip' && r.reden && (
                                  <span className="ml-1 text-[11px] text-gray-400">— {r.reden}</span>
                                )}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">{euro(r.begroot)}</td>
                              <td className="py-1.5 text-right tabular-nums">{euro(r.meerwerk)}</td>
                              <td className="py-1.5 text-right tabular-nums">{euro(r.werkbegroting)}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">
                                {r.actie === 'skip' ? '—' : euro(r.verschil)}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setBouw7Open(false)}
                disabled={bouw7Bezig}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={verstuurBouw7}
                disabled={
                  bouw7Bezig ||
                  !(
                    (bestelPreview?.ok && bestelPreview.regels.some(r => r.actie !== 'skip')) ||
                    (prognosePreview?.ok && prognosePreview.regels.some(r => r.schrijfbaar))
                  )
                }
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bouw7Bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Verstuur naar Bouw7
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Euro-formattering voor de prognose-preview. */
function euro(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

/** Kostengroep → kale bewakingscode (strip een eventueel "— naam"-achtervoegsel). */
function bareCode(kostengroep?: string | null): string {
  return (kostengroep ?? '').split(/\s[—-]\s/)[0].trim()
}

/** Kostengroep → omschrijving-deel ("CODE — Naam" → "Naam"), of null. */
function kgNaam(kostengroep?: string | null): string | null {
  const d = (kostengroep ?? '').split(/\s[—-]\s/)
  return d.length > 1 ? (d.slice(1).join(' — ').trim() || null) : null
}

/** Groepeer bestelregels per bewakingscode (lege code achteraan). */
function groepeerBestelPerCode(regels: BestelregelPlanRegel[]): [string, BestelregelPlanRegel[]][] {
  const map = new Map<string, BestelregelPlanRegel[]>()
  for (const r of regels) {
    const arr = map.get(r.code) ?? []
    arr.push(r)
    map.set(r.code, arr)
  }
  return [...map.entries()].sort((a, b) => {
    if (!a[0]) return 1
    if (!b[0]) return -1
    return a[0].localeCompare(b[0], 'nl')
  })
}

/** Leesbaar label per bestelregel-actie. */
function bestelActieLabel(actie: BestelregelPlanRegel['actie']): string {
  switch (actie) {
    case 'aanmaken': return 'nieuw'
    case 'bijwerken': return 'bijwerken'
    case 'neutraliseren': return 'verwijderen'
    default: return 'overslaan'
  }
}

/** Badge-kleur per bestelregel-actie. */
function bestelActieStijl(actie: BestelregelPlanRegel['actie']): string {
  switch (actie) {
    case 'aanmaken': return 'bg-green-100 text-green-700'
    case 'bijwerken': return 'bg-blue-100 text-blue-700'
    case 'neutraliseren': return 'bg-rose-100 text-rose-700'
    default: return 'bg-slate-100 text-slate-500'
  }
}

/** Groepeer prognose-regels per bewakingscode, met de codes gesorteerd (lege code achteraan). */
function groepeerPerCode(regels: PrognoseRegel[]): [string, PrognoseRegel[]][] {
  const map = new Map<string, PrognoseRegel[]>()
  for (const r of regels) {
    const arr = map.get(r.code) ?? []
    arr.push(r)
    map.set(r.code, arr)
  }
  return [...map.entries()].sort((a, b) => {
    if (!a[0]) return 1
    if (!b[0]) return -1
    return a[0].localeCompare(b[0], 'nl')
  })
}
