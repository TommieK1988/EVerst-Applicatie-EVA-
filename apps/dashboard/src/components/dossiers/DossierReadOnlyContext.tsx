'use client'
import React from 'react'

/**
 * Geeft aan of het huidige dossier **alleen-lezen** is (Financieel afgesloten / Verloren / Vervallen).
 * Wordt op dossier-detailniveau geleverd door `DossierTabContent` en door elk mutatie-onderdeel
 * geconsumeerd om bewerk-/toevoeg-/verwijder-controls te verbergen of te deactiveren. De server-actions
 * hebben daarnaast een eigen vangnet (`assertDossierBewerkbaar`), dus dit is puur de UI-laag.
 */
const DossierReadOnlyContext = React.createContext<boolean>(false)

export function DossierReadOnlyProvider({
  value,
  children,
}: {
  value: boolean
  children: React.ReactNode
}) {
  return <DossierReadOnlyContext.Provider value={value}>{children}</DossierReadOnlyContext.Provider>
}

/** True wanneer het geopende dossier alleen-lezen is. Buiten een provider standaard `false`. */
export function useDossierReadOnly(): boolean {
  return React.useContext(DossierReadOnlyContext)
}
