'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { upsertSkills } from '@/app/(platform)/medewerkers/[id]/actions'
import { Input, Button } from '@/components/ui'

export default function SkillBeheer({
  medewerker_id,
  initial,
}: {
  medewerker_id: string
  initial: string[]
}) {
  const [skills, setSkills] = useState<string[]>(initial)
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()

  function addSkill() {
    const t = input.trim()
    if (!t || skills.includes(t)) { setInput(''); return }
    const updated = [...skills, t]
    setSkills(updated)
    setInput('')
    save(updated)
  }

  function removeSkill(skill: string) {
    const updated = skills.filter(s => s !== skill)
    setSkills(updated)
    save(updated)
  }

  function save(list: string[]) {
    startTransition(async () => {
      const result = await upsertSkills(medewerker_id, list)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: '0 0 10px' }}>
        Vaardigheden
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, minHeight: 32 }}>
        {skills.map(skill => (
          <span key={skill} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--bg-active)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '4px 10px',
            fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)',
          }}>
            {skill}
            <button
              type="button"
              onClick={() => removeSkill(skill)}
              disabled={isPending}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--fg-muted)', padding: 0, lineHeight: 1, fontSize: 14,
              }}
              aria-label={`Verwijder ${skill}`}
            >
              ×
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', alignSelf: 'center' }}>
            Nog geen vaardigheden
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
          placeholder="Bijv. Schilderwerk, Dakdekken…"
          style={{ flex: 1 }}
          disabled={isPending}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={addSkill}
          disabled={isPending || !input.trim()}
        >
          Toevoegen
        </Button>
      </div>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 6 }}>
        Vaardigheden worden getoetst bij het plannen — bij mismatch toont het planbord een waarschuwing.
      </p>
    </div>
  )
}
