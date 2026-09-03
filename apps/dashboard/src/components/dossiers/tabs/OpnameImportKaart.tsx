'use client'

/**
 * "Naar calculatie" — zet een opname om in groepen, calculatieregels en componentregels.
 *
 * Deze import draait bewust CLIENT-side, in dezelfde tab, en begint altijd met een VERSE
 * `laadCalculatieSnapshot`. Twee valkuilen die dat afdekt:
 *
 *  - `calculatie_snapshots` is de bron van waarheid voor de editor. Server-side in
 *    `calculation_lines` schrijven is onzichtbaar voor de editor; server-side in de blob schrijven
 *    wordt door de eerstvolgende autosave van een geopende calculatie-tab overschreven.
 *  - `bewaarCalculatieSnapshot` doet read-modify-write zonder locking. Wie op een oude hydratie
 *    bouwt, gooit het werk van een collega weg.
 *
 * Model: `C4yDropCard`, met dezelfde volgorde project → scenario → schrijven → sync + snapshot.
 */

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { useDialogen } from '@/components/ui/dialogen'
import {
  getCalculatieregelsVoorScenario,
  getComponentregels,
  getGroepen,
  getScenario,
  hydrateCalculatie,
  maakStandaardScenario,
  slaCalculatieregelOp,
  slaComponentregelOp,
  slaGroepOp,
  verwijderCalculatieregel,
  verwijderComponentregel,
} from '@/lib/everts-calc/local-store'
import { verzamelCalculatieSnapshot, verzamelSyncData } from '@/lib/everts-calc/sync-utils'
import {
  bewaarCalculatieSnapshot,
  laadCalculatieSnapshot,
  syncCalculatieNaarSupabase,
} from '@/app/(platform)/everts-calc/actions/sync'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { koppelDossierAanProject } from '@/lib/dossiers/actions'
import { laadOpnameVoorImport, markeerOpnameOmgezet } from '@/lib/opname/import-actions'
import { bouwImport, overbodigeRegelIds } from '@/lib/opname/naar-calculatie'
import type { Opname } from '@everts/database/opname-types'

type Props = {
  dossierId: string
  opname: Opname
  aantalRegels: number
  /** Aan het dossier gekoppelde calculatie (dossiers.everts_calc_project_id), of null. */
  gekoppeldProjectId: string | null
  dossierNaam: string
  /** Link naar het Calculatie-tabblad van dít dossier — de calculatie heeft geen eigen route. */
  calculatieHref: string
  onKlaar: () => void | Promise<void>
}

