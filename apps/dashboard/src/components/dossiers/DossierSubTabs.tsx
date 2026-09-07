'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Sub-navigatie binnen één dossier-tab, als `?deel=`-links in plaats van client-state.
 *
 * Bewust links: de onderdelen achter deze knoppen zijn deels server components (KAM) en
 * deels zware client-eilanden (Oplevering, 1200 regels). Met client-state zouden ze
 * allemaal tegelijk in de bundel moeten zitten en tegelijk hun data ophalen; met een
 * navigatie rendert de server alleen het gekozen deel.
 */
export default function DossierSubTabs({
  delen,
}: {
  delen: Array<{ deel: string; label: string; actief: boolean }>
}) {
  const pathname = usePathname()
  const params = useSearchParams()

  function hrefVoor(deel: string) {
    const q = new URLSearchParams(params.toString())
    q.set('deel', deel)
    return `${pathname}?${q.toString()}`
  }

  return (
    <div
      role="tablist"
      style={{
        display: 'flex', gap: 2, padding: 3, marginBottom: 20,
        background: 'var(--neutral-100, #eef1f2)', borderRadius: 9,
        width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
      }}
    >
      {delen.map(d => (
        <Link
          key={d.deel}
          href={hrefVoor(d.deel)}
          role="tab"
          aria-selected={d.actief}
          scroll={false}
          style={{
            padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap', textDecoration: 'none',
            background: d.actief ? 'var(--bg-elev, #fff)' : 'transparent',
            color: d.actief ? 'var(--neutral-900, #161b20)' : 'var(--neutral-600, #58636b)',
            boxShadow: d.actief ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
          }}
        >
          {d.label}
        </Link>
      ))}
    </div>
  )
}
