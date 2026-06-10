'use client'
import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@everts/ui'

/** EVA Avatar — Basiscomponenten.html (#09). Radix Avatar, deterministische kleur per naam. */
const avatarVariants = cva(
  'relative inline-grid place-items-center rounded-full overflow-hidden text-white font-bold tracking-[0.02em] shrink-0',
  {
    variants: {
      size: {
        xs: 'h-5 w-5 text-[9px]',
        sm: 'h-6 w-6 text-[10px]',
        md: 'h-8 w-8 text-xs',
        lg: 'h-10 w-10 text-sm',
        xl: 'h-14 w-14 text-lg',
        '2xl': 'h-20 w-20 text-[26px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

// Deterministische gradient per naam (7 varianten, matcht av-c1..c7 uit DS)
const GRADIENTS = [
  'linear-gradient(135deg, #7c3aed, #4c1d95)',
  'linear-gradient(135deg, #2dd4bf, #0f766e)',
  'linear-gradient(135deg, #ef4444, #991b1b)',
  'linear-gradient(135deg, #10b981, #065f46)',
  'linear-gradient(135deg, #f59e0b, #92400e)',
  'linear-gradient(135deg, #3b82f6, #1e40af)',
  'linear-gradient(135deg, #ec4899, #9d174d)',
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h) % GRADIENTS.length
}

type Status = 'online' | 'away' | 'busy' | 'offline'
const STATUS_BG: Record<Status, string> = {
  online: 'bg-success-500',
  away: 'bg-warning-500',
  busy: 'bg-error-500',
  offline: 'bg-neutral-400',
}

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string | null
  name: string
  status?: Status
  colored?: boolean
}

function Avatar({ className, size, src, name, status, colored = true, ...props }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const background = colored && !src ? GRADIENTS[hashName(name)] : undefined

  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ size }), className)}
      style={background ? { background } : undefined}
      {...props}
    >
      {src && (
        <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" />
      )}
      <AvatarPrimitive.Fallback className="grid h-full w-full place-items-center">
        {initials}
      </AvatarPrimitive.Fallback>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-[30%] w-[30%] rounded-full border-2 border-white',
            STATUS_BG[status],
          )}
        />
      )}
    </AvatarPrimitive.Root>
  )
}

function AvatarGroup({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('inline-flex [&>*]:ring-2 [&>*]:ring-white [&>*+*]:-ml-2', className)} {...props}>
      {children}
    </div>
  )
}

export { Avatar, AvatarGroup, avatarVariants }
