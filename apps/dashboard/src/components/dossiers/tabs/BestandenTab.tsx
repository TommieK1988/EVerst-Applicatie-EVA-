'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { getDossierBestanden, type DossierBestandenData, type DossierBestand } from '@/lib/dossiers/bestanden'

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

export default function BestandenTab({ dossierId }: { dossierId: string }) {
  const [data, setData] = useState<DossierBestandenData | null>(null)

  useEffect(() => {
    getDossierBestanden(dossierId).then(setData).catch(() => setData({ beschikbaar: false, bestanden: [] }))
  }, [dossierId])

  if (data == null) return <div className="px-8 py-7 text-[13px] text-neutral-500">Bestanden laden…</div>

  if (!data.beschikbaar || data.bestanden.length === 0) {
    return (
      <div className="px-8 py-7">
        <Card>
          <CardHeader>Bestanden</CardHeader>
          <CardBody>
            <p className="text-[13px] text-neutral-500">
              {data.beschikbaar ? 'Geen projectbestanden in Bouw7.' : 'Dit dossier heeft geen Bouw7-koppeling of de bestanden zijn niet beschikbaar.'}
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Groepeer op categorie (behoudt de gesorteerde volgorde uit de server-action).
  const groepen: { categorie: string; items: DossierBestand[] }[] = []
  for (const b of data.bestanden) {
    const cat = b.categorie ?? 'Overig'
    const laatste = groepen[groepen.length - 1]
    if (laatste && laatste.categorie === cat) laatste.items.push(b)
    else groepen.push({ categorie: cat, items: [b] })
  }

  return (
    <div className="px-8 py-7 space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span>Bestanden</span>
            <span className="text-[11px] font-normal text-neutral-400">{data.bestanden.length} uit Bouw7</span>
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                <th className="py-1.5 pl-4 pr-2">Naam</th>
                <th className="py-1.5 px-2">Type</th>
                <th className="py-1.5 px-2 text-right">Grootte</th>
                <th className="py-1.5 px-2">Datum</th>
                <th className="py-1.5 px-2">Door</th>
                <th className="py-1.5 pl-2 pr-4 text-right">Actie</th>
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
          <div className="px-4 py-3 text-[11px] text-neutral-500">
            Live uit Bouw7 (projectbestanden). Openen/downloaden loopt via een beveiligde EVA-proxy.
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
