'use client'

import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { GripVertical, Trash2 } from 'lucide-react'

import type { MedewerkerRooster } from '@everts/database/platform-types'
import {
  DAG_MS, buitenRooster,
  type BlokInterval, type ConflictDetail, type EntryMetDossier,
} from './conflict'

const LABEL_W = 96   // breedte van de naamkolom links van de tijdlijn
const LANE_H  = 40   // hoogte van één sleepbare baan

type Venster = { vanMs: number; totMs: number; van: Date; tot: Date }

type Props = {
  /** De rijen in volgorde van de banen; elke rij is één balk. */
  rijen:        EntryMetDossier[]
  /** De rij zoals hij nu staat, inclusief nog niet opgeslagen wijzigingen. */
  draftVan:     (id: string) => EntryMetDossier
  /** Id's die als verwijderd zijn gemarkeerd — die balk is grijs en niet sleepbaar. */
  verwijderdSet: Set<string>
  /** Werk van deze medewerker buiten dit venster, als lichte band ter oriëntatie. */
  contextWerk:  EntryMetDossier[]
  blokken:      BlokInterval[]
  roosters:     MedewerkerRooster[]
  resterend:    ConflictDetail[]
  venster:      Venster
  dagenVenster: Date[]
  uurLijnen:    number[]
  spanMs:       number
  labelElke:    number
  pct:          (ms: number) => number
  titelVan:     (e: EntryMetDossier) => string
  korteNaam:    (e: EntryMetDossier) => string
  kleurVan:     (e: EntryMetDossier) => string
  fmt:          (ms: number) => string
  sleeptId:     string | null
  stripRef:     React.Ref<HTMLDivElement>
  barPointerDown: (e: React.PointerEvent, entry: EntryMetDossier) => void
  barPointerMove: (e: React.PointerEvent) => void
  barPointerUp:   () => void
}

/**
 * De sleepbare tijdlijn van het conflictvenster: dag-as, naamkolom en één baan per rij,
 * met de blok-periodes, de resterende botsingen en de balken zelf. Alleen weergave —
 * het rekenwerk en de draft blijven in ConflictOplosDialog.
 */
