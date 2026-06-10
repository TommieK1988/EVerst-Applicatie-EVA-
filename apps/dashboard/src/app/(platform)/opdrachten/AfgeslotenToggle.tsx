'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function AfgeslotenToggle() {
  const router      = useRouter()
  const pathname    = usePathname()
  const params      = useSearchParams()
  const afgesloten  = params.get('afgesloten') === '1'

  function toggle() {
    const next = new URLSearchParams(params.toString())
    if (afgesloten) next.delete('afgesloten')
    else next.set('afgesloten', '1')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: '0 12px', borderRadius: 6, fontSize: 12.5,
        fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
        background: afgesloten ? 'var(--neutral-200)' : 'transparent',
        color: afgesloten ? 'var(--neutral-800)' : 'var(--neutral-600)',
        transition: 'all 120ms',
      }}
    >
      {afgesloten ? 'Verberg afgesloten' : 'Toon afgesloten'}
    </button>
  )
}
