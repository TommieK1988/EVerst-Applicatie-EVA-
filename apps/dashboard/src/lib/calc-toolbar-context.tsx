'use client'
import React, { createContext, useContext, useState } from 'react'

type CalcToolbarItems = React.ReactNode | null

const CalcToolbarContext = createContext<{
  items: CalcToolbarItems
  setItems: (n: CalcToolbarItems) => void
} | null>(null)

export function CalcToolbarProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CalcToolbarItems>(null)
  return (
    <CalcToolbarContext.Provider value={{ items, setItems }}>
      {children}
    </CalcToolbarContext.Provider>
  )
}

export function useCalcToolbar() {
  return useContext(CalcToolbarContext)
}
