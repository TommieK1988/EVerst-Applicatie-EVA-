'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { IconSparkle, IconChat } from './Icons'
import type { GroupedResults, SearchHit, MedewerkerProfiel } from '@/lib/search/global'

/* ─── Context (⌘K + de TopBar-popup delen één open-status) ───────────────── */

type GlobalSearchCtx = { open: () => void; close: () => void; toggle: () => void; isOpen: boolean }
const Ctx = React.createContext<GlobalSearchCtx | null>(null)

export function useGlobalSearch(): GlobalSearchCtx {
  const ctx = React.useContext(Ctx)
  if (!ctx) return { open: () => {}, close: () => {}, toggle: () => {}, isOpen: false }
  return ctx
}

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false)

  const api = React.useMemo<GlobalSearchCtx>(
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
      isOpen,
    }),
    [isOpen],
  )

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // De popup zelf hangt in de TopBar (TopbarZoek). Hier alleen de gedeelde status.
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/* ─── Zoek-hook (debounced server-side fetch) ───────────────────────────── */

function useEntitySearch(query: string) {
  const [results, setResults] = React.useState<GroupedResults | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/eva/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        if (res.ok) setResults(await res.json())
      } catch {
        /* afgebroken of mislukt — stil */
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  return { results, loading }
}

/* ─── Gedeelde resultaten-render (lijst + medewerker-profiel) ────────────── */

function ZoekResultaten({
  term, results, loading, onNavigate,
}: {
  term: string
  results: GroupedResults | null
  loading: boolean
  onNavigate: (hit: SearchHit) => void
}) {
  const [profiel, setProfiel] = React.useState<MedewerkerProfiel | null>(null)
  const [profielLaadt, setProfielLaadt] = React.useState(false)

  // Reset het profielpaneel zodra de zoekterm wijzigt.
  React.useEffect(() => {
    setProfiel(null)
    setProfielLaadt(false)
  }, [term])

  async function openMedewerker(id: string) {
    setProfielLaadt(true)
    setProfiel(null)
    try {
      const res = await fetch(`/api/eva/medewerker?id=${encodeURIComponent(id)}`)
      if (res.ok) setProfiel(await res.json())
    } catch {
      /* stil */
    } finally {
      setProfielLaadt(false)
    }
  }

  function pick(hit: SearchHit) {
    if (hit.type === 'medewerker') {
      void openMedewerker(hit.id)
      return
    }
    if (hit.href) onNavigate(hit)
  }

  if (profiel || profielLaadt) {
    return (
      <MedewerkerPaneel
        profiel={profiel}
        laadt={profielLaadt}
        onTerug={() => { setProfiel(null); setProfielLaadt(false) }}
      />
    )
  }

  return (
    <div style={{ maxHeight: '56vh', overflowY: 'auto', padding: 8 }}>
      {loading && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--fg-muted)' }}>Zoeken…</div>
      )}

      {!loading && term.length >= 2 && results && results.total === 0 && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--fg-muted)' }}>
          Niets gevonden voor &quot;{term}&quot;.
        </div>
      )}

      {term.length < 2 && (
        <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--fg-muted)' }}>
          Typ minstens 2 tekens om te zoeken.
        </div>
      )}

      {results?.groups.map((g) => (
        <div key={g.type} style={{ marginTop: 6 }}>
          <div style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--fg-muted)', padding: '6px 12px 2px',
          }}>{g.label}</div>
          {g.hits.map((hit) => (
            <button
              key={`${hit.type}:${hit.id}`}
              onMouseDown={(e) => { e.preventDefault(); pick(hit) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, color: 'var(--fg-soft)',
                background: 'transparent', border: 'none', textAlign: 'left',
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--fg)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {hit.label}
                </span>
                {hit.sublabel && (
                  <span style={{ color: 'var(--fg-muted)', fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {hit.sublabel}
                  </span>
                )}
              </span>
              {hit.badge && (
                <span style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: 'var(--fg-muted)', border: '1px solid var(--border)',
                  borderRadius: 999, padding: '2px 8px', flexShrink: 0,
                }}>{hit.badge}</span>
              )}
              {hit.type === 'medewerker' && (
                <span style={{ fontSize: 11, color: 'var(--fg-muted)', flexShrink: 0 }}>profiel ›</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ─── Inline zoekbalk met dropdown (dashboard) ──────────────────────────── */

export function EvaSearchField({
  placeholder = 'Zoek op relatie, adres of dossier…',
  autoFocus = false,
  onDone,
  barStyle,
}: {
  placeholder?: string
  autoFocus?: boolean
  onDone?: () => void
  barStyle?: React.CSSProperties
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [focused, setFocused] = React.useState(false)
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const { results, loading } = useEntitySearch(query)
  const term = query.trim()
  const toon = focused && term.length >= 1

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        background: 'var(--bg-elev)', border: '1px solid var(--border)',
        borderRadius: 12,
        ...barStyle,
      }}>
        <IconSparkle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setFocused(true) }}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150) }}
          onKeyDown={(e) => { if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); onDone?.() } }}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--fg)', fontSize: 14, fontFamily: 'var(--font-ui)',
          }}
        />
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.08em' }}>⌘ K</span>
      </div>

      {toon && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 1001,
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
            overflow: 'hidden', fontFamily: 'var(--font-ui)',
          }}
        >
          <ZoekResultaten
            term={term}
            results={results}
            loading={loading}
            onNavigate={(hit) => { onDone?.(); router.push(hit.href!) }}
          />
        </div>
      )}
    </div>
  )
}

