'use client'
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Input — Basiscomponenten.html (#02). 36px default, radius 6px, brand focus-ring. */
const inputVariants = cva(
  'w-full bg-white border border-neutral-300 rounded-md text-neutral-900 leading-none outline-none transition-[border-color,box-shadow] [transition-duration:120ms] placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-200 aria-[invalid=true]:border-error-500 aria-[invalid=true]:focus:ring-error-100',
  {
    variants: {
      inputSize: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3 text-[13px]',
        lg: 'h-10 px-3.5 text-sm',
      },
    },
    defaultVariants: { inputSize: 'md' },
  },
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'suffix'>,
    VariantProps<typeof inputVariants> {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize, prefix, suffix, ...props }, ref) => {
    if (prefix || suffix) {
      return (
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-0 top-0 grid h-full w-8 place-items-center text-neutral-500 pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            className={cn(inputVariants({ inputSize }), prefix && 'pl-8', suffix && 'pr-8', className)}
            {...props}
          />
          {suffix && (
            <span className="absolute right-0 top-0 grid h-full w-8 place-items-center text-neutral-500">
              {suffix}
            </span>
          )}
        </div>
      )
    }
    return <input ref={ref} className={cn(inputVariants({ inputSize }), className)} {...props} />
  },
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full min-h-20 px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-[13px] leading-normal resize-y outline-none transition-[border-color,box-shadow] [transition-duration:120ms] placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100 disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Input, Textarea, inputVariants }
