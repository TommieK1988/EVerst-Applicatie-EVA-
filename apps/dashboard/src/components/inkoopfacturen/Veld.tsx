'use client'

import React from 'react'

/**
 * Eén gegeven van een inkoopfactuur: label (UPPERCASE 10,5px, zoals `FormField upper`) boven de
 * waarde. Leest op een smal paneel beter dan label en waarde naast elkaar.
 */
export default function Veld({ label, children, breed }: { label: string; children: React.ReactNode; breed?: boolean }) {
  return (
    <div className={breed ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">{label}</div>
      <div className="break-words text-[13px] text-neutral-900">{children}</div>
    </div>
  )
}
