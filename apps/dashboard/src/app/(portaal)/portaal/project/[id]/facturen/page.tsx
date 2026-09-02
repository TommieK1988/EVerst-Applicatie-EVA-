import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalFacturen } from '@/lib/portaal/facturen'
import { datumKort, euro } from '@/lib/portaal/format'
import { Kaart, Leeg } from '../../../ui'

export const metadata: Metadata = { title: 'Facturen' }
export const dynamic = 'force-dynamic'

const TOON: Record<string, string> = {
  Betaald:    'bg-success-50 text-success-700',
  Openstaand: 'bg-neutral-100 text-neutral-600',
  Vervallen:  'bg-warning-50 text-warning-700',
  Creditnota: 'bg-info-50 text-info-700',
}

/**
 * De verstuurde facturen van dit project.
 *
 * Alleen de facturen zelf: nummer, datum, bedrag en of ze betaald zijn. Geen
 * termijnschema, geen aanneemsom, geen contracttotaal — daar is met een offerte
 * ernaast onze marge uit te herleiden. Zie lib/portaal/facturen.ts.
 */
export default async function FacturenPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let data
  try {
    data = await getPortaalFacturen(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  // Onbereikbare administratie is iets anders dan "u heeft geen facturen". Dat
  // verschil moet op het scherm staan, anders belt iemand ons over een factuur
  // die er gewoon is.
  if (!data.beschikbaar) {
    return (
      <Kaart titel="Facturen">
        <Leeg>
          Het factuuroverzicht is op dit moment niet beschikbaar. Probeer het later opnieuw —
          uw facturen zelf zijn hier niet door geraakt.
        </Leeg>
      </Kaart>
    )
  }

  return (
    <Kaart titel="Facturen">
      {data.facturen.length === 0 ? (
        <Leeg>Er zijn nog geen facturen verstuurd voor dit project.</Leeg>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400">
                <th className="px-4 pb-2 font-semibold sm:px-0">Factuur</th>
                <th className="px-2 pb-2 font-semibold">Datum</th>
                <th className="px-2 pb-2 text-right font-semibold">Bedrag</th>
                <th className="px-4 pb-2 text-right font-semibold sm:px-0">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.facturen.map((f, i) => (
                <tr key={`${f.nummer ?? i}`}>
                  <td className="px-4 py-2.5 font-medium sm:px-0">{f.nummer ?? '—'}</td>
                  <td className="px-2 py-2.5 text-neutral-600">{datumKort(f.datum)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{euro(f.bedrag)}</td>
                  <td className="px-4 py-2.5 text-right sm:px-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TOON[f.status] ?? TOON.Openstaand}`}>
                      {f.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Kaart>
  )
}
