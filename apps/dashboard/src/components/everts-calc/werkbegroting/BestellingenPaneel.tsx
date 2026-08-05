'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X, ShoppingCart, Send, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Plus, Undo2,
  ChevronDown, ChevronRight, Mail, HardHat, Truck, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getWerkbegrotingRegels, getWerkbegrotingComponenten,
  getWerkbegrotingWijzigingen, getWerkbegrotingBestellingen, slaBestellingOp, verwijderBestelling,
} from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import { formatEuro } from '@/lib/everts-calc/calculations'
import {
  zetBestellingKlaar, verzendBestelling, getWerkbegrotingGoedkeuringStatus,
  type WerkbegrotingPayload,
} from '@/app/(platform)/everts-calc/actions/werkbegroting'
import {
  stelBestellingenVoor, maakBestellingInBouw7, trekBestellingIn,
  getBestellingMailConcept, verstuurBestelling,
  verversBestellingenUitBouw7, verwijderBestellingUitEva,
  type BestellingVoorstel,
} from '@/app/(platform)/everts-calc/actions/bestellingen'
import type { Werkbegroting, WerkbegrotingBestelling, WerkbegrotingComponent } from '@/lib/everts-calc/types'

interface Props {
  wb: Werkbegroting
  dossierId: string | null
  onSluit: () => void
}

const compLabel = (c: WerkbegrotingComponent) =>
  c.omschrijving || (c.type === 'arbeid' ? 'Arbeid' : c.type === 'materieel' ? 'Materieel' : 'Onderaanneming')

type Soort = 'oa_contract' | 'inkooporder'

/**
 * De twee soorten inkoop zijn zakelijk niet hetzelfde en horen dus ook niet hetzelfde te ogen:
 * een onderaannemer krijgt een **opdracht** voor een compleet stuk werk tegen vaste prijs, een
 * leverancier krijgt een **bestelling** voor materiaal of materieel.
 */
const SOORT: Record<Soort, {
  kop: string; uitleg: string; label: string; knop: string
  badge: string; rand: string; icoon: string; Icon: typeof HardHat
}> = {
  oa_contract: {
    kop: 'Opdrachten aan onderaannemers',
    uitleg: 'Een compleet stuk werk tegen vaste prijs. De onderaannemer plant zelf; in Bouw7 wordt dit een onderaannemerscontract.',
    label: 'Opdracht onderaannemer',
    knop: 'Opdracht aanmaken',
    badge: 'bg-violet-100 text-violet-700',
    rand: 'border-violet-200',
    icoon: 'text-violet-600',
    Icon: HardHat,
  },
  inkooporder: {
    kop: 'Bestellingen bij leveranciers',
    uitleg: 'Materiaal of materieel dat geleverd wordt. In Bouw7 wordt dit een inkooporder.',
    label: 'Bestelling leverancier',
    knop: 'Bestelling aanmaken',
    badge: 'bg-sky-100 text-sky-700',
    rand: 'border-sky-200',
    icoon: 'text-sky-600',
    Icon: Truck,
  },
}

const VOLGORDE: Soort[] = ['oa_contract', 'inkooporder']

