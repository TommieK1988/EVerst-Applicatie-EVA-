'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Save, Loader2, ChevronLeft, Clock, RefreshCw, Printer, ClipboardCheck, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import {
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie,
  getWerkbegrotingRegels, getWerkbegrotingComponenten, getWerkbegrotingWijzigingen,
  getWerkbegrotingBestellingen, slaWerkbegrotingOp, getScenarios,
  heroverhaalWerkbegroting,
} from '@/lib/everts-calc/local-store'
import { syncWerkbegrotingNaarSupabase, syncBestellingenNaarSupabase, maakWerkbegrotingControleTaak, previewWerkbegrotingPrognoseBouw7, stuurWerkbegrotingPrognoseBouw7, resolveBewakingscodes, type ControleTaakResultaat, type PrognoseResultaat, type PrognoseRegel, type WerkbegrotingPrognoseTotalen, type WerkbegrotingCodeTotaal } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import type { Werkbegroting, WerkbegrotingStatus } from '@/lib/everts-calc/types'
import WerkbegrotingGrid from './WerkbegrotingGrid'
import HeroverhaalModal from './HeroverhaalModal'
import GoedkeuringModal from './GoedkeuringModal'

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
  const [isSyncing, setIsSyncing] = useState(false)
  const [refreshTeller, setRefreshTeller] = useState(0)
  const [heroverhaalOpen, setHeroverhaalOpen] = useState(false)
  const [isHeroverhaal, setIsHeroverhaal] = useState(false)
  const [gridKey, setGridKey] = useState(0)
  const [goedkeuringOpen, setGoedkeuringOpen] = useState(false)
  const [controleTaak, setControleTaak] = useState<ControleTaakResultaat | null>(null)
  const [prognoseOpen, setPrognoseOpen] = useState(false)
  const [prognosePreview, setPrognosePreview] = useState<PrognoseResultaat | null>(null)
  const [prognoseBezig, setPrognoseBezig] = useState(false)
  /** Bouw7-bewakingscodes van het gekoppelde project (null = niet gekoppeld / nog niet geladen). */
  const [bewakingscodes, setBewakingscodes] = useState<{ code: string; naam: string | null }[] | null>(null)

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

  const handleWijziging = useCallback(() => {
    setRefreshTeller(t => t + 1)
  }, [])

  const handleHeroverhaal = useCallback((modus: 'volledig' | 'gewijzigd') => {
    if (!wb || !scenarioId) return
    setIsHeroverhaal(true)
    try {
      heroverhaalWerkbegroting(wb, scenarioId, modus)
      setGridKey(k => k + 1)
      setHeroverhaalOpen(false)
      toast.success(
        modus === 'volledig'
          ? 'Werkbegroting volledig opnieuw overgehaald'
          : 'Gewijzigde regels bijgewerkt'
      )
    } finally {
      setIsHeroverhaal(false)
    }
  }, [wb, scenarioId])

  const handleSync = useCallback(async () => {
    if (!wb || !scenarioId) return
    setIsSyncing(true)
    try {
      const regels = getWerkbegrotingRegels(wb.id)
      const componentIds = new Set(regels.map(r => r.id))
      const componenten = getWerkbegrotingComponenten().filter(c => componentIds.has(c.werkbegroting_regel_id))
      const wijzigingen = getWerkbegrotingWijzigingen()
      const bestellingen = getWerkbegrotingBestellingen(wb.id)

      const resultaat = await syncWerkbegrotingNaarSupabase(wb, regels, componenten, wijzigingen)
      if (bestellingen.length > 0) {
        await syncBestellingenNaarSupabase(bestellingen)
      }

      if (resultaat.gelukt) {
        const bijgewerkt: Werkbegroting = { ...wb, bijgewerkt_op: new Date().toISOString() }
        slaWerkbegrotingOp(bijgewerkt)
        setWb(bijgewerkt)
        toast.success(`Werkbegroting opgeslagen (${resultaat.regels_geschreven} regels)`)
      } else {
        toast.error(`Opslaan mislukt: ${resultaat.fout}`)
      }
    } finally {
      setIsSyncing(false)
    }
  }, [wb, scenarioId])

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
      setPrognosePreview(await previewWerkbegrotingPrognoseBouw7(dossierId, berekenPrognoseTotalen()))
    } finally {
      setPrognoseBezig(false)
    }
  }, [dossierId, berekenPrognoseTotalen])

  const verstuurPrognose = useCallback(async () => {
    if (!dossierId) return
    setPrognoseBezig(true)
    try {
      const res = await stuurWerkbegrotingPrognoseBouw7(dossierId, berekenPrognoseTotalen())
      if (res.ok) {
        const delen = [`${res.geschreven} bijgewerkt`]
        if (res.aangemaakt) delen.push(`${res.aangemaakt} aangemaakt`)
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
  }, [dossierId, berekenPrognoseTotalen])

  const handleStatusWijzig = useCallback(async (nieuweStatus: WerkbegrotingStatus, notitie?: string) => {
    if (!wb) return
    const bijgewerkt: Werkbegroting = { ...wb, status: nieuweStatus, bijgewerkt_op: new Date().toISOString() }
    slaWerkbegrotingOp(bijgewerkt)
    setWb(bijgewerkt)
    setGoedkeuringOpen(false)
    const labels: Record<WerkbegrotingStatus, string> = {
      concept: 'Teruggezet naar concept',
      definitief: 'Ingediend ter goedkeuring',
      geaccordeerd: 'Werkbegroting geaccordeerd',
    }
    toast.success(labels[nieuweStatus])
    if (notitie) console.info('[GoedkeuringNotitie]', notitie)

    // Bij indienen ter goedkeuring: controletaak voor de controller aanmaken.
    if (nieuweStatus === 'definitief' && dossierId) {
      try {
        const resultaat = await maakWerkbegrotingControleTaak(dossierId)
        setControleTaak(resultaat)
      } catch {
        toast.error('Controletaak kon niet worden aangemaakt')
      }
    }
  }, [wb, dossierId])

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
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          wb.status === 'geaccordeerd' ? 'bg-green-100 text-green-700' :
          wb.status === 'definitief'   ? 'bg-blue-100 text-blue-700' :
                                         'bg-amber-100 text-amber-700'
        }`}>
          {wb.status === 'geaccordeerd' ? 'Geaccordeerd' : wb.status === 'definitief' ? 'Definitief' : 'Concept'}
        </span>
        <button
          onClick={() => setHeroverhaalOpen(true)}
          disabled={isSyncing || isHeroverhaal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            border border-slate-200 bg-white text-slate-600 hover:bg-slate-50
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Opnieuw overhalen
        </button>
        <button
          onClick={() => {
            const params = new URLSearchParams({
              naam: projectNaam,
              nummer: projectNummer,
            })
            window.open(`/everts-calc/werkbegroting/${projectId}/afdruk?${params}`, '_blank')
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          title="Afdrukken (liggend A4)"
        >
          <Printer className="w-3.5 h-3.5" />
          Afdrukken
        </button>
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
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg
            bg-everts text-white hover:bg-everts/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Opslaan
        </button>
        <button
          onClick={openPrognose}
          disabled={!dossierId || isSyncing}
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
          key={gridKey}
          werkbegrotingId={wb.id}
          scenarioId={scenarioId}
          onWijziging={handleWijziging}
          bewakingscodes={bewakingscodes}
          dossierId={dossierId}
        />
      </div>

      {heroverhaalOpen && (
        <HeroverhaalModal
          onKies={handleHeroverhaal}
          onSluit={() => setHeroverhaalOpen(false)}
          isBezig={isHeroverhaal}
        />
      )}

      {goedkeuringOpen && (
        <GoedkeuringModal
          wb={wb}
          totaalBedrag={totaalBedrag}
          onStatusWijzig={handleStatusWijzig}
          onSluit={() => setGoedkeuringOpen(false)}
        />
      )}

      {controleTaak && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setControleTaak(null) }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Controletaak aangemaakt</h2>
            </div>
            <div className="px-6 py-5 text-sm leading-relaxed text-gray-700">
              <p>
                Er is een taak <strong>&ldquo;Werkbegroting controleren&rdquo;</strong>
                {controleTaak.bestond ? ' beschikbaar' : ' toegevoegd'} bij dit dossier
                {controleTaak.toegewezenAan
                  ? <> voor <strong>{controleTaak.toegewezenAan}</strong>.</>
                  : <>.</>}
              </p>
              {controleTaak.isFallback && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Er was geen controller ingesteld op dit dossier — de taak is daarom toegewezen aan
                  {' '}<strong>Tom Kamminga</strong>.
                </p>
              )}
              {controleTaak.bestond && (
                <p className="mt-2 text-[13px] text-gray-500">
                  Er stond al een openstaande controletaak open; er is geen dubbele taak aangemaakt.
                </p>
              )}
            </div>
            <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                onClick={() => setControleTaak(null)}
                className="rounded-lg bg-everts px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-everts/90"
              >
                Begrepen
              </button>
            </div>
          </div>
        </div>
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
                gezet op het verschil tussen de werkbegroting en het Bouw7-begrote bedrag. De kostengroep in EVA wordt
                op de bewakingscode gematcht. Controleer hieronder vóór verzenden.
              </p>

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
                        <th className="py-1.5 text-right">Werkbegroting</th>
                        <th className="py-1.5 text-right">Niet/anders begroot</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groepeerPerCode(prognosePreview.regels).map(([code, rs]) => (
                        <Fragment key={code || '∅'}>
                          <tr className="bg-gray-50">
                            <td colSpan={4} className="py-1 px-1 text-xs font-semibold text-gray-600">
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
