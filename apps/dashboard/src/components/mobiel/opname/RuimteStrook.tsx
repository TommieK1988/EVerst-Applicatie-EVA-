'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { chip, veld } from './stijl'

/**
 * Ruimtekiezer: chips uit het sjabloon plus een veld voor een eigen naam.
 *
 * Uit `OpnameScherm` gelicht om dat bestand onder de 800 regels te houden.
 *
 * Ruimtenamen uit het sjabloon van kantoor (`vertaalbaar`) worden in de taal van de app getoond;
 * wat de opnemer zelf typte niet. Opgeslagen wordt altijd de originele naam.
 */
export default function RuimteStrook({
  namen,
  vertaalbaar,
  actief,
  onKies,
  eigen,
  onEigen,
  compact = false,
}: {
  namen: string[]
  vertaalbaar: Set<string>
  actief: string
  onKies: (naam: string) => void
  eigen: string
  onEigen: (waarde: string) => void
  compact?: boolean
}) {
  const t = useTranslations('opname')
  const [eigenOpen, setEigenOpen] = React.useState(false)

  return (
    <div style={{ padding: compact ? 0 : '10px 14px 0' }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
        {namen.map(naam => (
          <button key={naam} type="button" style={chip(actief === naam && !eigen)} onClick={() => { onEigen(''); setEigenOpen(false); onKies(naam) }}>
            <RuimteNaam naam={naam} vertaalbaar={vertaalbaar} />
          </button>
        ))}
        <button type="button" style={chip(eigenOpen || !!eigen)} onClick={() => setEigenOpen(v => !v)}>
          {t('ruimte.anders')}
        </button>
      </div>
      {(eigenOpen || eigen) && (
        <input
          type="text"
          value={eigen}
          onChange={e => onEigen(e.target.value)}
          placeholder={t('ruimte.eigenNaam')}
          style={{ ...veld, marginBottom: 8 }}
        />
      )}
    </div>
  )
}

/** Een ruimtenaam: vertaald als hij uit het sjabloon komt, anders precies zoals getypt. */
export function RuimteNaam({ naam, vertaalbaar }: { naam: string; vertaalbaar: Set<string> }) {
  return vertaalbaar.has(naam) ? <VertaalbareTekst tekst={naam} label={false} /> : <>{naam}</>
}
