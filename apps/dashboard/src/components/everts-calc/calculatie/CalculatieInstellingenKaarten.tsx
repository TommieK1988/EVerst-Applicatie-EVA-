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
import { FormField } from '@/components/ui/form-field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useDialogen } from '@/components/ui/dialogen'
import OfferteBijlagenKaart from './OfferteBijlagenKaart'
import OfferteTekstEditor from './OfferteTekstEditor'

// ─── Component ────────────────────────────────────────────────────────────────

/** Radix Select kent geen lege waarde; dit staat voor "geen voorkeur". */
const GEEN = '__geen'


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
  /** Tekst op de Doorgaan-knop in vereist-modus. */
  doorgaanLabel?: string
  /** Voor een venster dat zelf de Doorgaan-knop toont (offertevenster): meldt of beide
   *  keuzes gemaakt zijn, en geeft de functie die alles eerst wegschrijft. Dan verschijnt
   *  de eigen knop onderaan niet. */
  onStatus?: (klaar: boolean, bewaarNu: () => Promise<void>) => void
}

export default function CalculatieInstellingenKaarten({
  projectId, dossierId, scenarioId, vereist = false, onVoltooid, doorgaanLabel = 'Doorgaan naar offerte', onStatus,
}: Props) {
  const [scenario, setScenario]                     = useState<Scenario | null>(null)
  const [betalingscondities, setBetalingscondities] = useState<Betalingsconditie[] | null>(null)
  const [algVoorwaarden, setAlgVoorwaarden]         = useState<AlgemeneVoorwaarden[] | null>(null)
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
    supabase.from('betalingscondities').select('*').is('gearchiveerd_op', null).order('volgorde').order('naam')
      .then(({ data }: { data: Betalingsconditie[] | null }) => setBetalingscondities(data ?? []))
    supabase.from('algemene_voorwaarden').select('*').is('gearchiveerd_op', null).order('naam')
      .then(({ data }: { data: AlgemeneVoorwaarden[] | null }) => setAlgVoorwaarden(data ?? []))
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
          toast.error(res.fout ?? 'Opslaan van voorwaarden en tekst mislukt')
        }
      })
      .catch((e: unknown) => {
        openstaand.current = true
        toast.error(e instanceof Error ? e.message : 'Opslaan van voorwaarden en tekst mislukt')
      })
      .finally(() => { lopend.current = null; setOpslaan(false) })
    lopend.current = taak
    await taak
  }, [projectId])

  // Nog niet weggeschreven wijziging alsnog opslaan als het dialoog sluit.
  useEffect(() => () => { void bewaarNu() }, [bewaarNu])

  const klaar = !!scenario
    && !!betalingscondities?.some(b => b.id === scenario.betalingsconditie_id)
    && !!algVoorwaarden?.some(av => av.id === scenario.algemene_voorwaarden_id)
  useEffect(() => { onStatus?.(klaar, bewaarNu) }, [onStatus, klaar, bewaarNu])

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


  // Een id dat niet (meer) in de lijst staat is gearchiveerd of verwijderd: dat
  // telt als niet gekozen. De keuzelijst valt dan terug op leeg in plaats van
  // stilletjes de eerste optie te tonen, en de offerte wordt niet geweigerd.
  const conditieId = betalingscondities?.some(b => b.id === scenario.betalingsconditie_id)
    ? scenario.betalingsconditie_id ?? null : null
  const voorwaardenId = algVoorwaarden?.some(av => av.id === scenario.algemene_voorwaarden_id)
    ? scenario.algemene_voorwaarden_id ?? null : null
  const verwijderd = (!!betalingscondities && !!scenario.betalingsconditie_id && !conditieId)
    || (!!algVoorwaarden && !!scenario.algemene_voorwaarden_id && !voorwaardenId)
  const beideGekozen = !!conditieId && !!voorwaardenId

  const bevroren = !!scenario.bevroren_op

  return (
    <div className="flex flex-col gap-5">

      {verwijderd ? (
        <Alert tone="warning" title="Gekozen voorwaarden bestaan niet meer">
          De betalingscondities of algemene voorwaarden op deze calculatie zijn onder Instellingen gearchiveerd of verwijderd.
          Kies ze opnieuw, anders kan er geen offerte of interne begroting gemaakt worden.
        </Alert>
      ) : vereist && !beideGekozen && (
        <Alert tone="warning" title="Kies eerst betalingscondities én algemene voorwaarden">
          Deze zijn verplicht voordat je een offerte kunt aanmaken. Ze worden vastgelegd op deze calculatie.
        </Alert>
      )}

      {/* ─── Betalingscondities en algemene voorwaarden ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Betalingscondities" upper>
          <Select
            value={conditieId ?? GEEN}
            onValueChange={v => wijzig({ betalingsconditie_id: v === GEEN ? null : v }, true)}
            disabled={bevroren}
          >
            <SelectTrigger aria-label="Betalingscondities"><SelectValue placeholder="Kies…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={GEEN}>Geen voorkeur</SelectItem>
              {(betalingscondities ?? []).map(b => <SelectItem key={b.id} value={b.id}>{b.naam}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Algemene voorwaarden" upper>
          <Select
            value={voorwaardenId ?? GEEN}
            onValueChange={v => wijzig({ algemene_voorwaarden_id: v === GEEN ? null : v }, true)}
            disabled={bevroren}
          >
            <SelectTrigger aria-label="Algemene voorwaarden"><SelectValue placeholder="Kies…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={GEEN}>Geen voorkeur</SelectItem>
              {(algVoorwaarden ?? []).map(av => (
                <SelectItem key={av.id} value={av.id}>
                  {av.naam}{av.versie ? ` (${av.versie})` : ''}{av.is_standaard ? ' (standaard)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* ─── Inleidende tekst (per calculatie) ───────────────────────────────── */}
      {/* Breed, en hij groeit mee met de tekst: zo zie je hoe de alinea's in de
          offerte uitvallen in plaats van een smal vakje met afgebroken regels. */}
      <FormField
        label="Inleidende tekst" upper
        helper={<>Verschijnt in de offerte op de plek van
          <code className="mx-1 rounded bg-neutral-100 px-1 py-0.5 text-[11px]">{'{@inleiding}'}</code>
          in de opmaak. Vet, cursief, onderstreept en opsommingen komen mee.</>}
      >
        <OfferteTekstEditor
          waarde={scenario.inleiding_tekst ?? ''}
          onChange={html => wijzig({ inleiding_tekst: html })}
          readOnly={bevroren}
        />
      </FormField>

      {/* ─── PDF-bijlages (eigen tabel, niet de scenario-snapshot) ───────────── */}
      <OfferteBijlagenKaart
        projectId={projectId}
        dossierId={dossierId}
        scenarioId={scenario.id}
        readOnly={bevroren}
      />

      {vereist && !onStatus && (
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
            {opslaan ? 'Opslaan…' : doorgaanLabel}
          </Button>
        </div>
      )}

    </div>
  )
}
