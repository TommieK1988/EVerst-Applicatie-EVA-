'use client'

import React, { useState, useTransition } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import toast from 'react-hot-toast'
import { Button, Input, EmptyState, Card, CardBody, Badge } from '@/components/ui'
import type { PlanningUursoort } from '@everts/database/platform-types'
import {
  maakUursoort,
  updateUursoort,
  verwijderUursoort,
  herschikUursoorten,
  updateEvertsCalcMapping,
  setUursoortTarief,
} from '@/app/(platform)/instellingen/planning/actions'

/* ── Types ─────────────────────────────────────────────────────── */

type EditState = {
  naam: string
  code: string
  kleur: string
  everts_calc_omschrijvingen: string[]
}

const DEFAULTS: EditState = {
  naam: '',
  code: '',
  kleur: '#2d7d2d',
  everts_calc_omschrijvingen: [],
}

/* ── Tag-input voor everts_calc_omschrijvingen ──────────────────── */

function TagInput({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState('')

  function addTag() {
    const t = input.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 28 }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-active)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '2px 8px',
            fontSize: 11, color: 'var(--fg)',
          }}>
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter(t => t !== tag))}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 0, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
          placeholder="Type omschrijving + Enter"
          inputSize="sm"
          style={{ flex: 1 }}
        />
        <Button type="button" variant="ghost" size="sm" onClick={addTag}>
          Voeg toe
        </Button>
      </div>
    </div>
  )
}

/* ── Per-uursoort tarief (laag 3 van de hiërarchie) ─────────────── */

function TariefCel({ item }: { item: PlanningUursoort }) {
  const [waarde, setWaarde] = useState<string>(item.tarief_verkoop != null ? String(item.tarief_verkoop) : '')
  const [busy, setBusy] = useState(false)

  async function opslaan() {
    const parsed = waarde.trim() === '' ? null : parseFloat(waarde)
    const huidig = item.tarief_verkoop ?? null
    if (parsed === huidig) return
    if (parsed != null && isNaN(parsed)) return
    setBusy(true)
    const r = await setUursoortTarief(item.id, { tarief_verkoop: parsed })
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Uursoort-tarief opgeslagen')
  }

  return (
    <div style={{ width: 120 }} title="Per-uursoort default verkooptarief (overschrijfbaar per medewerker)">
      <Input
        type="number" min="0" step="0.5" inputSize="sm"
        value={waarde}
        disabled={busy}
        placeholder="—"
        onChange={e => setWaarde(e.target.value)}
        onBlur={opslaan}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        prefix={<span style={{ fontSize: 11 }}>€</span>}
        suffix={<span style={{ fontSize: 9 }}>/uur</span>}
      />
    </div>
  )
}

/* ── Inline formulier ───────────────────────────────────────────── */

function UursoortFormulier({
  initial,
  onSave,
  onCancel,
  isPending,
  readonlyIdentiteit = false,
}: {
  initial: EditState
  onSave: (state: EditState) => void
  onCancel: () => void
  isPending: boolean
  /** Bouw7-afgeleide uursoort: naam/code/kleur zijn read-only (alleen mapping bewerkbaar). */
  readonlyIdentiteit?: boolean
}) {
  const [state, setState] = useState<EditState>(initial)
  const set = (k: keyof EditState, v: unknown) => setState(prev => ({ ...prev, [k]: v }))

  return (
    <Card className="mb-1">
      <CardBody>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Naam
            </label>
            <Input
              value={state.naam}
              onChange={e => set('naam', e.target.value)}
              placeholder="Bijv. Directe arbeid"
              style={{ width: '100%' }}
              disabled={readonlyIdentiteit}
              autoFocus={!readonlyIdentiteit}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Code
            </label>
            <Input
              value={state.code}
              onChange={e => set('code', e.target.value.toUpperCase())}
              placeholder="Bijv. DA"
              maxLength={10}
              disabled={readonlyIdentiteit}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Kleur
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={state.kleur}
                onChange={e => set('kleur', e.target.value)}
                disabled={readonlyIdentiteit}
                style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, cursor: readonlyIdentiteit ? 'not-allowed' : 'pointer', padding: 2 }}
              />
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                {state.kleur}
              </span>
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              Everts-calc omschrijvingen (sync-koppeling)
            </label>
            <TagInput
              tags={state.everts_calc_omschrijvingen}
              onChange={tags => set('everts_calc_omschrijvingen', tags)}
            />
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 5 }}>
              Arbeid-component omschrijvingen uit everts-calc die mappen naar deze uursoort bij de werkbegroting-sync.
            </p>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
              Annuleren
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => onSave(state)}
              loading={isPending}
              disabled={isPending || !state.naam.trim() || !state.code.trim()}
            >
              Opslaan
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

/* ── Sorteerbaar rij-item ───────────────────────────────────────── */

