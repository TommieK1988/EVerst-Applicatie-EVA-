'use client'

import { startOfDay } from 'date-fns'
import type { ReactNode, RefObject } from 'react'
import {
  HEADER_COL_HOOGTE, HEADER_SPAN_HOOGTE, KLEUR, LABEL_W,
} from './constants'
import type { PlanningLayout } from './usePlanningLayout'

export type PlanningShellProps = {
  layout:           PlanningLayout
  /** Geeft de consumer toegang tot het scrollbare gebied (bv. om naar vandaag te scrollen). */
  scrollRef?:       RefObject<HTMLDivElement>
  /** Boven de outer container. Doorgaans de PeriodeNav. */
  toolbar?:         ReactNode
  /** Tussen toolbar en header (bv. PeriodeScrubber in Detailplanning). */
  scrubber?:        ReactNode
  /** Tussen scrubber en header (bv. taken-strip met deadline-markers). */
  preHeaderStrip?:  ReactNode
  /** Sticky-left kolom met rij-labels. Hoogte moet matchen met `bodyHoogte`. */
  labelKolom:       ReactNode
  /** Inhoud van de scrollbare grid-area: bars, drop-zones, dependency-pijlen, … */
  body:             ReactNode
  /** Hoogte van de body in pixels (= som van rij-hoogtes). */
  bodyHoogte:       number
  /** Optioneel onder de outer container (bv. legenda). */
  legenda?:         ReactNode
  /** Optionele extra content als eerste in de label-header-spacer (bv. een kop). */
  labelHeader?:     ReactNode
  /** Custom width voor de label-kolom (default: LABEL_W). */
  labelW?:          number
  /** Vulmodus: de shell vult de beschikbare hoogte en het roostergebied is het enige
   *  scrollvlak (beide assen), met de datumbalk sticky in beeld. Vereist dat de pagina
   *  eromheen zelf niet scrollt — zie `.eva-page-vol` in globals.css. */
  vulHoogte?:       boolean
}

