'use client'

import React, { useState } from 'react'
import { format, isPast, isToday, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { DossierTaakRegel } from '@/lib/taken/services/taken'

/**
 * Acties-blok op de mobiele dossier-infopagina.
 *
 * Toont de vijf eerstvolgende openstaande acties; de rest én alles wat al
 * afgerond of vervallen is zit achter één uitklapknop. Bewust alleen-lezen:
 * afvinken gebeurt in Mijn taken, waar de taak ook echt aan jou is toegewezen.
 */

const TOP = 5

const PRIO: Record<string, { label: string; c: string; bg: string }> = {
  urgent:  { label: 'Urgent',  c: '#b42318', bg: '#fef3f2' },
  hoog:    { label: 'Urgent',  c: '#b42318', bg: '#fef3f2' },
  normaal: { label: 'Normaal', c: '#b85a00', bg: '#fff6ec' },
  laag:    { label: 'Laag',    c: '#6b757c', bg: '#f1f4f5' },
}

function deadlineLabel(iso: string | null): { tekst: string; kleur: string } | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    const kleur = isPast(d) && !isToday(d) ? '#b42318' : isToday(d) ? '#b85a00' : '#6b757c'
    const tekst = isToday(d) ? 'Vandaag' : format(d, 'd MMM', { locale: nl })
    return { tekst, kleur }
  } catch { return null }
}

function TaakRegel({ taak }: { taak: DossierTaakRegel }) {
  const prio = PRIO[taak.prioriteit] ?? PRIO.normaal
  const dl = deadlineLabel(taak.deadline)

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 0', borderTop: '1px solid #f0f3f4',
      opacity: taak.afgerond ? 0.55 : 1,
    }}>
      <div style={{
        width: 18, height: 18, flexShrink: 0, marginTop: 2, borderRadius: 5,
        border: `2px solid ${taak.afgerond ? '#009439' : '#d7dde0'}`,
        background: taak.afgerond ? '#009439' : 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        {taak.afgerond && (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4,
          textDecoration: taak.afgerond ? 'line-through' : 'none',
        }}>
          {taak.titel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {!taak.afgerond && (
            <span style={{ fontSize: 10, fontWeight: 700, color: prio.c, background: prio.bg, padding: '2px 8px', borderRadius: 99 }}>
              {prio.label}
            </span>
          )}
          {dl && <span style={{ fontSize: 11, fontWeight: 700, color: taak.afgerond ? '#9aa4ab' : dl.kleur }}>{dl.tekst}</span>}
          {taak.assignee_naam && <span style={{ fontSize: 11, color: '#6b757c' }}>{taak.assignee_naam}</span>}
        </div>
      </div>
    </div>
  )
}

export default function DossierActiesBlok({ taken }: { taken: DossierTaakRegel[] }) {
  const [open, setOpen] = useState(false)

  const openstaand = taken.filter(t => !t.afgerond)
  const afgerond = taken.filter(t => t.afgerond)
  const eerste = openstaand.slice(0, TOP)
  const rest = [...openstaand.slice(TOP), ...afgerond]

  return (
    <div style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '14px 16px 4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b757c' }}>Acties</span>
        {taken.length > 0 && (
          <span style={{ fontSize: 12, color: '#9aa4ab' }}>
            {openstaand.length === 0 ? 'alles afgerond' : `${openstaand.length} open`}
          </span>
        )}
      </div>

      {taken.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9aa4ab', padding: '4px 0 14px' }}>
          Geen acties voor dit dossier.
        </div>
      ) : (
        <>
          {eerste.length === 0 && (
            <div style={{ fontSize: 14, color: '#9aa4ab', padding: '4px 0 6px', borderTop: '1px solid #f0f3f4' }}>
              Alle acties zijn afgerond.
            </div>
          )}
          {eerste.map(t => <TaakRegel key={t.id} taak={t} />)}
          {open && rest.map(t => <TaakRegel key={t.id} taak={t} />)}

          {rest.length > 0 && (
            <button
              onClick={() => setOpen(v => !v)}
              style={{
                width: '100%', padding: '12px 0', marginTop: 2,
                borderTop: '1px solid #f0f3f4', border: 'none', borderTopWidth: 1, borderTopStyle: 'solid',
                background: 'none', color: '#009439', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {open ? 'Minder tonen' : `Toon alle acties (${rest.length})`}
            </button>
          )}
          {rest.length === 0 && <div style={{ height: 10 }} />}
        </>
      )}
    </div>
  )
}
