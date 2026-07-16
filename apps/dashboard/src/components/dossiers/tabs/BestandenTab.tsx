'use client'

import React, { useEffect, useState, useTransition } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { getDossierBestanden, type DossierBestandenData, type DossierBestand } from '@/lib/dossiers/bestanden'
import {
  getDossierSharePointBestanden,
  hermatchDossierSharePoint,
  koppelDossierMapViaLink,
  type DossierSharePointData,
  type SharePointBestand,
} from '@/lib/dossiers/sharepoint-bestanden'
import { useDossierReadOnly } from '../DossierReadOnlyContext'
import DocumentenKaart from '@/components/documenten/DocumentenKaart'

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

  useEffect(() => {
    getDossierBestanden(dossierId).then(setBouw7).catch(() => setBouw7({ beschikbaar: false, bestanden: [] }))
  }, [dossierId])

  return (
    <div className="px-8 py-7 space-y-5">
      {/* Opstellen bovenaan; wat je hier maakt landt in SharePoint en verschijnt
          daardoor vanzelf in de SharePoint-kaart hieronder. */}
      <DocumentenKaart dossierId={dossierId} />
      <Bouw7Kaart data={bouw7} />
      <SharePointKaart dossierId={dossierId} />
    </div>
  )
}

// ─── Bouw7 ──────────────────────────────────────────────────────────────────────

function Bouw7Kaart({ data }: { data: DossierBestandenData | null }) {
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
          <span className="text-[11px] font-normal text-neutral-400">{data.bestanden.length} uit Bouw7</span>
        </div>
      </CardHeader>
      <CardBody style={{ padding: 0 }}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 text-left">
              <th className={`${TH} pl-4`}>Naam</th><th className={TH}>Type</th>
              <th className={`${TH} text-right`}>Grootte</th><th className={TH}>Datum</th>
              <th className={TH}>Door</th><th className={`${TH} pr-4 text-right`}>Actie</th>
            </tr>
          </thead>
          {groepen.map(g => (
            <tbody key={g.categorie}>
              <tr className="bg-neutral-50">
                <td colSpan={6} className="py-1.5 pl-4 pr-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">{g.categorie}</td>
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

function SharePointKaart({ dossierId }: { dossierId: string }) {
  const readOnly = useDossierReadOnly()
  const [data, setData] = useState<DossierSharePointData | null>(null)
  const [link, setLink] = useState('')
  const [bezig, start] = useTransition()

  useEffect(() => {
    getDossierSharePointBestanden(dossierId)
      .then(setData)
      .catch(e => setData({ geconfigureerd: true, status: null, mapUrl: null, bestanden: [], fout: String(e) }))
  }, [dossierId])

  // Niet geconfigureerd → kaart helemaal verbergen
  if (data && !data.geconfigureerd) return null

  const fallbackFout = (e: unknown): DossierSharePointData =>
    ({ geconfigureerd: true, status: 'niet_gevonden', mapUrl: null, bestanden: [], fout: String(e) })

  const opnieuw = () => start(async () => {
    try { setData(await hermatchDossierSharePoint(dossierId)) } catch (e) { setData(fallbackFout(e)) }
  })
  const koppel = () => {
    if (!link.trim()) return
    start(async () => {
      try { const r = await koppelDossierMapViaLink(dossierId, link.trim()); setData(r); setLink('') }
      catch (e) { setData(fallbackFout(e)) }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>SharePoint-bestanden</span>
          {data?.status === 'gematcht' && (
            <span className="text-[11px] font-normal text-neutral-400">{data.bestanden.length} in map</span>
          )}
        </div>
      </CardHeader>
      <CardBody style={{ padding: data?.status === 'gematcht' && data.bestanden.length ? 0 : undefined }}>
        {data == null ? (
          <p className="text-[13px] text-neutral-500">SharePoint laden…</p>
        ) : data.status === 'gematcht' ? (
          data.bestanden.length === 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-neutral-500">Map gekoppeld, maar leeg.</p>
              {data.mapUrl && <a href={data.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Open map in SharePoint</a>}
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
                <span className="text-[11px] text-neutral-500">Live uit SharePoint (automatisch gekoppelde dossiermap).</span>
                {data.mapUrl && <a href={data.mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand-600 hover:underline">Open map in SharePoint</a>}
              </div>
            </>
          )
        ) : (
          // niet_gevonden / meerdere / fout → handmatig koppelen
          <div className="space-y-3">
            <p className="text-[13px] text-neutral-500">
              {data.status === 'meerdere'
                ? 'Meerdere mogelijke mappen gevonden — koppel de juiste handmatig.'
                : data.status === 'niet_gevonden'
                  ? 'Geen SharePoint-map automatisch gevonden voor dit dossier.'
                  : 'SharePoint is nu niet bereikbaar.'}
            </p>
            {data.fout && (
              <p className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11.5px] text-red-700 break-words">
                {data.fout}
              </p>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <input
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  placeholder="Plak SharePoint-link naar de dossiermap"
                  className="flex-1 rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <button onClick={koppel} disabled={bezig}
                  className="rounded bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                  Koppelen
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
