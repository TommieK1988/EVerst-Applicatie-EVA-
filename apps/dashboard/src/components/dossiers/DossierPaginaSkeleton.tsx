import { Skeleton } from '@/components/ui'

/**
 * Fallback voor `loading.tsx` van een dossier-detailpagina. Zonder deze boundary
 * blijft het overzicht (of een leeg tabblad) staan tot álle serverdata binnen is —
 * een dossier met veel Bouw7-data voelt dan als een hapering. Met de boundary
 * verschijnt de pagina meteen en streamt de inhoud erin.
 *
 * Vorm volgt bewust het Informatie-tab: kop met dossiernummer + titel, daaronder
 * twee kolommen met informatieblokken.
 */
export function DossierPaginaSkeleton() {
  return (
    <div className="px-8 py-7" aria-busy="true" aria-label="Dossier wordt geladen">
      {/* Kop */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-3" style={{ width: 110 }} />
        <Skeleton className="h-8" style={{ width: 420, maxWidth: '70%' }} />
        <div className="mt-2.5 flex items-center gap-2.5">
          <Skeleton className="h-6 rounded-full" style={{ width: 130 }} />
          <Skeleton className="h-6 rounded-full" style={{ width: 96 }} />
        </div>
      </div>

      {/* Informatieblokken. Randkleur via een Tailwind-klasse: --border is een
          HSL-kanalentripel, dus `borderColor: var(--border)` zou zwart worden. */}
      <div className="grid grid-cols-2 gap-3.5">
        {Array.from({ length: 4 }).map((_, blok) => (
          <div key={blok} className="rounded-lg border border-neutral-200 p-4">
            <Skeleton className="mb-4 h-3" style={{ width: 140 }} />
            <div className="grid grid-cols-2 gap-x-5 gap-y-4">
              {Array.from({ length: 6 }).map((_, veld) => (
                <div key={veld}>
                  <Skeleton className="mb-1.5 h-2.5" style={{ width: '60%' }} />
                  <Skeleton className="h-3.5" style={{ width: '85%' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
