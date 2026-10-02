'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { bedrijfsagendaTypeLabels, medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'

type TypeSleutel =
  | 'verlof' | 'ziek' | 'training' | 'overig' | 'afwezig'
  | 'vcaToolbox' | 'audit' | 'teamoverleg' | 'activiteit' | 'herinnering' | 'atvDag' | 'agenda'
  | 'feestdag' | 'jubileum' | 'verjaardag' | 'werk' | 'deadline'

/**
 * De datalaag (`lib/agenda/mijn-agenda.ts`, ook gebruikt door de home) levert het type als
 * Nederlands label. De vaste labels (afwezigheid, bedrijfsagenda, feestdag, deadline …)
 * vertalen we hier via de taalbestanden; een uursoortnaam van kantoor gaat door
 * `VertaalbareTekst`.
 */
const VASTE_TYPES: Record<string, TypeSleutel> = {
  [medewerkerAfwezigheidLabels.verlof]: 'verlof',
  [medewerkerAfwezigheidLabels.ziek]: 'ziek',
  [medewerkerAfwezigheidLabels.training]: 'training',
  [medewerkerAfwezigheidLabels.overig]: 'overig',
  [bedrijfsagendaTypeLabels.vca_toolbox]: 'vcaToolbox',
  [bedrijfsagendaTypeLabels.audit]: 'audit',
  [bedrijfsagendaTypeLabels.teamoverleg]: 'teamoverleg',
  [bedrijfsagendaTypeLabels.activiteit]: 'activiteit',
  [bedrijfsagendaTypeLabels.herinnering]: 'herinnering',
  [bedrijfsagendaTypeLabels.atv_dag]: 'atvDag',
  [bedrijfsagendaTypeLabels.overig]: 'overig',
  Afwezig: 'afwezig',
  Agenda: 'agenda',
  Feestdag: 'feestdag',
  Jubileum: 'jubileum',
  Verjaardag: 'verjaardag',
  Werk: 'werk',
  Deadline: 'deadline',
}

/** Vertaalt een vast typelabel; null als het geen vast label is (bijv. een uursoortnaam). */
export function useVastTypeLabel(): (tekst: string) => string | null {
  const t = useTranslations('planning')
  return (tekst) => {
    const sleutel = VASTE_TYPES[tekst]
    return sleutel ? t(`type.${sleutel}`) : null
  }
}

/** Typelabel of afwezigheidstitel van een agenda-item, in de taal van de app. */
export default function AgendaTypeLabel({ tekst, style }: { tekst: string; style?: React.CSSProperties }) {
  const vast = useVastTypeLabel()(tekst)
  if (vast) return <span style={style}>{vast}</span>
  return <VertaalbareTekst tekst={tekst} label={false} style={style} />
}
