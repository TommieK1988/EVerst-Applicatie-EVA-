'use client'
import * as React from 'react'
import { cn } from '@everts/ui'

/** EVA Skeleton — Feedback en States.html (#05). Shimmer 1.4s, neutral-100→200 gradient. */
function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-shimmer rounded', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, var(--neutral-100) 0%, var(--neutral-200) 50%, var(--neutral-100) 100%)',
        backgroundSize: '200% 100%',
        ...style,
      }}
      {...props}
    />
  )
}

const SkeletonText = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <Skeleton className={cn('h-3', className)} {...p} />
)
const SkeletonTitle = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <Skeleton className={cn('h-[18px]', className)} {...p} />
)
const SkeletonAvatar = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <Skeleton className={cn('h-10 w-10 rounded-full', className)} {...p} />
)
const SkeletonCard = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <Skeleton className={cn('h-[120px] rounded-lg', className)} {...p} />
)

export { Skeleton, SkeletonText, SkeletonTitle, SkeletonAvatar, SkeletonCard }