export default function PlanningShell({
  layout, scrollRef, toolbar, scrubber, preHeaderStrip,
  labelKolom, body, bodyHoogte, legenda, labelHeader, labelW = LABEL_W, vulHoogte,
}: PlanningShellProps) {
  const { spans, cols, gridUnits, totalW } = layout

  const headerHoogte = HEADER_SPAN_HOOGTE + HEADER_COL_HOOGTE
  // Gecentreerd op de dagkolom (12:00 → midden van de dag, weekend-bewust).
  const vandaagNoon = startOfDay(new Date()).getTime() + 12 * 3600_000
  const vandaagOffset = layout.xVoor(new Date(vandaagNoon).toISOString())
  const today0 = startOfDay(new Date())
  const toonVandaag = today0 >= startOfDay(layout.vs) && today0 <= startOfDay(layout.ve)

  // In vulmodus is de shell een flex-kolom: alles behalve de scroller houdt zijn
  // eigen hoogte, de scroller krijgt de rest.
  const vast = vulHoogte ? { flexShrink: 0 } : undefined

  return (
    <div style={vulHoogte
      ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }
      : undefined}>
      {toolbar && <div style={vast}>{toolbar}</div>}
      <div style={{
        border: `1px solid ${KLEUR.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: KLEUR.bgElev,
        ...(vulHoogte ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
      }}>
        {scrubber && <div style={vast}>{scrubber}</div>}
        {preHeaderStrip && <div style={vast}>{preHeaderStrip}</div>}

        {/* Eén scroller voor beide assen: datumbalk sticky top, labelkolom sticky left.
            Zonder vulHoogte scrollt alleen de horizontale as (gedrag als voorheen). */}
        <div ref={scrollRef} style={{
          overflow: 'auto',
          ...(vulHoogte ? { flex: 1, minHeight: 0 } : {}),
        }}>
          <div style={{ width: labelW + totalW, minWidth: labelW + totalW, position: 'relative' }}>

            {/* Header-rij — blijft in beeld bij verticaal scrollen */}
            <div style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex' }}>
              <div style={{
                position: 'sticky', left: 0, zIndex: 31,
                width: labelW, flexShrink: 0,
                height: headerHoogte,
                background: KLEUR.bgElev,
                borderRight: `1px solid ${KLEUR.border}`,
                borderBottom: `1px solid ${KLEUR.border}`,
                display: 'flex', alignItems: 'flex-end',
                padding: '0 12px 6px',
                fontSize: 10, fontWeight: 700,
                color: KLEUR.fgMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {labelHeader}
              </div>

              <div style={{ width: totalW, flexShrink: 0 }}>
                {/* Header — spans (boven) */}
                <div style={{
                  position: 'relative', height: HEADER_SPAN_HOOGTE,
                  background: KLEUR.bgElev,
                  borderBottom: `1px solid ${KLEUR.border}`,
                }}>
                  {spans.map(s => (
                    <div key={s.key} style={{
                      position: 'absolute', left: s.left, width: s.width, top: 0, bottom: 0,
                      padding: '4px 8px',
                      fontSize: 10, fontWeight: 700,
                      color: KLEUR.fgMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderRight: `1px solid ${KLEUR.border}`,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {s.label}
                    </div>
                  ))}
                </div>

                {/* Header — cols (onder) */}
                <div style={{
                  position: 'relative', height: HEADER_COL_HOOGTE,
                  background: KLEUR.bgElev,
                  borderBottom: `1px solid ${KLEUR.border}`,
                }}>
                  {cols.map(c => (
                    <div key={c.key} style={{
                      position: 'absolute', left: c.left, width: c.width, top: 0, bottom: 0,
                      textAlign: 'center', padding: '4px 0',
                      fontSize: 9,
                      color: c.isToday ? KLEUR.accent : c.isWeekend ? KLEUR.fgMuted : KLEUR.fgSoft,
                      fontWeight: c.isToday ? 700 : 400,
                      background: c.isToday ? KLEUR.vandaagHeaderBg : 'transparent',
                      borderRight: c.isBorder ? `1px solid ${KLEUR.border}` : 'none',
                      lineHeight: 1.1,
                      overflow: 'visible',
                    }}>
                      {/* Vandaag-vlag chip — DS spec: bovenin de vandaag-kolom */}
                      {c.isToday && (
                        <div style={{
                          position: 'absolute',
                          top: -1,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: 8.5,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '0 0 5px 5px',
                          whiteSpace: 'nowrap',
                          zIndex: 22,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                          lineHeight: 1.4,
                        }}>
                          Vandaag
                        </div>
                      )}
                      <div style={{
                        fontSize: 11,
                        fontWeight: c.isToday ? 700 : 600,
                        color: c.isToday ? KLEUR.accent : c.isWeekend ? KLEUR.fgMuted : KLEUR.fg,
                        lineHeight: 1.1,
                      }}>
                        {c.label}
                      </div>
                      {c.subLabel && (
                        <div style={{ fontSize: 8, color: KLEUR.fgMuted, marginTop: 1 }}>
                          {c.subLabel}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Body-rij — labelkolom sticky left, grid met consumer-content */}
            <div style={{ display: 'flex' }}>
              <div style={{
                position: 'sticky', left: 0, zIndex: 10,
                width: labelW, flexShrink: 0,
                background: KLEUR.bgElev,
                borderRight: `1px solid ${KLEUR.border}`,
              }}>
                {labelKolom}
              </div>

              <div style={{ width: totalW, flexShrink: 0, position: 'relative', height: bodyHoogte }}>
                {/* Grid-units (weekend, today, kolom-borders) */}
                {gridUnits.map(u => {
                  const bg = u.isWeekend ? KLEUR.weekend : u.isToday ? KLEUR.vandaagBg : 'transparent'
                  const border = u.borderStrength === 'major'
                    ? `1px solid ${KLEUR.border}`
                    : u.borderStrength === 'minor'
                      ? '1px solid rgba(0,0,0,0.04)'
                      : 'none'
                  return (
                    <div key={u.key} style={{
                      position: 'absolute', top: 0, height: bodyHoogte,
                      left: u.left, width: u.width,
                      background: bg, borderRight: border,
                      pointerEvents: 'none',
                    }} />
                  )
                })}

                {/* Vandaag-lijn */}
                {toonVandaag && (
                  <div style={{
                    position: 'absolute', top: 0, height: bodyHoogte,
                    left: vandaagOffset, width: 1,
                    background: KLEUR.vandaagLijn, opacity: 0.5,
                    pointerEvents: 'none', zIndex: 3,
                  }} />
                )}

                {/* Consumer-content */}
                {body}
              </div>
            </div>
          </div>
        </div>
      </div>
      {legenda && <div style={vast}>{legenda}</div>}
    </div>
  )
}
