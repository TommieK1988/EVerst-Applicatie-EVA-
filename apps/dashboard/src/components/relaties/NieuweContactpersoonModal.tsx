'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createContactpersoon } from '@/lib/relaties/contactpersonen-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField,
} from '@/components/ui'

const AANHEF_OPTIES = ['', 'De heer', 'Mevrouw', 'Dhr.', 'Mevr.', 'Dr.', 'Prof. dr.', 'Ir.', 'Mr.']

type FormState = {
  aanhef: string
  geslacht: '' | 'man' | 'vrouw' | 'overig'
  voorletter: string
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  email: string
  telefoon: string
  functie: string
}

const LEEG: FormState = {
  aanhef: '', geslacht: '', voorletter: '',
  voornaam: '', tussenvoegsel: '', achternaam: '',
  email: '', telefoon: '', functie: '',
}

export default function NieuweContactpersoonModal({ onSluit }: { onSluit: () => void }) {
  const [form, setForm] = useState<FormState>(LEEG)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.voornaam.trim() || !form.achternaam.trim()) return
    startTransition(async () => {
      const res = await createContactpersoon({
        aanhef: form.aanhef || null,
        geslacht: (form.geslacht || null) as 'man' | 'vrouw' | 'overig' | null,
        voorletter: form.voorletter.trim() || null,
        voornaam: form.voornaam.trim(),
        tussenvoegsel: form.tussenvoegsel.trim() || null,
        achternaam: form.achternaam.trim(),
        email: form.email || null,
        telefoon: form.telefoon || null,
        functie: form.functie || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Contactpersoon aangemaakt')
      router.push(`/relaties/contactpersonen/${res.id}`)
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe contactpersoon</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Aanhef + Geslacht */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="Aanhef">
                  <select
                    value={form.aanhef}
                    onChange={e => setForm(p => ({ ...p, aanhef: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--fg)', fontSize: 13, fontFamily: 'var(--font-ui)' }}
                  >
                    {AANHEF_OPTIES.map(o => <option key={o} value={o}>{o || '— geen —'}</option>)}
                  </select>
                </FormField>
                <FormField label="Geslacht">
                  <select
                    value={form.geslacht}
                    onChange={e => setForm(p => ({ ...p, geslacht: e.target.value as any }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--fg)', fontSize: 13, fontFamily: 'var(--font-ui)' }}
                  >
                    <option value="">— niet opgegeven —</option>
                    <option value="man">Man</option>
                    <option value="vrouw">Vrouw</option>
                    <option value="overig">Overig</option>
                  </select>
                </FormField>
              </div>

              {/* Naam */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 2fr 1fr 2fr', gap: 10 }}>
                <FormField label="Voorletter">
                  <Input value={form.voorletter} onChange={e => setForm(p => ({ ...p, voorletter: e.target.value }))} placeholder="J." autoFocus />
                </FormField>
                <FormField label="Voornaam" required>
                  <Input value={form.voornaam} onChange={e => setForm(p => ({ ...p, voornaam: e.target.value }))} />
                </FormField>
                <FormField label="Tussenvoegsel">
                  <Input value={form.tussenvoegsel} onChange={e => setForm(p => ({ ...p, tussenvoegsel: e.target.value }))} placeholder="van" />
                </FormField>
                <FormField label="Achternaam" required>
                  <Input value={form.achternaam} onChange={e => setForm(p => ({ ...p, achternaam: e.target.value }))} />
                </FormField>
              </div>

              <FormField label="Functie">
                <Input value={form.functie} onChange={e => setForm(p => ({ ...p, functie: e.target.value }))} placeholder="Projectmanager, Inkoper…" />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="E-mail werk">
                  <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </FormField>
                <FormField label="Telefoon werk">
                  <Input value={form.telefoon} onChange={e => setForm(p => ({ ...p, telefoon: e.target.value }))} />
                </FormField>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onSluit} disabled={isPending}>Annuleer</Button>
            <Button type="submit" variant="primary" disabled={isPending || !form.voornaam.trim() || !form.achternaam.trim()}>
              {isPending ? 'Aanmaken…' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
