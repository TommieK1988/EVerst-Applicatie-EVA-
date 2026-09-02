'use client'

/**
 * Bestanden-tab van het dossier.
 *
 * Bouw7 en SharePoint staan hier in één lijst met een kolom die vertelt waar het
 * bestand bewaard wordt — je hoeft dus niet te weten in welk systeem iets is
 * opgeslagen om het te vinden. Afbeeldingen worden uit die lijst gehaald en in een
 * fotogalerij getoond; een regel met een bestandsnaam als `IMG_20260714.jpg` zegt
 * niets, de foto zelf wel.
 */

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { UploadCloud } from 'lucide-react'
import {
  getDossierBestanden, getAppZichtbareBestandIds, setBestandAppZichtbaar,
  type DossierBestandenData,
} from '@/lib/dossiers/bestanden'
import {
  getDossierSharePointBestanden,
  hermatchDossierSharePoint,
  koppelDossierMap,
  ontkoppelDossierMap,
  uploadDossierBestandenNaarSharePoint,
  type DossierSharePointData,
} from '@/lib/dossiers/sharepoint-bestanden'
import { bouw7Rij, sharePointRij, type BestandRij } from '@/lib/dossiers/bestand-rijen'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import DocumentenKaart from '@/components/documenten/DocumentenKaart'
import SharePointMapPicker from './SharePointMapPicker'
import { getPortaalBestandSleutels, setPortaalBestandZichtbaar } from '@/lib/portaal/beheer-actions'
import BestandenLijst from './bestanden/BestandenLijst'
import Fotogalerij from './bestanden/Fotogalerij'
import MailVenster from './bestanden/MailVenster'
import OpenInVerkenner from './OpenInVerkenner'

/**
 * Uploaden loopt via een server-action, en die heeft een maximale payload
 * (`serverActions.bodySizeLimit` in next.config.js, nu 8 MB). Eén sleepactie met tien
 * foto's gaat daar zo overheen, dus we versturen in groepen die eronder blijven.
 * De marge is voor de multipart-overhead.
 */
const MAX_BESTAND_BYTES = 7 * 1024 * 1024
const MAX_GROEP_BYTES = 6 * 1024 * 1024

