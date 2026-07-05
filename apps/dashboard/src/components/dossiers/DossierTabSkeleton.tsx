import { Skeleton } from '@/components/ui'

/**
 * Placeholder voor dossiertabs die hun data live uit Bouw7 halen
 * (Financieel, Inkoop, Verkoop, Uren, Meerwerk, Bestanden). Door de tab in een
 * <Suspense> met deze fallback te wikkelen rendert de pagina-shell + tabbalk
 * meteen; de trage Bouw7-data streamt daarna in. Zo blokkeert een sloom Bouw7
 * de navigatie niet meer.
 */
export function DossierTabSkeleton() {
  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)' }}>
      <Skeleton className="h-5" style={{ width: 220, marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded" />
        ))}
      </div>
    </div>
  )
}
