'use client'

import { format, parseISO } from 'date-fns'
import { RotateCcw, Scissors, Trash2 } from 'lucide-react'

import type { EntryMetDossier } from './conflict'
import { verschuifTs } from './layout/index'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

type Props = {
  /** De rij zoals hij is opgeslagen — voor de vergelijking met de draft. */
  rij:            EntryMetDossier
  /** Dezelfde rij mét de nog niet opgeslagen wijzigingen erop. */
  d:              EntryMetDossier
  isDeel:         boolean
  gewijzigd:      boolean
  weg:            boolean
  heeftKind:      boolean
  kanSplitsen:    boolean
  /** Uren die door het knippen vervallen; 0 als er niets is weggeknipt. */
  geknipteUren:   number
  titel:          string
  kleur:          string
  zetTijden:      (id: string, start: Date, eind: Date) => void
  splits:         (id: string) => void
  herstelRij:     (id: string) => void
  herstelSplitsing: (tempId: string) => void
  markeerVerwijderen: (id: string) => void
  herstelVerwijderen: (id: string) => void
}

/**
 * Eén regel in "Verschuiven, splitsen of verwijderen": de knoppen plus de datum- en
 * tijdvelden van dat planitem. Apart gehouden zodat het dialoogbestand leesbaar blijft.
 */
