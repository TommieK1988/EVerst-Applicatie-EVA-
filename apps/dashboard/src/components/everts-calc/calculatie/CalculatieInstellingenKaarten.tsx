'use client'

import { useState, useEffect } from 'react'
import { getScenarios, slaScenarioOp } from '@/lib/everts-calc/local-store'
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
  /** Verplicht-modus: toon een waarschuwing + "Doorgaan"-knop die pas actief is als
   *  beide keuzes gemaakt zijn (gebruikt vóór het aanmaken van een offerte). */
  vereist?: boolean
  /** Aangeroepen wanneer in vereist-modus op Doorgaan wordt geklikt (beide gekozen). */
  onVoltooid?: () => void
}

export default function CalculatieInstellingenKaarten({ projectId, vereist = false, onVoltooid }: Props) {
  const [scenario, setScenario]                     = useState<Scenario | null>(null)
  const [betalingscondities, setBetalingscondities] = useState<Betalingsconditie[]>([])
  const [algVoorwaarden, setAlgVoorwaarden]         = useState<AlgemeneVoorwaarden[]>([])
  // Standaard offerte-sjabloon (quote_templates) — bron voor "Laden uit standaardsjabloon".
  const [standaardSjabloon, setStandaardSjabloon]   = useState<{
    standaard_voorwaarden: string | null
    standaard_uitsluitingen: string | null
    standaard_opmerkingen: string | null
  } | null>(null)
  const { bevestig } = useDialogen()

  useEffect(() => {
    const scs = getScenarios(projectId)
    if (scs.length === 0) return
    const sc = scs.find(s => s.is_standaard) ?? scs[0]
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
  }, [projectId])

  if (!scenario) return null

  /** Sla scenario op voor offerte-instellingen (betalingsconditie, AV). */
  const wijzig = (patch: Partial<Scenario>) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
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
    })
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
                onChange={e => wijzig({ betalingsconditie_id: e.target.value || null })}
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
                onChange={e => wijzig({ algemene_voorwaarden_id: e.target.value || null })}
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
          <Button variant="primary" size="md" disabled={!beideGekozen} onClick={onVoltooid}>
            Doorgaan naar offerte
          </Button>
        </div>
      )}

    </div>
  )
}