function SortableRow({
  item,
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onCancelEdit,
  isPending,
}: {
  item: PlanningUursoort
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
  onSave: (state: EditState) => void
  onCancelEdit: () => void
  isPending: boolean
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style}>
        <UursoortFormulier
          initial={{
            naam: item.naam,
            code: item.code,
            kleur: item.kleur,
            everts_calc_omschrijvingen: item.everts_calc_omschrijvingen,
          }}
          onSave={onSave}
          onCancel={onCancelEdit}
          isPending={isPending}
          readonlyIdentiteit={item.bron === 'bouw7'}
        />
      </div>
    )
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 px-3.5 py-2.5 mb-1"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        style={{
          border: 'none', background: 'none', cursor: 'grab', color: 'var(--fg-muted)',
          padding: '2px 4px', touchAction: 'none',
        }}
        aria-label="Versleep"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M4 4h2v2H4V4zm4 0h2v2H8V4zM4 8h2v2H4V8zm4 0h2v2H8V8z" fill="currentColor"/>
        </svg>
      </button>

      {/* Kleur swatch */}
      <div style={{ width: 18, height: 18, borderRadius: 4, background: item.kleur, flexShrink: 0 }} />

      {/* Naam + code */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          {item.naam}
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
          {item.code}
        </span>
        {item.bron === 'bouw7' && (
          <Badge variant="outline" tone="info" size="sm" title="Afgeleid uit Bouw7 — read-only">Bouw7</Badge>
        )}
      </div>

      {/* Everts-calc tags */}
      {item.everts_calc_omschrijvingen.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {item.everts_calc_omschrijvingen.slice(0, 3).map(tag => (
            <span key={tag} style={{
              fontSize: 9, color: 'var(--fg-muted)',
              border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px',
            }}>{tag}</span>
          ))}
          {item.everts_calc_omschrijvingen.length > 3 && (
            <span style={{ fontSize: 9, color: 'var(--fg-muted)' }}>
              +{item.everts_calc_omschrijvingen.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Per-uursoort default tarief (laag 3 hiërarchie) */}
      <TariefCel item={item} />

      {/* Acties */}
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {item.bron === 'bouw7' ? 'Koppeling' : 'Bewerken'}
        </Button>
        <Button
          variant="outline" size="sm" onClick={onDelete}
          disabled={isPending || item.bron === 'bouw7'}
          title={item.bron === 'bouw7' ? 'Bouw7-uursoort kan hier niet verwijderd worden' : undefined}
        >
          Verwijder
        </Button>
      </div>
    </Card>
  )
}

/* ── Hoofd-component ────────────────────────────────────────────── */

export default function UursoortBeheer({ initial }: { initial: PlanningUursoort[] }) {
  const [items, setItems] = useState<PlanningUursoort[]>(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNieuw, setShowNieuw] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)
    setItems(reordered)

    startTransition(async () => {
      const result = await herschikUursoorten(reordered.map(i => i.id))
      if (!result.ok) toast.error(result.error)
    })
  }

  function handleSaveNew(state: EditState) {
    startTransition(async () => {
      const result = await maakUursoort({ ...state, volgorde: items.length })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Uursoort aangemaakt')
      setShowNieuw(false)
      // Refresh via server revalidation — page will re-render with new data
    })
  }

  function handleSaveEdit(id: string, state: EditState) {
    const idx = items.findIndex(i => i.id === id)
    startTransition(async () => {
      const result = await updateUursoort(id, { ...state, volgorde: idx })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Wijzigingen opgeslagen')
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Uursoort verwijderen? Bestaande planning-items behouden hun uursoort-referentie.')) return
    startTransition(async () => {
      const result = await verwijderUursoort(id)
      if (!result.ok) { toast.error(result.error); return }
      setItems(prev => prev.filter(i => i.id !== id))
      toast.success('Uursoort verwijderd')
    })
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
            Uursoorten
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginTop: 3 }}>
            Categorieën voor planbare uren (Montage, Reistijd, Inbedrijfstelling, …).
            Sleep rijen om de volgorde aan te passen.
          </p>
        </div>
        {!showNieuw && (
          <Button
            variant="primary"
            onClick={() => { setShowNieuw(true); setEditingId(null) }}
            style={{ flexShrink: 0 }}
          >
            + Uursoort toevoegen
          </Button>
        )}
      </div>

      {/* Nieuw formulier */}
      {showNieuw && (
        <UursoortFormulier
          initial={DEFAULTS}
          onSave={handleSaveNew}
          onCancel={() => setShowNieuw(false)}
          isPending={isPending}
        />
      )}

      {/* Gesorteerde lijst */}
      {items.length === 0 && !showNieuw ? (
        <EmptyState
          title="Nog geen uursoorten aangemaakt"
          description="Voeg de categorieën toe die in de planning gebruikt worden."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={e => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map(item => (
              <SortableRow
                key={item.id}
                item={item}
                isEditing={editingId === item.id}
                onEdit={() => { setEditingId(item.id); setShowNieuw(false) }}
                onDelete={() => handleDelete(item.id)}
                onSave={state => handleSaveEdit(item.id, state)}
                onCancelEdit={() => setEditingId(null)}
                isPending={isPending}
              />
            ))}
          </SortableContext>

          <DragOverlay>
            {activeItem && (
              <Card className="flex items-center gap-2.5 px-3.5 py-2.5 border-brand-300 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
                <div style={{ width: 18, height: 18, borderRadius: 4, background: activeItem.kleur }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600 }}>
                  {activeItem.naam}
                </span>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Everts-calc sync info */}
      <Card className="mt-6">
        <CardBody>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Everts-calc koppeling
          </p>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5, margin: 0 }}>
            Voeg bij elke uursoort de arbeid-omschrijvingen toe die in everts-calc gebruikt worden
            (bijv. <em>Schilder</em>, <em>Dakdekker</em>). Bij het synchroniseren van de werkbegroting
            worden de begrote uren per omschrijving automatisch samengevoegd per uursoort.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

// Re-export for direct use from updateEvertsCalcMapping
export { updateEvertsCalcMapping }
