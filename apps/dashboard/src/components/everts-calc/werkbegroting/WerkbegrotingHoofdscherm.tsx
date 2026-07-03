'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { Loader2, ChevronLeft, Clock, ClipboardCheck, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import {
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie,
  getWerkbegrotingRegels, getWerkbegrotingComponenten,
  getWerkbegrotingWijzigingen,
  slaWerkbegrotingOp, getScenarios,
} from '@/lib/everts-calc/local-store'
import { previewWerkbegrotingPrognoseBouw7, stuurWerkbegrotingPrognoseBouw7, resolveBewakingscodes, getProjectHoofdstukken, syncWerkbegrotingNaarSupabase, accordeerWerkbegroting, getWerkbegrotingGoedkeuringStatus, type PrognoseResultaat, type PrognoseRegel, type WerkbegrotingPrognoseTotalen, type WerkbegrotingCodeTotaal, type Hoofdstuk, type WerkbegrotingPayload } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { vraagGoedkeuringAan } from '@/lib/goedkeuring/actions'
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
  const [refreshTeller, setRefreshTeller] = useState(0)
  const [goedkeuringOpen, setGoedkeuringOpen] = useState(false)
  const [bestellingenOpen, setBestellingenOpen] = useState(false)
  /** Aantal actieve regels dat (nog) niet geaccordeerd is (server-side berekend). */
  const [nietGeaccordeerd, setNietGeaccordeerd] = useState<number>(0)
  const [prognoseOpen, setPrognoseOpen] = useState(false)
  const [prognosePreview, setPrognosePreview] = useState<PrognoseResultaat | null>(null)
  const [prognoseBezig, setPrognoseBezig] = useState(false)
  /** Bouw7-bewakingscodes van het gekoppelde project (null = niet gekoppeld / nog niet geladen). */
  const [bewakingscodes, setBewakingscodes] = useState<{ code: string; naam: string | null }[] | null>(null)
  /** Bestaande Bouw7-hoofdstukken + het gekozen doelhoofdstuk voor nieuwe codes (onthouden per dossier). */
  const [hoofdstukken, setHoofdstukken] = useState<Hoofdstuk[]>([])
  const [doelHoofdstukId, setDoelHoofdstukId] = useState<number | null>(null)

  useEffect(() => {
    const scenarios = getScenarios(projectId)
    const standaard = scenarios.find(s => s.is_standaard) ?? scenarios[0]
    if (!standaard) return

    setScenarioId(standaard.id)

    const toegestaneStatussen = ['gewonnen', 'opdracht', 'uitvoering', 'afgerond']
    if (!toegestaneStatussen.includes(projectStatus)) return

    const bestaand = getWerkbegrotingVoorScenario(standaard.id)
    if (bestaand) {
      setWb(bestaand)
    } else {
      const nieuw = maakWerkbegrotingVanCalculatie(projectId, standaard.id)
      setWb(nieuw)
    }
  }, [projectId, projectStatus])

  // Bewakingscodes van het gekoppelde Bouw7-project ophalen → kostengroep-picker + prognose-match.
  useEffect(() => {
    if (!dossierId) { setBewakingscodes(null); return }
    let actief = true
    resolveBewakingscodes(dossierId)
      .then(res => { if (actief) setBewakingscodes(res.ok ? res.codes.map(c => ({ code: c.code, naam: c.naam })) : null) })
      .catch(() => { if (actief) setBewakingscodes(null) })
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

  /** Werkbegroting-totalen per bewakingscode (= regel.kostengroep), gesplitst per component-type. */
  const berekenPrognoseTotalen = useCallback((): WerkbegrotingPrognoseTotalen => {
    if (!wb) return []
    const regels = getWerkbegrotingRegels(wb.id)
    const regelById = new Map(regels.map(r => [r.id, r]))
    const regelIds = new Set(regels.map(r => r.id))
    const componenten = getWerkbegrotingComponenten().filter(c => regelIds.has(c.werkbegroting_regel_id) && !c.is_verwijderd)
    const perCode = new Map<string, WerkbegrotingCodeTotaal>()
    const ensure = (code: string): WerkbegrotingCodeTotaal => {
      let t = perCode.get(code)
      if (!t) { t = { code }; perCode.set(code, t) }
      return t
    }
    for (const comp of componenten) {
      const regel = regelById.get(comp.werkbegroting_regel_id)
      if (!regel) continue
      const code = bareCode(regel.kostengroep)
      const hoeveelheid = regel.hoeveelheid * comp.norm_hoeveelheid
      const bedrag = hoeveelheid * comp.tarief
      const t = ensure(code)
      if (comp.type === 'arbeid') { t.arbeid = t.arbeid ?? { bedrag: 0, uren: 0 }; t.arbeid.bedrag += bedrag; t.arbeid.uren += hoeveelheid }
      else if (comp.type === 'onderaanneming') { t.onderaanneming = t.onderaanneming ?? { bedrag: 0 }; t.onderaanneming.bedrag += bedrag }
      else if (comp.type === 'materieel') { t.materieel = t.materieel ?? { bedrag: 0 }; t.materieel.bedrag += bedrag }
    }
    return [...perCode.values()]
  }, [wb])

  const openPrognose = useCallback(async () => {
    if (!dossierId) return
    setPrognoseOpen(true)
    setPrognosePreview(null)
    setPrognoseBezig(true)
    try {
      const [preview, hs] = await Promise.all([
        previewWerkbegrotingPrognoseBouw7(dossierId, berekenPrognoseTotalen()),
        getProjectHoofdstukken(dossierId),
      ])
      setPrognosePreview(preview)
      if (hs.ok) {
        setHoofdstukken(hs.hoofdstukken)
        const opgeslagen = Number(localStorage.getItem(`eva_prognose_hoofdstuk_${dossierId}`))
        const geldig = hs.hoofdstukken.some(h => h.id === opgeslagen)
        const wb = hs.hoofdstukken.find(h => h.naam.trim().toUpperCase() === 'WB')
        setDoelHoofdstukId(geldig ? opgeslagen : (wb?.id ?? hs.hoofdstukken[0]?.id ?? null))
      }
    } finally {
      setPrognoseBezig(false)
    }
  }, [dossierId, berekenPrognoseTotalen])

  const verstuurPrognose = useCallback(async () => {
    if (!dossierId) return
    setPrognoseBezig(true)
    try {
      if (doelHoofdstukId != null) localStorage.setItem(`eva_prognose_hoofdstuk_${dossierId}`, String(doelHoofdstukId))
      const res = await stuurWerkbegrotingPrognoseBouw7(dossierId, berekenPrognoseTotalen(), doelHoofdstukId, bouwPayload() ?? undefined)
      if (res.ok) {
        const delen = [`${res.geschreven} bijgewerkt`]
        if (res.aangemaakt) delen.push(`${res.aangemaakt} aangemaakt`)
        if (res.gereset) delen.push(`${res.gereset} gereset`)
        if (res.overgeslagen) delen.push(`${res.overgeslagen} overgeslagen`)
        toast.success(`Prognose verzonden naar Bouw7: ${delen.join(', ')}.`)
        if (res.fouten.length) toast(`Let op: ${res.fouten[0]}${res.fouten.length > 1 ? ` (+${res.fouten.length - 1} meer)` : ''}`, { icon: '⚠️' })
        setPrognoseOpen(false)
      } else {
        toast.error(`Verzenden mislukt: ${res.error}`)
      }
    } finally {
      setPrognoseBezig(false)
    }
  }, [dossierId, berekenPrognoseTotalen, doelHoofdstukId, bouwPayload])

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
    const res = await accordeerWerkbegroting(goedkeuringId, payload, opmerking)
    if (res.ok) {
      const bij: Werkbegroting = { ...wb, status: 'geaccordeerd', bijgewerkt_op: new Date().toISOString() }
      slaWerkbegrotingOp(bij); setWb(bij)
      await verversStatus()
    }
    return res
  }, [wb, bouwPayload, verversStatus])

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
    return (
      <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Werkbegroting laden…
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
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          wb.status === 'geaccordeerd' ? 'bg-green-100 text-green-700' :
          wb.status === 'definitief'   ? 'bg-blue-100 text-blue-700' :
                                         'bg-amber-100 text-amber-700'
        }`}>
          {wb.status === 'geaccordeerd' ? 'Geaccordeerd' : wb.status === 'definitief' ? 'Definitief' : 'Concept'}
        </span>
        <button
          onClick={() => setGoedkeuringOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            wb.status === 'geaccordeerd'
              ? 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
              : wb.status === 'definitief'
              ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Goedkeuringsproces beheren"
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          {wb.status === 'geaccordeerd' ? 'Geaccordeerd' : wb.status === 'definitief' ? 'Ter beoordeling' : 'Goedkeuring'}
        </button>
        <button
          onClick={() => setBestellingenOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          title="Bestellingen klaarzetten en verzenden"
        >
          <Package className="w-3.5 h-3.5" />
          Bestellingen
        </button>
        <button
          onClick={openPrognose}
          disabled={!dossierId}
          title={dossierId ? 'Stuur de werkbegroting-bedragen als prognose naar Bouw7' : 'Geen dossier gekoppeld'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Prognose naar Bouw7
        </button>
      </div>

      {/* Grid + totalen panel */}
      <div className="flex-1 overflow-hidden">
        <WerkbegrotingGrid
          werkbegrotingId={wb.id}
          scenarioId={scenarioId}
          onWijziging={handleWijziging}
          bewakingscodes={bewakingscodes}
          dossierId={dossierId}
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
                onVeranderd={verversStatus}
              />
            </div>
          </div>
        </div>
      )}

      {bestellingenOpen && (
        <BestellingenPaneel wb={wb} dossierId={dossierId ?? null} onSluit={() => setBestellingenOpen(false)} />
      )}

      {prognoseOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !prognoseBezig) setPrognoseOpen(false) }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                <Send className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Prognose naar Bouw7</h2>
            </div>

            <div className="px-6 py-5">
              <p className="mb-3 text-sm text-gray-600">
                Per <strong>bewakingscode</strong> wordt <strong>&ldquo;Niet/anders begroot&rdquo;</strong> in Bouw7
                gezet op de werkbegroting minus <strong>begroot + meerwerk</strong>, zodat de totale prognose gelijk
                wordt aan de werkbegroting. De kostengroep in EVA wordt op de bewakingscode gematcht. Controleer
                hieronder vóór verzenden.
              </p>

              {/* Doelhoofdstuk voor nieuwe codes — alleen relevant als er nieuwe codes aangemaakt worden. */}
              {prognosePreview?.ok && prognosePreview.regels.some(r => r.actie === 'aanmaken' && r.nieuweCode) && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
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

              {prognoseBezig && !prognosePreview && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Bedragen ophalen uit Bouw7…
                </div>
              )}

              {prognosePreview && !prognosePreview.ok && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{prognosePreview.error}</div>
              )}

              {prognosePreview?.ok && (
                <div className="max-h-[55vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500">
                        <th className="py-1.5">Kostensoort</th>
                        <th className="py-1.5 text-right">Begroot</th>
                        <th className="py-1.5 text-right">Meerwerk</th>
                        <th className="py-1.5 text-right">Werkbegroting</th>
                        <th className="py-1.5 text-right">Niet/anders begroot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groepeerPerCode(prognosePreview.regels).map(([code, rs]) => (
                        <Fragment key={code || '∅'}>
                          <tr className="bg-gray-50">
                            <td colSpan={5} className="py-1 px-1 text-xs font-semibold text-gray-600">
                              {code ? code : 'Zonder bewakingscode'}
                              {rs[0]?.codeNaam && <span className="ml-1 font-normal text-gray-400">— {rs[0].codeNaam}</span>}
                            </td>
                          </tr>
                          {rs.map((r) => (
                            <tr key={`${code}-${r.type}`} className={`border-b border-gray-100 ${r.actie === 'skip' ? 'text-gray-400' : 'text-gray-800'}`}>
                              <td className="py-1.5 pl-3">
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
                              <td className="py-1.5 text-right tabular-nums font-semibold">
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
                onClick={() => setPrognoseOpen(false)}
                disabled={prognoseBezig}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={verstuurPrognose}
                disabled={prognoseBezig || !prognosePreview?.ok || !prognosePreview.regels.some(r => r.schrijfbaar)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {prognoseBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
