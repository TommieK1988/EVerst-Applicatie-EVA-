'use client'
import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import StatusBadge from './StatusBadge'

export type MobielDossier = {
  id: string
  titel: string
  dossiernummer: string | null
  klant_naam: string | null
  projectleider_naam: string | null
  groep: 'aanvraag' | 'opdracht' | 'servicedesk'
  statusLabel: string
  statusColor: string
}

/**
 * De chips boven de lijst.
 *
 * Er was ook een chip "Alle". Die is weg: hij voegde niets toe — je zoekt op de telefoon nooit
 * door aanvragen en opdrachten tegelijk, en hij stond wél altijd vooraan de rij te vullen.
 * Een chip zonder dossiers verdwijnt nu ook helemaal, in plaats van als lege knop te blijven
 * staan.
 */
const SLICER: { key: MobielDossier['groep']; label: string }[] = [
  { key: 'aanvraag',    label: 'Aanvragen' },
  { key: 'opdracht',    label: 'Opdrachten' },
  { key: 'servicedesk', label: 'Servicedesk' },
]

/**
 * Vanaf hoeveel dossiers het zoekveld verschijnt.
 *
 * Onder dit aantal zie je de hele lijst in één oogopslag en is zoeken alleen maar een extra
 * regel die de kaarten omlaag duwt.
 */
const ZOEK_DREMPEL = 5

/** Hoofdletter- en diakriet-ongevoelig, zodat "krue" ook "Krüger" vindt. */
function normaliseer(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function MobielDossierLijst({ dossiers }: { dossiers: MobielDossier[] }) {
  const zichtbareChips = useMemo(
    () => SLICER
      .map(s => ({ ...s, aantal: dossiers.filter(d => d.groep === s.key).length }))
      .filter(s => s.aantal > 0),
    [dossiers],
  )

  const [filter, setFilter] = useState<MobielDossier['groep'] | null>(null)
  const [term, setTerm] = useState('')

  // Geen eigen effect om de selectie te herstellen: de eerste chip met inhoud is de
  // standaard, en zodra de gekozen groep leegloopt valt hij daar vanzelf op terug.
  const actief = zichtbareChips.some(c => c.key === filter)
    ? (filter as MobielDossier['groep'])
    : zichtbareChips[0]?.key ?? null

  const vanGroep = useMemo(
    () => (actief ? dossiers.filter(d => d.groep === actief) : []),
    [dossiers, actief],
  )

  const toonZoek = vanGroep.length > ZOEK_DREMPEL
  const schoon = normaliseer(term.trim())
  const gefilterd = useMemo(() => {
    if (!toonZoek || !schoon) return vanGroep
    return vanGroep.filter(d => normaliseer(
      [d.titel, d.dossiernummer, d.klant_naam, d.projectleider_naam].filter(Boolean).join(' '),
    ).includes(schoon))
  }, [vanGroep, toonZoek, schoon])

  return (
    <>
      {zichtbareChips.length > 0 && (
        <div
          style={{
            display: 'flex', gap: 5, padding: '10px 14px 8px',
            background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)',
            overflowX: 'auto', flexShrink: 0,
          }}
        >
          {zichtbareChips.map(s => {
            const aan = actief === s.key
            return (
              <button
                key={s.key}
                onClick={() => { setFilter(s.key); setTerm('') }}
                style={{
                  height: 30, padding: '0 11px', borderRadius: 99, border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  background: aan ? '#009439' : '#f1f4f5',
                  color: aan ? '#fff' : '#6b757c',
                  transition: 'all 120ms', whiteSpace: 'nowrap',
                }}
              >
                {s.label} {s.aantal}
              </button>
            )
          })}
        </div>
      )}

      {toonZoek && (
        <div style={{ padding: '10px 12px 0', position: 'relative' }}>
          <input
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Zoek op titel, nummer, klant of projectleider"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg-elev)',
              fontSize: 16, // onder de 16px zoomt iOS in bij focus
              color: 'var(--fg)', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gefilterd.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 0', fontSize: 14 }}>
            {schoon ? 'Geen dossier gevonden' : 'Geen dossiers'}
          </div>
        )}
        {gefilterd.map(d => (
          <Link
            key={d.id}
            href={`/m/dossiers/${d.id}`}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: 14, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 7 }}>
                <StatusBadge label={d.statusLabel} color={d.statusColor} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.titel}
              </div>
              {d.klant_naam && (
                <div style={{ fontSize: 12, color: '#6b757c', marginBottom: 3 }}>{d.klant_naam}</div>
              )}
              {d.projectleider_naam && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#009439' }}>{d.projectleider_naam}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {d.dossiernummer && (
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: '#9aa4ab' }}>{d.dossiernummer}</span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
