'use client'
import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { nl } from 'date-fns/locale'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'

export type MobielTaak = {
  id: string
  titel: string
  deadline: string | null
  prioriteit: string
  dossier_naam: string | null
  dossier_id: string | null
  formulier_template_id: string | null
  /** De actie start een kwaliteitsronde (tasks.kwaliteit_ronde). */
  kwaliteit_ronde?: boolean
  /** Gezet als de taak een openstaande toolbox is; link naar de doorloop. */
  toolbox_toewijzing_id?: string | null
  /** Platte omschrijving-tekst; null als er geen omschrijving is. */
  omschrijving: string | null
}

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
    return { tekst: format(d, 'd MMM', { locale: nl }), kleur }
  } catch { return null }
}

export default function MobielTakenLijst({ taken }: { taken: MobielTaak[] }) {
  const [afgevinkt, setAfgevinkt] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<MobielTaak | null>(null)
  const [, startTransition] = useTransition()

  function vinkAf(id: string) {
    setAfgevinkt(prev => new Set(prev).add(id))
    startTransition(async () => {
      try {
        await updateTaakStatus(id, 'gereed')
      } catch {
        setAfgevinkt(prev => { const n = new Set(prev); n.delete(id); return n })
      }
    })
  }

  const zichtbaar = taken.filter(t => !afgevinkt.has(t.id))

  if (zichtbaar.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
        Geen openstaande acties
      </div>
    )
  }

  return (
    <>
    <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {zichtbaar.map(taak => {
        const prio = PRIO[taak.prioriteit] ?? PRIO.normaal
        const dl = deadlineLabel(taak.deadline)
        const isToolbox = !!taak.toolbox_toewijzing_id
        return (
          <div
            key={taak.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: 14, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 12,
            }}
          >
            {isToolbox ? (
              <div
                aria-label="Toolbox — rond af via de doorloop"
                title="Deze actie sluit automatisch zodra je de toolbox hebt doorlopen"
                style={{
                  width: 22, height: 22, flexShrink: 0, marginTop: 1,
                  borderRadius: 6, border: '2px solid var(--border)', background: '#f7f9fa',
                  display: 'grid', placeItems: 'center', fontSize: 12,
                }}
              >
                🦺
              </div>
            ) : (
              <button
                onClick={() => vinkAf(taak.id)}
                aria-label="Actie afvinken"
                style={{
                  width: 22, height: 22, flexShrink: 0, marginTop: 1,
                  borderRadius: 6, border: '2px solid var(--border)', background: 'transparent',
                  cursor: 'pointer', display: 'grid', placeItems: 'center',
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {taak.omschrijving ? (
                <button
                  type="button"
                  onClick={() => setDetail(taak)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%',
                    background: 'none', border: 'none', padding: 0, margin: '0 0 6px',
                    textAlign: 'left', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.45 }}>
                    {taak.titel}
                  </span>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#1f6feb" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.45, marginBottom: 6 }}>
                  {taak.titel}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {taak.dossier_naam && (
                  taak.dossier_id ? (
                    <Link
                      href={`/m/dossiers/${taak.dossier_id}`}
                      style={{ fontSize: 10, fontWeight: 600, color: '#1f6feb', background: '#eef4ff', padding: '2px 7px', borderRadius: 6, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                    >
                      {taak.dossier_naam}
                    </Link>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#4d575e', background: 'var(--bg)', padding: '2px 7px', borderRadius: 6, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {taak.dossier_naam}
                    </span>
                  )
                )}
                <span style={{ fontSize: 10, fontWeight: 700, color: prio.c, background: prio.bg, padding: '2px 8px', borderRadius: 99 }}>
                  {prio.label}
                </span>
                {dl && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: dl.kleur }}>{dl.tekst}</span>
                )}
              </div>
              {taak.formulier_template_id && (
                <Link
                  href={`/m/taken/${taak.id}/formulier`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: '#eef4ff', color: '#1f6feb',
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M9 13h6m-6 4h6M9 9h1M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"/>
                  </svg>
                  Formulier invullen
                </Link>
              )}
              {taak.kwaliteit_ronde && (
                <Link
                  href={`/m/taken/${taak.id}/kwaliteit`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: '#ecfdf3', color: '#067647',
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Kwaliteitsronde starten
                </Link>
              )}
              {taak.toolbox_toewijzing_id && (
                <Link
                  href={`/m/toolbox/${taak.toolbox_toewijzing_id}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: '#ecfdf3', color: '#067647',
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2L3 7v6c0 5 3.5 8 9 9 5.5-1 9-4 9-9V7l-9-5z"/>
                  </svg>
                  Toolbox openen
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>

    {detail && (
      <div
        onClick={() => setDetail(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', background: 'var(--bg-elev)',
            borderTopLeftRadius: 18, borderTopRightRadius: 18,
            padding: '8px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '70dvh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          }}
        >
          {/* grijp-streepje */}
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 14px', flexShrink: 0 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', marginBottom: 10, flexShrink: 0 }}>
            {detail.titel}
          </div>
          <div style={{ overflowY: 'auto', fontSize: 14, color: '#3a444b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {detail.omschrijving}
          </div>
          <button
            type="button"
            onClick={() => setDetail(null)}
            style={{
              marginTop: 18, flexShrink: 0,
              padding: '13px 16px', borderRadius: 12,
              background: 'var(--bg)', color: 'var(--fg)', border: 'none',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Sluiten
          </button>
        </div>
      </div>
    )}
    </>
  )
}
