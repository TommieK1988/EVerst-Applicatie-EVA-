'use client'
import React from 'react'
import type { DossierRij, DossierSectie } from './types'
import { crewKleur, crewInitialen } from '@/lib/utils/crew'
import { DossierKaartDetail } from './DossierKaartDetail'
import { berekenKaartBedrag } from './kaart-bedrag'
import {
  getKaartIndicatoren, heeftKaartDetail, IndicatorIcoon, TONE_KLEUREN,
  type KaartIndicator,
} from './kaart-indicatoren'

/** Hoe lang de muis moet blijven hangen voordat het detailpaneel uitschuift. */
const OPEN_VERTRAGING_MS = 400
/** Korte sluitvertraging tegen geflikker als de muis net langs de rand van de kaart schuift. */
const SLUIT_VERTRAGING_MS = 120

function formatBedrag(bedrag: number) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(bedrag)
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short',
  })
}

/** Compacte indicator: gekleurd icoon met optioneel een getal. De uitleg staat in het paneel. */
function IndicatorChip({ indicator }: { indicator: KaartIndicator }) {
  const kleur = TONE_KLEUREN[indicator.tone]
  return (
    <span
      aria-label={indicator.uitleg}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        height: 16, padding: indicator.chip ? '0 4px 0 3px' : '0 3px',
        borderRadius: 4, flexShrink: 0,
        color: kleur.fg, background: kleur.bg, border: `1px solid ${kleur.border}`,
        fontSize: 9.5, fontWeight: 700, lineHeight: 1,
      }}
    >
      <IndicatorIcoon soort={indicator.soort} size={10} />
      {indicator.chip}
    </span>
  )
}

/**
 * Eén kaart op het bord.
 *
 * `React.memo`: een bord toont makkelijk 400 kaarten, en zonder memo tekent elke
 * statuswijziging, filterklik of sleepbeweging ze allemaal opnieuw. Dat werkt alleen
 * als de props stabiel zijn — vandaar `onOpen(id)` in plaats van een `onClick`-closure
 * die per render een nieuwe identiteit krijgt. Zie DossierKanban.
 */
