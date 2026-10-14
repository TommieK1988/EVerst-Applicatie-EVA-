'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  maakStandaardScenario, getScenarios, getGroepen, hydrateCalculatie,
  getMeetstaten, maakNieuweMeetstaat, slaMeetstaatOp,
  getMeetregelAggregaten, slaMeetregelAggregaatOp,
  slaCalculatieregelOp, getCalculatieregels,
} from '@/lib/everts-calc/local-store'
import { laadCalculatieSnapshot, bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Meetstaat, Groep, Calculatieregel, Scenario } from '@/lib/everts-calc/types'
import { calculatieregelOmschrijving, normaliseerBestekcode } from '@/lib/everts-calc/meetstaat-utils'
import { vervangNormenUitCombinatie } from '@/lib/everts-calc/normen-uit-combinatie'
import { zonderCodeInOmschrijving } from '@/lib/everts-calc/bestekcode'
import { teVerwerken, isVervallen, meetstaatStatus } from '@/lib/everts-calc/meetstaat-verwerken'
import GroepenboomPanel from './GroepenboomPanel'
import MeetstaatKopbalk from './MeetstaatKopbalk'
import MeetregelGrid from './MeetregelGrid'
import MeetstaatOpenenModal from './MeetstaatOpenenModal'
import { openMeetstaatPdf } from './meetstaat-afdrukken'
import toast from 'react-hot-toast'
import { haalSchilderDropdownData, haalCombinaties } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'

interface SchilderData {
  onderdelen: { id: string; naam: string; code: string | null }[]
  types: { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[]
  behandelingen: { id: string; naam: string; code: string | null }[]
  combinaties: { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[]
}

const BEVROREN_MELDING =
  'Deze calculatie is verzonden en bevroren. Reviseer de calculatie en open de meetstaat vanuit de nieuwe versie.'

export default function MeetstaaatHoofdscherm({
  projectId, scenarioId, onSluit, schilderData: schilderDataProp, printKop, ingebed = false, terug,
}: {
  projectId: string
  /** Scenario dat de calculatie open heeft (revisie, meerwerk). Leeg of onbekend = het standaardscenario. */
  scenarioId?: string
  /** Project waar de meetstaat bij hoort, voor de kop van de afdruk en de contextregel. */
  printKop?: { naam?: string; nummer?: string }
  /** Overlay in de calculatie: sluiten brengt je terug naar het rekenblad. */
  onSluit?: () => void
  schilderData?: SchilderData
  /** Draait in het calculatietabblad zelf: het werkgeheugen is al actueel. */
  ingebed?: boolean
  /** Los venster: pad van de calculatie om naar terug te gaan. */
  terug?: string
}) {
  const router = useRouter()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [meetstaat, setMeetstaat] = useState<Meetstaat | null>(null)
  const [groepen, setGroepen] = useState<Groep[]>([])
  const [schilderData, setSchilderData] = useState<SchilderData | undefined>(schilderDataProp)
  const [actiefGroepId, setActiefGroepId] = useState<string | null>(null)
  const [openenOpen, setOpenenOpen] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [wijzigingsTeller, setWijzigingsTeller] = useState(0)

  // ─── Opslaan naar Supabase ────────────────────────────────────────────────
  // De meetstaat reist mee in de calculatie-snapshot van dit project. Elke
  // wijziging plant een stille opslag; bij wegnavigeren wordt die geflusht.
  const bewaarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vuil = useRef(false)

  const bewaarNu = useCallback(async (): Promise<boolean> => {
    if (!vuil.current) return true
    vuil.current = false
    if (bewaarTimer.current) { clearTimeout(bewaarTimer.current); bewaarTimer.current = null }
    const res = await bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId))
      .catch(() => ({ gelukt: false, fout: 'geen verbinding' }))
    if (!res.gelukt) {
      vuil.current = true
      toast.error(`Meetstaat opslaan mislukt: ${res.fout ?? 'onbekende fout'}`)
    }
    return res.gelukt
  }, [projectId])

  const planOpslag = useCallback(() => {
    vuil.current = true
    if (bewaarTimer.current) clearTimeout(bewaarTimer.current)
    bewaarTimer.current = setTimeout(() => { bewaarTimer.current = null; void bewaarNu() }, 1200)
  }, [bewaarNu])

  const onWijziging = useCallback(() => {
    setWijzigingsTeller(n => n + 1)
    planOpslag()
  }, [planOpslag])

