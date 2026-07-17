'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Calendar, Info } from 'lucide-react'
import { activeerSjabloon } from '@/app/(platform)/taken/actions/sjablonen'
import type { DbTaskList } from '@/lib/taken/supabase/database.types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  FormField,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui'
import { useDossierReadOnly } from './DossierReadOnlyContext'

interface Props {
  dossier_id: string
  sjablonen: DbTaskList[]
  compact?: boolean
}

export default function ActiveerSjabloonDialog({ dossier_id, sjablonen, compact = false }: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [open, setOpen]           = useState(false)
  const [pending, startTransition] = useTransition()
  const [templateId, setTemplateId] = useState('')
  const [streefdatum, setStreefdatum] = useState('')

  const geselecteerd = sjablonen.find(s => s.id === templateId)
  // Alleen vragen wat het sjabloon niet zelf weet: bij een dossier-gebonden bron haalt
  // activeerSjabloon de streefdatum op uit het dossier.
  const vraagStreefdatum = (geselecteerd?.streefdatum_bron ?? 'handmatig') === 'handmatig'

  function handleActiveer() {
    if (!templateId) return
    startTransition(async () => {
      const result = await activeerSjabloon({
        template_id: templateId,
        dossier_id,
        streefdatum: streefdatum || undefined,
      })
      setOpen(false)
      setTemplateId('')
      setStreefdatum('')
      router.push(`/taken/lijsten/${result.lijst_id}`)
    })
  }

  if (readOnly) return null

  return (
    <>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        onClick={() => setOpen(true)}
      >
        <Plus style={{ width: compact ? 12 : 16, height: compact ? 12 : 16 }} />
        {compact ? 'Sjabloon' : 'Sjabloon activeren'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Sjabloon activeren</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Sjabloon select */}
              <FormField label="Sjabloon">
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="— Kies een sjabloon —" />
                  </SelectTrigger>
                  <SelectContent>
                    {sjablonen.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.template_naam ?? s.naam}
                        {s.trigger_substatus ? ` (auto: ${s.trigger_substatus})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {/* Streefdatum */}
              {vraagStreefdatum && templateId && (
                <FormField
                  label={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar style={{ width: 13, height: 13 }} />
                      Streefdatum (wanneer moet de volledige checklist klaar zijn?)
                    </span>
                  }
                >
                  <Input
                    type="date"
                    value={streefdatum}
                    onChange={e => setStreefdatum(e.target.value)}
                  />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
                    <Info style={{ width: 13, height: 13, color: 'var(--fg-muted)', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-muted)' }}>
                      Taken met een &quot;offset van streefdatum&quot; krijgen automatisch een deadline berekend. Optioneel.
                    </p>
                  </div>
                </FormField>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <Button
              variant="primary"
              onClick={handleActiveer}
              disabled={!templateId}
              loading={pending}
            >
              {pending ? 'Activeren…' : 'Activeren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
