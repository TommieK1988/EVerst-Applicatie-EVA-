import { cn } from '@/lib/houtrotherstel/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

export default function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  }[size]

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={cn(
          'rounded-full border-blue-600 border-t-transparent animate-spin',
          sizeClass
        )}
        style={{ borderWidth: size === 'lg' ? 3 : 2 }}
      />
      {text && <p className="text-sm text-slate-500">{text}</p>}
    </div>
  )
}

export function PageLoader({ text = 'Laden...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center min-h-64">
      <LoadingSpinner size="lg" text={text} />
    </div>
  )
}