export default function ConflictTijdlijn({
  rijen, draftVan, verwijderdSet, contextWerk, blokken, roosters, resterend,
  venster, dagenVenster, uurLijnen, spanMs, labelElke, pct,
  titelVan, korteNaam, kleurVan, fmt,
  sleeptId, stripRef, barPointerDown, barPointerMove, barPointerUp,
}: Props) {
  return (
    <>
      {/* Dag-as */}
      <div style={{ display: 'flex', marginBottom: 2 }}>
        <span style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ position: 'relative', flex: 1, height: 14 }}>
          {dagenVenster.map((d, i) => (
            i % labelElke === 0 ? (
              <span key={i} style={{
                position: 'absolute', left: `${pct(d.getTime())}%`,
                fontSize: 9, color: 'var(--fg-muted)', whiteSpace: 'nowrap', paddingLeft: 3,
              }}>
                {format(d, 'EEE d', { locale: nl })}
              </span>
            ) : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex' }}>
        {/* Naamkolom */}
        <div style={{ width: LABEL_W, flexShrink: 0 }}>
          {rijen.map((e, i) => (
            <div key={e.id} title={titelVan(e)} style={{
              height: LANE_H, display: 'flex', alignItems: 'center', gap: 6,
              borderBottom: i < rijen.length - 1 ? '1px solid var(--border)' : 'none',
              paddingRight: 6,
            }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: kleurVan(e), flexShrink: 0 }} />
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--fg)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textDecoration: verwijderdSet.has(e.id) ? 'line-through' : 'none',
                opacity: verwijderdSet.has(e.id) ? 0.55 : 1,
              }}>
                {korteNaam(e)}
              </span>
            </div>
          ))}
        </div>

        {/* Tijdlijn met sleepbare balken */}
        <div
          ref={stripRef}
          style={{
            position: 'relative', flex: 1, height: rijen.length * LANE_H,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
            overflow: 'hidden', touchAction: 'none',
          }}
        >
          {/* Dag-achtergrond: buiten rooster grijs, dag-scheidingslijnen */}
          {dagenVenster.map((d, i) => (
            <div key={`dag-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(d.getTime())}%`, width: `${(DAG_MS / spanMs) * 100}%`,
              background: buitenRooster(d, roosters) ? 'rgba(0,0,0,0.06)' : 'transparent',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              zIndex: 0,
            }} />
          ))}

          {/* Uurlijnen (bij inzoomen) */}
          {uurLijnen.map((t, i) => (
            <div key={`uur-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0, left: `${pct(t)}%`, width: 0,
              borderLeft: '1px dashed var(--border)', opacity: 0.5, zIndex: 0,
            }} />
          ))}

          {/* Blok-periodes (verlof/feestdag/ATV) */}
          {blokken.filter(b => b.s < venster.totMs && b.e > venster.vanMs).map((b, i) => (
            <div key={`blok-${i}`} title={b.label} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(Math.max(b.s, venster.vanMs))}%`,
              width: `${pct(Math.min(b.e, venster.totMs)) - pct(Math.max(b.s, venster.vanMs))}%`,
              background: 'rgba(248,113,113,0.18)', zIndex: 1,
            }} />
          ))}

          {/* Context: niet-cluster werk als lichte band, over de volle hoogte */}
          {contextWerk.map(e => {
            const s = parseISO(e.start_dt).getTime()
            const en = parseISO(e.eind_dt).getTime()
            const l = pct(Math.max(s, venster.vanMs))
            const w = Math.max(0.5, pct(Math.min(en, venster.totMs)) - l)
            return (
              <div key={`ctx-${e.id}`} title={`${titelVan(e)} (andere planning)`} style={{
                position: 'absolute', top: 0, bottom: 0, left: `${l}%`, width: `${w}%`,
                background: 'rgba(100,116,139,0.16)',
                borderLeft: '1px dashed rgba(100,116,139,0.5)',
                borderRight: '1px dashed rgba(100,116,139,0.5)',
                zIndex: 1,
              }} />
            )
          })}

          {/* Baan-scheidingslijnen */}
          {rijen.slice(1).map((_, i) => (
            <div key={`lane-${i}`} style={{
              position: 'absolute', left: 0, right: 0, top: (i + 1) * LANE_H,
              height: 1, background: 'var(--border)', zIndex: 2,
            }} />
          ))}

          {/* Resterende conflicten — rode band over de volle hoogte */}
          {resterend.filter(c => c.s < venster.totMs && c.e > venster.vanMs).map((c, i) => (
            <div key={`seg-${i}`} title="Overlap" style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(Math.max(c.s, venster.vanMs))}%`,
              width: `${Math.max(0.6, pct(Math.min(c.e, venster.totMs)) - pct(Math.max(c.s, venster.vanMs)))}%`,
              background: 'rgba(239,68,68,0.20)',
              borderLeft: '1px solid rgba(239,68,68,0.75)',
              borderRight: '1px solid rgba(239,68,68,0.75)',
              boxShadow: '0 0 7px 1px rgba(239,68,68,0.45)',
              pointerEvents: 'none', zIndex: 3,
            }} />
          ))}

          {/* Sleepbare balken, elk in eigen baan */}
          {rijen.map((e, i) => {
            const d  = draftVan(e.id)
            const s  = parseISO(d.start_dt).getTime()
            const en = parseISO(d.eind_dt).getTime()
            const l  = pct(Math.max(s, venster.vanMs))
            const w  = Math.max(1.2, pct(Math.min(en, venster.totMs)) - l)
            const actief = sleeptId === e.id
            const weg    = verwijderdSet.has(e.id)
            return (
              <div
                key={`bar-${e.id}`}
                onPointerDown={weg ? undefined : ev => barPointerDown(ev, e)}
                onPointerMove={weg ? undefined : barPointerMove}
                onPointerUp={weg ? undefined : barPointerUp}
                title={weg
                  ? `${titelVan(e)}\nWordt verwijderd bij Toepassen`
                  : `${titelVan(e)} · ${fmt(s)} – ${fmt(en)}\nSleep om te verschuiven`}
                style={{
                  position: 'absolute',
                  top: i * LANE_H + 6, height: LANE_H - 12,
                  left: `${l}%`, width: `${w}%`,
                  borderRadius: 5, background: kleurVan(e),
                  boxShadow: actief ? '0 4px 14px rgba(0,0,0,0.35)' : '0 1px 2px rgba(0,0,0,0.15)',
                  cursor: weg ? 'default' : actief ? 'grabbing' : 'grab',
                  display: 'flex', alignItems: 'center', gap: 2,
                  paddingLeft: 4, paddingRight: 4, overflow: 'hidden',
                  userSelect: 'none', touchAction: 'none',
                  zIndex: actief ? 6 : 5,
                  outline: actief ? '2px solid rgba(255,255,255,0.8)' : 'none',
                  opacity: weg ? 0.35 : 1,
                  filter: weg ? 'grayscale(1)' : 'none',
                }}
              >
                {weg
                  ? <Trash2 size={12} color="rgba(255,255,255,0.9)" style={{ flexShrink: 0 }} />
                  : <GripVertical size={12} color="rgba(255,255,255,0.9)" style={{ flexShrink: 0 }} />}
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'white',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textDecoration: weg ? 'line-through' : 'none',
                }}>
                  {format(s, 'HH:mm', { locale: nl })}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
