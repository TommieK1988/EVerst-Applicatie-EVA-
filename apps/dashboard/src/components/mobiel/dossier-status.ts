import {
  getDossierSubstatus,
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_STATUSSEN,
} from '@/components/dossiers/types'
import type { Dossier } from '@everts/database'

const ALLE_STATUSSEN = [
  ...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN, ...SERVICEDESK_STATUSSEN,
]

/**
 * Label + kleur voor een dossier-substatus (mobiele StatusBadge).
 * Concrete hex-kleuren zodat color-mix in elke scope werkt.
 */
export function dossierStatusBadge(dossier: Dossier): { label: string; color: string } {
  const s = getDossierSubstatus(dossier)
  const label = ALLE_STATUSSEN.find(x => x.key === s)?.label ?? s
  const color =
    ['verloren', 'vervallen', 'afgewezen'].includes(s) ? '#e8453b' :
    ['gewonnen', 'offerte_gereed', 'financieel_afgesloten'].includes(s) ? '#009439' :
    ['verzonden', 'nabellen', 'in_behandeling', 'mondelinge_toezegging', 'onderhanden', 'uitvoering_gereed'].includes(s) ? '#2e90fa' :
    '#6b757c'
  return { label, color }
}
