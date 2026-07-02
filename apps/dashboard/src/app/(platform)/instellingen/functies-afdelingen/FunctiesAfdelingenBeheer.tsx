'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerFunctie, MedewerkerAfdeling, Ploeg, StandaardRooster } from '@everts/database/platform-types'
import { upsertFunctie, verwijderFunctie, upsertAfdeling, verwijderAfdeling, upsertPloeg, verwijderPloeg } from './actions'
import { Button, Card, CardBody, EmptyState, Input } from '@/components/ui'

export type MedewerkerOptie = { id: string; voornaam: string; tussenvoegsel: string | null; achternaam: string }

function medewerkerNaam(m: MedewerkerOptie): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const DAGEN = [
  { nr: 1, label: 'Ma' }, { nr: 2, label: 'Di' }, { nr: 3, label: 'Wo' },
  { nr: 4, label: 'Do' }, { nr: 5, label: 'Vr' }, { nr: 6, label: 'Za' },
  { nr: 7, label: 'Zo' },
]

function roosterLabel(r: StandaardRooster): string {
  if (!r || !r.werkdagen?.length) return ''
  const labels = DAGEN.filter(d => r.werkdagen.includes(d.nr)).map(d => d.label)
  const dagenStr = labels.length === 5 && r.werkdagen.every(d => d <= 5)
    ? 'Ma–Vr'
    : labels.join(' ')
  return `${dagenStr} · ${r.dagstart}–${r.dageind} · ${r.contracturen_per_week}u/w`
}

function toMinuten(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return 0
  return h * 60 + m
}

function berekenUrenPerWeek(
  werkdagen: number[],
  dagstart: string,
  dageind: string,
  pauzes: { pauze_start: string; pauze_eind: string }[],
): number {
  if (!werkdagen.length || !dagstart || !dageind) return 0
  const start = toMinuten(dagstart)
  const eind  = toMinuten(dageind)
  if (eind <= start) return 0
  let dagMin = eind - start
  for (const p of pauzes) {
    const ps = toMinuten(p.pauze_start)
    const pe = toMinuten(p.pauze_eind)
    if (pe > ps) dagMin -= (pe - ps)
  }
  if (dagMin < 0) dagMin = 0
  return Math.round((dagMin * werkdagen.length) / 60 * 10) / 10
}

// ── Rooster form ──────────────────────────────────────────────────────────────

type RoosterState = {
  enabled:      boolean
  werkdagen:    number[]
  dagstart:     string
  dageind:      string
  contracturen: string
  pauzes:       { pauze_start: string; pauze_eind: string }[]
}

function roosterFromFunctie(r: StandaardRooster): RoosterState {
  return {
    enabled:      !!r,
    werkdagen:    r?.werkdagen    ?? [1, 2, 3, 4, 5],
    dagstart:     r?.dagstart     ?? '07:30',
    dageind:      r?.dageind      ?? '17:00',
    contracturen: String(r?.contracturen_per_week ?? 40),
    pauzes:       r?.pauzes?.length ? r.pauzes : [{ pauze_start: '12:00', pauze_eind: '12:30' }],
  }
}

