'use client'
import * as React from 'react'
import { UploadCloud, File as FileIcon, X } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA FileUpload — Formulierpatronen.html (#06). Dropzone + bestandslijst. */
export interface FileUploadProps {
  onFiles?: (files: File[]) => void
  accept?: string
  multiple?: boolean
  title?: React.ReactNode
  sub?: React.ReactNode
  types?: React.ReactNode
  className?: string
}

export function FileUpload({
  onFiles, accept, multiple = true, title, sub, types, className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragover, setDragover] = React.useState(false)

  const handle = (list: FileList | null) => {
    if (list && list.length) onFiles?.(Array.from(list))
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => { e.preventDefault(); setDragover(false); handle(e.dataTransfer.files) }}
      className={cn(
        'cursor-pointer rounded-[10px] border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-9 text-center transition-[border-color,background,box-shadow] duration-150',
        'hover:border-brand-400 hover:bg-brand-50',
        dragover && 'border-brand-500 bg-brand-50 ring-[3px] ring-brand-100',
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <div className="mx-auto mb-3.5 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <UploadCloud className="h-5 w-5" />
      </div>
      <div className="mb-1 text-sm font-semibold text-neutral-900">
        {title ?? <>Sleep bestanden hierheen of <span className="text-brand-700 underline">blader</span></>}
      </div>
      {sub && <div className="text-[12.5px] text-neutral-500">{sub}</div>}
      {types && <div className="mt-2 text-[11px] text-neutral-400">{types}</div>}
    </div>
  )
}

export interface FileItemProps {
  name: string
  size?: string
  onRemove?: () => void
  className?: string
}

export function FileItem({ name, size, onRemove, className }: FileItemProps) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-md border border-neutral-200 bg-white px-3 py-2', className)}>
      <FileIcon className="h-4 w-4 shrink-0 text-neutral-400" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">{name}</span>
      {size && <span className="shrink-0 font-mono text-[11px] text-neutral-500">{size}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Verwijderen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
