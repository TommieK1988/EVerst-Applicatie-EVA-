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
import { Card, CardHeader, CardBody, Button } from '@/components/ui'
import { FileUpload } from '@/components/ui/file-upload'
import { parseC4y, type C4yParseResultaat } from '@/lib/everts-calc/c4y-parser'
import {
  maakStandaardScenario, slaScenarioOp,
  getGroepen, verwijderGroep,
  slaGroepOp, slaCalculatieregelOp, slaComponentregelOp,
  getWerkbegrotingVoorScenario, maakWerkbegrotingVanCalculatie, heroverhaalWerkbegroting,
} from '@/lib/everts-calc/local-store'
import { berekenScenarioKostprijs, formatEuro } from '@/lib/everts-calc/calculations'
import { maakProjectVanAanvraag, setProjectStatus } from '@/app/(platform)/everts-calc/actions/projecten'
import { slaAanvraagProjectIdOp } from './AanvraagCalculatieTab'
import type { DossierSectie } from '@/components/dossiers/types'

const MAP_KEY = 'aanvraag_project_ids'

function leesProjectId(dossierId: string): string | null {
  try {
    const map: Record<string, string> = JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}')
    return map[dossierId] ?? null
  } catch { return null }
}

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
  /** Wordt aangeroepen na een geslaagde import met het (mogelijk nieuwe) projectId. */
  onImported?: (projectId: string) => void
}

export default function C4yDropCard({ dossierId, sectie, naam, onImported }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [bezig, setBezig]     = useState(false)
  const [fout, setFout]       = useState<string | null>(null)
  const [klaar, setKlaar]     = useState<string | null>(null)

  async function verwerkBestand(file: File) {
    setFout(null); setKlaar(null)
    if (!file.name.toLowerCase().endsWith('.c4y')) {
      setFout('Selecteer een Calc4You-bestand (.c4y).')
      return
    }
    setBezig(true)
    try {
      const inhoud = await file.text()

      // 1. Zorg voor project + scenario
      let projectId = leesProjectId(dossierId)
      if (!projectId) {
        const { id } = await maakProjectVanAanvraag(naam, '')
        slaAanvraagProjectIdOp(dossierId, id)
        projectId = id
      }
      // Opslag% staat niet in het .c4y-bestand (net als bij CUF is dat handmatige
      // invoer in Calc4You) → leeg houden, in te vullen via de Opslag%-kolom.
      const basis = maakStandaardScenario(projectId)
      const scenario = { ...basis, opslag_algemene_kosten: 0, opslag_winst_risico: 0, opslag_overhead: 0 }
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

  function bevestig() {
    if (!preview) return
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

      // Respecteer fase: alleen in de opdracht-fase overhalen naar werkbegroting
      if (sectie === 'opdracht') {
        setProjectStatus(projectId, 'opdracht').catch(() => {})
        const bestaand = getWerkbegrotingVoorScenario(scenarioId)
        if (bestaand) {
          heroverhaalWerkbegroting(bestaand, scenarioId, 'gewijzigd')
        } else {
          maakWerkbegrotingVanCalculatie(projectId, scenarioId)
        }
      }

      const aantal = resultaat.calculatieregels.length
      setKlaar(
        `${aantal} regel${aantal !== 1 ? 's' : ''} geïmporteerd` +
        (sectie === 'opdracht' ? ' en overgehaald naar de werkbegroting.' : '.'),
      )
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
            {preview.resultaat.samengevattePosten.length > 0 && (
              <p className="rounded-md bg-neutral-50 px-3 py-2 text-[11px] leading-snug text-neutral-500">
                Samengevat tot één regel (subregels telden niet op tot de post):{' '}
                {preview.resultaat.samengevattePosten.join(', ')}.
              </p>
            )}
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
              De bestaande calculatie van dit dossier wordt vervangen.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={bezig}>Annuleren</Button>
              <Button variant="primary" onClick={bevestig} disabled={bezig}>
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
    </Card>
  )
}
