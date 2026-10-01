/**
 * Overige betrokkenen in het werkplan: alleen-lezen, uit het blok Betrokkenen op het
 * Informatie-tabblad. Wijzigen gebeurt daar, zodat er maar één lijst is.
 */

import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'
import type { Betrokkene } from '@/lib/dossiers/betrokkenen-types'

export default function WerkplanBetrokkenen({ betrokkenen, informatieHref }: {
  betrokkenen: Betrokkene[]
  informatieHref: string
}) {
  return (
    <div className="flex flex-col gap-3">
      {betrokkenen.length === 0 ? (
        <p className="text-[13px] text-neutral-500">Er staan nog geen betrokkenen bij dit dossier.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {betrokkenen.map(b => (
            <li key={b.sleutel} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-[13px]">
              <span className="font-semibold text-neutral-900">{b.naam}</span>
              {b.rol && <span className="text-neutral-600">{b.rol}</span>}
              {b.organisatie && b.organisatie.naam !== b.naam && <span className="text-neutral-500">{b.organisatie.naam}</span>}
              <span className="ml-auto flex gap-4 text-neutral-600">
                {b.telefoon && (
                  <a href={`tel:${b.telefoon}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                    <Phone className="h-3.5 w-3.5" />{b.telefoon}
                  </a>
                )}
                {b.email && (
                  <a href={`mailto:${b.email}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                    <Mail className="h-3.5 w-3.5" />{b.email}
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href={informatieHref} className="text-[12.5px] font-semibold text-brand-600 hover:underline">
        Betrokkenen wijzigen in Informatie
      </Link>
    </div>
  )
}
