'use client'

import React, { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnOrderState,
  type RowSelectionState,
  type PaginationState,
  type ColumnSizingState,
} from '@tanstack/react-table'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { KolomConfig, GebruikerLayout } from '@everts/database/platform-types'
import { slaLayoutOp, verwijderLayout, stelStandaardIn } from '@/app/actions/layouts'
import {
  GripVertical,
  Eye, EyeOff, X, Check, Layers, SlidersHorizontal, ChevronDown as ChevronDownSm,
  Search, ChevronLeft, ChevronRight, MoreHorizontal, Download,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type KolomDefinitie<T> = {
  key:                 string
  label:               string
  standaard_zichtbaar?: boolean
  vast?:               boolean
  render:              (item: T) => React.ReactNode
  sorteerWaarde?:      (item: T) => string | number | null
  filterType?:         'tekst' | 'select'
  filterOpties?:       string[]
  breedte?:            number
}

type Props<T extends { id: string }> = {
  scherm:     string
  data:       T[]
  kolommen:   KolomDefinitie<T>[]
  layouts:    GebruikerLayout[]
  user_id:    string | null
  onRijKlik?: (item: T) => void
  /** Buttons rendered in the toolbar right area (Filter, Export, Nieuw…) */
  acties?:    React.ReactNode
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate, onChange, disabled }: {
  checked: boolean
  indeterminate?: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={e => { e.stopPropagation(); if (!disabled) onChange?.(!checked) }}
      style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--border)'}`,
        background: checked || indeterminate ? 'var(--accent)' : 'white',
        display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 100ms, border-color 100ms',
      }}
    >
      {indeterminate
        ? <span style={{ width: 7, height: 1.5, background: 'white', borderRadius: 1, display: 'block' }} />
        : checked
          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : null
      }
    </div>
  )
}

// ─── Draggable header cell ────────────────────────────────────────────────────

