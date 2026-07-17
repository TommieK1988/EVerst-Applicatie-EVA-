'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, List, LayoutGrid, Pencil } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import PageHeader from '@/components/taken/shared/PageHeader'
import TaakLijstWeergave from './TaakLijstWeergave'
import KanbanBord from './KanbanBord'
import NieuweTaakDialog from './NieuweTaakDialog'
import SjabloonTriggers from './SjabloonTriggers'
import { updateActielijst } from '@/app/(platform)/taken/actions/taken'
import type { ActielijstMetTaken } from '@/lib/taken/supabase/database.types'
import { STREEFDATUM_BRON_LABELS, type StreefdatumBron } from '@/lib/taken/deadlines'
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
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui'

interface Props {
  lijst: ActielijstMetTaken
}

/** Potlood-knop + dialoog om naam en beschrijving van de lijst te bewerken. */
function BewerkLijstDialog({ lijst }: { lijst: ActielijstMetTaken }) {
  const [open, setOpen] = useState(false)
  const [naam, setNaam] = useState(lijst.naam)
  const [beschrijving, setBeschrijving] = useState(lijst.beschrijving ?? '')
  const [streefdatumBron, setStreefdatumBron] = useState<StreefdatumBron>(
    lijst.streefdatum_bron ?? 'handmatig',
  )
  const [pending, startTransition] = useTransition()

  function openDialog() {
    setNaam(lijst.naam)
    setBeschrijving(lijst.beschrijving ?? '')
    setStreefdatumBron(lijst.streefdatum_bron ?? 'handmatig')
    setOpen(true)
  }

  function handleBewaar() {
    if (!naam.trim()) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('naam', naam.trim())
      fd.set('beschrijving', beschrijving)
      if (lijst.is_template) fd.set('streefdatum_bron', streefdatumBron)
      await updateActielijst(lijst.id, fd)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        onClick={openDialog}
        title="Naam en beschrijving bewerken"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      >
        <Pencil className="w-3.5 h-3.5" />
        Bewerken
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Actielijst bewerken</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <FormField label="Naam">
                <Input value={naam} onChange={e => setNaam(e.target.value)} autoFocus />
              </FormField>
              <FormField label="Beschrijving">
                <Textarea
                  value={beschrijving}
                  onChange={e => setBeschrijving(e.target.value)}
                  placeholder="Optioneel"
                  rows={3}
                />
              </FormField>
              {lijst.is_template && (
                <FormField label="Streefdatum van deze checklist">
                  <Select
                    value={streefdatumBron}
                    onValueChange={v => setStreefdatumBron(v as StreefdatumBron)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STREEFDATUM_BRON_LABELS) as StreefdatumBron[]).map(k => (
                        <SelectItem key={k} value={k}>{STREEFDATUM_BRON_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                    Bepaalt de deadline van taken die op &quot;streefdatum&quot; staan. Kies een datum van
                    het dossier als de checklist ook automatisch geactiveerd wordt — bij
                    &quot;invullen bij het activeren&quot; blijven die taken dan zonder deadline.
                  </p>
                </FormField>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button variant="primary" onClick={handleBewaar} disabled={!naam.trim()} loading={pending}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function ActielijstDetail({ lijst }: Props) {
  const [view, setView] = useState<'lijst' | 'kanban'>('lijst')

  const voortgang = lijst.taken_count > 0
    ? Math.round((lijst.gereed_count / lijst.taken_count) * 100)
    : 0

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={lijst.naam}
        description={lijst.beschrijving ?? undefined}
        back={
          <Link href="/taken/lijsten" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Actielijsten
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <BewerkLijstDialog lijst={lijst} />
            {lijst.is_template && <SjabloonTriggers templateId={lijst.id} />}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setView('lijst')}
                className={cn('p-1.5 rounded-md transition-all', view === 'lijst' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600')}
                title="Lijstweergave"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn('p-1.5 rounded-md transition-all', view === 'kanban' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600')}
                title="Kanbanbord"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <NieuweTaakDialog defaultLijstId={lijst.id} isTemplate={lijst.is_template} />
          </div>
        }
      />

      {/* Voortgangsbalk */}
      {lijst.taken_count > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>{lijst.gereed_count} van {lijst.taken_count} taken gereed</span>
            <span className="font-semibold text-slate-700">{voortgang}%</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${voortgang}%` }}
            />
          </div>
        </div>
      )}

      {/* Inhoud */}
      {lijst.taken.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
            <List className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">Nog geen taken in deze lijst</p>
          <p className="text-slate-400 text-sm mb-4">Voeg de eerste taak toe om te beginnen.</p>
          <NieuweTaakDialog defaultLijstId={lijst.id} isTemplate={lijst.is_template} />
        </div>
      ) : view === 'lijst' ? (
        <TaakLijstWeergave
          taken={lijst.taken}
          isTemplate={lijst.is_template}
          takenInLijst={lijst.taken.map(t => ({ id: t.id, titel: t.titel }))}
        />
      ) : (
        <KanbanBord
          taken={lijst.taken}
          isTemplate={lijst.is_template}
          takenInLijst={lijst.taken.map(t => ({ id: t.id, titel: t.titel }))}
        />
      )}
    </div>
  )
}
