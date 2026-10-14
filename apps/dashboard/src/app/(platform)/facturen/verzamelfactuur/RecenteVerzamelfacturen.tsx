'use client'

import React from 'react'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui'
import type { VerzamelfactuurRij } from '@/lib/verzamelfactuur/types'
import { datum, euro } from './format'

/** De laatst klaargezette verzamelfacturen, met hun stand in Bouw7. */
export function RecenteVerzamelfacturen({ rijen }: { rijen: VerzamelfactuurRij[] }) {
  if (rijen.length === 0) return null
  return (
    <Card>
      <CardHeader>Eerder klaargezet</CardHeader>
      <CardBody className="p-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[10.5px] uppercase tracking-[0.08em] text-neutral-500">
              <th className="px-4 py-2">Datum</th>
              <th className="px-2 py-2">Factuurpartij</th>
              <th className="px-2 py-2">Werkmaatschappij</th>
              <th className="px-2 py-2 text-right">Bonnen</th>
              <th className="px-2 py-2 text-right">Excl. btw</th>
              <th className="px-2 py-2">Door</th>
              <th className="px-4 py-2">Stand</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(r => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 tabular-nums text-neutral-600">{datum(r.aangemaaktOp)}</td>
                <td className="px-2 py-2 text-neutral-900">{r.factuurpartijNaam}</td>
                <td className="px-2 py-2 text-neutral-600">{r.werkmaatschappij ?? '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.aantalDossiers}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.totaalExcl != null ? euro(r.totaalExcl) : '—'}</td>
                <td className="px-2 py-2 text-neutral-600">{r.aangemaaktDoor ?? '—'}</td>
                <td className="px-4 py-2">
                  {r.status === 'verzonden'
                    ? <Badge tone="success">Verstuurd · {r.factuurnummer}</Badge>
                    : <Badge tone="warning">Klaar in Bouw7 · {r.bouw7InvoiceId}</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
