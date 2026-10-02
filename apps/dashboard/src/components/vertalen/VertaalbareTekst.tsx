'use client'

import React, { useState } from 'react'
import { Languages } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useVertaling } from './useVertaling'

/**
 * Een tekst van kantoor (taakomschrijving, notitie, melding, handboek) in de taal van de
 * app. Staat de app op Nederlands, dan is dit gewoon de tekst.
 *
 * Onder een vertaalde tekst staat "Automatisch vertaald · Toon origineel": het Nederlands
 * is altijd één tik weg. Dat is bewust, ook voor veiligheidsteksten — een machinevertaling
 * is een leeshulp, geen vervanging.
 *
 *   <VertaalbareTekst tekst={taak.omschrijving} />
 *   <VertaalbareTekst tekst={melding.titel} label={false} />   // zonder label (bijv. in een lijst)
 *
 * `children` als render-functie wanneer de tekst zelf opgemaakt moet worden (Markdown e.d.):
 *   <VertaalbareTekst tekst={md}>{(t) => <Markdown>{t}</Markdown>}</VertaalbareTekst>
 */
export default function VertaalbareTekst({
  tekst,
  label = true,
  as: Element = 'span',
  style,
  className,
  children,
}: {
  tekst: string | null | undefined
  /** Toon het label "Automatisch vertaald · Toon origineel". Uit voor korte teksten in lijsten. */
  label?: boolean
  as?: 'span' | 'div' | 'p'
  style?: React.CSSProperties
  className?: string
  children?: (tekst: string) => React.ReactNode
}) {
  const v = useVertaling(tekst)
  const [origineel, setOrigineel] = useState(false)
  const toon = origineel ? v.origineel : v.tekst
  const inhoud = children ? children(toon) : toon

  if (!v.vertaald || !label) {
    return <Element style={style} className={className}>{inhoud}</Element>
  }

  return (
    <Element style={style} className={className}>
      {inhoud}
      <VertaalLabel origineel={origineel} wissel={() => setOrigineel((o) => !o)} />
    </Element>
  )
}

/** Het kleine label onder een vertaalde tekst. Los te gebruiken bij een eigen weergave. */
export function VertaalLabel({ origineel, wissel }: { origineel: boolean; wissel: () => void }) {
  const t = useTranslations('vertalen')
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
      <Languages size={12} aria-hidden style={{ color: '#6b757c', flexShrink: 0 }} />
      <span style={{ fontSize: 11.5, color: '#6b757c' }}>
        {origineel ? t('origineelNederlands') : t('automatischVertaald')}
      </span>
      <span aria-hidden style={{ fontSize: 11.5, color: '#6b757c' }}>·</span>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); wissel() }}
        style={{
          background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
          fontSize: 11.5, fontWeight: 600, color: '#00762e', textDecoration: 'underline',
        }}
      >
        {origineel ? t('toonVertaling') : t('toonOrigineel')}
      </button>
    </span>
  )
}
