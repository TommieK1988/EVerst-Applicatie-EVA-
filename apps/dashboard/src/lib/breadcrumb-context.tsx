'use client'
import React, { createContext, useContext, useState } from 'react'

/**
 * Het dossier dat nu open staat, voor de ene sync-knop in de topbalk. Elke dossiertab zet dit via
 * `BreadcrumbTitle`, zodat de knop op élk tab op dezelfde plek staat in plaats van per tab een
 * eigen variant.
 */
export type DossierSyncInfo = {
  id: string
  laatsteSync: string | null
  /** Zonder Bouw7-koppeling valt er niets te synchroniseren; dan geen knop. */
  heeftBouw7: boolean
}

const BreadcrumbContext = createContext<{
  recordName: string | null
  setRecordName: (name: string | null) => void
  dossierSync: DossierSyncInfo | null
  setDossierSync: (info: DossierSyncInfo | null) => void
} | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [recordName, setRecordName] = useState<string | null>(null)
  const [dossierSync, setDossierSync] = useState<DossierSyncInfo | null>(null)
  return (
    <BreadcrumbContext.Provider value={{ recordName, setRecordName, dossierSync, setDossierSync }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext)
}
