'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, FileText } from 'lucide-react'
import { getLayouts } from '@/app/(platform)/everts-calc/actions/quote-instellingen'
import { getBetalingscondities } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import { maakQuoteVanuitProjectMetImport } from '@/app/(platform)/everts-calc/actions/quotes'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import type { Groep, Calculatieregel } from '@/lib/everts-calc/types'
import { buildNummers, buildStructuur } from '@/lib/everts-calc/import-structuur'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  /** Scenario (calculatie) waarvan de offerte gemaakt wordt. Zonder → standaard/eerste. */
  scenarioId?: string
  /** Dossier waarin de offerte inline wordt aangemaakt — koppelt project ⇄ dossier. */
  dossierId?: string | null
  projectNaam: string
  clientNaam: string | null
  projectNummer: string | null
  type: QuoteType
  /** Waar je naartoe gaat na aanmaken. Standaard de losse offerte-preview; geef een
   *  dossier-tab-URL mee om in het dossier te blijven. */
  terugNaarUrl?: string
}

interface Layout {
  id: string
  naam: string
  beschrijving?: string | null
  is_standaard: boolean
}

export default function OfferteAanmakenModal({
  open, onClose,
  projectId, scenarioId, dossierId, projectNaam, clientNaam, projectNummer, type, terugNaarUrl,
}: Props) {
  const router = useRouter()
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [gekozenLayoutId, setGekozenLayoutId] = useState<string | null>(null)
  const [heeftBetalingscondities, setHeeftBetalingscondities] = useState(true)
  const [aantalRegels, setAantalRegels] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchingData, setFetchingData] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetchingData(true)

    Promise.all([getLayouts(), getBetalingscondities()]).then(([lays, bcs]) => {
      setLayouts(lays)
      const standaard = lays.find((l: Layout) => l.is_standaard)
      setGekozenLayoutId(standaard?.id ?? lays[0]?.id ?? null)
      setHeeftBetalingscondities(bcs.length > 0)
      setFetchingData(false)
    }).catch(() => setFetchingData(false))

    // Tel calculatieregels voor het gekozen (of standaard) scenario
    import('@/lib/everts-calc/local-store').then(({ getScenarios, getGroepen, getCalculatieregels }) => {
      try {
        const scenarios = getScenarios(projectId)
        const actief = scenarioId
          ? scenarios.find(s => s.id === scenarioId)
          : (scenarios.find(s => s.is_standaard) ?? scenarios[0])
        const groepen = actief ? getGroepen(actief.id) : getGroepen()
        const count = groepen.reduce((sum, g) => sum + getCalculatieregels(g.id).length, 0)
        setAantalRegels(count)
      } catch {
        setAantalRegels(0)
      }
    })
  }, [open, projectId, scenarioId])

  async function handleAanmaken() {
    setLoading(true)
    try {
      const { getGroepen, getCalculatieregels, getComponentregels, getScenarios, slaScenarioOp } = await import('@/lib/everts-calc/local-store')
      const { berekenCalculatieregel } = await import('@/lib/everts-calc/calculations')

      // Filter op het gekozen (of standaard) scenario van dit project
      const scenarios = getScenarios(projectId)
      const actiefScenario = scenarioId
        ? scenarios.find(s => s.id === scenarioId)
        : (scenarios.find(s => s.is_standaard) ?? scenarios[0])

      // Zorg dat de calculatie een nummer heeft (kan nog ontbreken als het
      // reserve-effect nog niet klaar was) zodat offerte en calculatie hetzelfde
      // nummer krijgen, en dat de versie-velden geïnitialiseerd zijn (v1, root =
      // zichzelf) zodat de versiereeks vanaf de eerste offerte klopt.
      let offerteNummer = actiefScenario?.nummer ?? null
      const scenarioVersie = actiefScenario?.versie ?? 1
      if (actiefScenario) {
        const patch: Record<string, unknown> = {}
        if (!offerteNummer) {
          const { reserveerOfferteNummer } = await import('@/app/(platform)/everts-calc/actions/quotes')
          offerteNummer = await reserveerOfferteNummer()
          if (offerteNummer) patch.nummer = offerteNummer
        }
        if (actiefScenario.versie == null) patch.versie = 1
        if (actiefScenario.versie_root_id == null) patch.versie_root_id = actiefScenario.id
        if (Object.keys(patch).length > 0) {
          slaScenarioOp({ ...actiefScenario, ...patch })
        }
      }

      const alleGroepen: Groep[] = actiefScenario ? getGroepen(actiefScenario.id) : getGroepen()
      const alleRegels: Calculatieregel[] = getCalculatieregels()
      const alleComps = getComponentregels()

      const nummers = buildNummers(alleGroepen)
      const DEFAULT_OPSLAG = 18
      const importRegels: Parameters<typeof maakQuoteVanuitProjectMetImport>[0]['importRegels'] = []

      for (const groep of alleGroepen.sort((a, b) => a.volgorde - b.volgorde)) {
        const regelsBijGroep = alleRegels
          .filter(r => r.groep_id === groep.id)
          .sort((a, b) => a.volgorde - b.volgorde)

        if (regelsBijGroep.length === 0) continue

        for (const regel of regelsBijGroep) {
          const comps = alleComps.filter((c: { calculatieregel_id: string }) => c.calculatieregel_id === regel.id)
          const berekend = berekenCalculatieregel(regel, comps, regel.opslag_pct ?? DEFAULT_OPSLAG)

          importRegels.push({
            groep_id: groep.id,
            groep_naam: groep.naam,
            groep_nummer: nummers.get(groep.id) ?? null,
            groep_niveau: groep.niveau,
            groep_optioneel: groep.optioneel ?? false,
            omschrijving: regel.omschrijving,
            hoeveelheid: regel.hoeveelheid,
            eenheid: regel.eenheid,
            eenheidsprijs: +berekend.vp_pe.toFixed(2),
            kostprijs_pe: +berekend.kp_pe.toFixed(2),
            uren_pe: +berekend.uren_pe.toFixed(3),
            calculatieregel_id: regel.id,
            opmerking: regel.werkomschrijving ?? null,
            is_stelpost: regel.is_stelpost ?? false,
            schilderbehandeling: regel.schilderbehandeling ?? null,
            werkomschrijving_afbeeldingen: regel.werkomschrijving_afbeeldingen ?? null,
          })
        }
      }

      // Structuur incl. lege hoofdstuk-groepen (niveau 1), in outline-volgorde.
      const groepenMetRegels = new Set(importRegels.map(r => r.groep_id))
      const structuur = buildStructuur(alleGroepen, gid => groepenMetRegels.has(gid), nummers)

      const { id } = await maakQuoteVanuitProjectMetImport({
        projectId,
        scenarioId: actiefScenario?.id ?? null,
        // Offerte neemt het nummer van de calculatie over (leeg → DB genereert er een).
        quoteNummer: offerteNummer,
        // Offerte erft ook de versie van de calculatie.
        versie: scenarioVersie,
        dossierId,
        projectNaam,
        clientNaam,
        projectNummer,
        type,
        layoutId: gekozenLayoutId,
        // Keuzes uit het Offerte-instellingen-blok (scenario).
        betalingsconditieId: actiefScenario?.betalingsconditie_id ?? null,
        voorwaardenId: actiefScenario?.algemene_voorwaarden_id ?? null,
        // Vrije offerte-teksten van de calculatie (leeg → standaardsjabloon).
        voorwaardenTekst: actiefScenario?.voorwaarden_tekst ?? null,
        uitsluitingenTekst: actiefScenario?.uitsluitingen_tekst ?? null,
        opmerkingenTekst: actiefScenario?.opmerkingen_tekst ?? null,
        importRegels,
        structuur,
      })

      // In het dossier blijven: terug naar de dossier-tab en direct de nieuwe offerte
      // inline openen (?offerte={id}); anders de losse offerte-preview.
      if (terugNaarUrl) {
        const sep = terugNaarUrl.includes('?') ? '&' : '?'
        router.push(`${terugNaarUrl}${sep}offerte=${id}`)
      } else {
        router.push(`/everts-calc/quotes/${id}/preview`)
      }
    } catch (e) {
      console.error('Offerte aanmaken mislukt:', e)
      setLoading(false)
    }
  }

  const titel = type === 'interne_calculatie' ? 'Interne begroting aanmaken' : 'Offerte aanmaken'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onClose() }}>
      <DialogContent size="sm">
        {/* Header */}
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
        </DialogHeader>

        {/* Body */}
        <DialogBody className="space-y-5">

          {/* Betalingscondities waarschuwing */}
          {!heeftBetalingscondities && !fetchingData && (
            <Alert tone="warning" title="Geen betalingscondities ingesteld.">
              <a href="/instellingen/betalingscondities" className="underline hover:opacity-80">
                Ga naar Instellingen
              </a>{' '}
              om dit in te stellen.
            </Alert>
          )}

          {/* Lay-out keuze */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lay-out</div>
            {fetchingData ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Spinner size="sm" />
                <span>Laden…</span>
              </div>
            ) : layouts.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">Geen lay-outs beschikbaar. Je kunt later een lay-out kiezen.</p>
            ) : (
              <div className="space-y-2">
                {layouts.map(layout => (
                  <button
                    key={layout.id}
                    onClick={() => setGekozenLayoutId(layout.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      gekozenLayoutId === layout.id
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      gekozenLayoutId === layout.id ? 'bg-emerald-500' : 'bg-slate-100'
                    }`}>
                      {gekozenLayoutId === layout.id
                        ? <Check className="w-3.5 h-3.5 text-white" />
                        : <FileText className="w-3.5 h-3.5 text-slate-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{layout.naam}</div>
                      {layout.beschrijving && (
                        <div className="text-xs text-slate-500 truncate">{layout.beschrijving}</div>
                      )}
                    </div>
                    {layout.is_standaard && (
                      <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        standaard
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Calculatieregels info */}
          {aantalRegels !== null && (
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {aantalRegels === 0
                ? 'Geen calculatieregels gevonden — je kunt ze later handmatig toevoegen.'
                : `${aantalRegels} calculatieregel${aantalRegels !== 1 ? 's' : ''} worden geïmporteerd.`
              }
            </div>
          )}
        </DialogBody>

        {/* Footer */}
        <DialogFooter>
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={loading}
          >
            Annuleren
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleAanmaken}
            disabled={loading || fetchingData}
            loading={loading}
          >
            {loading ? 'Aanmaken…' : 'Aanmaken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
