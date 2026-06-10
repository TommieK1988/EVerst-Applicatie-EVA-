'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { maakMedewerker } from '@/app/(platform)/medewerkers/medewerkersActions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Button,
  Input,
  Checkbox,
  FormField,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui'

type FormState = {
  voornaam:      string
  tussenvoegsel: string
  achternaam:    string
  email:         string
  functie:       string
  extern:        boolean
}

const LEEG: FormState = {
  voornaam:      '',
  tussenvoegsel: '',
  achternaam:    '',
  email:         '',
  functie:       '',
  extern:        false,
}

export default function NieuweMedewerkerModal({
  onClose,
  functies = [],
}: {
  onClose: () => void
  functies?: { id: string; naam: string }[]
}) {
  const [form, setForm] = useState<FormState>(LEEG)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await maakMedewerker({
        voornaam:      form.voornaam.trim(),
        tussenvoegsel: form.tussenvoegsel.trim() || null,
        achternaam:    form.achternaam.trim(),
        email:         form.email.trim() || null,
        functie:       form.functie.trim() || null,
        extern:        form.extern,
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Medewerker aangemaakt')
      onClose()
      router.push(`/medewerkers/${result.id}`)
    })
  }

  const isValid = form.voornaam.trim().length > 0 && form.achternaam.trim().length > 0

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe medewerker</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody>
            {/* Naam */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, marginBottom: 14 }}>
              <FormField label="Voornaam" required>
                <Input
                  value={form.voornaam}
                  onChange={e => set('voornaam', e.target.value)}
                  placeholder="Voornaam"
                  autoFocus
                  required
                />
              </FormField>
              <div style={{ width: 80 }}>
                <FormField label="Tussen">
                  <Input
                    value={form.tussenvoegsel}
                    onChange={e => set('tussenvoegsel', e.target.value)}
                    placeholder="van"
                  />
                </FormField>
              </div>
              <FormField label="Achternaam" required>
                <Input
                  value={form.achternaam}
                  onChange={e => set('achternaam', e.target.value)}
                  placeholder="Achternaam"
                  required
                />
              </FormField>
            </div>

            {/* Email + Functie */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <FormField label="E-mailadres">
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="naam@bedrijf.nl"
                />
              </FormField>
              <FormField label="Functie">
                {functies.length > 0 ? (
                  <Select
                    value={form.functie || undefined}
                    onValueChange={v => set('functie', v === '__geen__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Geen —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__geen__">— Geen —</SelectItem>
                      {functies.map(f => (
                        <SelectItem key={f.id} value={f.naam}>{f.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.functie}
                    onChange={e => set('functie', e.target.value)}
                    placeholder="bijv. Timmerman"
                  />
                )}
              </FormField>
            </div>

            {/* Extern */}
            <div style={{ marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <Checkbox
                  checked={form.extern}
                  onCheckedChange={v => set('extern', v === true)}
                />
                Extern medewerker (ZZP / uitzend)
              </label>
            </div>
          </DialogBody>

          {/* Actions */}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Annuleren
            </Button>
            <Button type="submit" variant="primary" loading={isPending} disabled={isPending || !isValid}>
              Medewerker aanmaken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