function maakGroepen(bestanden: File[]): File[][] {
  const groepen: File[][] = []
  let huidige: File[] = []
  let omvang = 0

  for (const b of bestanden) {
    if (huidige.length && omvang + b.size > MAX_GROEP_BYTES) {
      groepen.push(huidige)
      huidige = []
      omvang = 0
    }
    huidige.push(b)
    omvang += b.size
  }
  if (huidige.length) groepen.push(huidige)
  return groepen
}

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

  const [bouw7, setBouw7] = useState<DossierBestandenData | null>(null)
  const [sharepoint, setSharepoint] = useState<DossierSharePointData | null>(null)
  const [inApp, setInApp] = useState<Set<number>>(new Set())
  // null = deze gebruiker heeft geen recht op het klantportaal; dan verdwijnt
  // de kolom in plaats van uitgegrijsd te blijven staan.
  const [inPortaal, setInPortaal] = useState<Set<string> | null>(null)
  const [mail, setMail] = useState<BestandRij | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bezig, start] = useTransition()

  useEffect(() => {
    getDossierBestanden(dossierId)
      .then(setBouw7)
      .catch(() => setBouw7({ beschikbaar: false, bestanden: [] }))
    getAppZichtbareBestandIds(dossierId)
      .then(ids => setInApp(new Set(ids)))
      .catch(() => setInApp(new Set()))
    getPortaalBestandSleutels(dossierId)
      .then(sleutels => setInPortaal(sleutels ? new Set(sleutels) : null))
      .catch(() => setInPortaal(null))
    getDossierSharePointBestanden(dossierId)
      .then(setSharepoint)
      .catch(e => setSharepoint(fallbackFout(e)))
  }, [dossierId])

  // Optimistisch omzetten: de lijst hoeft niet opnieuw geladen te worden voor een
  // vinkje. Faalt de opslag, dan zetten we het vinkje terug.
  function toggleApp(bestandId: number, zichtbaar: boolean) {
    setInApp(vorig => {
      const nieuw = new Set(vorig)
      if (zichtbaar) nieuw.add(bestandId); else nieuw.delete(bestandId)
      return nieuw
    })
    setBestandAppZichtbaar(dossierId, bestandId, zichtbaar).then(res => {
      if (!res.ok) {
        setInApp(vorig => {
          const terug = new Set(vorig)
          if (zichtbaar) terug.delete(bestandId); else terug.add(bestandId)
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
  function togglePortaal(rij: BestandRij, zichtbaar: boolean) {
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
        // Mails horen bij de documenten: de klant heeft geen leesvenster voor .msg.
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
    const alle: BestandRij[] = [
      ...(bouw7?.bestanden ?? []).map(bouw7Rij),
      ...(sharepoint?.status === 'gematcht' ? sharepoint.bestanden.map(sharePointRij) : []),
    ]
    return {
      documenten: alle.filter(r => r.soort !== 'afbeelding'),
      // Nieuwste foto's bovenaan: bij een lopend project is de laatste opname het interessantst.
      fotos: alle
        .filter(r => r.soort === 'afbeelding')
        .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? '') || a.naam.localeCompare(b.naam)),
    }
  }, [bouw7, sharepoint])

  const laadt = bouw7 == null || sharepoint == null

  /* ─── Slepen en neerzetten ─── */

  // Uploaden gaat altijd naar SharePoint: Bouw7-bestanden zijn in EVA read-only, en
  // de dossiermap is de plek waar collega's stukken bewaren. Bestaat die map nog
  // niet, dan maakt de server-action hem aan.
  const kanUploaden = !readOnly && !!sharepoint?.geconfigureerd
  const [sleept, setSleept] = useState(false)
  const [uploadt, setUploadt] = useState(false)
  const [uploadVoortgang, setUploadVoortgang] = useState({ klaar: 0, totaal: 0 })
  // Elk kind-element vuurt zijn eigen dragenter/dragleave; tellen voorkomt geflikker.
  const sleepDiepte = useRef(0)

  const bevatBestanden = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  function opDragEnter(e: React.DragEvent) {
    if (!kanUploaden || !bevatBestanden(e)) return
    e.preventDefault()
    sleepDiepte.current++
    setSleept(true)
  }

  function opDragOver(e: React.DragEvent) {
    if (!kanUploaden || !bevatBestanden(e)) return
    // Zonder preventDefault weigert de browser de drop en opent hij het bestand.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function opDragLeave() {
    // Bewust géén controle op de inhoud van de drag: niet elke browser vult
    // `dataTransfer.types` bij dragleave, en dan zou de teller blijven hangen en de
    // overlay in beeld blijven staan.
    if (sleepDiepte.current === 0) return
    sleepDiepte.current--
    if (sleepDiepte.current === 0) setSleept(false)
  }

  async function opDrop(e: React.DragEvent) {
    if (!kanUploaden || !bevatBestanden(e)) return
    e.preventDefault()
    sleepDiepte.current = 0
    setSleept(false)

    const gesleept = Array.from(e.dataTransfer.files)
    if (gesleept.length === 0) return

    // Te groot voor één server-action eruit filteren mét naam. Zonder deze check
    // krijgt de gebruiker een nietszeggende netwerkfout terug.
    const teGroot = gesleept.filter(b => b.size > MAX_BESTAND_BYTES)
    const bestanden = gesleept.filter(b => b.size <= MAX_BESTAND_BYTES)
    if (teGroot.length) {
      toast.error(
        `Te groot om via EVA te uploaden (max ${Math.floor(MAX_BESTAND_BYTES / 1024 / 1024)} MB): ` +
        `${teGroot.map(b => b.name).join(', ')}. Zet die rechtstreeks in SharePoint.`,
      )
    }
    if (bestanden.length === 0) return

    setUploadt(true)
    setUploadVoortgang({ klaar: 0, totaal: bestanden.length })

    let geuploaded = 0
    const fouten: string[] = []
    try {
      for (const groep of maakGroepen(bestanden)) {
        const formData = new FormData()
        for (const b of groep) formData.append('bestanden', b)

        const res = await uploadDossierBestandenNaarSharePoint(dossierId, formData)
        geuploaded += res.geuploaded
        if (res.fout) fouten.push(res.fout)
        setUploadVoortgang(v => ({ klaar: v.klaar + groep.length, totaal: v.totaal }))
      }

      if (geuploaded > 0) {
        toast.success(`${geuploaded} bestand${geuploaded === 1 ? '' : 'en'} in SharePoint gezet.`)
      }
      if (fouten.length) toast.error(fouten.join(' · '))
      else if (geuploaded === 0) toast.error('Er is niets geüpload.')

      // Opnieuw ophalen: de map kan zojuist zijn aangemaakt én de lijst moet de
      // nieuwe bestanden tonen.
      setSharepoint(await getDossierSharePointBestanden(dossierId))
    } catch (err) {
      toast.error(`Uploaden mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
    } finally {
      setUploadt(false)
    }
  }

  // De koppelacties zijn identiek in de lege staat en in de voetregel; één keer
  // opschrijven scheelt twee blokken die uit elkaar kunnen gaan lopen.
  const koppelActies = {
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
      {/* Opstellen bovenaan; wat je hier maakt landt in SharePoint en verschijnt
          daardoor vanzelf in de lijst hieronder. */}
      <DocumentenKaart dossierId={dossierId} />

      {/* Lijst links, foto's rechts — elk de helft. Het fotoblok blijft ook staan als
          er geen foto's zijn, zodat de indeling niet verspringt. Onder lg stapelen ze. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card
          className="relative"
          onDragEnter={opDragEnter}
          onDragOver={opDragOver}
          onDragLeave={opDragLeave}
          onDrop={opDrop}
        >
          {(sleept || uploadt) && (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[10px] border-2 border-dashed border-brand-400 bg-white/85">
              <span className="flex items-center gap-2 text-[13px] font-medium text-brand-700">
                <UploadCloud className="h-4 w-4" />
                {uploadt
                  ? `Bezig met uploaden… (${uploadVoortgang.klaar} van ${uploadVoortgang.totaal})`
                  : 'Laat los om in de SharePoint-dossiermap te zetten'}
              </span>
            </div>
          )}
          <SharePointMapPicker
            dossierId={dossierId}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onGekoppeld={setSharepoint}
            voorstelNaam={sharepoint?.voorstelNaam ?? null}
            zoekterm={sharepoint?.voorstelNaam?.split(' - ')[0] ?? null}
          />
          <CardHeader>
            <div className="flex items-center justify-between">
              <span>Bestanden</span>
              <span className="text-[11px] font-normal text-neutral-400">
                {[
                  inApp.size > 0 ? `${inApp.size} in de app` : null,
                  inPortaal && inPortaal.size > 0 ? `${inPortaal.size} in het portaal` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            {laadt ? (
              <p className="px-4 py-4 text-[13px] text-neutral-500">Bestanden laden…</p>
            ) : documenten.length === 0 && fotos.length === 0 ? (
              <div className="space-y-3 px-4 py-4">
                <p className="text-[13px] text-neutral-500">
                  Nog geen bestanden bij dit dossier.
                  {kanUploaden && ' Sleep bestanden hierheen om ze in de SharePoint-dossiermap te zetten.'}
                </p>
                {/* Zonder SharePoint valt er hier niets te kiezen — dan alleen de melding hierboven. */}
                {sharepoint?.geconfigureerd && <SharePointKoppeling data={sharepoint} {...koppelActies} />}
              </div>
            ) : (
              <BestandenLijst
                rijen={documenten}
                inApp={inApp}
                onToggleApp={toggleApp}
                inPortaal={inPortaal ?? undefined}
                onTogglePortaal={inPortaal ? togglePortaal : undefined}
                onOpenMail={setMail}
                legeTekst="Alle bestanden bij dit dossier zijn afbeeldingen — die staan in de fotogalerij."
                voettekst={
                  <div className="border-t border-neutral-100 px-3 py-2.5">
                    <SharePointKoppeling
                      data={sharepoint}
                      bouw7Beschikbaar={bouw7?.beschikbaar ?? false}
                      {...koppelActies}
                    />
                    {kanUploaden && (
                      <p className="mt-1.5 text-[10.5px] text-neutral-400">
                        Sleep bestanden hierheen om ze in de SharePoint-dossiermap te zetten.
                      </p>
                    )}
                  </div>
                }
              />
            )}
          </CardBody>
        </Card>

        <Fotogalerij
          fotos={fotos}
          inPortaal={inPortaal ?? undefined}
          onTogglePortaal={inPortaal ? togglePortaal : undefined}
        />
      </div>

      <MailVenster rij={mail} onClose={() => setMail(null)} />
    </div>
  )
}

/* ─── SharePoint-koppeling ──────────────────────────────────────────────────── */

/** Acties bij een gekoppelde map. Ontkoppelen raakt SharePoint niet aan — alleen de koppeling in EVA. */
function MapActies({ onKies, onOntkoppel, bezig }: { onKies: () => void; onOntkoppel: () => void; bezig: boolean }) {
  const [bevestig, setBevestig] = useState(false)

  if (bevestig) {
    return (
      <span className="flex items-center gap-2 text-[11px]">
        <span className="text-neutral-600">Koppeling weghalen? De map blijft in SharePoint staan.</span>
        <button onClick={() => { setBevestig(false); onOntkoppel() }} disabled={bezig}
          className="font-medium text-red-600 hover:underline disabled:opacity-60">
          Ontkoppelen
        </button>
        <button onClick={() => setBevestig(false)} className="text-neutral-500 hover:underline">Annuleren</button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-3 text-[11px]">
      <button onClick={onKies} disabled={bezig} className="font-medium text-brand-600 hover:underline disabled:opacity-60">
        Andere map kiezen
      </button>
      <button onClick={() => setBevestig(true)} disabled={bezig} className="text-neutral-500 hover:underline disabled:opacity-60">
        Ontkoppelen
      </button>
    </span>
  )
}

/**
 * Herkomst van de lijst plus de acties op de SharePoint-map. Dit stond eerder in een
 * eigen kaart; nu de bestanden in één lijst staan hoort het bij de voetregel.
 */
function SharePointKoppeling({
  data, bouw7Beschikbaar, readOnly, bezig, onKies, onOntkoppel, onOpnieuw, onKiesKandidaat,
}: {
  data: DossierSharePointData | null
  bouw7Beschikbaar?: boolean
  readOnly: boolean
  bezig: boolean
  onKies: () => void
  onOntkoppel: () => void
  onOpnieuw: () => void
  onKiesKandidaat: (itemId: string) => void
}) {
  // Niet geconfigureerd → alleen over Bouw7 iets zeggen.
  if (!data || !data.geconfigureerd) {
    return <span className="text-[11px] text-neutral-500">Live uit Bouw7 — openen via een beveiligde EVA-proxy.</span>
  }

  if (data.status === 'gematcht') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <span className="text-[11px] text-neutral-500">
          Live uit {bouw7Beschikbaar === false ? '' : 'Bouw7 en '}SharePoint
          ({data.handmatig ? 'handmatig' : 'automatisch'} gekoppelde dossiermap).
        </span>
        <span className="flex items-center gap-3">
          {!readOnly && <MapActies onKies={onKies} onOntkoppel={onOntkoppel} bezig={bezig} />}
          {data.mapUrl && <OpenInVerkenner mapUrl={data.mapUrl} />}
          {data.mapUrl && (
            <a href={data.mapUrl} target="_blank" rel="noopener noreferrer"
              className="text-[11px] font-medium text-brand-600 hover:underline">
              Open map in SharePoint
            </a>
          )}
        </span>
      </div>
    )
  }

  // niet_gevonden / meerdere / fout → zelf een map kiezen of aanmaken.
  return (
    <div className="space-y-2">
      {data.melding && <p className="text-[11.5px] text-neutral-600">{data.melding}</p>}
      <p className="text-[11.5px] text-neutral-500">
        {data.status === 'meerdere'
          ? 'Meerdere SharePoint-mappen komen in aanmerking — kies de juiste.'
          : data.status === 'niet_gevonden'
            ? 'Geen SharePoint-map gekoppeld. Kies de juiste map, of maak hem aan.'
            : 'SharePoint is nu niet bereikbaar.'}
      </p>

      {data.fout && (
        <p className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 break-words">
          {data.fout}
        </p>
      )}

      {/* Bij 'meerdere' de kandidaten direct tonen: één klik i.p.v. de picker openen. */}
      {!readOnly && !!data.kandidaten?.length && (
        <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
          {data.kandidaten.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-neutral-800">{m.naam}</span>
                <span className="block text-[10.5px] text-neutral-500">
                  {m.aantalItems ?? 0} item{m.aantalItems === 1 ? '' : 's'}
                  {m.gewijzigd ? ` · gewijzigd ${m.gewijzigd}` : ''}
                </span>
              </span>
              <button onClick={() => onKiesKandidaat(m.id)} disabled={bezig}
                className="shrink-0 rounded border border-neutral-300 px-2 py-[3px] text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                Koppelen
              </button>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <button onClick={onKies} disabled={bezig}
            className="rounded bg-brand-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            Map kiezen of aanmaken
          </button>
          <button onClick={onOpnieuw} disabled={bezig}
            className="rounded border border-neutral-300 px-2.5 py-1 text-[11.5px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60">
            Opnieuw zoeken
          </button>
        </div>
      )}
    </div>
  )
}
