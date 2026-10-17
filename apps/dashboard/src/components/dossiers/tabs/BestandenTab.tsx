'use client'

/**
 * Bestanden-tab van het dossier.
 *
 * Bouw7 en SharePoint staan hier in één lijst met een kolom die vertelt waar het
 * bestand bewaard wordt — je hoeft dus niet te weten in welk systeem iets is
 * opgeslagen om het te vinden. Afbeeldingen worden uit die lijst gehaald en in een
 * fotogalerij getoond; een regel met een bestandsnaam als `IMG_20260714.jpg` zegt
 * niets, de foto zelf wel.
 *
 * Indeling: de lijst met rechts een voorvertoningspaneel voor wat je aanklikt, en de
 * fotogalerij daaronder over de volle breedte. Eerder stonden lijst en galerij elk op
 * een halve breedte en waren lange bestandsnamen nauwelijks te lezen.
 *
 * Submappen van de SharePoint-dossiermap komen mee, in lijst én galerij, in dezelfde
 * indeling als in SharePoint.
 */

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button, Card, CardHeader, CardBody } from '@/components/ui'
import { UploadCloud } from 'lucide-react'
import { Bouw7StandStrip } from '../Bouw7StandStrip'
import {
  getDossierBestanden, getAppZichtbareBestandSleutels, setBestandAppZichtbaar,
  type DossierBestandenData,
} from '@/lib/dossiers/bestanden'
import {
  getDossierSharePointBestanden,
  hermatchDossierSharePoint,
  koppelDossierMap,
  ontkoppelDossierMap,
  type DossierSharePointData,
} from '@/lib/dossiers/sharepoint-bestanden'
import { bouw7Rij, sharePointRij, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { pasMetaToe } from '@/lib/dossiers/bestand-soort'
import { sorteerFotos } from '@/lib/dossiers/bestand-boom'
import { getBestandMeta, zetBestandSoort, type BestandMetaData } from '@/lib/dossiers/bestand-meta'
import BestandVoorvertoning, { type Hernoemd } from './bestanden/BestandVoorvertoning'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import DocumentenKaart from '@/components/documenten/DocumentenKaart'
import SharePointMapPicker from './SharePointMapPicker'
import { getPortaalBestandSleutels, setPortaalBestandZichtbaar } from '@/lib/portaal/beheer-actions'
import { useDialogen } from '@/components/ui'
import BestandenLijst from './bestanden/BestandenLijst'
import Fotogalerij from './bestanden/Fotogalerij'
import MailVenster from './bestanden/MailVenster'
import MarkdownVenster from './bestanden/MarkdownVenster'
import SharePointKoppeling from './bestanden/SharePointKoppeling'
import { useDossierUpload } from './bestanden/useDossierUpload'

const fallbackFout = (e: unknown): DossierSharePointData => ({
  geconfigureerd: true,
  status: null,
  mapUrl: null,
  bestanden: [],
  handmatig: false,
  voorstelNaam: null,
  fout: String(e),
})

export default function BestandenTab({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()

  const [bouw7, setBouw7] = useState<DossierBestandenData | null>(null)
  const [sharepoint, setSharepoint] = useState<DossierSharePointData | null>(null)
  const [inApp, setInApp] = useState<Set<string>>(new Set())
  // Soort en (Bouw7) eigen naam. Lukt het ophalen niet, dan werkt de lijst gewoon
  // zonder: geen soorten, de namen uit de bron.
  const [meta, setMeta] = useState<BestandMetaData>({ meta: [], soorten: [] })
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null)
  // null = deze gebruiker heeft geen recht op het klantportaal; dan verdwijnt
  // de kolom in plaats van uitgegrijsd te blijven staan.
  const [inPortaal, setInPortaal] = useState<Set<string> | null>(null)
  // Groot leesvenster voor mail/markdown, vanuit het voorvertoningspaneel.
  const [venster, setVenster] = useState<BestandRij | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // "Bekijken" bij de foto's van een map in de lijst: de galerij springt erheen.
  const [fotoSprong, setFotoSprong] = useState<{ pad: string; keer: number } | null>(null)
  const [bezig, start] = useTransition()

  useEffect(() => {
    getDossierBestanden(dossierId)
      .then(setBouw7)
      .catch(() => setBouw7({ beschikbaar: false, bestanden: [], opgehaaldOp: null }))
    getAppZichtbareBestandSleutels(dossierId)
      .then(sleutels => setInApp(new Set(sleutels)))
      .catch(() => setInApp(new Set()))
    getPortaalBestandSleutels(dossierId)
      .then(sleutels => setInPortaal(sleutels ? new Set(sleutels) : null))
      .catch(() => setInPortaal(null))
    getDossierSharePointBestanden(dossierId)
      .then(setSharepoint)
      .catch(e => setSharepoint(fallbackFout(e)))
    getBestandMeta(dossierId)
      .then(setMeta)
      .catch(() => setMeta({ meta: [], soorten: [] }))
  }, [dossierId])

  // Optimistisch omzetten: de lijst hoeft niet opnieuw geladen te worden voor een
  // vinkje. Faalt de opslag, dan zetten we het vinkje terug.
  function toggleApp(rij: BestandRij, zichtbaar: boolean) {
    setInApp(vorig => {
      const nieuw = new Set(vorig)
      if (zichtbaar) nieuw.add(rij.sleutel); else nieuw.delete(rij.sleutel)
      return nieuw
    })
    setBestandAppZichtbaar(dossierId, { sleutel: rij.sleutel, bouw7Id: rij.bouw7Id }, zichtbaar)
      .then(res => {
        if (!res.ok) {
          setInApp(vorig => {
            const terug = new Set(vorig)
            if (zichtbaar) terug.delete(rij.sleutel); else terug.add(rij.sleutel)
            return terug
          })
        }
      })
  }

  /**
   * Zelfde optimistische aanpak als het app-vinkje. Wat hier extra meegaat is de
   * bevroren `bronQuery`: die bepaalt later welk bestand de klant precies krijgt,
   * en wordt daarom bij het aanvinken vastgelegd in plaats van bij het opvragen.
   */
  async function togglePortaal(rij: BestandRij, zichtbaar: boolean) {
    // Delen vraagt om een bevestiging met de bestandsnaam erin, weghalen niet.
    // Een vinkje is een kleine beweging met een groot gevolg: het bestand staat
    // meteen bij de opdrachtgever. De asymmetrie is bewust -- iets per ongeluk
    // intrekken is te herstellen, iets per ongeluk delen niet.
    if (zichtbaar) {
      const akkoord = await bevestig({
        titel: 'Delen met de opdrachtgever?',
        omschrijving:
          `"${rij.naam}" wordt zichtbaar in het klantportaal van dit dossier, ` +
          'voor iedereen die daar toegang toe heeft.',
        bevestigLabel: 'Ja, delen',
      })
      if (!akkoord) return
    }

    setInPortaal(vorig => {
      if (!vorig) return vorig
      const nieuw = new Set(vorig)
      if (zichtbaar) nieuw.add(rij.sleutel); else nieuw.delete(rij.sleutel)
      return nieuw
    })
    setPortaalBestandZichtbaar(
      dossierId,
      {
        sleutel: rij.sleutel,
        bron: rij.bron === 'Bouw7' ? 'bouw7' : 'sharepoint',
        bronQuery: rij.bronQuery,
        naam: rij.naam,
        extensie: rij.extensie,
        // Mails en markdown horen bij de documenten: het klantportaal heeft
        // daar geen leesvenster voor.
        soort: rij.soort === 'afbeelding' ? 'afbeelding' : 'document',
        grootte: rij.grootte,
        datum: rij.datum,
      },
      zichtbaar,
    ).then(res => {
      if (!res.ok) {
        setInPortaal(vorig => {
          if (!vorig) return vorig
          const terug = new Set(vorig)
          if (zichtbaar) terug.delete(rij.sleutel); else terug.add(rij.sleutel)
          return terug
        })
      }
    })
  }

  const { documenten, fotos } = useMemo(() => {
    const alle: BestandRij[] = pasMetaToe([
      ...(bouw7?.bestanden ?? []).map(bouw7Rij),
      ...(sharepoint?.status === 'gematcht' ? sharepoint.bestanden.map(sharePointRij) : []),
    ], meta.meta, meta.soorten)
    return {
      documenten: alle.filter(r => r.soort !== 'afbeelding'),
      // Per map, en daarbinnen de nieuwste bovenaan.
      fotos: sorteerFotos(alle.filter(r => r.soort === 'afbeelding')),
    }
  }, [bouw7, sharepoint, meta])

  const geselecteerdeRij = documenten.find(r => r.sleutel === geselecteerd) ?? null

  /** Optimistisch, net als de vinkjes: bij een fout gaat de oude keuze terug. */
  function zetSoort(rij: BestandRij, soortId: string | null) {
    const vorige = meta
    setMeta(m => ({ ...m, meta: zetInMeta(m.meta, rij.sleutel, { soortId }) }))
    zetBestandSoort(dossierId, rij.sleutel, soortId)
      .then(res => { if (!res.ok) { setMeta(vorige); toast.error(res.error) } })
      .catch(() => { setMeta(vorige); toast.error('Soort opslaan mislukt.') })
  }

  // De nieuwe naam lokaal doorvoeren in plaats van alles opnieuw op te halen. Bij
  // SharePoint verandert ook de webUrl (die bevat de bestandsnaam).
  function opHernoemd(h: Hernoemd) {
    if (h.bron === 'SharePoint') {
      const id = h.sleutel.replace(/^sharepoint:/, '')
      setSharepoint(sp => sp && {
        ...sp,
        bestanden: sp.bestanden.map(b => b.id === id ? { ...b, naam: h.naam, webUrl: h.webUrl ?? b.webUrl } : b),
      })
    } else {
      setMeta(m => ({ ...m, meta: zetInMeta(m.meta, h.sleutel, { weergavenaam: h.naam || null }) }))
    }
  }

  const laadt = bouw7 == null || sharepoint == null

  /* ─── Uploaden ─── */

  const kanUploaden = !readOnly && !!sharepoint?.geconfigureerd
  // Na een upload in een submap die map openklappen, zodat je ziet wat erbij kwam.
  const [openNaar, setOpenNaar] = useState<{ pad: string; keer: number } | null>(null)
  const upload = useDossierUpload({
    dossierId,
    kanUploaden,
    onVernieuwd: (data, pad) => {
      setSharepoint(data)
      if (pad) setOpenNaar(v => ({ pad, keer: (v?.keer ?? 0) + 1 }))
    },
  })
  // Boven een map wijst die map zichzelf aan; de overlay over alles is alleen voor de
  // dossiermap zelf.
  const sleepDoel = upload.sleept ? upload.sleepDoel : null

  // De koppelacties zijn identiek in de lege staat en in de voetregel; één keer
  // opschrijven scheelt twee blokken die uit elkaar kunnen gaan lopen.
  const koppelActies = {
    dossierId,
    readOnly,
    bezig,
    onKies: () => setPickerOpen(true),
    onOntkoppel: () => start(async () => {
      try { setSharepoint(await ontkoppelDossierMap(dossierId)) } catch (e) { setSharepoint(fallbackFout(e)) }
    }),
    onOpnieuw: () => start(async () => {
      try { setSharepoint(await hermatchDossierSharePoint(dossierId)) } catch (e) { setSharepoint(fallbackFout(e)) }
    }),
    onKiesKandidaat: (itemId: string) => start(async () => {
      try { setSharepoint(await koppelDossierMap(dossierId, itemId)) } catch (e) { setSharepoint(fallbackFout(e)) }
    }),
  }

  return (
    <div className="px-8 py-7 space-y-5">
      {/* De Bouw7-helft van de lijst komt uit de snapshot; SharePoint blijft live. */}
      <Bouw7StandStrip
        dossierId={dossierId}
        tab="bestanden"
        opgehaaldOp={bouw7?.opgehaaldOp ?? null}
        ontbreekt={bouw7?.opgehaaldOp == null ? ['project_files'] : []}
      />

      {/* Opstellen bovenaan; wat je hier maakt landt in SharePoint en verschijnt
          daardoor vanzelf in de lijst hieronder. */}
      <DocumentenKaart dossierId={dossierId} />

      {/* Lijst links, voorvertoning rechts; de foto's daaronder over de volle breedte.
          Het paneel blijft ook zonder selectie staan, zodat de indeling niet verspringt.
          Onder lg stapelt alles. Het geheel is één dropzone: loslaten landt in de
          dossiermap, behalve op een map (of een bestand in een map) in de lijst — dan
          landt het in die map. */}
      <div className="relative space-y-5" {...upload.zone}>
        {(upload.uploadt || sleepDoel === '') && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[10px] border-2 border-dashed border-brand-400 bg-white/85">
              <span className="flex items-center gap-2 text-[13px] font-medium text-brand-700">
                <UploadCloud className="h-4 w-4" />
                {upload.uploadt
                  ? `Bezig met uploaden… (${upload.voortgang.klaar} van ${upload.voortgang.totaal})`
                  : 'Laat los om in de SharePoint-dossiermap te zetten'}
              </span>
            </div>
          )}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,39%)]">
        <Card>
          <SharePointMapPicker
            dossierId={dossierId}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onGekoppeld={setSharepoint}
            voorstelNaam={sharepoint?.voorstelNaam ?? null}
            zoekterm={sharepoint?.voorstelNaam?.split(' - ')[0] ?? null}
          />
          <CardHeader>
            <div className="flex w-full items-center justify-between">
              <span>Bestanden</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-normal text-neutral-400">
                  {[
                    inApp.size > 0 ? `${inApp.size} in de app` : null,
                    inPortaal && inPortaal.size > 0 ? `${inPortaal.size} in het portaal` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
                {/* Slepen lukt niet vanuit elk mailprogramma; kiezen werkt altijd. */}
                {kanUploaden && (
                  <>
                    <input ref={upload.kiezer} type="file" multiple hidden onChange={upload.opGekozen} />
                    <Button variant="ghost" size="sm" disabled={upload.uploadt} onClick={() => upload.kies()}>
                      <UploadCloud className="h-3.5 w-3.5" />
                      Bestanden toevoegen
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {laadt ? (
              <p className="px-4 py-4 text-[13px] text-neutral-500">Bestanden laden…</p>
            ) : (
              /* Ook zonder bestanden de volledige lijst: kolomkoppen en een lege regel. Zo zie je
                 wat er van een bestand wordt vastgelegd, en blijft de SharePoint-koppeling op
                 dezelfde plek staan als bij een gevuld dossier. */
              <BestandenLijst
                rijen={documenten}
                mappen={sharepoint?.status === 'gematcht' ? sharepoint.mappen : undefined}
                fotos={fotos}
                onToonFotos={pad => setFotoSprong(v => ({ pad, keer: (v?.keer ?? 0) + 1 }))}
                onUploadNaar={kanUploaden ? upload.kies : undefined}
                sleepDoel={sleepDoel}
                openNaar={openNaar}
                inApp={inApp}
                onToggleApp={toggleApp}
                inPortaal={inPortaal ?? undefined}
                onTogglePortaal={inPortaal ? togglePortaal : undefined}
                geselecteerd={geselecteerd}
                onSelecteer={r => setGeselecteerd(r.sleutel)}
                soorten={meta.soorten}
                onZetSoort={readOnly ? undefined : zetSoort}
                legeTekst={fotos.length > 0
                  ? 'Alle bestanden bij dit dossier zijn afbeeldingen — die staan in de fotogalerij.'
                  : 'Nog geen bestanden bij dit dossier.'}
                voettekst={
                  <div className="border-t border-neutral-100 px-3 py-2.5">
                    <SharePointKoppeling
                      data={sharepoint}
                      bouw7Beschikbaar={bouw7?.beschikbaar ?? false}
                      {...koppelActies}
                    />
                    {kanUploaden && (
                      <p className="mt-1.5 text-[10.5px] text-neutral-400">
                        Sleep bestanden hierheen of gebruik "Bestanden toevoegen" om ze in de SharePoint-dossiermap te zetten.
                        Laat je los op een map, of gebruik het uploadknopje bij een map, dan komen ze in die map.
                      </p>
                    )}
                  </div>
                }
              />
            )}
          </CardBody>
        </Card>

        <div className="lg:sticky lg:top-4">
          <BestandVoorvertoning
            dossierId={dossierId}
            rij={geselecteerdeRij}
            readOnly={readOnly}
            onHernoemd={opHernoemd}
            onVergroot={setVenster}
          />
        </div>
        </div>

        <Fotogalerij
          fotos={fotos}
          springNaar={fotoSprong}
          inApp={inApp}
          onToggleApp={toggleApp}
          inPortaal={inPortaal ?? undefined}
          onTogglePortaal={inPortaal ? togglePortaal : undefined}
        />
      </div>

      <MailVenster rij={venster?.soort === 'mail' ? venster : null} onClose={() => setVenster(null)} />
      <MarkdownVenster rij={venster?.soort === 'markdown' ? venster : null} onClose={() => setVenster(null)} />
    </div>
  )
}

/** Eén veld in de meta van een bestand bijwerken; de rij bestaat misschien nog niet. */
function zetInMeta(
  lijst: BestandMetaData['meta'],
  sleutel: string,
  wijziging: Partial<Omit<BestandMetaData['meta'][number], 'sleutel'>>,
): BestandMetaData['meta'] {
  const bestaat = lijst.some(m => m.sleutel === sleutel)
  return bestaat
    ? lijst.map(m => (m.sleutel === sleutel ? { ...m, ...wijziging } : m))
    : [...lijst, { sleutel, weergavenaam: null, soortId: null, ...wijziging }]
}
