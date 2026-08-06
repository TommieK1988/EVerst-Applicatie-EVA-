'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getScenarios, slaScenarioOp } from '@/lib/everts-calc/local-store'
import { verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import { bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { createClient } from '@/lib/everts-calc/supabase/client'
import type { Scenario } from '@/lib/everts-calc/types'
import type { Betalingsconditie } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import type { AlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useDialogen } from '@/components/ui/dialogen'

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  /** Calculatie waar de keuzes op horen. Leeg → standaard/eerste scenario. Geef dit
   *  mee vanuit een geopende calculatie: na een revisie is het geopende scenario een
   *  ander dan het standaard-scenario, en de offerte wordt van het geopende gemaakt. */
  scenarioId?: string
  /** Verplicht-modus: toon een waarschuwing + "Doorgaan"-knop die pas actief is als
   *  beide keuzes gemaakt zijn (gebruikt vóór het aanmaken van een offerte). */
  vereist?: boolean
  /** Aangeroepen wanneer in vereist-modus op Doorgaan wordt geklikt (beide gekozen). */
  onVoltooid?: () => void
}

export default function CalculatieInstellingenKaarten({ projectId, scenarioId, vereist = false, onVoltooid }: Props) {
  const [scenario, setScenario]                     = useState<Scenario | null>(null)
  const [betalingscondities, setBetalingscondities] = useState<Betalingsconditie[]>([])
  const [algVoorwaarden, setAlgVoorwaarden]         = useState<AlgemeneVoorwaarden[]>([])
  // Standaard offerte-sjabloon (quote_templates) — bron voor "Laden uit standaardsjabloon".
  const [standaardSjabloon, setStandaardSjabloon]   = useState<{
    standaard_voorwaarden: string | null
    standaard_uitsluitingen: string | null
    standaard_opmerkingen: string | null
  } | null>(null)
  const [opslaan, setOpslaan] = useState(false)
  const { bevestig } = useDialogen()

  // Wachtende opslag: `openstaand` = er is iets gewijzigd dat nog niet in Supabase
  // staat; `lopend` = de schrijfactie die op dit moment onderweg is.
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openstaand = useRef(false)
  const lopend     = useRef<Promise<void> | null>(null)

  useEffect(() => {
    const scs = getScenarios(projectId)
    if (scs.length === 0) return
    const sc = (scenarioId ? scs.find(s => s.id === scenarioId) : undefined)
      ?? scs.find(s => s.is_standaard) ?? scs[0]
    setScenario(sc)

    // Betalingscondities + AV ophalen via Supabase browser client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    supabase.from('betalingscondities').select('*').order('volgorde').order('naam')
      .then(({ data }: { data: Betalingsconditie[] | null }) => setBetalingscondities(data ?? []))
    supabase.from('algemene_voorwaarden').select('*').order('naam')
      .then(({ data }: { data: AlgemeneVoorwaarden[] | null }) => setAlgVoorwaarden(data ?? []))
    supabase.from('quote_templates')
      .select('standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
      .eq('is_standaard', true).maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any }) => setStandaardSjabloon(data ?? null))
  }, [projectId, scenarioId])

  /**
   * Schrijft de calculatie (inclusief dit scenario) naar Supabase.
   *
   * Zonder deze stap blijft de keuze alleen in het werkgeheugen van deze browser
   * staan: een collega ziet 'm dan niet, en het offerte-dialoog haalt de gedeelde
   * snapshot op vóór het aanmaken — die overschrijft de keuze weer met leeg.
   */
  const bewaarNu = useCallback(async (): Promise<void> => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    // Een al lopende schrijfactie eerst afmaken, anders keert "Doorgaan" terug
    // vóórdat de keuze op de server staat.
    if (lopend.current) await lopend.current
    if (!openstaand.current) return
    openstaand.current = false
    setOpslaan(true)
    const taak = bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId))
      .then(res => {
        if (!res.gelukt) {
          openstaand.current = true
          toast.error(res.fout ?? 'Opslaan van de offerte-instellingen mislukt')
        }
      })
      .catch((e: unknown) => {
        openstaand.current = true
        toast.error(e instanceof Error ? e.message : 'Opslaan van de offerte-instellingen mislukt')
      })
      .finally(() => { lopend.current = null; setOpslaan(false) })
    lopend.current = taak
    await taak
  }, [projectId])

  // Nog niet weggeschreven wijziging alsnog opslaan als het dialoog sluit.
  useEffect(() => () => { void bewaarNu() }, [bewaarNu])

  if (!scenario) return null

  /**
   * Sla scenario op voor offerte-instellingen (betalingsconditie, AV, teksten).
   * `direct` voor keuzelijsten (één klik = klaar), debounce voor tekstvelden.
   */
  const wijzig = (patch: Partial<Scenario>, direct = false) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
    openstaand.current = true
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (direct) void bewaarNu()
    else saveTimer.current = setTimeout(() => { saveTimer.current = null; void bewaarNu() }, 800)
  }

  /** Laad de drie teksten uit het standaard offerte-sjabloon (overschrijft huidige). */
  const laadUitSjabloon = async () => {
    if (!standaardSjabloon) return
    if (!await bevestig({
      titel: 'Huidige teksten overschrijven met het standaardsjabloon?',
      omschrijving: 'Voorwaarden, uitsluitingen en opmerkingen worden vervangen.',
      bevestigLabel: 'Overschrijven',
    })) return
    wijzig({
      voorwaarden_tekst:   standaardSjabloon.standaard_voorwaarden ?? '',
      uitsluitingen_tekst: standaardSjabloon.standaard_uitsluitingen ?? '',
      opmerkingen_tekst:   standaardSjabloon.standaard_opmerkingen ?? '',
    }, true)
  }

  const TEKSTVELDEN: { key: 'voorwaarden_tekst' | 'uitsluitingen_tekst' | 'opmerkingen_tekst'; label: string; placeholder: string }[] = [
    { key: 'voorwaarden_tekst',   label: 'Voorwaarden',   placeholder: 'Voorwaarden voor deze offerte…' },
    { key: 'uitsluitingen_tekst', label: 'Uitsluitingen', placeholder: 'Wat is niet inbegrepen…' },
    { key: 'opmerkingen_tekst',   label: 'Opmerkingen',   placeholder: 'Aanvullende opmerkingen…' },
  ]

  const beideGekozen = !!scenario.betalingsconditie_id && !!scenario.algemene_voorwaarden_id

  return (
    <div className="grid grid-cols-1 gap-4">

      {vereist && !beideGekozen && (
        <Alert tone="warning" title="Kies eerst betalingscondities én algemene voorwaarden">
          Deze zijn verplicht voordat je een offerte kunt aanmaken. Ze worden vastgelegd op deze calculatie.
        </Alert>
      )}

      {/* ─── Offerte-instellingen ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>Offerte-instellingen</CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Betalingscondities</label>
              <select
                value={scenario.betalingsconditie_id ?? ''}
                onChange={e => wijzig({ betalingsconditie_id: e.target.value || null }, true)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white"
              >
                <option value="">— Geen voorkeur —</option>
                {betalingscondities.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.naam}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Algemene Voorwaarden</label>
              <select
                value={scenario.algemene_voorwaarden_id ?? ''}
                onChange={e => wijzig({ algemene_voorwaarden_id: e.target.value || null }, true)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white"
              >
                <option value="">— Geen voorkeur —</option>
                {algVoorwaarden.map(av => (
                  <option key={av.id} value={av.id}>
                    {av.naam}{av.versie ? ` (${av.versie})` : ''}{av.is_standaard ? ' (standaard)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ─── Vrije offerte-teksten (per calculatie) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <span>Voorwaarden &amp; opmerkingen</span>
          {standaardSjabloon && (
            <Button variant="secondary" size="sm" onClick={laadUitSjabloon}>
              Laden uit standaardsjabloon
            </Button>
          )}
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TEKSTVELDEN.map(veld => (
              <div key={veld.key}>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">{veld.label}</label>
                <textarea
                  value={scenario[veld.key] ?? ''}
                  onChange={e => wijzig({ [veld.key]: e.target.value })}
                  rows={8}
                  placeholder={veld.placeholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-y leading-relaxed"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Deze teksten worden op de offerte overgenomen. Laat je een veld leeg, dan gebruikt de offerte het standaardsjabloon.
          </p>
        </CardBody>
      </Card>

      {vereist && (
        <div className="flex justify-end">
          {/* Eerst de keuze vastleggen, dan pas door: het offerte-dialoog haalt bij
              openen de gedeelde calculatie op en zou een niet-opgeslagen keuze
              overschrijven. */}
          <Button
            variant="primary"
            size="md"
            disabled={!beideGekozen || opslaan}
            onClick={async () => { await bewaarNu(); onVoltooid?.() }}
          >
            {opslaan ? 'Opslaan…' : 'Doorgaan naar offerte'}
          </Button>
        </div>
      )}

    </div>
  )
}
