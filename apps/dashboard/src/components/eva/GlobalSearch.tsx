'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { IconSparkle, IconChat } from './Icons'
import type { GroupedResults, SearchHit, MedewerkerProfiel } from '@/lib/search/global'

/* ─── Context ───────────────────────────────────────────────────────────── */

type GlobalSearchCtx = { open: () => void; close: () => void }
const Ctx = React.createContext<GlobalSearchCtx | null>(null)

export function useGlobalSearch(): GlobalSearchCtx {
  const ctx = React.useContext(Ctx)
  if (!ctx) return { open: () => {}, close: () => {} }
  return ctx
}

const VRAAGWOORDEN = ['hoeveel', 'wat', 'welke', 'wie', 'waar', 'hoe', 'wanneer', 'waarom']

function lijktVraag(s: string): boolean {
  const t = s.trim().toLowerCase()
  if (!t) return false
  if (t.endsWith('?')) return true
  const eerste = t.split(/\s+/)[0]
  return VRAAGWOORDEN.includes(eerste) && t.split(/\s+/).length >= 3
}

/* ─── Provider ──────────────────────────────────────────────────────────── */

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  const api = React.useMemo<GlobalSearchCtx>(
    () => ({ open: () => setOpen(true), close: () => setOpen(false) }),
    [],
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

  return (
    <Ctx.Provider value={api}>
      {children}
      {open && <GlobalSearchDialog onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

/* ─── Dialog ────────────────────────────────────────────────────────────── */

function GlobalSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<GroupedResults | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [profiel, setProfiel] = React.useState<MedewerkerProfiel | null>(null)
  const [profielLaadt, setProfielLaadt] = React.useState(false)

  // Debounced server-side zoek.
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
        const res = await fetch(`/api/eva/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        })
        if (res.ok) setResults(await res.json())
      } catch {
        /* afgebroken of mislukt — stil laten */
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  function vraagEva() {
    const term = query.trim()
    if (!term) return
    onClose()
    router.push(`/vraag-eva?seed=${encodeURIComponent(term)}`)
  }

  function kiesHit(hit: SearchHit) {
    if (hit.type === 'medewerker') {
      openMedewerker(hit.id)
      return
    }
    if (hit.href) {
      onClose()
      router.push(hit.href)
    }
  }

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

  const isVraag = lijktVraag(query)

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <Command shouldFilter={false} loop>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <IconSparkle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={(v) => { setQuery(v); setProfiel(null) }}
              placeholder="Zoek relaties, dossiers, medewerkers… of stel EVA een vraag"
              onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--fg)', fontSize: 15, fontFamily: 'var(--font-ui)',
              }}
            />
            <kbd style={{ fontSize: 10, color: 'var(--fg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 5px' }}>esc</kbd>
          </div>

          {profiel || profielLaadt ? (
            <MedewerkerPaneel
              profiel={profiel}
              laadt={profielLaadt}
              onTerug={() => { setProfiel(null); setProfielLaadt(false) }}
            />
          ) : (
            <Command.List style={{ maxHeight: '52vh', overflowY: 'auto', padding: 8 }}>
              {query.trim().length >= 1 && (
                <Command.Group>
                  <Command.Item
                    value="__vraag-eva__"
                    onSelect={vraagEva}
                    style={rowStyle(isVraag)}
                  >
                    <IconChat size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Vraag EVA: <strong style={{ color: 'var(--fg)' }}>"{query.trim()}"</strong>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>↵</span>
                  </Command.Item>
                </Command.Group>
              )}

              {loading && (
                <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--fg-muted)' }}>Zoeken…</div>
              )}

              {!loading && query.trim().length >= 2 && results && results.total === 0 && (
                <Command.Empty style={{ padding: '12px 14px', fontSize: 13, color: 'var(--fg-muted)' }}>
                  Niets gevonden in EVA voor "{query.trim()}".
                </Command.Empty>
              )}

              {results?.groups.map((g) => (
                <Command.Group
                  key={g.type}
                  heading={g.label}
                  style={{ marginTop: 6 }}
                >
                  {g.hits.map((hit) => (
                    <Command.Item
                      key={`${hit.type}:${hit.id}`}
                      value={`${hit.type}:${hit.id}:${hit.label}`}
                      onSelect={() => kiesHit(hit)}
                      style={rowStyle(false)}
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
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}

              {query.trim().length < 2 && (
                <div style={{ padding: '14px', fontSize: 13, color: 'var(--fg-muted)' }}>
                  Typ minstens 2 tekens om te zoeken.
                </div>
              )}
            </Command.List>
          )}
        </Command>
      </div>
    </div>
  )
}

function rowStyle(highlight: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, color: 'var(--fg-soft)',
    background: highlight ? 'var(--bg-active)' : 'transparent',
  }
}

/* ─── Medewerker-profielpaneel ──────────────────────────────────────────── */

function MedewerkerPaneel({
  profiel, laadt, onTerug,
}: { profiel: MedewerkerProfiel | null; laadt: boolean; onTerug: () => void }) {
  return (
    <div style={{ padding: 16 }}>
      <button
        onClick={onTerug}
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
