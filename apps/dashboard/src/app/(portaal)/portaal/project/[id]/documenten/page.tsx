import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalDocumenten } from '@/lib/portaal/bestanden'
import { datumKort, bestandsgrootte } from '@/lib/portaal/format'
import { Kaart, Leeg } from '../../../ui'

export const metadata: Metadata = { title: 'Documenten' }
export const dynamic = 'force-dynamic'

/**
 * De documenten die met deze klant gedeeld zijn.
 *
 * Staat het onderdeel uit, dan geeft de guard een fout en wordt dit een 404 —
 * de pagina bestaat dan niet, in plaats van leeg te renderen. Dat scheelt de
 * bevestiging dat er wél documenten zijn die hij niet mag zien.
 */
export default async function DocumentenPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let bestanden
  try {
    bestanden = await getPortaalDocumenten(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return (
    <Kaart titel="Documenten" subtitel={bestanden.length > 0 ? `${bestanden.length} bestand${bestanden.length === 1 ? '' : 'en'}` : undefined}>
      {bestanden.length === 0 ? (
        <Leeg>Er zijn nog geen documenten met u gedeeld.</Leeg>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {bestanden.map(b => (
            <li key={b.sleutel}>
              <a
                href={b.url}
                className="flex items-center gap-3 py-2.5 transition hover:bg-neutral-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-bold uppercase text-neutral-500">
                  {(b.extensie ?? '?').slice(0, 4)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{b.naam}</span>
                  <span className="block text-xs text-neutral-500">
                    {[datumKort(b.datum), bestandsgrootte(b.grootte)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand-600">Downloaden</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  )
}
