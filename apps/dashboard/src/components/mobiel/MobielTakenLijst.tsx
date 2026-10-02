'use client'
import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { parseISO, isPast, isToday } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import { bepaalUitvoerActies } from '@/lib/taken/uitvoeracties'
import TaakUitvoerKnop, { UitvoerBadge } from './TaakUitvoerKnop'

export type MobielTaak = {
  id: string
  titel: string
  deadline: string | null
  prioriteit: string
  dossier_naam: string | null
  dossier_id: string | null
  formulier_template_id: string | null
  /** De actie start een opname (tasks.opname_ronde). */
  opname_ronde?: boolean
  /** De actie start een projectbezoek (tasks.bezoek_ronde). */
  bezoek_ronde?: boolean
  /** Gezet als de taak een openstaande toolbox is; link naar de doorloop. */
  toolbox_toewijzing_id?: string | null
  /** Platte omschrijving-tekst; null als er geen omschrijving is. */
  omschrijving: string | null
}

// `hoog` toont in de lijst bewust als Urgent; vandaar een eigen sleutel naast de kleur.
const PRIO: Record<string, { sleutel: 'urgent' | 'normaal' | 'laag'; c: string; bg: string }> = {
  urgent:  { sleutel: 'urgent',  c: '#b42318', bg: '#fef3f2' },
  hoog:    { sleutel: 'urgent',  c: '#b42318', bg: '#fef3f2' },
  normaal: { sleutel: 'normaal', c: '#b85a00', bg: '#fff6ec' },
  laag:    { sleutel: 'laag',    c: '#6b757c', bg: '#f1f4f5' },
}

function deadlineLabel(iso: string | null, locale: string): { tekst: string; kleur: string } | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    if (isNaN(d.getTime())) return null
    const kleur = isPast(d) && !isToday(d) ? '#b42318' : isToday(d) ? '#b85a00' : '#6b757c'
    return { tekst: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }), kleur }
  } catch { return null }
}

export default function MobielTakenLijst({ taken }: { taken: MobielTaak[] }) {
  const t = useTranslations('taken')
  const locale = useDatumLocale()
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

  const zichtbaar = taken.filter(tk => !afgevinkt.has(tk.id))

  if (zichtbaar.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
        {t('geenOpenstaand')}
      </div>
    )
  }

  return (
    <>
    <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {zichtbaar.map(taak => {
        const prio = PRIO[taak.prioriteit] ?? PRIO.normaal
        const dl = deadlineLabel(taak.deadline, locale)
        const acties = bepaalUitvoerActies(taak)
        return (
          <div
            key={taak.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: 14, background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 12,
            }}
          >
            {/* Hangt er een doorloop aan de actie, dan geen afvinkvakje: het formulier, de ronde
                of de toolbox zet de actie zelf op gereed. Handmatig afvinken zou de registratie
                overslaan en wordt daarom ook serverzijdig geweigerd. Bij meerdere doorlopen
                staat het icoon van de eerste; de knoppen eronder tonen ze alle drie. */}
            {acties.length > 0 ? (
              <UitvoerBadge actie={acties[0]} />
            ) : (
              <button
                onClick={() => vinkAf(taak.id)}
                aria-label={t('afvinkenLabel')}
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
                  <VertaalbareTekst
                    tekst={taak.titel}
                    label={false}
                    style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.45 }}
                  />
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#1f6feb" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              ) : (
                <VertaalbareTekst
                  as="div"
                  tekst={taak.titel}
                  label={false}
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.45, marginBottom: 6 }}
                />
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
                  {t(`prioriteit.${prio.sleutel}`)}
                </span>
                {dl && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: dl.kleur }}>{dl.tekst}</span>
                )}
              </div>
              {acties.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {acties.map(actie => (
                    <TaakUitvoerKnop key={actie.soort} actie={actie} />
                  ))}
                </div>
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
          <VertaalbareTekst
            as="div"
            tekst={detail.titel}
            label={false}
            style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', marginBottom: 10, flexShrink: 0 }}
          />
          <VertaalbareTekst
            as="div"
            tekst={detail.omschrijving}
            style={{ overflowY: 'auto', fontSize: 14, color: '#3a444b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}
          />
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
            {t('sluiten')}
          </button>
        </div>
      </div>
    )}
    </>
  )
}
