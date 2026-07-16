'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { markeerUpdatesGezien, type ChangelogItem, type ChangelogCategorie } from '@/app/(platform)/wat-is-nieuw/actions'

const CAT: Record<ChangelogCategorie, { label: string; kleur: string; bg: string }> = {
  nieuw:     { label: 'Nieuw',     kleur: '#009439', bg: 'rgba(0,148,57,0.10)' },
  verbeterd: { label: 'Verbeterd', kleur: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  opgelost:  { label: 'Opgelost',  kleur: '#b45309', bg: 'rgba(180,83,9,0.10)' },
}

const MAAND = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

function maandLabel(datum: string): string {
  const d = new Date(datum)
  return `${MAAND[d.getMonth()]} ${d.getFullYear()}`
}

function dagLabel(datum: string): string {
  const d = new Date(datum)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

type Props = { items: ChangelogItem[] }

export default function WatIsNieuwTijdlijn({ items }: Props) {
  const router = useRouter()
  const [filter, setFilter] = useState<ChangelogCategorie | 'alle'>('alle')

  // Bij openen: markeer alles als gezien en ververs zodat de sidebar-badge verdwijnt.
  useEffect(() => {
    let actief = true
    markeerUpdatesGezien().then(() => { if (actief) router.refresh() })
    return () => { actief = false }
  }, [router])

  const zichtbaar = useMemo(
    () => items.filter(i => filter === 'alle' || i.categorie === filter),
    [items, filter],
  )

  // Groepeer per maand, volgorde van de (al gesorteerde) lijst behouden.
  const groepen = useMemo(() => {
    const map = new Map<string, ChangelogItem[]>()
    for (const i of zichtbaar) {
      const key = maandLabel(i.datum)
      const arr = map.get(key)
      if (arr) arr.push(i); else map.set(key, [i])
    }
    return [...map.entries()]
  }, [zichtbaar])

  const telling = useMemo(() => ({
    alle:      items.length,
    nieuw:     items.filter(i => i.categorie === 'nieuw').length,
    verbeterd: items.filter(i => i.categorie === 'verbeterd').length,
    opgelost:  items.filter(i => i.categorie === 'opgelost').length,
  }), [items])

  const filters: Array<{ key: ChangelogCategorie | 'alle'; label: string; n: number }> = [
    { key: 'alle',      label: 'Alles',     n: telling.alle },
    { key: 'nieuw',     label: 'Nieuw',     n: telling.nieuw },
    { key: 'verbeterd', label: 'Verbeterd', n: telling.verbeterd },
    { key: 'opgelost',  label: 'Opgelost',  n: telling.opgelost },
  ]

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px 64px' }}>
      {/* Kop */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>✨</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)', margin: 0 }}>Wat is nieuw in EVA</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--fg-soft)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Een overzicht van alle nieuwe functies, verbeteringen en oplossingen die aan EVA zijn toegevoegd.
          De nieuwste updates staan bovenaan.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
        {filters.map(f => {
          const actief = filter === f.key
          const c = f.key === 'alle' ? null : CAT[f.key]
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600,
                border: `1px solid ${actief ? (c?.kleur ?? 'var(--fg)') : 'var(--border)'}`,
                background: actief ? (c?.bg ?? 'var(--bg-active)') : 'transparent',
                color: actief ? (c?.kleur ?? 'var(--fg)') : 'var(--fg-soft)',
              }}
            >
              {f.label}
              <span style={{
                fontSize: 10.5, fontWeight: 700, opacity: 0.7,
                minWidth: 16, textAlign: 'center',
              }}>{f.n}</span>
            </button>
          )
        })}
      </div>

      {/* Tijdlijn */}
      {groepen.length === 0 && (
        <div style={{ fontSize: 14, color: 'var(--fg-muted)', padding: '40px 0', textAlign: 'center' }}>
          Geen updates in deze categorie.
        </div>
      )}

      {groepen.map(([maand, groepItems]) => (
        <section key={maand} style={{ marginBottom: 30 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--fg-muted)', marginBottom: 12,
          }}>{maand}</div>

          <div style={{ position: 'relative', paddingLeft: 26 }}>
            {/* Verticale lijn */}
            <div style={{
              position: 'absolute', left: 6, top: 6, bottom: 6, width: 2,
              background: 'var(--border)', borderRadius: 2,
            }}/>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groepItems.map(item => {
                const c = CAT[item.categorie]
                return (
                  <article key={item.id} style={{ position: 'relative' }}>
                    {/* Stip op de lijn */}
                    <span style={{
                      position: 'absolute', left: -26, top: 16,
                      width: 14, height: 14, borderRadius: '50%',
                      background: c.kleur, border: '3px solid var(--bg)',
                      transform: 'translateX(-1px)',
                    }}/>
                    <div style={{
                      border: '1px solid var(--border)', borderRadius: 12,
                      background: 'var(--bg-elev, white)', padding: '14px 16px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          color: c.kleur, background: c.bg,
                        }}>{c.label}</span>
                        {item.module && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                            color: 'var(--fg-muted)', background: 'var(--surface, rgba(0,0,0,0.04))',
                          }}>{item.module}</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-muted)' }}>
                          {dagLabel(item.datum)}
                        </span>
                      </div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px' }}>
                        {item.titel}
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--fg-soft)', margin: 0, lineHeight: 1.5 }}>
                        {item.omschrijving}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