export default function OpnameImportKaart({
  dossierId,
  opname,
  aantalRegels,
  gekoppeldProjectId,
  dossierNaam,
  calculatieHref,
  onKlaar,
}: Props) {
  const { bevestig } = useDialogen()
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(
    opname.calculatie_project_id ?? gekoppeldProjectId,
  )

  const alOmgezet = opname.status === 'omgezet'

  async function importeer() {
    if (alOmgezet) {
      const ja = await bevestig({
        titel: 'Calculatie bijwerken?',
        omschrijving:
          'De regels die uit deze opname komen worden vervangen door de huidige stand. ' +
          'Handmatige wijzigingen aan díe regels gaan verloren; regels die je zelf hebt toegevoegd blijven staan.',
        bevestigLabel: 'Bijwerken',
      })
      if (!ja) return
    }

    setBezig(true)
    setFout(null)
    setMelding(null)
    try {
      // 1. De opname ophalen, inclusief verkleinde foto's.
      const res = await laadOpnameVoorImport(opname.id)
      if (!res.ok) {
        setFout(res.error)
        return
      }
      const { payload } = res

      // 2. Zorgen voor een gekoppeld calculatieproject. koppelDossierAanProject is idempotent en
      //    overschrijft nooit — een dossier dat al een calculatie heeft, krijgt er geen tweede.
      let pid = projectId
      if (!pid) {
        const { id } = await maakProjectVanAanvraag(dossierNaam || opname.opnamenummer, '')
        const koppel = await koppelDossierAanProject(dossierId, id)
        if (!koppel.ok) throw new Error('Koppelen van de calculatie aan het dossier is mislukt.')
        // koppelDossierAanProject overschrijft nooit: hangt er al een calculatie aan dit dossier,
        // dan krijgen we díe terug en importeren we daarin.
        pid = koppel.projectId ?? id
        setProjectId(pid)
      }

      // 3. VERSE hydratie, direct vóór het schrijven. Zonder dit is het werkgeheugen leeg en zou de
      //    snapshot die we straks wegschrijven de hele bestaande calculatie wissen.
      const snapshot = await laadCalculatieSnapshot(pid)
      if (snapshot) hydrateCalculatie(pid, snapshot)

      const scenario = maakStandaardScenario(pid)
      if (scenario.bevroren_op) {
        setFout(
          'De standaardcalculatie hoort bij een verzonden offerte en is bevroren. ' +
            'Maak eerst een nieuwe versie aan; importeren zou nu niets doen.',
        )
        return
      }

      // 4. Vertalen.
      const bestaandeHoofdgroepen = getGroepen(scenario.id).filter(g => g.parent_id === null)
      const resultaat = bouwImport({
        opnameId: opname.id,
        opnamenummer: opname.opnamenummer,
        scenarioId: scenario.id,
        bestaandeGroepId: opname.calculatie_groep_id,
        adres: opname.adres_vrij,
        regels: payload.regels,
        volgordeBasis: bestaandeHoofdgroepen.length + 1,
        btwPctDefault: getScenario(scenario.id)?.btw_pct_default,
      })

      // 5. Opruimen wat niet meer bij deze opname hoort. Alleen regels met onze herkomstnotitie;
      //    wat de calculator er zelf bij zette blijft staan.
      const huidigeIds = resultaat.regels.map(r => r.id)
      const teVerwijderen = overbodigeRegelIds(
        getCalculatieregelsVoorScenario(scenario.id),
        huidigeIds,
        opname.opnamenummer,
      )
      teVerwijderen.forEach(verwijderCalculatieregel)

      // 6. Schrijven. Componenten eerst weg: het aantal kan tussen twee imports verschillen, en
      //    achterblijvers tellen wél mee in het totaal.
      resultaat.groepen.forEach(slaGroepOp)
      resultaat.regels.forEach(regel => {
        getComponentregels(regel.id).forEach(c => verwijderComponentregel(c.id))
        slaCalculatieregelOp(regel)
      })
      resultaat.componenten.forEach(slaComponentregelOp)

      // 7. Persisteren: platte projectie én verliesloze snapshot.
      const { groepen: syncGroepen, regels: syncRegels } = verzamelSyncData(scenario.id)
      const [syncRes, snapRes] = await Promise.all([
        syncCalculatieNaarSupabase(pid, syncGroepen, syncRegels),
        bewaarCalculatieSnapshot(pid, verzamelCalculatieSnapshot(pid)),
      ])
      if (!syncRes.gelukt || !snapRes.gelukt) {
        setFout(
          `Import gelukt, maar opslaan in de database mislukte: ${
            syncRes.fout ?? snapRes.fout ?? 'onbekende fout'
          }. Open de calculatie en sla hem op.`,
        )
        return
      }

      await markeerOpnameOmgezet(opname.id, {
        projectId: pid,
        scenarioId: scenario.id,
        groepId: resultaat.hoofdgroepId,
      })

      const fotoDeel =
        payload.fotos.beschikbaar === 0
          ? ''
          : payload.fotos.meegenomen === payload.fotos.beschikbaar
            ? ` ${payload.fotos.meegenomen} foto's meegenomen.`
            : ` ${payload.fotos.meegenomen} van de ${payload.fotos.beschikbaar} foto's meegenomen` +
              ' (de rest paste niet binnen de fotolimiet, maar blijft op deze tab staan).'
      const verwijderdDeel =
        teVerwijderen.length > 0 ? ` ${teVerwijderen.length} vervallen regel(s) opgeruimd.` : ''

      setMelding(
        `${resultaat.regels.length} regel${resultaat.regels.length !== 1 ? 's' : ''} in de calculatie gezet.` +
          fotoDeel +
          verwijderdDeel,
      )
      toast.success('Opname in de calculatie gezet')
      await onKlaar()
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err))
    } finally {
      setBezig(false)
    }
  }

  return (
    <Card>
      <CardHeader>Naar calculatie</CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-[13px] text-neutral-600">
          {alOmgezet
            ? 'Deze opname staat al in de calculatie. Bijwerken vervangt de regels die eruit komen door de huidige stand.'
            : `De ${aantalRegels} opgenomen regel${aantalRegels !== 1 ? 's worden' : ' wordt'} als calculatieregels toegevoegd, gegroepeerd per ruimte. Foto's gaan mee naar de offerte.`}
        </p>

        {fout && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {fout}
          </div>
        )}
        {melding && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
            {melding}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={importeer}
            disabled={bezig}
            className="rounded-md bg-[var(--brand-600,#009439)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {bezig ? 'Bezig…' : alOmgezet ? 'Calculatie bijwerken' : 'Naar calculatie'}
          </button>
          {projectId && (
            <a href={calculatieHref} className="text-[13px] font-medium text-[var(--brand-700,#00752e)] underline">
              Calculatie openen
            </a>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
