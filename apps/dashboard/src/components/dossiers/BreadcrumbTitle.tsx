'use client'
import { useEffect } from 'react'
import { useBreadcrumb } from '@/lib/breadcrumb-context'

export function BreadcrumbTitle({ title }: { title: string }) {
  const ctx = useBreadcrumb()
  useEffect(() => {
    ctx?.setRecordName(title)
    return () => ctx?.setRecordName(null)
  }, [title, ctx])
  return null
}
