'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, List, Folder, Trash2, Copy, ChevronRight, Zap, User } from 'lucide-react'
import PageHeader from '@/components/taken/shared/PageHeader'
import { maakActielijst, verwijderActielijst } from '@/app/(platform)/taken/actions/taken'
import { kopieerActielijst } from '@/app/(platform)/taken/actions/sjablonen'
import type { ActielijstMetTriggerCount } from '@/lib/taken/services/taken'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui'

interface Props {
  lijsten: ActielijstMetTriggerCount[]
}

export default function ActielijstenOverzicht({ lijsten }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [toonNieuw, setToonNieuw]  = useState(false)
  const [naam, setNaam]            = useState('')
  const [beschrijving, setBeschrijving] = useState('')
  const [context, setContext] = useState<'dossier' | 'medewerker'>('dossier')
  const [verwijderLijst, setVerwijderLijst] = useState<{ id: string; naam: string } | null>(null)

  const handleAanmaken = (e: React.FormEvent) => {
    e.preventDefault()
    if (!naam.trim()) return
    const fd = new FormData()
    fd.set('naam', naam.trim())
    fd.set('beschrijving', beschrijving)
    fd.set('context', context)
    startTransition(async () => {
      await maakActielijst(fd)
      setNaam('')
      setBeschrijving('')
      setContext('dossier')
      setToonNieuw(false)
    })
  }

  const handleKopieer = (id: string) => {
    startTransition(async () => {
      const { id: nieuwId } = await kopieerActielijst(id)
      router.push(`/taken/lijsten/${nieuwId}`)
    })
  }

  const bevestigVerwijderen = () => {
    if (!verwijderLijst) return
    const id = verwijderLijst.id
    setVerwijderLijst(null)
    startTransition(() => verwijderActielijst(id))
  }

  const LijstKaart = ({ lijst }: { lijst: ActielijstMetTriggerCount }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/taken/lijsten/${lijst.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <List className="w-4 h-4 text-everts flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800 group-hover:text-everts transition-colors truncate">
              {lijst.naam}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${
              lijst.triggers_count > 0
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}>
              <Zap className="w-3 h-3" />
              {lijst.triggers_count > 0
                ? `${lijst.triggers_count} trigger${lijst.triggers_count !== 1 ? 's' : ''}`
                : 'Handmatig'}
            </span>
            {lijst.context === 'medewerker' && (
              <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 flex-shrink-0 bg-violet-50 text-violet-700 border border-violet-200">
                <User className="w-3 h-3" />
                Medewerker
              </span>
            )}
          </div>
          {lijst.beschrijving && (
            <p className="text-xs text-slate-500 truncate pl-6">{lijst.beschrijving}</p>
          )}
        </Link>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => handleKopieer(lijst.id)}
            disabled={pending}
            title="Kopieer actielijst"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVerwijderLijst({ id: lijst.id, naam: lijst.naam })}
            title="Verwijder actielijst"
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <Link
            href={`/taken/lijsten/${lijst.id}`}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Actielijsten"
        description="Sjablonen met taken die handmatig of via triggers aan dossiers gekoppeld worden"
        actions={
          <button
            onClick={() => setToonNieuw(true)}
            className="inline-flex items-center gap-2 bg-everts text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-everts/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuwe lijst
          </button>
        }
      />

      {/* Snelle aanmaak */}
      {toonNieuw && (
        <form onSubmit={handleAanmaken} className="bg-white border border-everts/30 rounded-xl p-4 mb-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Nieuwe actielijst</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              autoFocus
              type="text"
              value={naam}
              onChange={e => setNaam(e.target.value)}
              placeholder="Naam van de lijst *"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
            <input
              type="text"
              value={beschrijving}
              onChange={e => setBeschrijving(e.target.value)}
              placeholder="Beschrijving (optioneel)"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-everts/30"
            />
            <select
              value={context}
              onChange={e => setContext(e.target.value as 'dossier' | 'medewerker')}
              title="Waar hoort deze lijst bij?"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/30"
            >
              <option value="dossier">Voor een dossier</option>
              <option value="medewerker">Voor een medewerker</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={!naam.trim() || pending}
                className="bg-everts text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-everts/90 disabled:opacity-50"
              >
                {pending ? 'Aanmaken...' : 'Aanmaken'}
              </button>
              <button
                type="button"
                onClick={() => setToonNieuw(false)}
                className="text-slate-500 hover:text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-100"
              >
                Annuleren
              </button>
            </div>
          </div>
        </form>
      )}

      {lijsten.length === 0 && !toonNieuw ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-700 font-medium mb-1">Nog geen actielijsten</p>
          <p className="text-slate-400 text-sm mb-4">Maak een actielijst aan om taken te groeperen.</p>
          <button
            onClick={() => setToonNieuw(true)}
            className="inline-flex items-center gap-2 bg-everts text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-everts/90"
          >
            <Plus className="w-4 h-4" />
            Eerste lijst aanmaken
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lijsten.map(l => <LijstKaart key={l.id} lijst={l} />)}
        </div>
      )}

      {/* Verwijder-bevestiging (DS AlertDialog) */}
      <AlertDialog open={!!verwijderLijst} onOpenChange={open => { if (!open) setVerwijderLijst(null) }}>
        <AlertDialogContent>
          <AlertDialogTitle>Actielijst verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            Weet je zeker dat je <strong>{verwijderLijst?.naam}</strong> wilt verwijderen?
            Alle taken in deze lijst worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={bevestigVerwijderen}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
