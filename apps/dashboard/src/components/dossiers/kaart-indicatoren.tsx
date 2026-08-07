'use client'
import React from 'react'
import { IconClock, IconEuro, IconWarn, IconSend, IconAgenda, IconTaken, IconNotitie } from '@/components/eva/Icons'
import { isDossierAfgesloten } from './types'
import type { DossierRij, DossierSectie } from './types'
import type { KaartBedrag } from './kaart-bedrag'

/**
 * Eén bron voor de kanban-kaart-indicatoren: de compacte kaart rendert ze als icoon-chip,
 * het uitklappaneel rendert dezelfde lijst als regel met volledige uitleg. Zo kunnen de chip
 * en de uitleg niet uit elkaar lopen.
 */

export type IndicatorSoort = 'uren' | 'begroting' | 'wb' | 'verstuurd' | 'deadline' | 'notitie' | 'taken'
export type IndicatorTone = 'error' | 'warning' | 'info' | 'neutral'

export type KaartIndicator = {
  soort: IndicatorSoort
  tone: IndicatorTone
  /** Kort label naast het icoon op de chip. Leeg = alleen het icoon. */
  chip?: string
  /** Volledige uitleg in het uitklappaneel. */
  uitleg: string
  /**
   * Het uitklappaneel toont deze indicator als eigen blok in plaats van als uitleg-regel — voor
   * signalen met echte inhoud (de notitie), die meer ruimte nodig hebben dan één zin.
   */
  eigenBlok?: boolean
}

const ICONEN: Record<IndicatorSoort, (p: { size?: number }) => React.ReactElement> = {
  uren:      IconClock,
  begroting: IconEuro,
  wb:        IconWarn,
  verstuurd: IconSend,
  deadline:  IconAgenda,
  notitie:   IconNotitie,
  taken:     IconTaken,
}

export const TONE_KLEUREN: Record<IndicatorTone, { fg: string; bg: string; border: string }> = {
  error:   { fg: 'var(--error-600, #d9534f)',   bg: 'var(--error-50, #fef2f2)',   border: 'var(--error-200, #fecaca)'   },
  warning: { fg: 'var(--warning-600, #d97706)', bg: 'var(--warning-50, #fffbeb)', border: 'var(--warning-200, #fde68a)' },
  info:    { fg: 'var(--primary-700, #1d4ed8)', bg: 'var(--primary-50, #eff6ff)', border: 'var(--primary-200, #bfdbfe)' },
  neutral: { fg: 'var(--neutral-600)',          bg: 'var(--neutral-100)',         border: 'var(--neutral-200)'          },
}

export function IndicatorIcoon({ soort, size = 12 }: { soort: IndicatorSoort; size?: number }) {
  const Icoon = ICONEN[soort]
  return <Icoon size={size} />
}

/** True als de datum in het verleden ligt. */
export function isVerlopen(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return !isNaN(d.getTime()) && d < new Date()
}

/** Hele dagen tussen vandaag en `iso` (negatief = verstreken). */
function dagenTot(iso: string): number | null {
  const doel = new Date(iso)
  if (isNaN(doel.getTime())) return null
  doel.setHours(0, 0, 0, 0)
  const vandaag = new Date()
  vandaag.setHours(0, 0, 0, 0)
  return Math.round((doel.getTime() - vandaag.getTime()) / 86_400_000)
}

