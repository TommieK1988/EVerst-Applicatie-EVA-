import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalFotos } from '@/lib/portaal/bestanden'
import { datumKort } from '@/lib/portaal/format'
import { Kaart, Leeg } from '../../../ui'

export const metadata: Metadata = { title: "Foto's" }
export const dynamic = 'force-dynamic'

/**
 * De foto's die met deze klant gedeeld zijn.
 *
 * Zowel de thumbnail als het origineel gaan via /api/dossier-bestand?portaal=1.
 * Er staat dus nooit een rechtstreekse bucket- of SharePoint-URL in de HTML —
 * daardoor kunnen die buckets later privé worden zonder dat deze pagina breekt.
 */
export default async function FotosPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let fotos
  try {
    fotos = await getPortaalFotos(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return (
    <Kaart titel="Foto's" subtitel={fotos.length > 0 ? `${fotos.length} foto${fotos.length === 1 ? '' : "'s"}` : undefined}>
      {fotos.length === 0 ? (
        <Leeg>Er zijn nog geen foto&apos;s met u gedeeld.</Leeg>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {fotos.map(f => (
            <li key={f.sleutel}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="group block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.thumbUrl ?? f.url}
                  alt={f.naam}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover transition group-hover:opacity-90"
                />
                <span className="mt-1 block truncate text-[11px] text-neutral-500">
                  {datumKort(f.datum)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  )
}
