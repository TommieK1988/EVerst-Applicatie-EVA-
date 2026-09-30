'use client'
import * as React from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@everts/ui'

/** EVA FormField / FormSection / FormRow — Formulierpatronen.html (#01-02). */

/**
 * De toestand van één veld, als kleur.
 *
 * `neutraal` is de standaard en rendert precies als vóór deze prop bestond, zodat
 * elk bestaand formulier in EVA ongemoeid blijft.
 */
export type VeldToon = 'zeker' | 'twijfel' | 'ontbreekt' | 'gedimd' | 'neutraal'

/**
 * Alleen stappen die bestaan (50/100/300/500/700/900) en alleen Tailwind-klassen:
 * die lezen de kanalen `--su-*`/`--wa-*`/`--er-*`, die in donkere modus omkeren.
 * Een inline `var(--xx-800)` doet dat niet -- dat was precies de fout die hiervoor
 * in het behandelscherm zat.
 *
 * `zeker` krijgt bewust géén achtergrondvlak. Op een scherm met dertig velden is
 * groen de normale toestand; zou die ook een vlak krijgen, dan vallen de twee
 * oranje velden waar het om gaat juist niet meer op.
 */
const TOON: Record<VeldToon, { doos: string; label: string }> = {
  zeker:     { doos: 'border-success-300',            label: 'text-success-700' },
  twijfel:   { doos: 'border-warning-300 bg-warning-50', label: 'text-warning-700' },
  ontbreekt: { doos: 'border-error-300 bg-error-50',  label: 'text-error-700' },
  gedimd:    { doos: 'border-transparent opacity-45', label: 'text-neutral-400' },
  neutraal:  { doos: 'border-transparent',            label: '' },
}

export interface FormFieldProps {
  label?: React.ReactNode
  htmlFor?: string
  required?: boolean
  optional?: boolean
  upper?: boolean
  helper?: React.ReactNode
  error?: React.ReactNode
  success?: React.ReactNode
  /** Kleurt het veld naar zijn toestand. Standaard `neutraal` = rendert als voorheen. */
  tone?: VeldToon
  /** Hoveruitleg bij die kleur, bv. "EVA twijfelt (62%)" of "staat al op 20267.00682". */
  toneTitle?: string
  className?: string
  children: React.ReactNode
}

export function FormField({
  label, htmlFor, required, optional, upper, helper, error, success,
  tone = 'neutraal', toneTitle, className, children,
}: FormFieldProps) {
  const toon = TOON[tone]
  return (
    <div className={cn('flex flex-col', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            'mb-1.5 block font-semibold text-neutral-700',
            upper ? 'text-[10.5px] uppercase tracking-[0.08em] text-neutral-500' : 'text-[12.5px]',
            toon.label,
          )}
        >
          {label}
          {required && <span className="ml-[3px] text-error-500">*</span>}
          {optional && <span className="ml-1 text-[11px] font-normal text-neutral-400">optioneel</span>}
        </label>
      )}
      {/*
        De doos om het veld draagt de kleur. `border-transparent` plus een negatieve
        marge betekent dat de rand kan verschijnen zonder dat er iets opschuift --
        zonder die truc verspringt het hele formulier zodra één veld van toestand
        wisselt, en dat is precies wat hier opgelost moet worden.
      */}
      <div
        title={toneTitle}
        className={cn(
          // De negatieve marges compenseren padding én rand exact: 6px padding plus
          // 1px border is 7px horizontaal, 3px plus 1px is 4px verticaal. Zonder die
          // compensatie wordt elk veld in élk formulier van EVA een paar pixels
          // groter, en dat is precies het verspringen dat hier weg moet.
          '-mx-[7px] -my-[4px] rounded-md border px-1.5 py-[3px] transition-colors',
          toon.doos,
        )}
      >
        {children}
      </div>
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
