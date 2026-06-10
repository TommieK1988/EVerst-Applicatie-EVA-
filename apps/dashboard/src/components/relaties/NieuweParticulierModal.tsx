'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createParticulier } from '@/lib/relaties/particulieren-actions'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input, FormField,
} from '@/components/ui'

type FormState = {
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  email: string
  telefoon: string
  adres_plaats: string
}

const LEEG: FormState = { voornaam: '', tussenvoegsel: '', achternaam: '', email: '', telefoon: '', adres_plaats: '' }

export default function NieuweParticulierModal({ onSluit }: { onSluit: () => void }) {
  const [form, setForm] = useState<FormState>(LEEG)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.voornaam.trim() || !form.achternaam.trim()) return
    startTransition(async () => {
      const res = await createParticulier({
        voornaam: form.voornaam.trim(),
        tussenvoegsel: form.tussenvoegsel.trim() || null,
        achternaam: form.achternaam.trim(),
        email: form.email || null,
        telefoon: form.telefoon || null,
        adres_plaats: form.adres_plaats || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Particulier aangemaakt')
      router.push(`/relaties/particulieren/${res.id}`)
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe particulier</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 10 }}>
                <FormField label="Voornaam" required>
                  <Input value={form.voornaam} onChange={e => setForm(p => ({ ...p, voornaam: e.target.value }))} autoFocus />
                </FormField>
                <FormField label="Tussenvoegsel">
                  <Input value={form.tussenvoegsel} onChange={e => setForm(p => ({ ...p, tussenvoegsel: e.target.value }))} placeholder="van" />
                </FormField>
                <FormField label="Achternaam" required>
                  <Input value={form.achternaam} onChange={e => setForm(p => ({ ...p, achternaam: e.target.value }))} />
                </FormField>
              </div>
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
            <Button type="submit" variant="primary" disabled={isPending || !form.voornaam.trim() || !form.achternaam.trim()}>
              {isPending ? 'Aanmaken…' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