function DraggableHeaderCell({
  columnId, children, style,
}: {
  columnId: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnId })
  return (
    <th
      ref={setNodeRef}
      style={{ ...style, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      className="overzicht-th"
    >
      <span
        {...listeners}
        className="th-grip"
        style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', marginRight: 4, color: 'var(--fg-muted)', opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={11} />
      </span>
      {children}
    </th>
  )
}

// ─── Sort icon (DS §43 style) ─────────────────────────────────────────────────

function SortIco({ dir }: { dir: false | 'asc' | 'desc' }) {
  if (dir === 'asc') return <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 3 }}>▲</span>
  if (dir === 'desc') return <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 3 }}>▼</span>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 3, opacity: 0.35, verticalAlign: 'middle' }}>
      <span style={{ fontSize: 7, lineHeight: 1 }}>▲</span>
      <span style={{ fontSize: 7, lineHeight: 1 }}>▼</span>
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OverzichtTabel<T extends { id: string }>({
  scherm, data, kolommen, layouts: initialLayouts, user_id, onRijKlik, acties,
}: Props<T>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const defaultVisibility: VisibilityState = Object.fromEntries(
    kolommen.map(k => [k.key, k.standaard_zichtbaar !== false])
  )
  const defaultOrder: ColumnOrderState = kolommen.map(k => k.key)

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultVisibility)
  const [columnOrder, setColumnOrder]           = useState<ColumnOrderState>(defaultOrder)
  const [columnSizing, setColumnSizing]         = useState<ColumnSizingState>({})
  const [sorting, setSorting]                   = useState<SortingState>([])
  const [columnFilters, setColumnFilters]       = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter]         = useState('')
  const [rowSelection, setRowSelection]         = useState<RowSelectionState>({})
  const [pagination, setPagination]             = useState<PaginationState>({ pageIndex: 0, pageSize: 25 })

  const [layouts, setLayouts]             = useState<GebruikerLayout[]>(initialLayouts)
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(
    initialLayouts.find(l => l.is_standaard)?.id ?? null
  )
  const [isDirty, setIsDirty]           = useState(false)
  const [showSaveAs, setShowSaveAs]     = useState(false)
  const [saveAsNaam, setSaveAsNaam]     = useState('')
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [showKolomBeheer, setShowKolomBeheer] = useState(false)

  const layoutMenuRef  = useRef<HTMLDivElement>(null)
  const kolomBeheerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node))
        setShowLayoutMenu(false)
      if (kolomBeheerRef.current && !kolomBeheerRef.current.contains(e.target as Node))
        setShowKolomBeheer(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyLayout = useCallback((layout: GebruikerLayout) => {
    const sorted = [...layout.kolommen].sort((a, b) => a.volgorde - b.volgorde)
    setColumnOrder(sorted.map(k => k.key))
    setColumnVisibility(Object.fromEntries(sorted.map(k => [k.key, k.zichtbaar])))
    const sizing: ColumnSizingState = {}
    sorted.forEach(k => { if (k.breedte) sizing[k.key] = k.breedte })
    setColumnSizing(sizing)
    setActiveLayoutId(layout.id)
    setIsDirty(false)
  }, [])

  useEffect(() => {
    const standaard = initialLayouts.find(l => l.is_standaard)
    if (standaard) applyLayout(standaard)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markDirty = () => setIsDirty(true)

  function handleVisibilityChange(key: string, value: boolean) {
    setColumnVisibility(prev => ({ ...prev, [key]: value }))
    markDirty()
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setColumnOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string))
      markDirty()
      return next
    })
  }

  // ── Selection column ──────────────────────────────────────────────────────
  const selectColumn: ColumnDef<T> = {
    id: '__select',
    size: 40,
    enableSorting: false,
    enableColumnFilter: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler() as (v: boolean) => void}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler() as (v: boolean) => void}
      />
    ),
  }

  const tableColumns: ColumnDef<T>[] = [
    selectColumn,
    ...kolommen.map(k => ({
      id: k.key,
      accessorFn: k.sorteerWaarde ?? ((row: T) => {
        const r = k.render(row)
        return (typeof r === 'string' || typeof r === 'number') ? r : ''
      }),
      header: k.label,
      cell: ({ row }: { row: { original: T } }) => k.render(row.original),
      enableSorting: !!k.sorteerWaarde,
      enableColumnFilter: !!k.filterType,
      enableResizing: true,
      filterFn: (k.filterType === 'select' ? 'equals' : 'includesString') as 'equals' | 'includesString',
      size: k.breedte ?? 150,
      minSize: 60,
    })),
  ]

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnFilters, columnVisibility, columnOrder, columnSizing, globalFilter, rowSelection, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableRowSelection: true,
  })

  // ── Layout CRUD ────────────────────────────────────────────────────────────
  function currentKolommen(): KolomConfig[] {
    return columnOrder.map((key, i) => ({
      key,
      zichtbaar: columnVisibility[key] !== false,
      volgorde: i,
      breedte: columnSizing[key] ?? undefined,
    }))
  }

  function handleSaveAs() {
    if (!user_id || !saveAsNaam.trim()) return
    startTransition(async () => {
      const result = await slaLayoutOp(user_id, scherm, saveAsNaam.trim(), currentKolommen())
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => [...prev, {
        id: result.id!, user_id, scherm, naam: saveAsNaam.trim(),
        kolommen: currentKolommen(), is_standaard: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }])
      setActiveLayoutId(result.id!)
      setIsDirty(false); setShowSaveAs(false); setSaveAsNaam('')
      toast.success('Layout opgeslagen')
    })
  }

  function handleUpdateLayout() {
    if (!user_id || !activeLayoutId) return
    startTransition(async () => {
      const layout = layouts.find(l => l.id === activeLayoutId)
      if (!layout) return
      const result = await slaLayoutOp(user_id, scherm, layout.naam, currentKolommen(), activeLayoutId)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.map(l => l.id === activeLayoutId ? { ...l, kolommen: currentKolommen() } : l))
      setIsDirty(false)
      toast.success('Layout bijgewerkt')
    })
  }

  function handleDeleteLayout(id: string) {
    if (!user_id) return
    startTransition(async () => {
      const result = await verwijderLayout(id, user_id)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.filter(l => l.id !== id))
      if (activeLayoutId === id) setActiveLayoutId(null)
      toast.success('Layout verwijderd')
    })
  }

  function handleSetStandaard(id: string) {
    if (!user_id) return
    startTransition(async () => {
      const result = await stelStandaardIn(id, user_id, scherm)
      if (!result.ok) { toast.error(result.error); return }
      setLayouts(prev => prev.map(l => ({ ...l, is_standaard: l.id === id })))
      toast.success('Standaard layout ingesteld')
    })
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const orderedKolommen = columnOrder
    .map(key => kolommen.find(k => k.key === key))
    .filter(Boolean) as KolomDefinitie<T>[]

  const hasFilters = kolommen.some(k => k.filterType)
  const activeFilters = columnFilters.filter(f => f.value !== '' && f.value !== undefined && f.value !== null)
  const hasActiveChips = activeFilters.length > 0 || globalFilter.length > 0
  const filteredCount  = table.getFilteredRowModel().rows.length
  const selectedCount  = table.getFilteredSelectedRowModel().rows.length
  const totalPages     = table.getPageCount()
  const pageIndex      = table.getState().pagination.pageIndex

  const activeLayoutNaam = activeLayoutId
    ? (layouts.find(l => l.id === activeLayoutId)?.naam ?? 'Layout')
    : 'Weergave'

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportNaarCsv() {
    const zichtbareKolommen = orderedKolommen.filter(k => columnVisibility[k.key] !== false)
    const headers = zichtbareKolommen.map(k => k.label)
    const rijen = table.getFilteredRowModel().rows.map(row =>
      zichtbareKolommen.map(k => {
        const waarde = k.sorteerWaarde ? k.sorteerWaarde(row.original) : ''
        return waarde != null ? String(waarde) : ''
      })
    )
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [headers, ...rijen].map(r => r.map(escape).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${scherm}-export.csv` })
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
    toast.success(`${rijen.length} rijen geëxporteerd`)
  }

  // ── Styles — DS Data Display §43 ──────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '10px 14px', textAlign: 'left', userSelect: 'none', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)', background: 'var(--bg)',
  }

  const tdStyle: React.CSSProperties = {
    fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
    padding: '12px 14px', borderBottom: '1px solid var(--border-soft)',
    verticalAlign: 'middle',
  }

  // ── Pagination helpers ─────────────────────────────────────────────────────
  function PagBtn({ children, active, disabled, onClick }: {
    children: React.ReactNode, active?: boolean, disabled?: boolean, onClick?: () => void
  }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          height: 28, minWidth: 28, padding: '0 8px',
          border: '1px solid var(--border)', borderRadius: 5,
          background: active ? 'var(--accent)' : 'white',
          color: active ? 'white' : 'var(--fg)',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: active ? 600 : 400,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'grid', placeItems: 'center',
          opacity: disabled ? 0.4 : 1,
          transition: 'background 100ms',
        }}
        onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
        onMouseLeave={e => { if (!active && !disabled) (e.currentTarget as HTMLButtonElement).style.background = 'white' }}
      >
        {children}
      </button>
    )
  }

  function pageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i)
    const pages: (number | '…')[] = [0, 1, 2]
    if (pageIndex > 3) pages.push('…')
    if (pageIndex > 2 && pageIndex < totalPages - 3) pages.push(pageIndex)
    if (pageIndex < totalPages - 4) pages.push('…')
    pages.push(totalPages - 1)
    return [...new Set(pages)]
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Tabel-container ── */}
      <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'white' }}>

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: 'white',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Zoekbalk (links) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 32, padding: '0 10px',
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, minWidth: 220, flex: 1, maxWidth: 360,
          }}>
            <Search size={13} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <input
              placeholder={`Zoek dossier, relatie…`}
              value={globalFilter}
              onChange={e => { setGlobalFilter(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
              style={{
                flex: 1, border: 0, outline: 'none',
                fontFamily: 'var(--font-ui)', fontSize: 12.5,
                background: 'transparent', color: 'var(--fg)',
              }}
            />
            {globalFilter && (
              <button onClick={() => setGlobalFilter('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--fg-muted)', display: 'flex' }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Count */}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
            {filteredCount} {scherm}
          </span>

          {/* Export knop (ingebouwd) */}
          <button
            onClick={exportNaarCsv}
            title="Exporteer als CSV"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 32, padding: '0 10px',
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--fg)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--neutral-100, #f1f4f5)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
          >
            <Download size={13} strokeWidth={2} />
            Export
          </button>

          {/* Extern meegegeven acties (Nieuw…) */}
          {acties && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{acties}</div>}

          {/* Layout dropdown */}
          {user_id && (
            <div style={{ position: 'relative' }} ref={layoutMenuRef}>
              <button
                onClick={() => { setShowLayoutMenu(s => !s); setShowKolomBeheer(false) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg)', cursor: 'pointer', padding: '4px 10px',
                  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)',
                }}
              >
                <Layers size={13} strokeWidth={1.8} />
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeLayoutNaam}
                </span>
                {isDirty && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                <ChevronDownSm size={11} strokeWidth={2} style={{ color: 'var(--fg-muted)' }} />
              </button>

              {showLayoutMenu && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300,
                  background: 'white', border: '1px solid var(--border)', borderRadius: 8,
                  minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
                }}>
                  {layouts.length > 0 && (
                    <div style={{ borderBottom: '1px solid var(--border)' }}>
                      {layouts.map(l => (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
                          <button onClick={() => { applyLayout(l); setShowLayoutMenu(false) }}
                            style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '8px 6px', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 8 }}
                          >
                            {activeLayoutId === l.id ? <Check size={13} color="var(--accent)" /> : <span style={{ width: 13 }} />}
                            {l.naam}
                            {l.is_standaard && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.06em' }}>standaard</span>}
                          </button>
                          <button onClick={() => handleSetStandaard(l.id)} title={l.is_standaard ? 'Is al standaard' : 'Instellen als standaard'}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: l.is_standaard ? 'var(--accent)' : 'var(--fg-muted)', padding: '4px 5px', fontSize: 13 }}
                          >{l.is_standaard ? '★' : '☆'}</button>
                          <button onClick={() => handleDeleteLayout(l.id)} title="Verwijderen"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: '4px 5px' }}
                          ><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: '6px' }}>
                    {isDirty && activeLayoutId && (
                      <button onClick={() => { handleUpdateLayout(); setShowLayoutMenu(false) }} disabled={isPending}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >Wijzigingen opslaan</button>
                    )}
                    <button onClick={() => { setShowSaveAs(true); setShowLayoutMenu(false) }}
                      style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 10px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >Opslaan als nieuw…</button>
                  </div>
                </div>
              )}

              {showSaveAs && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300, background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 240 }}>
                  <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px' }}>Naam voor nieuwe layout</p>
                  <input className="eva-input" style={{ width: '100%', fontSize: 12, marginBottom: 8 }} placeholder="bijv. Compact overzicht"
                    value={saveAsNaam} onChange={e => setSaveAsNaam(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveAs(false) }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="eva-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowSaveAs(false)}>Annuleren</button>
                    <button className="eva-btn-primary" style={{ fontSize: 12 }} onClick={handleSaveAs} disabled={!saveAsNaam.trim() || isPending}>Opslaan</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kolommen beheren */}
          <div style={{ position: 'relative' }} ref={kolomBeheerRef}>
            <button onClick={() => { setShowKolomBeheer(s => !s); setShowLayoutMenu(false) }} title="Kolommen beheren"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 6,
                background: showKolomBeheer ? 'var(--bg-active)' : 'var(--bg)',
                cursor: 'pointer', padding: '4px 8px', color: 'var(--fg-muted)',
              }}
            >
              <SlidersHorizontal size={14} strokeWidth={1.8} />
            </button>

            {showKolomBeheer && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 300, background: 'white', border: '1px solid var(--border)', borderRadius: 8, width: 210, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '8px 0' }}>
                <div style={{ padding: '0 12px 6px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Zichtbare kolommen</div>
                {orderedKolommen.map(k => (
                  <label key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: k.vast ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', opacity: k.vast ? 0.45 : 1 }}>
                    {columnVisibility[k.key] !== false ? <Eye size={13} color="var(--accent)" /> : <EyeOff size={13} color="var(--fg-muted)" />}
                    <input type="checkbox" checked={columnVisibility[k.key] !== false} disabled={k.vast} onChange={e => handleVisibilityChange(k.key, e.target.checked)} style={{ display: 'none' }} />
                    {k.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Filter chips rij (DS §43 tbl-filters) ── */}
        {hasActiveChips && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '7px 14px', background: 'var(--bg)',
            borderBottom: '1px solid var(--border-soft)',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', flexShrink: 0 }}>Filter:</span>

            {globalFilter && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', border: '1px solid var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-700)', borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 500 }}>
                <span style={{ color: 'var(--fg-muted)', marginRight: 1 }}>Zoek:</span>
                {globalFilter}
                <button onClick={() => setGlobalFilter('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '1px 0 0', color: 'var(--brand-700)', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
              </span>
            )}

            {activeFilters.map(f => {
              const kol = kolommen.find(k => k.key === f.id)
              return (
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', border: '1px solid var(--brand-200)', background: 'var(--brand-50)', color: 'var(--brand-700)', borderRadius: 999, fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 500 }}>
                  <span style={{ color: 'var(--fg-muted)', marginRight: 1 }}>{kol?.label ?? f.id}:</span>
                  {String(f.value)}
                  <button onClick={() => table.getColumn(f.id)?.setFilterValue(undefined)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '1px 0 0', color: 'var(--brand-700)', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
                </span>
              )
            })}

            {(activeFilters.length + (globalFilter ? 1 : 0)) > 1 && (
              <button onClick={() => { setColumnFilters([]); setGlobalFilter('') }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', padding: '2px 6px' }}
              >Wis alles</button>
            )}
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ overflowX: 'auto' }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select').map(header => {
                    if (columnVisibility[header.id] === false) return null
                    return <col key={header.id} style={{ width: header.getSize() }} />
                  })}
                  <col style={{ width: 44 }} />
                </colgroup>
                <thead>
                  <tr>
                    {/* Checkbox header */}
                    <th style={{ ...thStyle, width: 44, padding: '10px 14px' }}>
                      <Checkbox
                        checked={table.getIsAllPageRowsSelected()}
                        indeterminate={table.getIsSomePageRowsSelected()}
                        onChange={table.getToggleAllPageRowsSelectedHandler() as (v: boolean) => void}
                      />
                    </th>

                    {/* Data column headers */}
                    {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select').map(header => {
                      if (columnVisibility[header.id] === false) return null
                      const kol = kolommen.find(k => k.key === header.id)
                      if (!kol) return null
                      const col = header.column
                      const isSorted = col.getIsSorted()
                      return (
                        <DraggableHeaderCell key={header.id} columnId={header.id}
                          style={{ ...thStyle, width: header.getSize(), position: 'relative' }}>
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', cursor: col.getCanSort() ? 'pointer' : 'default' }}
                            onClick={col.getCanSort() ? col.getToggleSortingHandler() : undefined}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {col.getCanSort() && <SortIco dir={isSorted} />}
                          </span>
                          <div
                            onMouseDown={e => { e.stopPropagation(); header.getResizeHandler()(e) }}
                            onTouchStart={e => { e.stopPropagation(); header.getResizeHandler()(e) }}
                            onClick={e => e.stopPropagation()}
                            className={`col-resize-handle${header.column.getIsResizing() ? ' is-resizing' : ''}`}
                          />
                        </DraggableHeaderCell>
                      )
                    })}

                    {/* Acties kolom */}
                    <th style={{ ...thStyle, width: 44 }} />
                  </tr>

                  {/* Filter row */}
                  {hasFilters && (
                    <tr>
                      <th style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }} />
                      {table.getHeaderGroups()[0]?.headers.filter(h => h.id !== '__select').map(header => {
                        if (columnVisibility[header.id] === false) return null
                        const kol = kolommen.find(k => k.key === header.id)
                        if (!kol) return null
                        return (
                          <th key={`filter-${header.id}`} style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }}>
                            {kol.filterType === 'tekst' && (
                              <input className="eva-input" style={{ width: '100%', fontSize: 11, padding: '3px 8px' }}
                                placeholder="Filter…"
                                value={(header.column.getFilterValue() as string) ?? ''}
                                onChange={e => { header.column.setFilterValue(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                              />
                            )}
                            {kol.filterType === 'select' && (
                              <select className="eva-input" style={{ width: '100%', fontSize: 11, padding: '3px 8px' }}
                                value={(header.column.getFilterValue() as string) ?? ''}
                                onChange={e => { header.column.setFilterValue(e.target.value || undefined); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                              >
                                <option value="">Alle</option>
                                {kol.filterOpties?.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            )}
                          </th>
                        )
                      })}
                      <th style={{ ...thStyle, padding: '5px 10px', background: 'var(--bg)' }} />
                    </tr>
                  )}
                </thead>

                <tbody>
                  {table.getRowModel().rows.map(row => {
                    const isSelected = row.getIsSelected()
                    return (
                      <tr
                        key={row.id}
                        className="overzicht-rij"
                        style={{ cursor: 'pointer', background: isSelected ? 'var(--brand-50)' : undefined }}
                      >
                        {/* Checkbox cell */}
                        <td style={{ ...tdStyle, width: 44 }} onClick={e => { e.stopPropagation(); row.toggleSelected() }}>
                          <Checkbox checked={isSelected} onChange={() => row.toggleSelected()} />
                        </td>

                        {/* Data cells */}
                        {row.getVisibleCells().filter(c => c.column.id !== '__select').map(cell => {
                          if (columnVisibility[cell.column.id] === false) return null
                          return (
                            <td key={cell.id} style={tdStyle}
                              onClick={() => onRijKlik ? onRijKlik(row.original) : router.push(`/${scherm}/${row.original.id}`)}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          )
                        })}

                        {/* ⋯ actie-knop */}
                        <td style={{ ...tdStyle, width: 44, padding: '12px 8px' }}>
                          <button
                            onClick={e => { e.stopPropagation(); onRijKlik ? onRijKlik(row.original) : router.push(`/${scherm}/${row.original.id}`) }}
                            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)' }}
                            className="tbl-action-btn"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={columnOrder.filter(k => columnVisibility[k] !== false).length + 2}
                        style={{ ...tdStyle, textAlign: 'center', color: 'var(--fg-muted)', padding: '40px 0', borderBottom: 'none' }}
                      >Geen resultaten</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>

        {/* ── Paginering (DS §43 tbl-pagination) ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--border)',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--fg-muted)',
          background: 'white',
        }}>
          {/* Links: selectie-info + page size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>
              {selectedCount > 0
                ? `${selectedCount} geselecteerd van ${filteredCount}`
                : `${filteredCount} ${scherm}`
              }
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              Rijen:
              <select
                value={pagination.pageSize}
                onChange={e => { table.setPageSize(Number(e.target.value)); setPagination(p => ({ ...p, pageIndex: 0 })) }}
                style={{ height: 26, padding: '0 6px', border: '1px solid var(--border)', borderRadius: 5, fontFamily: 'var(--font-ui)', fontSize: 12, background: 'white', cursor: 'pointer' }}
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          {/* Rechts: pagina-navigatie */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <PagBtn disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
                <ChevronLeft size={13} />
              </PagBtn>
              {pageNumbers().map((p, i) =>
                p === '…'
                  ? <span key={`dots-${i}`} style={{ padding: '0 4px', color: 'var(--fg-muted)', fontSize: 12 }}>…</span>
                  : <PagBtn key={p} active={p === pageIndex} onClick={() => table.setPageIndex(p as number)}>{(p as number) + 1}</PagBtn>
              )}
              <PagBtn disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
                <ChevronRight size={13} />
              </PagBtn>
            </div>
          )}
        </div>
      </div>

      <style>{`
        tr.overzicht-rij { transition: background 80ms ease; }
        tr.overzicht-rij:hover td { background: var(--bg); }
        tr.overzicht-rij:has(td [aria-checked="true"]) td,
        tr.overzicht-rij:has(td [aria-checked="true"]):hover td { background: var(--brand-50) !important; }
        .overzicht-th:hover .th-grip { opacity: 0.5 !important; }
        .tbl-action-btn:hover { background: var(--bg) !important; color: var(--fg) !important; }
        .col-resize-handle {
          position: absolute; right: 0; top: 0; bottom: 0;
          width: 5px; cursor: col-resize; user-select: none;
          background: transparent; z-index: 2;
        }
        .col-resize-handle:hover, .col-resize-handle.is-resizing {
          background: var(--accent, #2d7dd2);
          opacity: 0.5;
        }
        .col-resize-handle.is-resizing { opacity: 0.8; }
      `}</style>
    </div>
  )
}
