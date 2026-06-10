'use client'
import * as React from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { ChevronsUpDown, ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA DataTable — Data Display.html (#01). TanStack v8: sort + filter + paginate, sticky header, dense. */
const TBL_BADGE: Record<string, string> = {
  ok: 'bg-success-50 text-success-700',
  warn: 'bg-warning-50 text-warning-700',
  err: 'bg-error-50 text-error-700',
  info: 'bg-info-50 text-info-700',
  neutral: 'bg-neutral-100 text-neutral-700',
}

export function TableBadge({
  tone = 'neutral', dot, className, children,
}: {
  tone?: keyof typeof TBL_BADGE
  dot?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', TBL_BADGE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]
  data: T[]
  dense?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  pageSize?: number
  onRowClick?: (row: T) => void
  toolbar?: React.ReactNode
  className?: string
}

export function DataTable<T>({
  columns, data, dense = false, searchable = true, searchPlaceholder = 'Zoeken…',
  pageSize = 10, onRowClick, toolbar, className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const cellPad = dense ? 'px-3 py-[7px]' : 'px-3.5 py-3'
  const headPad = dense ? 'px-3 py-[7px] text-[10px]' : 'px-3.5 py-2.5 text-[11px]'

  return (
    <div className={cn('overflow-hidden rounded-[10px] border border-neutral-200 bg-white', className)}>
      {(searchable || toolbar) && (
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
          {searchable && (
            <div className="flex h-8 w-64 items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <input
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-[12.5px] text-neutral-900 outline-none placeholder:text-neutral-400"
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 text-xs text-neutral-500">{table.getFilteredRowModel().rows.length} rijen</span>
            {toolbar}
          </div>
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                      className={cn(
                        'sticky top-0 z-[1] whitespace-nowrap border-b border-neutral-200 bg-neutral-50 text-left font-bold uppercase tracking-[0.06em] text-neutral-600 select-none',
                        headPad,
                        sortable && 'cursor-pointer hover:bg-neutral-100 hover:text-neutral-900',
                        sorted && 'text-brand-700',
                      )}
                    >
                      <span className="inline-flex items-center gap-1 align-middle">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable &&
                          (sorted === 'asc' ? (
                            <ChevronUp className="h-3 w-3 text-brand-500" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown className="h-3 w-3 text-brand-500" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3.5 py-10 text-center text-[13px] text-neutral-500">
                  Geen resultaten.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-neutral-100 last:border-0',
                    onRowClick && 'cursor-pointer',
                    row.getIsSelected() ? 'bg-brand-50' : 'hover:bg-neutral-50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn('align-middle text-neutral-800', cellPad)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-2.5 text-xs text-neutral-500">
          <span>
            Pagina {table.getState().pagination.pageIndex + 1} van {table.getPageCount()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