function SoortBadge({ soort }: { soort: Soort }) {
  const s = SOORT[soort]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${s.badge}`}>
      <s.Icon className="w-3 h-3" /> {s.label}
    </span>
  )
}

export default function BestellingenPaneel({ wb, dossierId, onSluit }: Props) {
  const [tick, setTick] = useState(0)
  const [bezigId, setBezigId] = useState<string | null>(null)
  const [nieuw, setNieuw] = useState(false)
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [omschrijving, setOmschrijving] = useState('')
  const [goedgekeurdRegels, setGoedgekeurdRegels] = useState<Set<string>>(new Set())

  /** Verzendvenster: welke bestelling wordt verstuurd + de (bewerkbare) mailvelden. */
  const [verstuurB, setVerstuurB] = useState<WerkbegrotingBestelling | null>(null)
  const [mail, setMail] = useState({ to: '', cc: '', onderwerp: '', bericht: '' })
  const [mailLaden, setMailLaden] = useState(false)
  const [verstuurBezig, setVerstuurBezig] = useState(false)

  /** Automatische voorstellen per leverancier (server-side berekend uit de werkbegroting). */
  const [voorstellen, setVoorstellen] = useState<BestellingVoorstel[] | null>(null)
  const [voorstellenFout, setVoorstellenFout] = useState<string | null>(null)
  const [voorstellenLaden, setVoorstellenLaden] = useState(false)
  /** Per voorstel: uitgevinkte componenten, open/dicht, en de invulvelden. */
  const [uit, setUit] = useState<Record<string, Set<string>>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [naam, setNaam] = useState<Record<string, string>>({})
  const [levering, setLevering] = useState<Record<string, string>>({})
  const [betaling, setBetaling] = useState<Record<string, string>>({})

  const regels = useMemo(() => getWerkbegrotingRegels(wb.id).filter(r => !r.is_verwijderd), [wb.id, tick])
  const componenten = useMemo(() => {
    const ids = new Set(regels.map(r => r.id))
    return getWerkbegrotingComponenten().filter(c => ids.has(c.werkbegroting_regel_id) && !c.is_verwijderd)
  }, [regels, tick])
  const bestellingen = useMemo(() => getWerkbegrotingBestellingen(wb.id), [wb.id, tick])

  const bouwPayload = useCallback((): WerkbegrotingPayload => ({
    wb,
    regels: getWerkbegrotingRegels(wb.id),
    componenten: getWerkbegrotingComponenten().filter(c => getWerkbegrotingRegels(wb.id).some(r => r.id === c.werkbegroting_regel_id)),
    wijzigingen: getWerkbegrotingWijzigingen().filter(w => w.werkbegroting_id === wb.id),
    dossierId,
  }), [wb, dossierId])

  const verversStatus = useCallback(async () => {
    try {
      const status = await getWerkbegrotingGoedkeuringStatus(wb.id)
      setGoedgekeurdRegels(new Set(status.regels.filter(r => r.goedgekeurd).map(r => r.regel_id)))
    } catch { /* stil */ }
  }, [wb.id])

  useEffect(() => { verversStatus() }, [verversStatus, tick])

  /**
   * Haal de echte stand uit Bouw7 op: wat daar is weggegooid, mag hier niet als besteld staan.
   * Draait bij openen en bij "Vernieuwen" — de gebruiker hoeft er niet om te vragen.
   */
  const verversStand = useCallback(async () => {
    if (!dossierId) return
    try {
      const res = await verversBestellingenUitBouw7(dossierId, wb.id)
      if (!res.ok) return
      const lokaal = new Map(getWerkbegrotingBestellingen(wb.id).map(b => [b.id, b]))
      for (const s of res.bestellingen) {
        const b = lokaal.get(s.id)
        if (!b) continue
        slaBestellingOp({ ...b, ...s, soort: s.soort ?? undefined })
      }
      if (res.verdwenen.length > 0) {
        toast(
          res.verdwenen.length === 1
            ? 'Eén inkoop is in Bouw7 verwijderd — die regels staan weer bij "Nog te bestellen".'
            : `${res.verdwenen.length} inkopen zijn in Bouw7 verwijderd — die regels staan weer bij "Nog te bestellen".`,
          { icon: '⚠️', duration: 7000 },
        )
        setTick(t => t + 1)
      }
    } catch { /* stil: een storing mag het paneel niet blokkeren */ }
  }, [dossierId, wb.id])

  useEffect(() => { verversStand() }, [verversStand])

  const verversVoorstellen = useCallback(async () => {
    if (!dossierId) { setVoorstellen([]); return }
    setVoorstellenLaden(true)
    setVoorstellenFout(null)
    try {
      const res = await stelBestellingenVoor(dossierId, bouwPayload())
      if (res.ok) {
        setVoorstellen(res.voorstellen)
        setNaam(prev => {
          const next = { ...prev }
          for (const v of res.voorstellen) if (next[v.sleutel] == null) next[v.sleutel] = v.relatieNaam
          return next
        })
      } else {
        setVoorstellen([])
        setVoorstellenFout(res.error)
      }
    } catch (e) {
      setVoorstellen([])
      setVoorstellenFout(e instanceof Error ? e.message : 'Voorstellen ophalen mislukt')
    } finally {
      setVoorstellenLaden(false)
    }
  }, [dossierId, bouwPayload])

  useEffect(() => { verversVoorstellen() }, [verversVoorstellen, tick])

  async function vernieuwAlles() {
    setVoorstellenLaden(true)
    await verversStand()
    setTick(t => t + 1)
  }

  const compById = useMemo(() => new Map(componenten.map(c => [c.id, c])), [componenten])
  const regelVanComp = useCallback((compId: string) => compById.get(compId)?.werkbegroting_regel_id ?? null, [compById])

  /** Bevat de bestelling regels die (nog) niet geaccordeerd zijn? */
  const bestellingGeblokkeerd = useCallback((b: WerkbegrotingBestelling): string[] => {
    const blokkerend: string[] = []
    for (const cid of b.component_ids) {
      const regelId = regelVanComp(cid)
      if (!regelId || !goedgekeurdRegels.has(regelId)) {
        const c = compById.get(cid)
        blokkerend.push(c ? compLabel(c) : 'Onbekende regel')
      }
    }
    return [...new Set(blokkerend)]
  }, [regelVanComp, goedgekeurdRegels, compById])

  async function maakBestelling() {
    if (!omschrijving.trim() || selectie.size === 0) return
    const bestelling: WerkbegrotingBestelling = {
      id: nieuweId(),
      werkbegroting_id: wb.id,
      omschrijving: omschrijving.trim(),
      status: 'concept',
      component_ids: [...selectie],
    }
    slaBestellingOp(bestelling)
    setBezigId(bestelling.id)
    try {
      const res = await zetBestellingKlaar(bestelling, bouwPayload())
      if (res.ok) toast.success('Bestelling klaargezet')
      else toast.error(res.error)
    } finally {
      setBezigId(null)
      setNieuw(false); setSelectie(new Set()); setOmschrijving('')
      setTick(t => t + 1)
    }
  }

  async function verzend(b: WerkbegrotingBestelling) {
    setBezigId(b.id)
    try {
      const res = await verzendBestelling(b.id, bouwPayload())
      if (res.ok) { toast.success('Bestelling verzonden'); setTick(t => t + 1) }
      else if (res.reden === 'niet_goedgekeurd') toast.error(`Niet geaccordeerd: ${(res.regels ?? []).join(', ')}`)
      else toast.error(res.error)
    } finally { setBezigId(null) }
  }

  async function werkBij(b: WerkbegrotingBestelling) {
    setBezigId(b.id)
    try {
      const res = await zetBestellingKlaar(b, bouwPayload())
      if (res.ok) { toast.success('Bestelling bijgewerkt'); setTick(t => t + 1) }
      else toast.error(res.error)
    } finally { setBezigId(null) }
  }

  /** Voorstel accepteren: bestelling vastleggen én het Bouw7-document (concept) aanmaken. */
  async function maakInBouw7(v: BestellingVoorstel) {
    if (!dossierId) return
    const uitgevinkt = uit[v.sleutel] ?? new Set<string>()
    const gekozen = v.regels.filter(r => !uitgevinkt.has(r.componentId))
    if (gekozen.length === 0) { toast.error('Selecteer minstens één regel.'); return }

    const bestelling: WerkbegrotingBestelling = {
      id: nieuweId(),
      werkbegroting_id: wb.id,
      omschrijving: (naam[v.sleutel] ?? v.relatieNaam).trim() || v.relatieNaam,
      status: 'concept',
      relatie_id: v.relatieId ?? undefined,
      component_ids: gekozen.map(r => r.componentId),
      soort: v.soort,
      levering_tekst: levering[v.sleutel]?.trim() || null,
      betaalafspraak: betaling[v.sleutel]?.trim() || null,
    }
    slaBestellingOp(bestelling)
    setBezigId(v.sleutel)
    try {
      const res = await maakBestellingInBouw7(dossierId, bestelling, bouwPayload())
      if (res.ok) {
        // Contract staat als concept in Bouw7. Nog niet verstuurd, nog geen leverbon.
        slaBestellingOp({ ...bestelling, bouw7_contract_id: res.contractId, bouw7_nummer: res.nummer, bouw7_verwijderd_op: null })
        toast.success(
          v.soort === 'oa_contract'
            ? `Opdracht ${res.nummer ?? ''} aangemaakt — verstuur hem nu naar de onderaannemer`
            : `Bestelling ${res.nummer ?? ''} aangemaakt — verstuur hem nu naar de leverancier`,
        )
      } else if (res.reden === 'niet_goedgekeurd') {
        toast.error(`Niet geaccordeerd: ${(res.regels ?? []).join(', ')}`)
      } else {
        toast.error(res.error)
      }
    } finally {
      setBezigId(null)
      setTick(t => t + 1)
    }
  }

  /** Open het verzendvenster met een voorgevuld mailconcept. */
  async function openVerstuur(b: WerkbegrotingBestelling) {
    if (!dossierId) return
    setVerstuurB(b)
    setMailLaden(true)
    setMail({ to: '', cc: '', onderwerp: '', bericht: '' })
    try {
      const concept = await getBestellingMailConcept(dossierId, b.id)
      setMail({ to: concept.to, cc: '', onderwerp: concept.onderwerp, bericht: concept.bericht })
    } catch { /* laat leeg */ } finally { setMailLaden(false) }
  }

  async function doeVerstuur() {
    if (!dossierId || !verstuurB) return
    if (!mail.to.trim()) { toast.error('Vul een e-mailadres van de leverancier in.'); return }
    setVerstuurBezig(true)
    try {
      const res = await verstuurBestelling(dossierId, verstuurB.id, mail)
      if (res.ok) {
        slaBestellingOp({ ...verstuurB, status: 'verzonden', verstuurd_op: new Date().toISOString(), bouw7_bonnummer: res.bonnummer })
        if (res.bonWaarschuwing) {
          toast.error(`Verstuurd, maar de leverbon niet aangemaakt: ${res.bonWaarschuwing}`, { duration: 8000 })
        } else {
          toast.success(`Verstuurd naar de leverancier — ${res.bonAantal} leverbon(nen) aangemaakt`)
        }
        setVerstuurB(null)
        setTick(t => t + 1)
      } else {
        toast.error(res.error, { duration: 7000 })
      }
    } finally { setVerstuurBezig(false) }
  }

  async function trekIn(b: WerkbegrotingBestelling) {
    if (!dossierId) return
    setBezigId(b.id)
    try {
      const res = await trekBestellingIn(dossierId, b.id)
      if (res.ok) {
        slaBestellingOp({ ...b, status: 'concept', bouw7_contract_id: null, bouw7_nummer: null, bouw7_verwijderd_op: null })
        toast.success('Concept ingetrokken in Bouw7')
      } else toast.error(res.error)
    } finally {
      setBezigId(null)
      setTick(t => t + 1)
    }
  }

  /** Opruimen van een inkoop die in Bouw7 niet meer bestaat. */
  async function ruimOp(b: WerkbegrotingBestelling) {
    if (!dossierId) return
    setBezigId(b.id)
    try {
      const res = await verwijderBestellingUitEva(dossierId, b.id)
      if (res.ok) { verwijderBestelling(b.id); toast.success('Uit EVA verwijderd') }
      else toast.error(res.error)
    } finally {
      setBezigId(null)
      setTick(t => t + 1)
    }
  }

  /** Voorstellen gegroepeerd per soort — opdracht en bestelling zijn twee verschillende dingen. */
  const voorstellenPerSoort = useMemo(() => {
    const map: Record<Soort, BestellingVoorstel[]> = { oa_contract: [], inkooporder: [] }
    for (const v of voorstellen ?? []) map[v.soort as Soort]?.push(v)
    return map
  }, [voorstellen])

  // Bewust een render-functie en geen genest component: een component dat elke render opnieuw
  // gedefinieerd wordt, remount React volledig — dan verliezen de invoervelden hun focus bij
  // elke toetsaanslag.
  const renderVoorstel = (v: BestellingVoorstel) => {
    const soort = v.soort as Soort
    const uitgevinkt = uit[v.sleutel] ?? new Set<string>()
    const gekozen = v.regels.filter(r => !uitgevinkt.has(r.componentId))
    const totaal = gekozen.reduce((s, r) => s + r.bedrag, 0)
    const bezig = bezigId === v.sleutel
    const geblokkeerd = v.blokkades.length > 0
    const isOpen = open[v.sleutel] ?? false
    return (
      <div key={v.sleutel} className={`rounded-lg border ${SOORT[soort].rand}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button onClick={() => setOpen(p => ({ ...p, [v.sleutel]: !isOpen }))} className="flex items-center gap-2 min-w-0 text-left">
            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {v.relatieNaam}
                {v.code && <span className="ml-1.5 text-xs font-normal text-slate-400">{v.code}</span>}
              </p>
              <p className="text-xs text-slate-400">
                {v.isWinkel && <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 mr-1.5 text-[10px] font-medium text-amber-700">Winkelbudget</span>}
                {v.isWinkel
                  ? `${gekozen.length} regel(s) → één budgetbedrag · ${formatEuro(totaal)}`
                  : `${gekozen.length} van ${v.regels.length} regel(s) · ${formatEuro(totaal)}`}
              </p>
            </div>
          </button>
          <button
            onClick={() => maakInBouw7(v)}
            disabled={bezig || geblokkeerd || gekozen.length === 0}
            title={geblokkeerd ? v.blokkades.join(' ') : 'Als concept aanmaken in Bouw7 — versturen doe je daarna'}
            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-everts text-white hover:bg-everts/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {SOORT[soort].knop}
          </button>
        </div>

        {geblokkeerd && (
          <div className="px-4 pb-3">
            <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{v.blokkades.join(' ')}</span>
            </p>
          </div>
        )}

        {isOpen && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">
                Omschrijving
                <input value={naam[v.sleutel] ?? v.relatieNaam} onChange={e => setNaam(p => ({ ...p, [v.sleutel]: e.target.value }))}
                  className="mt-1 w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
              </label>
              <label className="text-xs text-slate-500">
                {soort === 'oa_contract' ? 'Start werk' : 'Levering'}
                <input value={levering[v.sleutel] ?? ''} onChange={e => setLevering(p => ({ ...p, [v.sleutel]: e.target.value }))}
                  placeholder="bijv. week 34"
                  className="mt-1 w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
              </label>
              <label className="text-xs text-slate-500">
                Betaalafspraak
                <input value={betaling[v.sleutel] ?? ''} onChange={e => setBetaling(p => ({ ...p, [v.sleutel]: e.target.value }))}
                  placeholder="bijv. 30 dagen netto"
                  className="mt-1 w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
              </label>
            </div>

            <div className="space-y-1">
              {v.regels.map(r => (
                <label key={r.componentId} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                  <input type="checkbox" className="accent-everts" checked={!uitgevinkt.has(r.componentId)}
                    onChange={() => setUit(p => {
                      const set = new Set(p[v.sleutel] ?? [])
                      if (set.has(r.componentId)) set.delete(r.componentId); else set.add(r.componentId)
                      return { ...p, [v.sleutel]: set }
                    })} />
                  <span className="flex-1 truncate text-slate-700">{r.omschrijving || 'Regel zonder omschrijving'}</span>
                  {r.code && <span className="text-[10px] text-slate-400 shrink-0">{r.code}</span>}
                  <span className="text-slate-500 shrink-0 tabular-nums">{formatEuro(r.bedrag)}</span>
                  {!r.geaccordeerd && <span className="text-[10px] text-amber-600 shrink-0">niet geaccordeerd</span>}
                  {r.bouw7LineId == null && <span className="text-[10px] text-amber-600 shrink-0">niet in Bouw7</span>}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onSluit() }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-everts" />
            <h2 className="text-base font-bold text-gray-900">Inkopen</h2>
          </div>
          <button onClick={onSluit} className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-200"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <p className="text-xs text-slate-500 mb-4">
            EVA stelt per partij én bewakingscode een inkoop voor. Een <strong>opdracht aan een
            onderaannemer</strong> is een compleet stuk werk tegen vaste prijs; een <strong>bestelling
            bij een leverancier</strong> gaat over materiaal of materieel. <strong>Aanmaken</strong> zet
            het document als concept in Bouw7. Met <strong>Versturen</strong> mailt EVA het naar de partij
            en maakt Bouw7 de leverbon(nen) aan, zodat een inkoopfactuur er straks op afboekt.
            Voorwaarde: de regels zijn <strong>geaccordeerd</strong> en staan al als bestelregel in Bouw7.
            Eenmaal verstuurd is een inkoop <strong>niet meer te wijzigen</strong>.
          </p>

          {/* ── Voorstellen per partij, gescheiden per soort ────────────────── */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nog te bestellen</p>
              <button onClick={vernieuwAlles} disabled={voorstellenLaden}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40">
                {voorstellenLaden ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Vernieuwen
              </button>
            </div>

            {voorstellenFout && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">{voorstellenFout}</p>
            )}
            {!voorstellenFout && voorstellen?.length === 0 && !voorstellenLaden && (
              <p className="text-sm text-slate-400 italic py-3 text-center">
                Niets te bestellen — alle inkoopregels staan al in een opdracht of bestelling.
              </p>
            )}

            <div className="space-y-4">
              {VOLGORDE.map(soort => {
                const lijst = voorstellenPerSoort[soort]
                if (lijst.length === 0) return null
                const s = SOORT[soort]
                return (
                  <div key={soort}>
                    <div className="flex items-center gap-2 mb-1">
                      <s.Icon className={`w-4 h-4 ${s.icoon}`} />
                      <p className="text-sm font-semibold text-slate-700">{s.kop}</p>
                      <span className="text-xs text-slate-400">({lijst.length})</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">{s.uitleg}</p>
                    <div className="space-y-2">{lijst.map(renderVoorstel)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Bestaande inkopen ──────────────────────────────────────────── */}
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Opdrachten en bestellingen</p>
          {bestellingen.length === 0 && !nieuw && (
            <p className="text-sm text-slate-400 italic py-3 text-center">Nog niets klaargezet.</p>
          )}

          <div className="space-y-2">
            {bestellingen.map(b => {
              const blokkerend = bestellingGeblokkeerd(b)
              const inBouw7 = b.bouw7_contract_id != null
              // In Bouw7 weggegooid: de koppeling is losgelaten, de regels zijn weer bestelbaar.
              // Deze stand gaat vóór alle andere — ook vóór "Verstuurd", want dat is nu historie.
              const wegInBouw7 = !inBouw7 && b.bouw7_verwijderd_op != null
              const isVerstuurd = !wegInBouw7 && !!b.verstuurd_op
              const isLegacyVerzonden = !inBouw7 && !wegInBouw7 && b.status !== 'concept'
              const soort = (b.soort ?? null) as Soort | null
              const bezig = bezigId === b.id
              return (
                <div key={b.id} className={`rounded-lg border border-slate-200 px-4 py-3 ${wegInBouw7 ? 'bg-slate-50' : ''}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${wegInBouw7 ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {b.omschrijving}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                        {soort && <SoortBadge soort={soort} />}
                        <span>{b.component_ids.length} regel(s)</span>
                        {b.bouw7_nummer && <>· <span className="font-medium text-slate-500">{b.bouw7_nummer}</span></>}
                        {b.bouw7_bonnummer && <>· bon <span className="font-medium text-slate-500">{b.bouw7_bonnummer}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {wegInBouw7 ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-200 px-2 py-1 rounded-lg">
                            <AlertTriangle className="w-3.5 h-3.5" /> Verwijderd in Bouw7
                          </span>
                          <button onClick={() => ruimOp(b)} disabled={bezig} title="Deze inkoop uit EVA halen"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40">
                            {bezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Opruimen
                          </button>
                        </>
                      ) : isVerstuurd ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verstuurd
                        </span>
                      ) : inBouw7 ? (
                        <>
                          <button
                            onClick={() => openVerstuur(b)}
                            disabled={bezig}
                            title={soort === 'oa_contract' ? 'Opdracht naar de onderaannemer mailen' : 'Bestelling naar de leverancier mailen'}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-everts text-white hover:bg-everts/90 disabled:opacity-40"
                          >
                            <Mail className="w-3.5 h-3.5" /> Versturen
                          </button>
                          <button onClick={() => trekIn(b)} disabled={bezig} title="Concept in Bouw7 verwijderen"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                            {bezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Intrekken
                          </button>
                        </>
                      ) : isLegacyVerzonden ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verzonden
                        </span>
                      ) : (
                        <button
                          onClick={() => verzend(b)}
                          disabled={bezig || blokkerend.length > 0}
                          title={blokkerend.length > 0 ? `Bevat niet-geaccordeerde regels: ${blokkerend.join(', ')}` : 'Bestelling verzenden'}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-everts text-white hover:bg-everts/90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {bezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Verzenden
                        </button>
                      )}
                      {!inBouw7 && !isLegacyVerzonden && !wegInBouw7 && (
                        <button onClick={() => werkBij(b)} disabled={bezig} title="Snapshot bijwerken naar de huidige werkbegroting"
                          className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                          <RefreshCw className="w-3.5 h-3.5" /> Bijwerken
                        </button>
                      )}
                    </div>
                  </div>
                  {wegInBouw7 && (
                    <p className="mt-2 text-xs text-slate-500 bg-white border border-slate-200 rounded px-2 py-1.5">
                      Dit document bestaat niet meer in Bouw7. De regels tellen niet meer als besteld en
                      staan weer bij <strong>Nog te bestellen</strong>.
                      {b.verstuurd_op && ' De eerder verstuurde mail blijft uiteraard wel verstuurd.'}
                    </p>
                  )}
                  {b.bouw7_sync_fout && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {b.bouw7_sync_fout}
                    </p>
                  )}
                  {!inBouw7 && !isLegacyVerzonden && !wegInBouw7 && blokkerend.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Bevat niet-geaccordeerde regels: {blokkerend.join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Zelf samenstellen ──────────────────────────────────────────── */}
          {nieuw ? (
            <div className="mt-4 rounded-lg border border-everts/30 bg-everts-50/40 p-4">
              <input
                value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
                placeholder="Omschrijving, bijv. Levering steigermateriaal week 12"
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg mb-3 focus:outline-none focus:border-everts/40"
              />
              <p className="text-xs font-semibold text-slate-500 mb-1">Componenten selecteren:</p>
              <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
                {componenten.map(c => {
                  const regelGoedgekeurd = goedgekeurdRegels.has(c.werkbegroting_regel_id)
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                      <input type="checkbox" checked={selectie.has(c.id)} className="accent-everts"
                        onChange={() => setSelectie(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} />
                      <span className="flex-1 truncate text-slate-700">{compLabel(c)}</span>
                      <span className="text-slate-400">{formatEuro(c.norm_hoeveelheid * c.tarief)}</span>
                      {regelGoedgekeurd
                        ? <span className="text-[10px] text-green-600">✓ geaccordeerd</span>
                        : <span className="text-[10px] text-amber-600">niet geaccordeerd</span>}
                    </label>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setNieuw(false); setSelectie(new Set()); setOmschrijving('') }}
                  className="text-sm px-3 py-1.5 text-slate-500 hover:text-slate-700">Annuleren</button>
                <button onClick={maakBestelling} disabled={!omschrijving.trim() || selectie.size === 0 || bezigId != null}
                  className="text-sm px-4 py-1.5 bg-everts text-white rounded-lg hover:bg-everts/90 disabled:opacity-40 font-semibold">
                  Klaarzetten
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNieuw(true)}
              className="mt-4 flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Plus className="w-4 h-4" /> Zelf samenstellen
            </button>
          )}
        </div>
      </div>

      {/* ── Verzendvenster ─────────────────────────────────────────────────── */}
      {verstuurB && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget && !verstuurBezig) setVerstuurB(null) }}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-everts" />
                <h2 className="text-base font-bold text-gray-900">
                  {verstuurB.soort === 'oa_contract' ? 'Versturen naar onderaannemer' : 'Versturen naar leverancier'}
                </h2>
              </div>
              <button onClick={() => !verstuurBezig && setVerstuurB(null)} className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
              <p className="text-xs text-slate-500">
                EVA maakt een order-PDF en mailt die namens jou. Daarna zet Bouw7 de order op verstuurd en
                maakt de leverbon(nen) aan. <strong>Bijlage: {verstuurB.omschrijving} ({verstuurB.bouw7_nummer}).pdf</strong>
              </p>
              {mailLaden ? (
                <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
              ) : (
                <>
                  <label className="block text-xs text-slate-500">
                    Aan
                    <input value={mail.to} onChange={e => setMail(m => ({ ...m, to: e.target.value }))}
                      placeholder="leverancier@voorbeeld.nl"
                      className="mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
                  </label>
                  <label className="block text-xs text-slate-500">
                    CC (optioneel)
                    <input value={mail.cc} onChange={e => setMail(m => ({ ...m, cc: e.target.value }))}
                      className="mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
                  </label>
                  <label className="block text-xs text-slate-500">
                    Onderwerp
                    <input value={mail.onderwerp} onChange={e => setMail(m => ({ ...m, onderwerp: e.target.value }))}
                      className="mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40" />
                  </label>
                  <label className="block text-xs text-slate-500">
                    Bericht
                    <textarea value={mail.bericht} onChange={e => setMail(m => ({ ...m, bericht: e.target.value }))} rows={8}
                      className="mt-1 w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-everts/40 resize-none" />
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Onder je bericht komt automatisch een blokje met ordernummer, project, werkadres,
                      leverdatum en bedrag. Je naam komt uit je Outlook-handtekening.
                    </span>
                  </label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-3">
              <button onClick={() => setVerstuurB(null)} disabled={verstuurBezig}
                className="text-sm px-3 py-1.5 text-slate-500 hover:text-slate-700 disabled:opacity-40">Annuleren</button>
              <button onClick={doeVerstuur} disabled={verstuurBezig || mailLaden || !mail.to.trim()}
                className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 bg-everts text-white rounded-lg hover:bg-everts/90 disabled:opacity-40 font-semibold">
                {verstuurBezig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Versturen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