export default function ConflictRegelKaart({
  rij, d, isDeel, gewijzigd, weg, heeftKind, kanSplitsen, geknipteUren, titel, kleur,
  zetTijden, splits, herstelRij, herstelSplitsing, markeerVerwijderen, herstelVerwijderen,
}: Props) {
  const startDt = parseISO(d.start_dt)
  const eindDt  = parseISO(d.eind_dt)
  const zetVelden = (patch: Partial<{ sd: string; st: string; ed: string; et: string }>) => {
    const sd = patch.sd ?? format(startDt, 'yyyy-MM-dd')
    const st = patch.st ?? format(startDt, 'HH:mm')
    const ed = patch.ed ?? format(eindDt,  'yyyy-MM-dd')
    const et = patch.et ?? format(eindDt,  'HH:mm')
    zetTijden(rij.id, new Date(`${sd}T${st}`), new Date(`${ed}T${et}`))
  }
  const verschuifDagen = (dagen: number) => {
    zetTijden(
      rij.id,
      parseISO(verschuifTs(d.start_dt, dagen)),
      parseISO(verschuifTs(d.eind_dt, dagen)),
    )
  }

  return (
    <div style={{
      border: `1px solid ${weg ? 'rgba(239,68,68,0.5)' : isDeel ? 'rgba(37,99,235,0.45)' : 'var(--border)'}`,
      background: weg ? 'rgba(239,68,68,0.06)' : isDeel ? 'rgba(37,99,235,0.05)' : 'transparent',
      borderRadius: 8, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: 3, background: kleur, flexShrink: 0,
          opacity: weg ? 0.4 : 1,
        }} />
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--fg)', minWidth: 0, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          textDecoration: weg ? 'line-through' : 'none',
          opacity: weg ? 0.6 : 1,
        }}>
          {isDeel && <span style={{ color: '#2563eb', fontWeight: 700 }}>Los deel · </span>}
          {titel}
        </div>
        <span style={{ fontSize: 10, color: 'var(--fg-muted)', flexShrink: 0 }}>{d.uren}u</span>
        {weg ? (
          <button
            type="button"
            onClick={() => herstelVerwijderen(rij.id)}
            className="eva-btn-ghost"
            style={{ padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            <RotateCcw size={11} /> Herstel
          </button>
        ) : (
          <>
            {gewijzigd && (
              <button
                type="button"
                onClick={() => herstelRij(rij.id)}
                className="eva-btn-ghost"
                style={{ padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              >
                <RotateCcw size={11} /> Herstel
              </button>
            )}
            {isDeel && !heeftKind && (
              <button
                type="button"
                onClick={() => herstelSplitsing(rij.id)}
                className="eva-btn-ghost"
                title="De splitsing terugdraaien: dit deel vervalt en het item wordt weer één geheel"
                style={{ padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              >
                <RotateCcw size={11} /> Samenvoegen
              </button>
            )}
            <button
              type="button"
              onClick={() => splits(rij.id)}
              disabled={!kanSplitsen}
              className="eva-btn-ghost"
              title={kanSplitsen
                ? 'Knip het dubbel geplande stuk uit dit item; wat vrij staat blijft precies staan'
                : 'Splitsen kan alleen als een deel van dit item buiten de botsing valt'}
              style={{
                padding: '2px 6px', fontSize: 10,
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                opacity: kanSplitsen ? 1 : 0.4,
                cursor: kanSplitsen ? 'pointer' : 'not-allowed',
              }}
            >
              <Scissors size={11} /> Splitsen
            </button>
            {/* Een los deel "verwijder" je door het weer samen te voegen: de uren
                horen dan terug bij het item waar het uit geknipt is. */}
            {!isDeel && (
              <button
                type="button"
                onClick={() => markeerVerwijderen(rij.id)}
                className="eva-btn-ghost"
                title="Dit planitem verwijderen in plaats van verschuiven"
                style={{
                  padding: '2px 6px', fontSize: 10, color: '#b91c1c',
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                }}
              >
                <Trash2 size={11} /> Verwijderen
              </button>
            )}
          </>
        )}
      </div>

      {weg ? (
        <div style={{
          border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)',
          borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--fg)',
        }}>
          Wordt verwijderd zodra je op Toepassen klikt.
          {rij.bron === 'bouw7' && !isDeel && ' Het item wordt dan ook in Bouw7 weggehaald.'}
        </div>
      ) : (<>

      {geknipteUren > 0 && (
        <div style={{
          border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.08)',
          borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--fg)',
        }}>
          {geknipteUren.toLocaleString('nl-NL')} uur dubbele planning eruit geknipt
          (was {rij.uren}u). Die uren vervallen — ze stonden op hetzelfde moment als
          ander werk.
        </div>
      )}

      {isDeel && (
        <div style={{
          border: '1px solid rgba(37,99,235,0.35)', background: 'rgba(37,99,235,0.07)',
          borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--fg)',
        }}>
          Reststuk van {d.uren}u dat na het uitknippen overblijft; wordt bij Toepassen
          een eigen planitem op dezelfde tijd als waar het nu staat.
        </div>
      )}

      {rij.bron === 'bouw7' && !isDeel && (
        <div style={{
          border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.08)',
          borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--fg)',
        }}>
          Dit item komt uit Bouw7 — een volgende synchronisatie kan deze wijziging overschrijven.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="eva-btn-ghost" onClick={() => verschuifDagen(-1)}
            style={{ padding: '4px 8px', fontSize: 11 }} title="Eén dag eerder">− 1 dag</button>
          <button type="button" className="eva-btn-ghost" onClick={() => verschuifDagen(1)}
            style={{ padding: '4px 8px', fontSize: 11 }} title="Eén dag later">+ 1 dag</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: 6, alignItems: 'end' }}>
          <div>
            <label style={{ ...labelStyle, marginBottom: 2 }}>Start</label>
            <input type="date" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
              value={format(startDt, 'yyyy-MM-dd')}
              onChange={e => e.target.value && zetVelden({ sd: e.target.value })} />
          </div>
          <input type="time" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
            value={format(startDt, 'HH:mm')}
            onChange={e => e.target.value && zetVelden({ st: e.target.value })} />
          <div>
            <label style={{ ...labelStyle, marginBottom: 2 }}>Eind</label>
            <input type="date" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
              value={format(eindDt, 'yyyy-MM-dd')}
              onChange={e => e.target.value && zetVelden({ ed: e.target.value })} />
          </div>
          <input type="time" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
            value={format(eindDt, 'HH:mm')}
            onChange={e => e.target.value && zetVelden({ et: e.target.value })} />
        </div>
      </div>
      </>)}
    </div>
  )
}
