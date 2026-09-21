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
import OfferteBijlagenKaart from './OfferteBijlagenKaart'
import OfferteTekstEditor from './OfferteTekstEditor'

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  /** Dossier waar deze calculatie bij hoort — nodig om bijlages uit de dossiermap
   *  te kunnen kiezen. Leeg bij een calculatie buiten een dossier. */
  dossierId?: string
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

/**
 * De drie standaardteksten uit het offerte-sjabloon als één opgemaakt blok. Ze staan
 * daar nog als platte tekst met streepjes-opsommingen; die worden hier echte bullets,
 * zodat "Laden uit standaardsjabloon" meteen bruikbare opmaak oplevert.
 */
function sjabloonAlsBlok(sjabloon: {
  standaard_voorwaarden: string | null
  standaard_uitsluitingen: string | null
  standaard_opmerkingen: string | null
}): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const blok = (kop: string, tekst: string | null): string => {
    const regels = (tekst ?? '').split(/\r?\n/).map(r => r.trim()).filter(r => r !== '')
    if (regels.length === 0) return ''
    const uit: string[] = [`<p><strong>${kop}</strong></p>`]
    let inLijst = false
    for (const regel of regels) {
      const bullet = /^[-•*]\s+|^\d+[.)]\s+/.test(regel)
      if (bullet && !inLijst) { uit.push('<ul>'); inLijst = true }
      if (!bullet && inLijst) { uit.push('</ul>'); inLijst = false }
      uit.push(bullet
        ? `<li>${esc(regel.replace(/^[-•*]\s+|^\d+[.)]\s+/, ''))}</li>`
        : `<p>${esc(regel)}</p>`)
    }
    if (inLijst) uit.push('</ul>')
    return uit.join('')
  }
  return [
    blok('Voorwaarden', sjabloon.standaard_voorwaarden),
    blok('Uitsluitingen', sjabloon.standaard_uitsluitingen),
    blok('Opmerkingen', sjabloon.standaard_opmerkingen),
  ].join('')
}

export default function CalculatieInstellingenKaarten({ projectId, dossierId, scenarioId, vereist = false, onVoltooid }: Props) {
  const [scenario, setScenario]                     = useState<Scenario | null>(null)
  const [betalingscondities, setBetalingscondities] = useState<Betalingsconditie[]>([])
  const [algVoorwaarden, setAlgVoorwaarden]         = useState<AlgemeneVoorwaarden[]>([])
  // Standaard offerte-sjabloon (quote_templates) — bron voor "Laden uit standaardsjabloon".
  const [standaardSjabloon, setStandaardSjabloon]   = useState<{
    standaard_inleiding: string | null
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
      .select('standaard_inleiding, standaard_voorwaarden, standaard_uitsluitingen, standaard_opmerkingen')
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
      omschrijving: 'De inleidende tekst en het offertetekstblok worden vervangen.',
      bevestigLabel: 'Overschrijven',
    })) return
    wijzig({
      inleiding_tekst: standaardSjabloon.standaard_inleiding ?? '',
      offerteteksten: sjabloonAlsBlok(standaardSjabloon),
    }, true)
  }


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
          <span>Offerteteksten</span>
          {standaardSjabloon && (
            <Button variant="secondary" size="sm" onClick={laadUitSjabloon}>
              Laden uit standaardsjabloon
            </Button>
          )}
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Inleidende tekst</label>
              <textarea
                value={scenario.inleiding_tekst ?? ''}
                onChange={e => wijzig({ inleiding_tekst: e.target.value })}
                rows={4}
                placeholder="Inleiding bovenaan de offerte…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-y leading-relaxed"
              />
              <p className="text-xs text-slate-400 mt-1">
                Verschijnt waar in de offerte-layout
                <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-[11px]">{'{offerte.inleiding}'}</code>
                staat. Leeg → de tekst uit het standaardsjabloon.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Offertetekst</label>
              <OfferteTekstEditor
                waarde={scenario.offerteteksten ?? ''}
                onChange={html => wijzig({ offerteteksten: html })}
                readOnly={!!scenario.bevroren_op}
                placeholder="Voorwaarden, uitsluitingen, opmerkingen… — opmaken met de knoppen hierboven."
              />
              <p className="text-xs text-slate-400 mt-1">
                Eén blok voor alles wat je bij de offerte wilt vermelden. Vet, cursief en opsommingen
                komen mee in de PDF, op de plek van
                <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-[11px]">{'{@offerteteksten}'}</code>
                in de offerte-layout.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ─── PDF-bijlages (eigen tabel, niet de scenario-snapshot) ───────────── */}
      <OfferteBijlagenKaart
        projectId={projectId}
        dossierId={dossierId}
        scenarioId={scenario.id}
        readOnly={!!scenario.bevroren_op}
      />

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
