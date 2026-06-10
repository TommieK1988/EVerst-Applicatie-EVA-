'use client'
import * as React from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA FormField / FormSection / FormRow — Formulierpatronen.html (#01-02). */

export interface FormFieldProps {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  optional?: boolean
  upper?: boolean
  helper?: React.ReactNode
  error?: React.ReactNode
  success?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function FormField({
  label, htmlFor, required, optional, upper, helper, error, success, className, children,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            'mb-1.5 block font-semibold text-neutral-700',
            upper ? 'text-[10.5px] uppercase tracking-[0.08em] text-neutral-500' : 'text-[12.5px]',
          )}
        >
          {label}
          {required && <span className="ml-[3px] text-error-500">*</span>}
          {optional && <span className="ml-1 text-[11px] font-normal text-neutral-400">optioneel</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-[5px] flex items-start gap-[5px] text-[11.5px] leading-tight text-error-700">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : success ? (
        <p className="mt-[5px] flex items-start gap-[5px] text-[11.5px] leading-tight text-success-700">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          {success}
        </p>
      ) : helper ? (
        <p className="mt-[5px] text-[11.5px] leading-tight text-neutral-500">{helper}</p>
      ) : null}
    </div>
  )
}

export function FormSection({
  title, description, children, className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-7 last:mb-0', className)}>
      <div className="mb-[18px] flex items-baseline gap-3 border-b border-neutral-200 pb-3">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        {description && <span className="text-xs text-neutral-500">{description}</span>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export function FormRow({
  cols = '2', className, children,
}: {
  cols?: '2' | '3' | '1-2' | '2-1'
  className?: string
  children: React.ReactNode
}) {
  const tmpl = {
    '2': 'grid-cols-2',
    '3': 'grid-cols-3',
    '1-2': 'grid-cols-[1fr_2fr]',
    '2-1': 'grid-cols-[2fr_1fr]',
  }[cols]
  return <div className={cn('grid gap-4', tmpl, className)}>{children}</div>
}
