'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import {
  getDossierBestanden, getAppZichtbareBestandIds, setBestandAppZichtbaar,
  type DossierBestandenData, type DossierBestand,
} from '@/lib/dossiers/bestanden'
import {
  getDossierSharePointBestanden,
  hermatchDossierSharePoint,
  koppelDossierMap,
  ontkoppelDossierMap,
  type DossierSharePointData,
  type SharePointBestand,
} from '@/lib/dossiers/sharepoint-bestanden'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import DocumentenKaart from '@/components/documenten/DocumentenKaart'
import SharePointMapPicker from './SharePointMapPicker'

const fmtGrootte = (bytes: number | null): string => {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const downloadHref = (b: DossierBestand): string | null => {
  if (!b.fileHash && !b.id) return null
  const naam = b.extensie && !b.naam.toLowerCase().endsWith(`.${b.extensie.toLowerCase()}`)
    ? `${b.naam}.${b.extensie}`
    : b.naam
  return `/api/bouw7/bestand/${encodeURIComponent(b.fileHash ?? '-')}?id=${b.id}&naam=${encodeURIComponent(naam)}`
}

const TH = 'py-1.5 px-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-400'

export default function BestandenTab({ dossierId }: { dossierId: string }) {
  const [bouw7, setBouw7] = useState<DossierBestandenData | null>(null)
  const [inApp, setInApp] = useState<Set<number>>(new Set())

  useEffect(() => {
    getDossierBestanden(dossierId).then(setBouw7).catch(() => setBouw7({ beschikbaar: false, bestanden: [] }))
    getAppZichtbareBestandIds(dossierId).then(ids => setInApp(new Set(ids))).catch(() => setInApp(new Set()))
  }, [dossierId])

  // Optimistisch omzetten: de lijst hoeft niet opnieuw geladen te worden voor
  // een vinkje. Faalt de opslag, dan zetten we het vinkje terug.
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

  return (
    <div className="px-8 py-7 space-y-5">
      {/* Opstellen bovenaan; wat je hier maakt landt in SharePoint en verschijnt
          daardoor vanzelf in de SharePoint-kaart hieronder. */}
      <DocumentenKaart dossierId={dossierId} />
      <Bouw7Kaart data={bouw7} inApp={inApp} onToggleApp={toggleApp} />
      <SharePointKaart dossierId={dossierId} />
    </div>
  )
}

// ─── Bouw7 ──────────────────────────────────────────────────────────────────────

function Bouw7Kaart({ data, inApp, onToggleApp }: {
  data: DossierBestandenData | null
  /** Bestanden die de buitendienst in de mobiele app te zien krijgt (opt-in). */
  inApp: Set<number>
  onToggleApp: (bestandId: number, zichtbaar: boolean) => void
}) {
  if (data == null) return <Card><CardHeader>Bouw7-bestanden</CardHeader><CardBody><p className="text-[13px] text-neutral-500">Laden…</p></CardBody></Card>

  if (!data.beschikbaar || data.bestanden.length === 0) {
    return (
      <Card>
        <CardHeader>Bouw7-bestanden</CardHeader>
        <CardBody>
          <p className="text-[13px] text-neutral-500">
            {data.beschikbaar ? 'Geen projectbestanden in Bouw7.' : 'Dit dossier heeft geen Bouw7-koppeling of de bestanden zijn niet beschikbaar.'}
          </p>
        </CardBody>
      </Card>
    )
  }

  const groepen: { categorie: string; items: DossierBestand[] }[] = []
  for (const b of data.bestanden) {
    const cat = b.categorie ?? 'Overig'
    const laatste = groepen[groepen.length - 1]
    if (laatste && laatste.categorie === cat) laatste.items.push(b)
    else groepen.push({ categorie: cat, items: [b] })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Bouw7-bestanden</span>
          <span className="text-[11px] font-normal text-neutral-400">
            {data.bestanden.length} uit Bouw7 · {inApp.size} in de app
          </span>
        </div>
      </CardHeader>
      <CardBody style={{ padding: 0 }}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-left">
              <th className={`${TH} pl-4`}>Naam</th><th className={TH}>Type</th>
              <th className={`${TH} text-right`}>Grootte</th><th className={TH}>Datum</th>
              <th className={TH}>Door</th>
              <th className={`${TH} text-center`} title="Zichtbaar in de mobiele app voor de buitendienst">In app</th>
              <th className={`${TH} pr-4 text-right`}>Actie</th>
            </tr>
          </thead>
          {groepen.map(g => (
            <tbody key={g.categorie}>
              <tr className="bg-neutral-50">
                <td colSpan={7} className="py-1.5 pl-4 pr-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">{g.categorie}</td>
              </tr>
              {g.items.map(b => {
                const href = downloadHref(b)
                return (
                  <tr key={b.id} className="border-b border-neutral-100 text-[12.5px]">
                    <td className="py-1.5 pl-4 pr-2">
                      <div className="text-neutral-800">{b.naam}</div>
                      {b.omschrijving && <div className="text-[10px] text-neutral-400">{b.omschrijving}</div>}
                    </td>
                    <td className="py-1.5 px-2 uppercase text-neutral-500">{b.extensie ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmtGrootte(b.grootte)}</td>
                    <td className="py-1.5 px-2 text-neutral-500">{b.datum ?? '—'}</td>
                    <td className="py-1.5 px-2 text-neutral-500">{b.aangemaaktDoor ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={inApp.has(b.id)}
                        onChange={e => onToggleApp(b.id, e.target.checked)}
                        aria-label={`${b.naam} zichtbaar in de app`}
                        className="h-4 w-4 cursor-pointer accent-brand-600"
                      />
                    </td>
                    <td className="py-1.5 pl-2 pr-4 text-right">
                      {href
                        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Openen</a>
                        : <span className="text-[11px] text-neutral-400">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
        <div className="px-4 py-3 text-[11px] text-neutral-500">Live uit Bouw7 — openen via een beveiligde EVA-proxy.</div>
      </CardBody>
    </Card>
  )
}

// ─── SharePoint ─────────────────────────────────────────────────────────────────

const fallbackFout = (e: unknown): DossierSharePointData => ({
  geconfigureerd: true,
  status: null,
  mapUrl: null,
  bestanden: [],
  handmatig: false,
  voorstelNaam: null,
  fout: String(e),
})

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

function SharePointKaart({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [data, setData] = useState<DossierSharePointData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [bezig, start] = useTransition()

  useEffect(() => {
    getDossierSharePointBestanden(dossierId)
      .then(setData)
      .catch(e => setData(fallbackFout(e)))
  }, [dossierId])

  // Niet geconfigureerd → kaart helemaal verbergen
  if (data && !data.geconfigureerd) return null

  const opnieuw = () => start(async () => {
    try { setData(await hermatchDossierSharePoint(dossierId)) } catch (e) { setData(fallbackFout(e)) }
  })
  const ontkoppel = () => start(async () => {
    try { setData(await ontkoppelDossierMap(dossierId)) } catch (e) { setData(fallbackFout(e)) }
  })
  // Kandidaat uit de 'meerdere'-lijst: één klik, zonder de picker te openen.
  const kiesKandidaat = (itemId: string) => start(async () => {
    try { setData(await koppelDossierMap(dossierId, itemId)) } catch (e) { setData(fallbackFout(e)) }
  })

  const picker = (
    <SharePointMapPicker
      dossierId={dossierId}
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      onGekoppeld={setData}
      voorstelNaam={data?.voorstelNaam ?? null}
      zoekterm={data?.voorstelNaam?.split(' - ')[0] ?? null}
    />
  )

  return (
    <Card>
      {picker}
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>SharePoint-bestanden</span>
          <span className="flex items-center gap-2">
            {data?.handmatig && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                Handmatig gekoppeld
              </span>
            )}
            {data?.status === 'gematcht' && (
              <span className="text-[11px] font-normal text-neutral-400">{data.bestanden.length} in map</span>
            )}
          </span>
        </div>
      </CardHeader>
      <CardBody style={{ padding: data?.status === 'gematcht' && data.bestanden.length ? 0 : undefined }}>
        {data == null ? (
          <p className="text-[13px] text-neutral-500">SharePoint laden…</p>
        ) : data.status === 'gematcht' ? (
          data.bestanden.length === 0 ? (
            <div className="space-y-3">
              {data.melding && <p className="text-[12px] text-neutral-600">{data.melding}</p>}
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-neutral-500">Map gekoppeld, maar leeg.</p>
                {data.mapUrl && <a href={data.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Open map in SharePoint</a>}
              </div>
              {!readOnly && <MapActies onKies={() => setPickerOpen(true)} onOntkoppel={ontkoppel} bezig={bezig} />}
            </div>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-left">
                    <th className={`${TH} pl-4`}>Naam</th><th className={TH}>Type</th>
                    <th className={`${TH} text-right`}>Grootte</th><th className={TH}>Datum</th>
                    <th className={TH}>Door</th><th className={`${TH} pr-4 text-right`}>Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bestanden.map((b: SharePointBestand) => (
                    <tr key={b.id} className="border-b border-neutral-100 text-[12.5px]">
                      <td className="py-1.5 pl-4 pr-2 text-neutral-800">{b.naam}</td>
                      <td className="py-1.5 px-2 uppercase text-neutral-500">{b.extensie ?? '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmtGrootte(b.grootte)}</td>
                      <td className="py-1.5 px-2 text-neutral-500">{b.datum ?? '—'}</td>
                      <td className="py-1.5 px-2 text-neutral-500">{b.door ?? '—'}</td>
                      <td className="py-1.5 pl-2 pr-4 text-right">
                        {b.webUrl
                          ? <a href={b.webUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Openen</a>
                          : <span className="text-[11px] text-neutral-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[11px] text-neutral-500">
                  Live uit SharePoint ({data.handmatig ? 'handmatig gekoppelde' : 'automatisch gekoppelde'} dossiermap).
                </span>
                <span className="flex items-center gap-3">
                  {!readOnly && <MapActies onKies={() => setPickerOpen(true)} onOntkoppel={ontkoppel} bezig={bezig} />}
                  {data.mapUrl && <a href={data.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Open map in SharePoint</a>}
                </span>
              </div>
            </>
          )
        ) : (
          // niet_gevonden / meerdere / fout → zelf een map kiezen of aanmaken
          <div className="space-y-3">
            {data.melding && <p className="text-[12px] text-neutral-600">{data.melding}</p>}
            <p className="text-[13px] text-neutral-500">
              {data.status === 'meerdere'
                ? 'Meerdere mappen komen in aanmerking — kies de juiste.'
                : data.status === 'niet_gevonden'
                  ? 'Geen SharePoint-map gevonden voor dit dossier. Kies de juiste map, of maak hem aan.'
                  : 'SharePoint is nu niet bereikbaar.'}
            </p>
            {data.fout && (
              <p className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700 break-words">
                {data.fout}
              </p>
            )}

            {/* Bij 'meerdere' de kandidaten direct tonen: één klik i.p.v. de picker openen. */}
            {!readOnly && !!data.kandidaten?.length && (
              <ul className="divide-y divide-neutral-100 rounded border border-neutral-200">
                {data.kandidaten.map(m => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-neutral-800">{m.naam}</span>
                      <span className="block text-[11px] text-neutral-500">
                        {m.aantalItems ?? 0} item{m.aantalItems === 1 ? '' : 's'}
                        {m.gewijzigd ? ` · gewijzigd ${m.gewijzigd}` : ''}
                      </span>
                    </span>
                    <button onClick={() => kiesKandidaat(m.id)} disabled={bezig}
                      className="shrink-0 rounded border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                      Koppelen
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!readOnly && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPickerOpen(true)} disabled={bezig}
                  className="rounded bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                  Map kiezen of aanmaken
                </button>
                <button onClick={opnieuw} disabled={bezig}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-50 disabled:opacity-60">
                  Opnieuw zoeken
                </button>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