export const DossierKaart = React.memo(function DossierKaart({
  dossier, onOpen, sectie, draggingActief = false,
}: {
  dossier: DossierRij
  /** Krijgt het dossier-id; moet stabiel zijn (useCallback) anders werkt de memo niet. */
  onOpen?: (dossierId: string) => void
  sectie?: DossierSectie
  /** Er wordt ergens op het bord gesleept — dan mag geen enkele kaart uitklappen. */
  draggingActief?: boolean
}) {
  const [hovered, setHovered] = React.useState(false)
  const [open,    setOpen]    = React.useState(false)
  /**
   * Is deze kaart ooit uitgeklapt geweest? Het detailpaneel is het duurste stuk van de kaart
   * (notitieblok, bedragen, indicator-uitleg) en stond voorheen voor élke kaart in de DOM —
   * alleen met CSS dichtgeklapt. Bij 400 opdrachten bouwde de browser dus 400 panelen die
   * niemand zag. Nu komt het paneel er pas in zodra je de kaart daadwerkelijk opent, en het
   * blijft daarna staan zodat de dichtklap-animatie nog iets heeft om te tonen.
   */
  const [ooitGeopend, setOoitGeopend] = React.useState(false)

  const kaartRef      = React.useRef<HTMLDivElement>(null)
  const openTimerRef  = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const sluitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const indicatoren = getKaartIndicatoren(dossier, sectie)

  // Aanneemsom + goedgekeurd meerwerk + stelposten buiten de som + gekozen opties, uit dezelfde
  // rekenregel als het Financiële-totalen-blok op het Informatie-tab. Zie ./kaart-bedrag.
  const bedrag      = berekenKaartBedrag(dossier, sectie)
  const toonBedrag  = bedrag.totaalExclBtw
  const heeftDetail = heeftKaartDetail(dossier, indicatoren, bedrag)

  const wisTimers = React.useCallback(() => {
    if (openTimerRef.current)  clearTimeout(openTimerRef.current)
    if (sluitTimerRef.current) clearTimeout(sluitTimerRef.current)
    openTimerRef.current  = null
    sluitTimerRef.current = null
  }, [])

  React.useEffect(() => wisTimers, [wisTimers])

  // Tijdens het slepen mag er niets openstaan: de browser maakt de sleep-afbeelding van de
  // kaart zoals hij op dat moment in de DOM staat.
  React.useEffect(() => {
    if (draggingActief) { wisTimers(); setOpen(false) }
  }, [draggingActief, wisTimers])

  // Staat de kaart onderaan een kolom, dan valt het uitgeklapte paneel buiten de scroll-container.
  // Na de uitklap-animatie minimaal bijscrollen zodat het paneel in beeld komt.
  React.useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      kaartRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 220)
    return () => clearTimeout(t)
  }, [open])

  function handleEnter() {
    setHovered(true)
    if (!heeftDetail || draggingActief) return
    if (sluitTimerRef.current) clearTimeout(sluitTimerRef.current)
    openTimerRef.current = setTimeout(() => { setOoitGeopend(true); setOpen(true) }, OPEN_VERTRAGING_MS)
  }

  function handleLeave() {
    setHovered(false)
    if (openTimerRef.current) clearTimeout(openTimerRef.current)
    sluitTimerRef.current = setTimeout(() => setOpen(false), SLUIT_VERTRAGING_MS)
  }

  // mousedown gaat vooraf aan dragstart: hier sluiten we vóórdat de browser de sleep-afbeelding maakt.
  function handleMouseDown() {
    wisTimers()
    setOpen(false)
  }

  // Voor aanvraag/offerte: toon calculator; anders: projectleider
  const toonCalculator = sectie === 'aanvraag' || sectie === 'offerte'
  const persoonsNaam = toonCalculator
    ? (dossier.calculator_naam ?? dossier.werkvoorbereider_naam ?? '')
    : (dossier.projectleider_naam ?? '')
  const persoonsDbKleur = toonCalculator
    ? (dossier.calculator_kleur ?? dossier.werkvoorbereider_kleur ?? null)
    : (dossier.projectleider_kleur ?? null)
  const persoonsKleur = persoonsDbKleur ?? (persoonsNaam ? crewKleur(crewInitialen(persoonsNaam)) : 'var(--neutral-300)')
  const persoonsInit  = persoonsNaam ? crewInitialen(persoonsNaam) : ''

  const bouw7Url = dossier.bouw7_id
    ? `https://start.bouw7.nl/project/view?id=${dossier.bouw7_id}#/`
    : null

  // Aanvragen-tab: aanmaakdatum dossier. Offerte-tab: datum dat de offerte verzonden is.
  const kaartDatum = sectie === 'offerte'
    ? (dossier.verzonden_op ?? dossier.created_at)
    : dossier.created_at

  return (
    <div
      ref={kaartRef}
      onClick={onOpen ? () => onOpen(dossier.id) : undefined}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        padding: '12px 14px 12px 17px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: hovered ? 'var(--neutral-50)' : 'var(--neutral-0)',
        cursor: 'pointer',
        transition: 'background 0.12s, box-shadow 0.12s, transform 0.12s',
        boxShadow: hovered ? '0 4px 8px -2px rgba(16,24,40,0.10)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* 3px linker accent-strip */}
      <span style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        background: persoonsKleur,
        borderRadius: '0 2px 2px 0',
      }} />

      {/* Compacte body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Dossiernummer + Bouw7-link + bedrag */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              fontSize: 10.5,
              color: 'var(--neutral-400)', letterSpacing: '0.01em',
            }}>
              {dossier.dossiernummer ?? 'Nieuw'}
            </span>
            {bouw7Url && (
              <a
                href={bouw7Url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Openen in Bouw7"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, opacity: 0.4, color: 'var(--neutral-500)',
                  transition: 'opacity 0.12s', flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
            )}
          </div>
          {/* Ook een negatief totaal tonen: per saldo minderwerk is een echte uitkomst. */}
          {toonBedrag != null && toonBedrag !== 0 && (
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: 'var(--neutral-800)', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {formatBedrag(toonBedrag)}
            </span>
          )}
        </div>

        {/* Titel */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--neutral-900)',
          lineHeight: 1.35, letterSpacing: '-0.005em',
        }}>
          {dossier.titel}
        </div>

        {/* Footer: persoons-badge + indicator-chips + datum */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
          {persoonsNaam ? (
            <span
              title={persoonsNaam}
              style={{
                display: 'inline-grid', placeItems: 'center',
                width: 20, height: 20, borderRadius: '50%',
                background: `linear-gradient(135deg, ${persoonsKleur}, ${persoonsKleur}cc)`,
                boxShadow: '0 0 0 1.5px white',
                color: '#fff', fontSize: 8.5, fontWeight: 700, flexShrink: 0,
              }}
            >
              {persoonsInit}
            </span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
            {indicatoren.map(ind => <IndicatorChip key={ind.soort} indicator={ind} />)}
            <span style={{ fontSize: 11, color: 'var(--neutral-400)', whiteSpace: 'nowrap' }}>
              {formatDatum(kaartDatum)}
            </span>
          </div>
        </div>
      </div>

      {/* Uitklappaneel — animeert op hoogte via grid-template-rows (0fr → 1fr) */}
      {heeftDetail && (
        <div style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 180ms ease',
        }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            {ooitGeopend && (
              <DossierKaartDetail dossier={dossier} sectie={sectie} indicatoren={indicatoren} bedrag={bedrag} />
            )}
          </div>
        </div>
      )}
    </div>
  )
})
