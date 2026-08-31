'use client'

/**
 * C4yDropCard — sleep een Calc4You werkbegroting (.c4y) op de Informatie-tab.
 *
 * Flow:
 *  1. Parse het bestand client-side (DOMParser is browser-only).
 *  2. Zorg voor een gekoppeld EVA-calculatieproject + standaard-scenario.
 *  3. Schrijf groepen/regels/componenten weg (vervangt bestaande calculatie).
 *  4. In de opdracht-fase: haal automatisch over naar de werkbegroting.
 *  5. Meld terug zodat de Financiële-totalen kaart de verkoop/BTW kan herberekenen.
 */

import { useState } from 'react'
import { FileCode2, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  Card, CardHeader, CardBody, Button,
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui'
import { FileUpload } from '@/components/ui/file-upload'
import { parseC4y, type C4yParseResultaat } from '@/lib/everts-calc/c4y-parser'
import {
  maakStandaardScenario, slaScenarioOp,
  getGroepen, verwijderGroep,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp,
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie, verwijderWerkbegroting,
} from '@/lib/everts-calc/local-store'
import { berekenScenarioKostprijs, formatEuro } from '@/lib/everts-calc/calculations'
import { maakProjectVanAanvraag, setProjectStatus } from '@/app/(platform)/everts-calc/actions/projecten'
import { syncCalculatieNaarSupabase, bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { verzamelSyncData, verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import { koppelDossierAanProject } from '@/lib/dossiers/actions'
import type { DossierSectie } from '@/components/dossiers/types'

interface Preview {
  resultaat:    C4yParseResultaat
  projectId:    string
  scenarioId:   string
  kostprijs:    number
  bestandsnaam: string
}

interface Props {
  dossierId: string
  sectie:    DossierSectie
  naam:      string
  nummer:    string
  /** Aan het dossier gekoppeld calculatieproject (dossiers.everts_calc_project_id). */
  projectId?: string | null
  /** Wordt aangeroepen na een geslaagde import met het (mogelijk nieuwe) projectId. */
  onImported?: (projectId: string) => void
}

export default function C4yDropCard({ dossierId, sectie, naam, projectId: gekoppeldProjectId, onImported }: Props) {
  const [preview, setPreview]           = useState<Preview | null>(null)
  const [bezig, setBezig]               = useState(false)
  const [fout, setFout]                 = useState<string | null>(null)
  const [klaar, setKlaar]               = useState<string | null>(null)
  const [bevestigOpen, setBevestigOpen] = useState(false)

  async function verwerkBestand(file: File) {
    setFout(null); setKlaar(null)
    if (!file.name.toLowerCase().endsWith('.c4y')) {
      setFout('Selecteer een Calc4You-bestand (.c4y).')
      return
    }
    setBezig(true)
    try {
      const inhoud = await file.text()

      // 1. Zorg voor project + scenario. Het gekoppelde project komt uit de database
      //    (dossiers.everts_calc_project_id); een nieuw project wordt daar meteen aan
      //    het dossier gehangen, zodat de import ook op een ander apparaat te vinden is.
      let projectId = gekoppeldProjectId ?? null
      if (!projectId) {
        const { id } = await maakProjectVanAanvraag(naam, '')
        const r = await koppelDossierAanProject(dossierId, id)
        if (!r.ok) throw new Error('Koppelen van de calculatie aan het dossier is mislukt.')
        projectId = r.projectId ?? id
      }
      // Opslag% staat niet in het .c4y-bestand (net als bij CUF is dat handmatige
      // invoer in Calc4You) → op 0 houden. Per regel komt de opslag uit het bestand;
      // een calculatiebrede opslag zet je zelf in de totalenbalk.
      const basis = maakStandaardScenario(projectId)
      const scenario = { ...basis, opslag_pct: 0 }
      slaScenarioOp(scenario)

      // 2. Parse
      const resultaat = parseC4y(inhoud, scenario.id)
      if (resultaat.calculatieregels.length === 0) {
        setFout('Geen calculatieregels gevonden in dit .c4y-bestand.')
        setBezig(false)
        return
      }

      const kostprijs = berekenScenarioKostprijs(
        resultaat.groepen, resultaat.calculatieregels, resultaat.componentregels,
      )

      setPreview({ resultaat, projectId, scenarioId: scenario.id, kostprijs, bestandsnaam: file.name })
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Fout bij inlezen van het bestand.')
    } finally {
      setBezig(false)
    }
  }

  // Bij een bestaande werkbegroting: eerst expliciet bevestigen (die wordt gewist).
  function startImport() {
    if (!preview) return
    if (getWerkbegrotingVoorScenario(preview.scenarioId)) setBevestigOpen(true)
    else void bevestig()
  }

  async function bevestig() {
    if (!preview) return
    setBevestigOpen(false)
    setBezig(true); setFout(null)
    try {
      const { resultaat, projectId, scenarioId } = preview

      // Bestaande calculatie van dit scenario vervangen
      getGroepen(scenarioId)
        .filter(g => g.parent_id === null)
        .forEach(g => verwijderGroep(g.id))

      resultaat.groepen.forEach(slaGroepOp)
      resultaat.calculatieregels.forEach(slaCalculatieregelOp)
      resultaat.componentregels.forEach(slaComponentregelOp)

      // Volledige werkbegroting — inclusief de historie van verwijderde regels — wissen
      // bij (her)import, zodat er geen resten van de vorige begroting achterblijven.
      const bestaandeWb = getWerkbegrotingVoorScenario(scenarioId)
      const wbGeleegd = !!bestaandeWb
      if (bestaandeWb) verwijderWerkbegroting(bestaandeWb.id)

      // Respecteer fase: alleen in de opdracht-fase (opnieuw) opbouwen naar werkbegroting.
      if (sectie === 'opdracht') {
        setProjectStatus(projectId, 'opdracht').catch(() => {})
        maakWerkbegrotingVanCalculatie(projectId, scenarioId)
      }

      // Import meteen naar de database wegschrijven. Zonder dit leeft een geïmporteerde
      // calculatie alleen op dit apparaat, en zien de dossierkaart en collega's niets.
      const { groepen: syncGroepen, regels: syncRegels } = verzamelSyncData(scenarioId)
      const [syncRes, snapRes] = await Promise.all([
        syncCalculatieNaarSupabase(projectId, syncGroepen, syncRegels),
        bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId)),
      ])
      if (!syncRes.gelukt || !snapRes.gelukt) {
        setFout(`Import gelukt, maar opslaan in de database mislukte: ${syncRes.fout ?? snapRes.fout ?? 'onbekende fout'}. Open de calculatie en sla hem op.`)
        return
      }

      const aantal = resultaat.calculatieregels.length
      const wbDeel = wbGeleegd
        ? ' Werkbegroting en historie geleegd' + (sectie === 'opdracht' ? ' en opnieuw opgebouwd.' : '.')
        : (sectie === 'opdracht' ? ' en overgehaald naar de werkbegroting.' : '.')
      setKlaar(`${aantal} regel${aantal !== 1 ? 's' : ''} geïmporteerd.${wbDeel}`)
      setPreview(null)
      onImported?.(projectId)
    } catch (err) {
      setFout('Fout bij opslaan: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBezig(false)
    }
  }

  return (
    <Card>
      <CardHeader>Calculatie importeren (.c4y)</CardHeader>
      <CardBody className="flex flex-col gap-3">
        {!preview && (
          <>
            <FileUpload
              accept=".c4y"
              multiple={false}
              onFiles={(files) => { if (files[0]) verwerkBestand(files[0]) }}
              title={<>Sleep een Calc4You-werkbegroting (.c4y) hierheen of <span className="text-brand-700 underline">blader</span></>}
              sub={bezig ? 'Bestand inlezen…' : 'Vult automatisch de calculatie' + (sectie === 'opdracht' ? ' en werkbegroting.' : '.')}
            />
            {klaar && (
              <div className="flex items-center gap-2 rounded-md bg-everts-50 px-3 py-2 text-[12.5px] font-medium text-everts-dark">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {klaar}
              </div>
            )}
          </>
        )}

        {preview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-neutral-800">
              <FileCode2 className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="truncate">{preview.bestandsnaam}</span>
            </div>
            {(preview.resultaat.projectNaam || preview.resultaat.projectNummer) && (
              <p className="text-[12px] text-neutral-500">
                {preview.resultaat.projectNummer} {preview.resultaat.projectNaam}
              </p>
            )}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Groepen',     waarde: String(preview.resultaat.groepen.length) },
                { label: 'Regels',      waarde: String(preview.resultaat.calculatieregels.length) },
                { label: 'Componenten', waarde: String(preview.resultaat.componentregels.length) },
                { label: 'Kostprijs',   waarde: formatEuro(preview.kostprijs) },
              ].map(({ label, waarde }) => (
                <div key={label} className="rounded-lg border border-neutral-100 bg-neutral-50 px-2 py-2 text-center">
                  <div className="truncate text-[13px] font-bold text-neutral-800">{waarde}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-500">{label}</div>
                </div>
              ))}
            </div>
            {preview.resultaat.onbekendeBtwCodes.length > 0 && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Onbekende BTW-code(s): {preview.resultaat.onbekendeBtwCodes.join(', ')} — op 21% gezet. Controleer de tarieven.
              </p>
            )}
            {preview.resultaat.verwachtTotaal > 0 &&
              Math.abs(preview.resultaat.verkoopTotaal - preview.resultaat.verwachtTotaal) > 0.01 && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Controle: geïmporteerde verkoop {formatEuro(preview.resultaat.verkoopTotaal)} wijkt af van
                het .c4y-totaal {formatEuro(preview.resultaat.verwachtTotaal)} (verschil{' '}
                {formatEuro(preview.resultaat.verkoopTotaal - preview.resultaat.verwachtTotaal)}). Controleer de begroting.
              </p>
            )}
            {getWerkbegrotingVoorScenario(preview.scenarioId) ? (
              <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-[11.5px] font-medium leading-snug text-red-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Let op: de bestaande calculatie én de volledige werkbegroting — inclusief de historie
                van verwijderde regels — worden gewist en opnieuw opgebouwd.
              </p>
            ) : (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
                De bestaande calculatie van dit dossier wordt vervangen.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={bezig}>Annuleren</Button>
              <Button variant="primary" onClick={startImport} disabled={bezig}>
                {bezig ? 'Importeren…' : 'Importeren'}
              </Button>
            </div>
          </div>
        )}

        {fout && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {fout}
          </div>
        )}
      </CardBody>

      <AlertDialog open={bevestigOpen} onOpenChange={setBevestigOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Werkbegroting wissen en opnieuw opbouwen?</AlertDialogTitle>
          <AlertDialogDescription>
            Dit dossier heeft al een werkbegroting. Bij het importeren wordt de volledige
            werkbegroting — inclusief de historie van verwijderde regels — gewist en opnieuw
            opgebouwd uit het nieuwe .c4y-bestand. Handmatige aanpassingen in de werkbegroting
            gaan hierbij verloren.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void bevestig() }}>Ja, wissen en importeren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
