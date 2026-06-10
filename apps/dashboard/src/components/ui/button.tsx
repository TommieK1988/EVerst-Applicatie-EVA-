'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/**
 * EVA Button — 1-op-1 met EVA Basiscomponenten.html (#01).
 * radius 6px, font-weight 600, border-first, focus-ring brand-100.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent font-semibold leading-none whitespace-nowrap select-none cursor-pointer transition-[background,border-color,color,box-shadow] [transition-duration:120ms] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-500 text-white border-brand-500 hover:bg-brand-600 hover:border-brand-600 active:bg-brand-700 active:border-brand-700 disabled:bg-brand-200 disabled:border-brand-200',
        secondary:
          'bg-neutral-100 text-neutral-900 border-neutral-100 hover:bg-neutral-200 hover:border-neutral-200 active:bg-neutral-300 active:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-400',
        outline:
          'bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50 hover:border-neutral-400 active:bg-neutral-100 disabled:text-neutral-400 disabled:border-neutral-200',
        ghost:
          'bg-transparent text-neutral-700 border-transparent hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 disabled:text-neutral-400 disabled:bg-transparent',
        destructive:
          'bg-error-500 text-white border-error-500 hover:bg-error-700 hover:border-error-700 active:bg-error-900 active:border-error-900 disabled:bg-error-300 disabled:border-error-300 focus-visible:ring-error-100',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-10 px-4 text-sm',
        'icon-sm': 'h-7 w-7 p-0',
        'icon-md': 'h-8 w-8 p-0',
        'icon-lg': 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && (
              <span className="h-[13px] w-[13px] rounded-full border-2 border-current border-r-transparent animate-spin" />
            )}
            {children}
          </>
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
