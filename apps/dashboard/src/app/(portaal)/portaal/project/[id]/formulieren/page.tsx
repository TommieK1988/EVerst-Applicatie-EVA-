import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalFormulieren } from '@/lib/portaal/formulieren'
import { datumKort } from '@/lib/portaal/format'
import { Kaart, Leeg } from '../../../ui'

export const metadata: Metadata = { title: 'Controles' }
export const dynamic = 'force-dynamic'

/**
 * Ingevulde formulieren en uitgevoerde kwaliteitscontroles.
 *
 * Van een controle tonen we de samenvatting, niet de bevindingen per punt: die
 * bevatten interne toewijzingen en herstelkosten. Wat de klant wél moet zien —
 * een punt dat nog open staat — komt via Aandachtspunten binnen.
 */
export default async function FormulierenPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let data
  try {
    data = await getPortaalFormulieren(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  return (
    <div className="space-y-5">
      <Kaart titel="Ingevulde formulieren">
        {data.formulieren.length === 0 ? (
          <Leeg>Er zijn nog geen formulieren met u gedeeld.</Leeg>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.formulieren.map(f => (
              <li key={f.id}>
                <a
                  href={f.pdfUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-neutral-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{f.titel}</span>
                    <span className="block text-xs text-neutral-500">{datumKort(f.datum)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-600">Openen</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      <Kaart titel="Kwaliteitscontroles">
        {data.controles.length === 0 ? (
          <Leeg>Er zijn nog geen afgeronde controles voor dit project.</Leeg>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.controles.map(c => (
              <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {c.omschrijving || 'Kwaliteitscontrole'}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {[c.nummer, datumKort(c.datum)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {c.bekeken != null && (
                    <span className="shrink-0 text-xs text-neutral-500">
                      {c.bekeken} bekeken
                      {c.afwijkend != null && c.afwijkend > 0 && ` · ${c.afwijkend} afwijkend`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Kaart>
    </div>
  )
}