function RoosterForm({ state, onChange }: {
  state: RoosterState
  onChange: (s: RoosterState) => void
}) {
  const set = <K extends keyof RoosterState>(k: K, v: RoosterState[K]) => {
    const next = { ...state, [k]: v }
    if (['dagstart', 'dageind', 'werkdagen', 'pauzes'].includes(k as string)) {
      next.contracturen = String(berekenUrenPerWeek(next.werkdagen, next.dagstart, next.dageind, next.pauzes))
    }
    onChange(next)
  }

  function toggleDag(nr: number) {
    const next = state.werkdagen.includes(nr)
      ? state.werkdagen.filter(d => d !== nr)
      : [...state.werkdagen, nr].sort((a, b) => a - b)
    set('werkdagen', next)
  }

  function addPauze() {
    set('pauzes', [...state.pauzes, { pauze_start: '12:00', pauze_eind: '12:30' }])
  }

  function removePauze(i: number) {
    set('pauzes', state.pauzes.filter((_, idx) => idx !== i))
  }

  function updatePauze(i: number, field: 'pauze_start' | 'pauze_eind', val: string) {
    set('pauzes', state.pauzes.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  const inp: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--fg)', width: '100%' }

  return (
    <Card className="mt-3">
      <CardBody className="py-3 px-3.5">
        {/* Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: state.enabled ? 12 : 0 }}>
          <input type="checkbox" checked={state.enabled} onChange={e => set('enabled', e.target.checked)} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>
            Standaard werkrooster instellen
          </span>
        </label>

        {state.enabled && (
          <>
            {/* Werkdagen */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Werkdagen</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {DAGEN.map(dag => {
                  const active = state.werkdagen.includes(dag.nr)
                  return (
                    <Button
                      key={dag.nr}
                      type="button"
                      variant={active ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => toggleDag(dag.nr)}
                      className="w-[34px] px-0 text-[10px] font-bold "
                    >
                      {dag.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* Tijden + contracturen */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Begintijd</label>
                <input type="time" style={inp} value={state.dagstart} onChange={e => set('dagstart', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Eindtijd</label>
                <input type="time" style={inp} value={state.dageind} onChange={e => set('dageind', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Uren/week</label>
                <input type="number" min={0} max={80} step={0.5} style={inp} value={state.contracturen} onChange={e => set('contracturen', e.target.value)} />
              </div>
            </div>

            {/* Pauzes */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Pauzes</label>
              {state.pauzes.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <input type="time" style={{ ...inp, width: 100 }} value={p.pauze_start} onChange={e => updatePauze(i, 'pauze_start', e.target.value)} />
                  <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>–</span>
                  <input type="time" style={{ ...inp, width: 100 }} value={p.pauze_eind} onChange={e => updatePauze(i, 'pauze_eind', e.target.value)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removePauze(i)}>×</Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addPauze} className="px-0 text-[10px]">
                + Pauze toevoegen
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

// ── Functies lijst ────────────────────────────────────────────────────────────

function FunctieLijstBeheer({ functies: initialFuncties, afdelingen }: {
  functies: MedewerkerFunctie[]
  afdelingen: MedewerkerAfdeling[]
}) {
  const [functies, setFuncties]   = useState<MedewerkerFunctie[]>(initialFuncties)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNieuw, setShowNieuw] = useState(false)
  const [naam, setNaam]           = useState('')
  const [volgorde, setVolgorde]   = useState('0')
  const [rooster, setRooster]     = useState<RoosterState>(roosterFromFunctie(null))
  const [afdelingId, setAfdelingId] = useState('')
  const [isPending, startTransition] = useTransition()

  const actieveAfdelingen = afdelingen.filter(a => a.actief).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))
  const afdelingNaam = (id: string | null) => afdelingen.find(a => a.id === id)?.naam ?? null

  function resetForm() { setNaam(''); setVolgorde('0'); setRooster(roosterFromFunctie(null)); setAfdelingId('') }

  function startEdit(f: MedewerkerFunctie) {
    setEditingId(f.id)
    setNaam(f.naam)
    setVolgorde(String(f.volgorde))
    setRooster(roosterFromFunctie(f.standaard_rooster))
    setAfdelingId(f.standaard_afdeling_id ?? '')
    setShowNieuw(false)
  }

  function buildPayload() {
    return {
      naam:                  naam.trim(),
      volgorde,
      standaard_afdeling_id: afdelingId,
      standaard_rooster: rooster.enabled ? {
        werkdagen:             rooster.werkdagen,
        dagstart:              rooster.dagstart,
        dageind:               rooster.dageind,
        contracturen_per_week: parseFloat(rooster.contracturen) || 0,
        pauzes:                rooster.pauzes,
      } : null,
    }
  }

  function handleSave(id?: string) {
    startTransition(async () => {
      const result = await upsertFunctie(buildPayload(), id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(id ? 'Bijgewerkt' : 'Toegevoegd')
      window.location.reload()
    })
  }

  function handleVerwijder(id: string) {
    startTransition(async () => {
      const result = await verwijderFunctie(id)
      if (!result.ok) { toast.error(result.error); return }
      setFuncties(prev => prev.map(f => f.id === id ? { ...f, actief: false } : f))
      toast.success('Gedeactiveerd')
    })
  }

  const actief  = functies.filter(f => f.actief).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))
  const inactief = functies.filter(f => !f.actief)

  const editForm = (id?: string) => (
    <Card className={id ? 'border-brand-400' : ''}>
      <CardBody className="py-3 px-3.5">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 0 }}>
          <div>
            <label style={labelStyle}>Naam</label>
            <Input style={{ width: '100%' }} value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. Timmerman" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Volgorde</label>
            <Input type="number" style={{ width: '100%' }} value={volgorde} onChange={e => setVolgorde(e.target.value)} min={0} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={labelStyle}>Standaard afdeling</label>
          <select className="eva-input" style={{ width: '100%' }} value={afdelingId} onChange={e => setAfdelingId(e.target.value)}>
            <option value="">— Geen —</option>
            {actieveAfdelingen.map(a => <option key={a.id} value={a.id}>{a.naam}</option>)}
          </select>
        </div>
        <RoosterForm state={rooster} onChange={setRooster} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button type="button" variant="ghost" onClick={() => { id ? setEditingId(null) : setShowNieuw(false); resetForm() }} disabled={isPending}>Annuleren</Button>
          <Button type="button" variant="primary" onClick={() => handleSave(id)} loading={isPending} disabled={isPending || !naam.trim()}>
            Opslaan
          </Button>
        </div>
      </CardBody>
    </Card>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Functies</h3>
        {!showNieuw && (
          <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(true); setEditingId(null); resetForm() }}>
            + Toevoegen
          </Button>
        )}
      </div>

      {showNieuw && <div style={{ marginBottom: 8 }}>{editForm()}</div>}

      {actief.length === 0 && !showNieuw ? (
        <EmptyState size="sm" tone="neutral" title="Nog geen functies ingesteld." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {actief.map(f => (
            <div key={f.id}>
              {editingId === f.id ? editForm(f.id) : (
                <Card>
                  <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)', width: 20, textAlign: 'right' }}>{f.volgorde}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
                        {f.naam}
                        {afdelingNaam(f.standaard_afdeling_id) && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)', marginLeft: 8, padding: '1px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>
                            {afdelingNaam(f.standaard_afdeling_id)}
                          </span>
                        )}
                      </div>
                      {f.standaard_rooster && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 1 }}>
                          {roosterLabel(f.standaard_rooster)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(f)}>Bewerken</Button>
                      <Button variant="outline" size="sm" onClick={() => handleVerwijder(f.id)} disabled={isPending}>Deact.</Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {inactief.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, color: 'var(--fg-muted)', cursor: 'pointer', userSelect: 'none' }}>
            {inactief.length} inactief
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {inactief.map(f => (
              <Card key={f.id} className="opacity-45">
                <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{f.naam}</span>
                </CardBody>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Afdelingen lijst (generiek, ongewijzigd) ──────────────────────────────────

type Item = { id: string; naam: string; volgorde: number; actief: boolean; created_at: string }

function LijstBeheer({
  titel, items: initialItems, onUpsert, onVerwijder,
}: {
  titel: string
  items: Item[]
  onUpsert: (raw: unknown, id?: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onVerwijder: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [items, setItems]         = useState<Item[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNieuw, setShowNieuw] = useState(false)
  const [naam, setNaam]           = useState('')
  const [volgorde, setVolgorde]   = useState('0')
  const [isPending, startTransition] = useTransition()

  function resetForm() { setNaam(''); setVolgorde('0') }

  function startEdit(item: Item) {
    setEditingId(item.id); setNaam(item.naam); setVolgorde(String(item.volgorde)); setShowNieuw(false)
  }

  function handleSave(id?: string) {
    startTransition(async () => {
      const result = await onUpsert({ naam: naam.trim(), volgorde }, id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(id ? 'Bijgewerkt' : 'Toegevoegd')
      if (id) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, naam: naam.trim(), volgorde: parseInt(volgorde) || 0 } : i))
        setEditingId(null)
      } else {
        resetForm(); setShowNieuw(false); window.location.reload()
      }
    })
  }

  function handleVerwijder(id: string) {
    startTransition(async () => {
      const result = await onVerwijder(id)
      if (!result.ok) { toast.error(result.error); return }
      setItems(prev => prev.map(i => i.id === id ? { ...i, actief: false } : i))
      toast.success('Gedeactiveerd')
    })
  }

  const actief   = items.filter(i => i.actief).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))
  const inactief = items.filter(i => !i.actief)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>{titel}</h3>
        {!showNieuw && (
          <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(true); setEditingId(null); resetForm() }}>
            + Toevoegen
          </Button>
        )}
      </div>

      {showNieuw && (
        <Card className="mb-2">
          <CardBody className="py-3 px-3.5">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Naam</label>
                <Input style={{ width: '100%' }} value={naam} onChange={e => setNaam(e.target.value)} placeholder={`bijv. ${titel === 'Functies' ? 'Timmerman' : 'Uitvoering'}`} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Volgorde</label>
                <Input type="number" style={{ width: '100%' }} value={volgorde} onChange={e => setVolgorde(e.target.value)} min={0} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => setShowNieuw(false)} disabled={isPending}>Annuleren</Button>
              <Button type="button" variant="primary" onClick={() => handleSave()} loading={isPending} disabled={isPending || !naam.trim()}>
                Opslaan
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {actief.length === 0 && !showNieuw ? (
        <EmptyState size="sm" tone="neutral" title={`Nog geen ${titel.toLowerCase()} ingesteld.`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {actief.map(item => (
            <div key={item.id}>
              {editingId === item.id ? (
                <Card className="border-brand-400">
                  <CardBody className="py-3 px-3.5">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>Naam</label>
                        <Input style={{ width: '100%' }} value={naam} onChange={e => setNaam(e.target.value)} autoFocus />
                      </div>
                      <div>
                        <label style={labelStyle}>Volgorde</label>
                        <Input type="number" style={{ width: '100%' }} value={volgorde} onChange={e => setVolgorde(e.target.value)} min={0} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)} disabled={isPending}>Annuleren</Button>
                      <Button type="button" variant="primary" onClick={() => handleSave(item.id)} loading={isPending} disabled={isPending || !naam.trim()}>
                        Opslaan
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <Card>
                  <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)', width: 20, textAlign: 'right' }}>{item.volgorde}</span>
                    <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{item.naam}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>Bewerken</Button>
                      <Button variant="outline" size="sm" onClick={() => handleVerwijder(item.id)} disabled={isPending}>Deact.</Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {inactief.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, color: 'var(--fg-muted)', cursor: 'pointer', userSelect: 'none' }}>
            {inactief.length} inactief
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {inactief.map(item => (
              <Card key={item.id} className="opacity-45">
                <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{item.naam}</span>
                </CardBody>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Ploegen lijst (naam + volgorde + teamleider) ──────────────────────────────

function PloegLijstBeheer({
  ploegen: initialPloegen, medewerkers,
}: {
  ploegen: Ploeg[]
  medewerkers: MedewerkerOptie[]
}) {
  const [ploegen, setPloegen]     = useState<Ploeg[]>(initialPloegen)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNieuw, setShowNieuw] = useState(false)
  const [naam, setNaam]           = useState('')
  const [volgorde, setVolgorde]   = useState('0')
  const [teamleiderId, setTeamleiderId] = useState('')
  const [isPending, startTransition] = useTransition()

  const medewerkerById = (id: string | null) => medewerkers.find(m => m.id === id)

  function resetForm() { setNaam(''); setVolgorde('0'); setTeamleiderId('') }

  function startEdit(p: Ploeg) {
    setEditingId(p.id); setNaam(p.naam); setVolgorde(String(p.volgorde))
    setTeamleiderId(p.teamleider_id ?? ''); setShowNieuw(false)
  }

  function handleSave(id?: string) {
    startTransition(async () => {
      const result = await upsertPloeg({ naam: naam.trim(), volgorde, teamleider_id: teamleiderId || null }, id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success(id ? 'Bijgewerkt' : 'Toegevoegd')
      window.location.reload()
    })
  }

  function handleVerwijder(id: string) {
    startTransition(async () => {
      const result = await verwijderPloeg(id)
      if (!result.ok) { toast.error(result.error); return }
      setPloegen(prev => prev.map(p => p.id === id ? { ...p, actief: false } : p))
      toast.success('Gedeactiveerd')
    })
  }

  const actief   = ploegen.filter(p => p.actief).sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam))
  const inactief = ploegen.filter(p => !p.actief)

  const teamleiderSelect = (
    <select className="eva-input" style={{ width: '100%' }} value={teamleiderId} onChange={e => setTeamleiderId(e.target.value)}>
      <option value="">— Geen teamleider —</option>
      {medewerkers.map(m => <option key={m.id} value={m.id}>{medewerkerNaam(m)}</option>)}
    </select>
  )

  const editForm = (id?: string) => (
    <Card className={id ? 'border-brand-400' : 'mb-2'}>
      <CardBody className="py-3 px-3.5">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Naam</label>
            <Input style={{ width: '100%' }} value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. Ploeg A" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Volgorde</label>
            <Input type="number" style={{ width: '100%' }} value={volgorde} onChange={e => setVolgorde(e.target.value)} min={0} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Teamleider</label>
          {teamleiderSelect}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={() => { id ? setEditingId(null) : setShowNieuw(false); resetForm() }} disabled={isPending}>Annuleren</Button>
          <Button type="button" variant="primary" onClick={() => handleSave(id)} loading={isPending} disabled={isPending || !naam.trim()}>
            Opslaan
          </Button>
        </div>
      </CardBody>
    </Card>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Ploegen</h3>
        {!showNieuw && (
          <Button variant="ghost" size="sm" onClick={() => { setShowNieuw(true); setEditingId(null); resetForm() }}>
            + Toevoegen
          </Button>
        )}
      </div>

      {showNieuw && editForm()}

      {actief.length === 0 && !showNieuw ? (
        <EmptyState size="sm" tone="neutral" title="Nog geen ploegen ingesteld." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {actief.map(p => (
            <div key={p.id}>
              {editingId === p.id ? editForm(p.id) : (
                <Card>
                  <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                    <span style={{ fontSize: 10, color: 'var(--fg-muted)', width: 20, textAlign: 'right' }}>{p.volgorde}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{p.naam}</div>
                      <div style={{ fontSize: 10, color: p.teamleider_id ? 'var(--accent)' : 'var(--fg-muted)', marginTop: 1 }}>
                        {p.teamleider_id ? `Teamleider: ${medewerkerById(p.teamleider_id) ? medewerkerNaam(medewerkerById(p.teamleider_id)!) : '—'}` : 'Geen teamleider'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>Bewerken</Button>
                      <Button variant="outline" size="sm" onClick={() => handleVerwijder(p.id)} disabled={isPending}>Deact.</Button>
                    </div>
                  </CardBody>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {inactief.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, color: 'var(--fg-muted)', cursor: 'pointer', userSelect: 'none' }}>
            {inactief.length} inactief
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {inactief.map(p => (
              <Card key={p.id} className="opacity-45">
                <CardBody className="flex items-center gap-3 py-2.5 px-3.5">
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{p.naam}</span>
                </CardBody>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function FunctiesAfdelingenBeheer({
  functies,
  afdelingen,
  ploegen,
  medewerkers,
}: {
  functies: MedewerkerFunctie[]
  afdelingen: MedewerkerAfdeling[]
  ploegen: Ploeg[]
  medewerkers: MedewerkerOptie[]
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
      <FunctieLijstBeheer functies={functies} afdelingen={afdelingen} />
      <LijstBeheer
        titel="Afdelingen"
        items={afdelingen}
        onUpsert={(raw, id) => upsertAfdeling(raw, id)}
        onVerwijder={verwijderAfdeling}
      />
      <PloegLijstBeheer ploegen={ploegen} medewerkers={medewerkers} />
    </div>
  )
}
