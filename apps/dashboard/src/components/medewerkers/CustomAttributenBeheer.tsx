'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerAttribuutDefinitie, MedewerkerAttribuutWaarde } from '@everts/database/platform-types'
import { upsertAttribuutWaarden } from '@/app/(platform)/medewerkers/[id]/actions'
import { Button, Input } from '@/components/ui'

export default function CustomAttributenBeheer({
  medewerker_id,
  definities,
  initial_waarden,
}: {
  medewerker_id: string
  definities: MedewerkerAttribuutDefinitie[]
  initial_waarden: MedewerkerAttribuutWaarde[]
}) {
  const [editing, setEditing] = useState(false)
  const [waarden, setWaarden] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    initial_waarden.forEach(w => { map[w.definitie_id] = w.waarde ?? '' })
    return map
  })
  const [isPending, startTransition] = useTransition()

  function set(definitie_id: string, value: string) {
    setWaarden(prev => ({ ...prev, [definitie_id]: value }))
  }

  function save() {
    startTransition(async () => {
      const payload = definities.map(d => ({
        definitie_id: d.id,
        waarde: waarden[d.id] || null,
      }))
      const result = await upsertAttribuutWaarden(medewerker_id, payload)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Attributen opgeslagen')
      setEditing(false)
    })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 4,
  }

  if (definities.length === 0) {
    return (
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
          Custom attributen
        </h3>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>
          Geen attribuutdefinities geconfigureerd.{' '}
          <a href="/instellingen/medewerker-attributen" style={{ color: 'var(--accent)' }}>Configureer ze hier.</a>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Custom attributen
        </h3>
        {!editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Bewerken
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
        {definities.map(d => {
          const waarde = waarden[d.id] ?? ''

          if (!editing) {
            return (
              <div key={d.id}>
                <span style={labelStyle}>{d.naam}{d.verplicht && <span style={{ color: 'var(--kleur-fout, #e53e3e)' }}> *</span>}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: waarde ? 'var(--fg)' : 'var(--fg-muted)' }}>
                  {waarde || '—'}
                </span>
              </div>
            )
          }

          return (
            <div key={d.id}>
              <label style={labelStyle}>
                {d.naam}
                {d.verplicht && <span style={{ color: 'var(--kleur-fout, #e53e3e)' }}> *</span>}
              </label>
              {d.veldtype === 'datum' ? (
                <Input
                  type="date"
                  className="w-full"
                  value={waarde}
                  onChange={e => set(d.id, e.target.value)}
                />
              ) : d.veldtype === 'getal' ? (
                <Input
                  type="number"
                  className="w-full"
                  value={waarde}
                  onChange={e => set(d.id, e.target.value)}
                />
              ) : d.veldtype === 'boolean' ? (
                <select
                  className="eva-input"
                  style={{ width: '100%' }}
                  value={waarde}
                  onChange={e => set(d.id, e.target.value)}
                >
                  <option value="">—</option>
                  <option value="Ja">Ja</option>
                  <option value="Nee">Nee</option>
                </select>
              ) : (
                <Input
                  type="text"
                  className="w-full"
                  value={waarde}
                  onChange={e => set(d.id, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>Annuleren</Button>
          <Button type="button" variant="primary" onClick={save} loading={isPending}>
            Opslaan
          </Button>
        </div>
      )}
    </div>
  )
}
