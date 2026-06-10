import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Datum formattering
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'd MMMM yyyy', { locale: nl })
  } catch {
    return '-'
  }
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd-MM-yyyy', { locale: nl })
  } catch {
    return '-'
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd-MM-yyyy HH:mm', { locale: nl })
  } catch {
    return '-'
  }
}

export function toInputDate(date: string | null | undefined): string {
  if (!date) return ''
  try {
    return format(parseISO(date), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

// Valuta formattering
export function formatCurrency(
  amount: number | null | undefined,
  decimals = 2
): string {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

// Getal formattering
export function formatNumber(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Percentage formattering
export function formatPercentage(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value === null || value === undefined) return '-'
  return `${formatNumber(value, decimals)}%`
}

// Uren formattering
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '-'
  return `${formatNumber(hours, 1)} uur`
}

// Initialen ophalen
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Status kleur helper
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    onderhanden: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    afgerond: 'bg-green-100 text-green-700 border-green-200',
    niet_gecontroleerd: 'bg-gray-100 text-gray-600 border-gray-200',
    goedgekeurd: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    licht: 'bg-green-100 text-green-700 border-green-200',
    matig: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    ernstig: 'bg-orange-100 text-orange-700 border-orange-200',
    kritiek: 'bg-red-100 text-red-700 border-red-200',
  }
  return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200'
}

// Marge kleur
export function getMarginColor(margin: number): string {
  if (margin >= 30) return 'text-green-600'
  if (margin >= 15) return 'text-yellow-600'
  return 'text-red-600'
}

// Uniek ID genereren
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

// Bestand grootte formatteren
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Truncate tekst
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

// Debounce
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return function (...args: Parameters<T>) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Supabase storage URL helper
export function getPublicUrl(supabase: { storage: { from: (bucket: string) => { getPublicUrl: (path: string) => { data: { publicUrl: string } } } } }, bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// Rol label
export function getRolLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    platform_gebruiker: 'Platform-gebruiker',
    app_gebruiker: 'App-gebruiker',
  }
  return labels[role] || role
}
