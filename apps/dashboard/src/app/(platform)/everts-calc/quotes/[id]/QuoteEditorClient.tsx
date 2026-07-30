'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Eye, Trash2, GripVertical, ClipboardCheck, X, Lock } from 'lucide-react'
import GoedkeuringPaneel from '@/components/goedkeuring/GoedkeuringPaneel'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { verwijderQuote, herorderSections } from '@/app/(platform)/everts-calc/actions/quotes'
import QuoteHeaderCard from '@/components/everts-calc/quotes/QuoteHeaderCard'
import QuoteSectionBlock from '@/components/everts-calc/quotes/QuoteSectionBlock'
import QuoteTotalsCard from '@/components/everts-calc/quotes/QuoteTotalsCard'
import QuoteTermsEditor from '@/components/everts-calc/quotes/QuoteTermsEditor'
import QuoteStatusBadge from '@/components/everts-calc/quotes/QuoteStatusBadge'
import AutoImporter from './AutoImporter'
import QuoteConditionsCard from '@/components/everts-calc/quotes/QuoteConditionsCard'
import type { Quote, QuoteSection, QuoteTemplate } from '@/lib/everts-calc/types-quotes'
import type { Betalingsconditie } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import type { AlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'

interface Props {
  quote: Quote
  templates: QuoteTemplate[]
  betalingscondities: Betalingsconditie[]
  algVoorwaarden: AlgemeneVoorwaarden[]
}

// ─── Sorteerbaar sectie-item ──────────────────────────────────────────────────

function SortableSectieItem({
  section,
  quoteId,
  quoteType,
  isDragging,
}: {
  section: QuoteSection
  quoteId: string
  quoteType: Quote['type']
  isDragging: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: selfDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: selfDragging ? 0.5 : 1,
    zIndex: selfDragging ? 10 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={`absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 transition-opacity ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ touchAction: 'none' }}
        title="Slepen om te herordenen"
      >
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>
      <div className="pl-5">
        <QuoteSectionBlock
          section={section}
          quoteId={quoteId}
          type={quoteType}
        />
      </div>
    </div>
  )
}

// ─── Hoofd editor ─────────────────────────────────────────────────────────────

export default function QuoteEditorClient({ quote, templates, betalingscondities, algVoorwaarden }: Props) {
  const [, startTransition] = useTransition()
  const [verwijderPending, startVerwijder] = useTransition()
  const [isDragging, setIsDragging] = useState(false)
  const [goedkeuringOpen, setGoedkeuringOpen] = useState(false)

  // Lokale sectievolgorde voor optimistische UI
  const [sections, setSections] = useState<QuoteSection[]>(
    [...(quote.sections ?? [])].sort((a, b) => a.volgorde - b.volgorde)
  )

  const router = useRouter()
  const terms = quote.terms ?? []
  const isIntern = quote.type === 'interne_calculatie'
  // Vergrendeld: definitieve (verzonden) offerte — inhoud niet meer wijzigbaar.
  // Een nieuwe versie maak je via "Reviseren" op de calculatie in het dossier.
  const vergrendeld = quote.status === 'verzonden'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = sections.findIndex(s => s.id === active.id)
    const newIdx = sections.findIndex(s => s.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const newSections = arrayMove(sections, oldIdx, newIdx)
    setSections(newSections) // optimistische update

    // Sla nieuwe volgorde op
    startTransition(() => {
      herorderSections(
        quote.id,
        newSections.map((s, i) => ({ id: s.id, volgorde: i + 1 })),
      )
    })
  }

  function handleVerwijder() {
    if (!confirm(`Offerte "${quote.quote_nummer}" definitief verwijderen?`)) return
    startVerwijder(() => {
      verwijderQuote(quote.id)
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Auto-import als offerte nog leeg is */}
      <AutoImporter
        quoteId={quote.id}
        hasSections={sections.length > 0}
        projectId={quote.project_id}
        scenarioId={quote.scenario_id}
      />

      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        <Link
          href="/everts-calc/quotes"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          <span className=" text-sm font-semibold text-slate-700">{quote.quote_nummer}</span>
          {isIntern && (
            <span className="text-xs px-2 py-0.5 rounded-md border bg-purple-50 text-purple-700 border-purple-200 font-medium flex-shrink-0">
              INTERN
            </span>
          )}
        </div>

        {/* Status (automatisch: concept → definitief bij verzenden) */}
        <QuoteStatusBadge status={quote.status} />

        {/* Goedkeuring (niet voor interne calculaties) */}
        {!isIntern && (
          <button
            onClick={() => setGoedkeuringOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            title="Controller-goedkeuring aanvragen of beoordelen"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Goedkeuring
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/quotes/${quote.id}/preview`}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Voorvertoning
          </Link>
          {!vergrendeld && (
            <button
              onClick={handleVerwijder}
              disabled={verwijderPending}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Offerte verwijderen"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Vergrendeld-banner */}
      {vergrendeld && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>
            Deze offerte is <strong>definitief</strong> en kan niet meer gewijzigd worden.
            Maak een nieuwe versie via <strong>Reviseren</strong> op de calculatie in het dossier.
          </span>
        </div>
      )}

      {/* Hoofd scroll-gebied */}
      <div className="flex-1 overflow-y-auto p-4">
       <div className={`space-y-4 ${vergrendeld ? 'pointer-events-none opacity-70 select-none' : ''}`}>
        {/* 2-kolom: inhoud + totalen */}
        <div className="flex gap-4 items-start">
          {/* Links: header + secties */}
          <div className="flex-1 min-w-0 space-y-4">
            <QuoteHeaderCard quote={quote} templates={templates} />

            <QuoteConditionsCard
              quoteId={quote.id}
              betalingsconditieId={quote.betalingsconditie_id}
              voorwaardenId={quote.voorwaarden_id}
              betalingscondities={betalingscondities}
              algVoorwaarden={algVoorwaarden}
            />

            {/* Drag-to-reorder secties */}
            {sections.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <GripVertical className="w-3.5 h-3.5" />
                Versleep secties om de volgorde te wijzigen
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setIsDragging(false)}
            >
              <SortableContext
                items={sections.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {sections.map(s => (
                    <SortableSectieItem
                      key={s.id}
                      section={s}
                      quoteId={quote.id}
                      quoteType={quote.type}
                      isDragging={isDragging}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Rechts: totalen (sticky) */}
          <div className="w-72 flex-shrink-0 sticky top-0">
            <QuoteTotalsCard quote={quote} />
          </div>
        </div>

        {/* Voorwaarden: volle breedte onderaan */}
        <QuoteTermsEditor
          quoteId={quote.id}
          terms={terms}
          templates={templates}
        />
       </div>
      </div>

      {goedkeuringOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setGoedkeuringOpen(false) }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-700" />
                <h2 className="text-base font-bold text-gray-900">Goedkeuring offerte</h2>
              </div>
              <button onClick={() => setGoedkeuringOpen(false)} className="text-gray-400 hover:text-gray-600 rounded-md p-1 hover:bg-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">
              <GoedkeuringPaneel
                objectType="offerte"
                objectId={quote.id}
                dossierId={quote.dossier_id ?? null}
                totaalBedrag={quote.subtotaal_ex_btw}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