  // Altijd de actuele opslagfunctie bij de hand voor de flush (geen stale closure).
  const bewaarRef = useRef(bewaarNu)
  useEffect(() => { bewaarRef.current = bewaarNu }, [bewaarNu])
  useEffect(() => {
    const flush = () => { void bewaarRef.current() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [])

  // De calculatie (incl. meetstaten) uit Supabase halen vóórdat we het scenario
  // bepalen. Zonder dit zou een rechtstreeks geopende meetstaat een nieuw,
  // leeg scenario aanmaken naast de bestaande calculatie.
  // Ingebed niet: opnieuw inlezen zou niet-opgeslagen calculatiewerk in dit tabblad
  // overschrijven met de (oudere) serverversie.
  useEffect(() => {
    let actief = true
    ;(async () => {
      if (!ingebed) {
        try {
          const snap = await laadCalculatieSnapshot(projectId)
          if (actief && snap) hydrateCalculatie(projectId, snap)
        } catch { /* zonder snapshot starten we met een vers scenario */ }
      }
      if (!actief) return
      // Alleen een scenario van dít project; anders terugvallen op de standaard.
      const gekozen = scenarioId ? getScenarios(projectId).find(s => s.id === scenarioId) : undefined
      setScenario(gekozen ?? maakStandaardScenario(projectId))
    })()
    return () => { actief = false }
  }, [projectId, scenarioId, ingebed])

  // Een verzonden calculatie is bevroren; de server gooit wijzigingen aan zijn regels
  // weg. Synchroniseren zou dus "gelukt" melden terwijl er niets blijft staan.
  const bevroren = !!scenario?.bevroren_op

  // Haal schilderdata op als die niet als prop is meegegeven (bijv. vanuit calculatie-overlay)
  useEffect(() => {
    if (schilderDataProp) return
    haalSchilderDropdownData()
      .then(data => setSchilderData(data))
      .catch(() => {/* geen schilder data beschikbaar */})
  }, [schilderDataProp])

  // Laad groepen
  useEffect(() => {
    if (!scenario) return
    const g = getGroepen(scenario.id)
    setGroepen(g)
    if (g.length > 0 && !actiefGroepId) setActiefGroepId(g[0].id)
  }, [scenario?.id])

  // Laad of maak meetstaat
  useEffect(() => {
    if (!scenario) return
    const bestaande = getMeetstaten(scenario.id)
    if (bestaande.length > 0) {
      // Neem de meest recent bewerkte
      const gesorteerd = [...bestaande].sort((a, b) =>
        b.aangepast_op.localeCompare(a.aangepast_op)
      )
      setMeetstaat(gesorteerd[0])
    }
  }, [scenario?.id])

  // Eerst opslaan, dan terug. Een los venster sluit zichzelf als de calculatie er
  // nog is (die herlaadt bij terugkomst); anders navigeren we erheen.
  const naarCalculatie = useCallback(async () => {
    const opgeslagen = await bewaarNu()
    // De overlay deelt het werkgeheugen met de calculatie, die zelf opnieuw opslaat.
    // Een los venster houdt zijn werk alleen hier: bij een mislukte opslag blijft het open.
    if (onSluit) { onSluit(); return }
    if (!opgeslagen) return
    if (window.opener && !window.opener.closed) {
      window.opener.focus()
      window.close()
      return
    }
    router.push(terug ?? '/aanvragen')
  }, [bewaarNu, onSluit, router, terug])

  const handleVervers = useCallback(() => {
    // Herlaad groepen (volgorde kan gewijzigd zijn in calculatie)
    if (scenario) {
      const g = getGroepen(scenario.id)
      setGroepen(g)
    }
    // Herlaad schilder data (nieuwe behandelingen kunnen zijn toegevoegd)
    haalSchilderDropdownData()
      .then(data => setSchilderData(data))
      .catch(() => {})
  }, [scenario])

  const handleNieuweMeetstaat = useCallback(() => {
    if (!scenario) return
    const ms = maakNieuweMeetstaat(projectId, scenario.id)
    setMeetstaat(ms)
    planOpslag()
    toast.success(`Meetstaat ${ms.code} aangemaakt`)
  }, [scenario, projectId, planOpslag])

  const handleMeetstaatOpenen = useCallback((ms: Meetstaat) => {
    setMeetstaat(ms)
    setOpenenOpen(false)
  }, [])

  // Sync aggregaten naar calculatieregels + componentregels
  const handleSync = useCallback(async () => {
    if (!meetstaat || !scenario) return
    if (bevroren) { toast.error(BEVROREN_MELDING); return }
    setIsSyncing(true)

    try {
      const bestaandeRegels = getCalculatieregels()
      const aggregaten = teVerwerken(getMeetregelAggregaten(meetstaat.id), new Set(bestaandeRegels.map(r => r.id)))

      // Haal schilder combinaties op per uniek type_id (batch)
      const typeIds = Array.from(new Set(aggregaten.map(a => a.type_id).filter(Boolean))) as string[]
      const combinatiesPerType = new Map<string, SchilderCombinatie[]>()
      await Promise.all(typeIds.map(async (typeId) => {
        try {
          const combs = await haalCombinaties(typeId)
          combinatiesPerType.set(typeId, combs)
        } catch {
          // Schilder data niet beschikbaar voor dit type — ga door zonder normen
        }
      }))

      let aangemaakt = 0
      let bijgewerkt = 0
      let opNul = 0

      for (const agg of aggregaten) {
        // Code vervallen: de calculatieregel gaat naar 0 en blijft zichtbaar staan.
        // Verwijderen laten we aan de calculator; daar kan meer aan hangen dan de hoeveelheid.
        if (isVervallen(agg)) {
          const bestaand = bestaandeRegels.find(r => r.id === agg.calculatieregel_id)
          if (bestaand) {
            slaCalculatieregelOp({ ...bestaand, hoeveelheid: 0 })
            opNul++
          }
          slaMeetregelAggregaatOp({ ...agg, is_gesynchroniseerd: true })
          continue
        }

        const bestekcode = normaliseerBestekcode(agg.bestekcode) || undefined
        // De code krijgt in de calculatie een eigen kolom; niet ook nog in de omschrijving.
        const omschrijving = calculatieregelOmschrijving(agg.onderdeel, agg.type, agg.behandeling)

        // Zoek bijpassende schilder combinatie via IDs. Alleen oude meetstaten dragen
        // nog een behandeling; nieuwe koppelen die in de calculatie per bestekscode.
        const combinaties = agg.type_id ? (combinatiesPerType.get(agg.type_id) ?? []) : []
        const combinatie = !agg.behandeling_id && !agg.behandeling.trim()
          ? undefined
          : agg.behandeling_id
            ? combinaties.find(c => c.behandeling_id === agg.behandeling_id)
            : combinaties.find(c => c.behandeling.naam.toLowerCase() === agg.behandeling.toLowerCase())

        let calculatieregelId: string

        if (agg.calculatieregel_id) {
          // Bijwerken bestaande calculatieregel
          const bestaand = bestaandeRegels.find(r => r.id === agg.calculatieregel_id)
          if (bestaand && bestaand.schilderbehandeling_id) {
            // In de calculatie al een behandeling gekoppeld: alleen de hoeveelheid
            // volgt de meetstaat. Omschrijving en normen zijn van de calculator.
            slaCalculatieregelOp({
              ...zonderCodeInOmschrijving(bestaand),
              hoeveelheid: agg.totaal_hoeveelheid,
              eenheid: agg.eenheid as Calculatieregel['eenheid'],
              meetstaat_aggregaat_id: agg.id,
              bestekcode,
            })
            slaMeetregelAggregaatOp({ ...agg, is_gesynchroniseerd: true })
            bijgewerkt++
            continue
          }
          if (bestaand) {
            slaCalculatieregelOp({
              ...bestaand,
              omschrijving,
              hoeveelheid: agg.totaal_hoeveelheid,
              eenheid: agg.eenheid as Calculatieregel['eenheid'],
              meetstaat_aggregaat_id: agg.id,
              bestekcode,
            })
            slaMeetregelAggregaatOp({ ...agg, is_gesynchroniseerd: true })
            calculatieregelId = bestaand.id
            bijgewerkt++
          } else {
            calculatieregelId = agg.calculatieregel_id
          }
        } else {
          // Nieuwe calculatieregel aanmaken
          const nieuweRegel: Calculatieregel = {
            id: nieuweId(),
            groep_id: agg.groep_id,
            omschrijving,
            hoeveelheid: agg.totaal_hoeveelheid,
            eenheid: agg.eenheid as Calculatieregel['eenheid'],
            volgorde: 0,
            opslag_pct: undefined,
            gemarkeerd: false,
            meetstaat_aggregaat_id: agg.id,
            bestekcode,
          }
          slaCalculatieregelOp(nieuweRegel)
          slaMeetregelAggregaatOp({
            ...agg,
            calculatieregel_id: nieuweRegel.id,
            is_gesynchroniseerd: true,
          })
          calculatieregelId = nieuweRegel.id
          aangemaakt++
        }

        // Componentregels uit de schilder normen (vervangt bestaande)
        if (combinatie) vervangNormenUitCombinatie(calculatieregelId, combinatie)
      }

      slaMeetstaatOp({ ...meetstaat, status: 'gesynchroniseerd' })
      setMeetstaat(prev => prev ? { ...prev, status: 'gesynchroniseerd' } : prev)
      // De aangemaakte/bijgewerkte calculatieregels moeten direct de database in,
      // anders staan ze alleen in deze sessie.
      vuil.current = true
      await bewaarNu()
      toast.success(t => (
        <span>
          Gesynchroniseerd: {aangemaakt} nieuwe, {bijgewerkt} bijgewerkte calculatieregels
          {opNul > 0 && `, ${opNul} op 0 gezet (code vervallen)`}.
          <button className="ml-2 font-medium text-everts underline"
            onClick={() => { toast.dismiss(t.id); void naarCalculatie() }}>
            Bekijk in calculatie
          </button>
        </span>
      ), { duration: 6000 })
    } catch (e) {
      toast.error('Synchronisatie mislukt')
    } finally {
      setIsSyncing(false)
    }
  }, [meetstaat, scenario, bevroren, bewaarNu, naarCalculatie])

  const ongesyncCount = meetstaat
    ? teVerwerken(getMeetregelAggregaten(meetstaat.id), new Set(getCalculatieregels().map(r => r.id))).length
    : 0
  void wijzigingsTeller // zorgt dat re-render triggered bij wijzigingen

  // Staat er na een wijziging weer iets open, dan is de meetstaat niet meer
  // gesynchroniseerd. Ook opgeslagen, zodat 'Openen' en de afdruk het goed tonen.
  useEffect(() => {
    if (!meetstaat) return
    const status = meetstaatStatus(meetstaat.status, ongesyncCount)
    if (status === meetstaat.status) return
    const bijgewerkt = { ...meetstaat, status }
    slaMeetstaatOp(bijgewerkt)
    setMeetstaat(bijgewerkt)
  }, [meetstaat, ongesyncCount])

  return (
    <div className="flex flex-col h-full bg-neutral-50">
      <MeetstaatKopbalk
        meetstaat={meetstaat}
        calculatie={printKop?.nummer || printKop?.naam
          ? `Calculatie ${[printKop.nummer, printKop.naam].filter(Boolean).join(' · ')}`
          : ''}
        terugLabel={onSluit || terug ? 'Terug naar calculatie' : 'Aanvragen'}
        terugTitel={onSluit || terug ? 'Meetstaat sluiten en terug naar de calculatie' : 'Terug naar aanvragen'}
        aantalOpen={ongesyncCount}
        isSyncing={isSyncing}
        bevroren={bevroren}
        bevrorenMelding={BEVROREN_MELDING}
        meerwerk={!!scenario?.meerwerk_regel_id}
        versie={scenario?.versie ?? 1}
        onTerug={() => { void naarCalculatie() }}
        onVervers={handleVervers}
        onNieuw={handleNieuweMeetstaat}
        onOpenen={() => setOpenenOpen(true)}
        onAfdrukken={() => {
          if (meetstaat) openMeetstaatPdf({ meetstaat, groepen, projectNaam: printKop?.naam, projectNummer: printKop?.nummer })
        }}
        onSync={() => { void handleSync() }}
      />

      {/* ─── Hoofd content ───────────────────────────────────────────────── */}
      {!meetstaat ? (
        // Geen meetstaat: toon welkomscherm
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 bg-brand-50 rounded-xl flex items-center justify-center mx-auto">
              <Ruler className="w-8 h-8 text-brand-700" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">Geen meetstaat actief</h2>
            <p className="text-sm text-neutral-500">
              Maak een nieuwe meetstaat aan of open een bestaande om te beginnen.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="primary" size="lg" onClick={handleNieuweMeetstaat}>Nieuwe meetstaat</Button>
              <Button variant="outline" size="lg" onClick={() => setOpenenOpen(true)}>Openen</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Groepenboom links */}
          <GroepenboomPanel
            groepen={groepen}
            actiefGroepId={actiefGroepId}
            meetstaatId={meetstaat.id}
            onGroepSelecteer={setActiefGroepId}
          />

          {/* Meetregel grid centraal */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {actiefGroepId ? (
              <MeetregelGrid
                meetstaatId={meetstaat.id}
                groepId={actiefGroepId}
                groepen={groepen}
                onWijziging={onWijziging}
                schilderData={schilderData}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Kies een groep links om meetregels in te voeren
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: meetstaat openen */}
      {openenOpen && scenario && (
        <MeetstaatOpenenModal
          scenarioId={scenario.id}
          onSelecteer={handleMeetstaatOpenen}
          onSluit={() => setOpenenOpen(false)}
        />
      )}
    </div>
  )
}