/* ─── TopBar-popup (knop + verankerde dropdown, sluit bij klik buiten) ───── */

export function TopbarZoek() {
  const router = useRouter()
  const { isOpen, toggle, close } = useGlobalSearch()
  const ref = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [query, setQuery] = React.useState('')

  const { results, loading } = useEntitySearch(query)
  const term = query.trim()

  // Sluit bij klik buiten de popup.
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [close])

  // Focus het invoerveld zodra de popup opent; leeg de term bij sluiten.
  React.useEffect(() => {
    if (isOpen) inputRef.current?.focus()
    else setQuery('')
  }, [isOpen])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggle} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: '0 12px',
        background: 'var(--accent)', color: 'white',
        border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', letterSpacing: '0.01em', whiteSpace: 'nowrap',
      }}>
        <IconChat size={14} />
        Vraag EVA
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 'min(440px, 90vw)', zIndex: 1000,
          background: 'var(--bg-elev)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
          overflow: 'hidden', fontFamily: 'var(--font-ui)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <IconSparkle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') close() }}
              placeholder="Zoek op relatie, adres of dossier…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg)', fontSize: 14, fontFamily: 'var(--font-ui)',
              }}
            />
          </div>
          <ZoekResultaten
            term={term}
            results={results}
            loading={loading}
            onNavigate={(hit) => { close(); router.push(hit.href!) }}
          />
        </div>
      )}
    </div>
  )
}

/* ─── Medewerker-profielpaneel ──────────────────────────────────────────── */

function MedewerkerPaneel({
  profiel, laadt, onTerug,
}: { profiel: MedewerkerProfiel | null; laadt: boolean; onTerug: () => void }) {
  return (
    <div style={{ padding: 16 }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); onTerug() }}
        style={{ background: 'none', border: 'none', color: 'var(--fg-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12 }}
      >‹ Terug naar resultaten</button>

      {laadt && <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Profiel laden…</div>}

      {profiel && (
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>
            {profiel.naam}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 14 }}>
            {[profiel.functie, profiel.afdeling].filter(Boolean).join(' · ') || 'Medewerker'}
            {profiel.extern ? ' · extern' : ''}
            {!profiel.actief ? ' · niet actief' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
            <Veld label="E-mail" value={profiel.email} />
            <Veld label="Telefoon" value={profiel.telefoon} />
            <Veld label="In dienst sinds" value={profiel.in_dienst_vanaf} />
            <Veld label="Uit dienst" value={profiel.uit_dienst_per} />
            <Veld label="Plaats" value={profiel.adres_plaats} />
            <Veld label="Werkmaatschappij" value={profiel.werkmaatschappij} />
            <Veld label="CAO-schaal" value={profiel.cao_schaal} />
            <Veld
              label="Uurtarief verkoop"
              value={profiel.uurtarief_verkoop != null ? `€ ${profiel.uurtarief_verkoop}` : null}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Veld({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? 'var(--fg)' : 'var(--fg-muted)' }}>{value || '—'}</div>
    </div>
  )
}
