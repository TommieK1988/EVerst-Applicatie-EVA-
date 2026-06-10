'use client'
import React, { createContext, useContext, useState } from 'react'

const BreadcrumbContext = createContext<{
  recordName: string | null
  setRecordName: (name: string | null) => void
} | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [recordName, setRecordName] = useState<string | null>(null)
  return (
    <BreadcrumbContext.Provider value={{ recordName, setRecordName }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext)
}