function datumKort(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function dagenTekst(n: number): string {
  return n === 1 ? '1 dag' : `${n} dagen`
}

/** Leidt de indicatoren af die voor dit dossier gelden, in volgorde van urgentie. */
export function getKaartIndicatoren(d: DossierRij, sectie?: DossierSectie): KaartIndicator[] {
  const indicatoren: KaartIndicator[] = []

  if (d.bouw7_uren_overschrijding) {
    indicatoren.push({
      soort: 'uren', tone: 'error',
      uitleg: 'Arbeid: de uren op 100% overschrijden de prognose-uren.',
    })
  }

  if (d.bouw7_bestelregels_afwijking) {
    indicatoren.push({
      soort: 'begroting', tone: 'warning',
      uitleg: 'Bestelregels sluiten niet aan op de prognose — projectleider: laat de werkbegroting goedkeuren.',
    })
  }

  if (d.wb_ongeaccordeerde_wijzigingen) {
    indicatoren.push({
      soort: 'wb', tone: 'warning',
      uitleg: 'De werkbegroting bevat niet-geaccordeerde wijzigingen — laat de werkbegroting opnieuw accorderen.',
    })
  }

  const verstuurdAantal = d.offerte_verstuurd_aantal ?? 0
  if (sectie === 'offerte' && verstuurdAantal > 1 && d.offerte_verstuurd_som_excl_btw != null) {
    indicatoren.push({
      soort: 'verstuurd', tone: 'info', chip: String(verstuurdAantal),
      uitleg: `${verstuurdAantal} offertes staan op status Verstuurd — het bedrag op de kaart is het totaal excl. btw.`,
    })
  }

  // Deadline-signaal alleen bij een lopend dossier: op een afgesloten dossier is een
  // verstreken deadline geen actiepunt meer.
  const deadline = d.deadline ?? d.verwacht_einddatum
  const dagen = deadline && !isDossierAfgesloten(d) ? dagenTot(deadline) : null
  if (deadline && dagen != null) {
    if (dagen < 0) {
      indicatoren.push({
        soort: 'deadline', tone: 'error',
        uitleg: `Deadline verstreken op ${datumKort(deadline)} — ${dagenTekst(Math.abs(dagen))} geleden.`,
      })
    } else if (dagen <= 7) {
      indicatoren.push({
        soort: 'deadline', tone: 'warning', chip: `${dagen}d`,
        uitleg: dagen === 0
          ? `De deadline is vandaag (${datumKort(deadline)}).`
          : `Deadline over ${dagenTekst(dagen)} — ${datumKort(deadline)}.`,
      })
    }
  }

  // Notitie-signaal: op de kaart alleen het icoon (met het aantal bij meer dan één); de nieuwste
  // notitie zelf staat in het uitklappaneel.
  const notitieAantal = d.notitie_aantal ?? 0
  if (sectie === 'offerte' && notitieAantal > 0) {
    indicatoren.push({
      soort: 'notitie', tone: 'info', eigenBlok: true,
      chip: notitieAantal > 1 ? String(notitieAantal) : undefined,
      uitleg: notitieAantal === 1
        ? 'Er staat een notitie op dit dossier.'
        : `Er staan ${notitieAantal} notities op dit dossier — hieronder de nieuwste.`,
    })
  }

  const takenTotaal = d.taken_totaal ?? 0
  if (takenTotaal > 0) {
    const takenOpen = d.taken_open ?? 0
    indicatoren.push({
      soort: 'taken', tone: 'neutral', chip: `${takenOpen}/${takenTotaal}`,
      uitleg: takenOpen === 0
        ? `Alle ${takenTotaal} acties zijn afgerond.`
        : `${takenOpen} van de ${takenTotaal} acties staan nog open.`,
    })
  }

  return indicatoren
}

/**
 * True als er genoeg extra informatie is om het uitklappaneel te vullen. De aanmaakdatum telt
 * niet mee — die staat al op de compacte kaart — zodat een kaal dossier niet opengaat met een
 * paneel waar niets in staat.
 */
export function heeftKaartDetail(
  d: DossierRij,
  indicatoren: KaartIndicator[],
  bedrag?: KaartBedrag,
): boolean {
  return (
    indicatoren.length > 0 ||
    !!d.klant_naam ||
    !!d.deadline ||
    !!d.verwacht_startdatum ||
    !!d.verwacht_einddatum ||
    !!d.verzonden_op ||
    // Er valt iets uit te splitsen (meerwerk/stelposten/opties) of er is een kostprijs om de
    // marge mee te tonen.
    !!bedrag?.heeftOpbouw ||
    (bedrag?.kostprijs != null && bedrag.kostprijs > 0) ||
    (d.kostprijs_excl_btw != null && d.kostprijs_excl_btw > 0)
  )
}
