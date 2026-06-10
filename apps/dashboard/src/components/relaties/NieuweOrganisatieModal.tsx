'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createOrganisatie } from '@/lib/relaties/actions'
import type { OrganisatieType } from '@everts/database'
import { organisatieTypeLabels } from '@everts/database'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField,
} from '@/components/ui'

const ALLE_TYPES: OrganisatieType[] = ['opdrachtgever', 'leverancier', 'onderaannemer']

type FormState = {
  naam: string
  types: OrganisatieType[]
  kvk_nummer: string
  email: string
  telefoon: string
  adres_plaats: string
}

const LEEG: FormState = { naam: '', types: ['opdrachtgever'], kvk_nummer: '', email: '', telefoon: '', adres_plaats: '' }

export default function NieuweOrganisatieModal({ onSluit }: { onSluit: () => void }) {
  const [form, setForm] = useState<FormState>(LEEG)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggleType(t: OrganisatieType) {
    setForm(prev => {
      const heeft = prev.types.includes(t)
      if (heeft && prev.types.length === 1) return prev
      return { ...prev, types: heeft ? prev.types.filter(x => x !== t) : [...prev.types, t] }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.naam.trim() || form.types.length === 0) return
    startTransition(async () => {
      const res = await createOrganisatie({
        naam: form.naam.trim(),
        types: form.types,
        kvk_nummer: form.kvk_nummer || null,
        email: form.email || null,
        telefoon: form.telefoon || null,
        adres_plaats: form.adres_plaats || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Organisatie aangemaakt')
      router.push(`/relaties/${res.id}`)
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe organisatie</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FormField label="Naam" required>
                <Input
                  value={form.naam}
                  onChange={e => setForm(p => ({ ...p, naam: e.target.value }))}
                  placeholder="Bedrijfsnaam"
                  autoFocus
                />
              </FormField>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Type *
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ALLE_TYPES.map(t => (
                    <label
                      key={t}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', borderRadius: 20, border: `1px solid ${form.types.includes(t) ? 'var(--accent)' : 'var(--border)'}`, background: form.types.includes(t) ? 'var(--bg-active)' : 'transparent', fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}
                    >
                      <input
                        type="checkbox"
                        checked={form.types.includes(t)}
                        onChange={() => toggleType(t)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {organisatieTypeLabels[t]}
                    </label>
                  ))}
                </div>
              </div>

              <FormField label="KvK-nummer">
                <Input value={form.kvk_nummer} onChange={e => setForm(p => ({ ...p, kvk_nummer: e.target.value }))} placeholder="12345678" />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="E-mail">
                  <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </FormField>
                <FormField label="Telefoon">
                  <Input value={form.telefoon} onChange={e => setForm(p => ({ ...p, telefoon: e.target.value }))} />
                </FormField>
              </div>

              <FormField label="Stad">
                <Input value={form.adres_plaats} onChange={e => setForm(p => ({ ...p, adres_plaats: e.target.value }))} />
              </FormField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onSluit} disabled={isPending}>Annuleer</Button>
            <Button type="submit" variant="primary" disabled={isPending || !form.naam.trim() || form.types.length === 0}>
              {isPending ? 'Aanmaken…' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
