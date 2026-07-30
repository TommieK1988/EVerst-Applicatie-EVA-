'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { maakTaak } from '@/app/(platform)/taken/actions/taken'
import { getMedewerkersVoorToewijzing, type MedewerkerKeuze } from '@/app/(platform)/taken/actions/sjablonen'
import { zoekDossiers } from '@/lib/dossiers/actions'
import type { TaskPrioriteit } from '@/lib/taken/supabase/database.types'

/**
 * "Nieuwe actie" voor de mobiele Acties-lijst (`/m/taken`).
 *
 * Bewust een eigen, compacte flow i.p.v. de desktop-`NieuweTaakDialog`: styling
 * volgt de `/m`-taal (inline + CSS-vars, bottom-sheet), niet de Tailwind-modal
 * van de desktop. Velden: titel, dossier (optioneel), toegewezen medewerker,
 * prioriteit, deadline (optioneel).
 *
 * BELANGRIJK: `getMijnTaken` vult de lijst puur uit `task_assignees`. Standaard
 * wijzen we de actie aan de aanmaker zelf toe (anders "verdwijnt" hij meteen),
 * maar de toewijzing is wijzigbaar.
 *
 * `maakTaak` revalidate't `/taken` (bureau), niet `/m/taken`; na succes dus zelf
 * `router.refresh()` zodat de nieuwe actie direct in de mobiele lijst verschijnt.
 */

const PRIORITEITEN: { value: TaskPrioriteit; label: string }[] = [
  { value: 'laag',    label: 'Laag' },
  { value: 'normaal', label: 'Normaal' },
  { value: 'hoog',    label: 'Hoog' },
  { value: 'urgent',  label: 'Urgent' },
]

const PRIO_KLEUR: Record<string, { c: string; bg: string }> = {
  urgent:  { c: '#b42318', bg: '#fef3f2' },
  hoog:    { c: '#b42318', bg: '#fef3f2' },
  normaal: { c: '#b85a00', bg: '#fff6ec' },
  laag:    { c: '#6b757c', bg: '#f1f4f5' },
}

// fontSize 16 op invoervelden voorkomt de auto-zoom van iOS Safari.
const veld: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--border)', borderRadius: 12,
  padding: '13px 14px', fontSize: 16, lineHeight: 1.4,
  color: 'var(--fg)', background: 'var(--bg-elev)',
  fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#6b757c', marginBottom: 6,
}

type DossierResultaat = { id: string; titel: string; klant_naam: string | null }

export default function MobielNieuweActie({ userId }: { userId: string }) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [titel, setTitel]         = useState('')
  const [prioriteit, setPrio]     = useState<TaskPrioriteit>('normaal')
  const [deadline, setDeadline]   = useState('')
  const [fout, setFout]           = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Toewijzing — standaard de aanmaker zelf, maar wijzigbaar.
  const [medewerkers, setMedewerkers] = useState<MedewerkerKeuze[]>([])
  const [assigneeId, setAssigneeId]   = useState(userId)

  // Dossier-koppeling (optioneel) — vrij zoekveld met inline resultaten.
  const [dossier, setDossier]           = useState<{ id: string; titel: string } | null>(null)
  const [dossierQuery, setDossierQuery] = useState('')
  const [resultaten, setResultaten]     = useState<DossierResultaat[]>([])
  const zoekSeq = useRef(0)

  useEffect(() => {
    if (open) getMedewerkersVoorToewijzing().then(setMedewerkers).catch(() => {})
  }, [open])

  // De aanmaker staat altijd bovenaan als "(jij)"; ontbreekt die in de
  // medewerkerslijst (geen gekoppeld account), dan tóch een eigen optie tonen.
  const heeftZelf = medewerkers.some(m => m.auth_user_id === userId)
  const toewijsOpties: { value: string; label: string }[] = [
    ...(heeftZelf ? [] : [{ value: userId, label: 'Jezelf' }]),
    ...medewerkers
      .filter(m => m.auth_user_id)
      .map(m => ({ value: m.auth_user_id!, label: m.auth_user_id === userId ? `${m.naam} (jij)` : m.naam })),
  ]

  function zoek(q: string) {
    setDossierQuery(q)
    const seq = ++zoekSeq.current
    if (!q.trim()) { setResultaten([]); return }
    zoekDossiers(q).then(rs => { if (seq === zoekSeq.current) setResultaten(rs) }).catch(() => {})
  }

  function kiesDossier(d: DossierResultaat) {
    setDossier({ id: d.id, titel: d.titel })
    setDossierQuery('')
    setResultaten([])
  }

  function sluit() {
    setOpen(false)
    setTitel('')
    setPrio('normaal')
    setDeadline('')
    setAssigneeId(userId)
    setDossier(null)
    setDossierQuery('')
    setResultaten([])
    setFout(null)
  }

  function verstuur(e: React.FormEvent) {
    e.preventDefault()
    const t = titel.trim()
    if (!t) return
    setFout(null)
    startTransition(async () => {
      try {
        await maakTaak({
          titel:      t,
          prioriteit,
          deadline:   deadline || undefined,
          dossier_id: dossier?.id,
          assignees:  [{ user_id: assigneeId, rol: 'verantwoordelijke' }],
        })
        sluit()
        router.refresh()
      } catch (err) {
        setFout(err instanceof Error ? err.message : 'Aanmaken lukte niet. Probeer het opnieuw.')
      }
    })
  }

  return (
    <>
      {/* Vaste actiebalk onderaan — sticky binnen de scroll-kolom (nooit fixed). */}
      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: 'auto', flexShrink: 0,
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--neutral-0, #fff)', borderTop: '1px solid var(--border)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '15px 16px', borderRadius: 12, border: 'none',
            background: '#009439', color: '#fff', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nieuwe actie
        </button>
      </div>

      {open && (
        <div
          onClick={sluit}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={verstuur}
            style={{
              width: '100%', background: 'var(--bg-elev)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
              maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* grijp-streepje */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
              Nieuwe actie
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Titel */}
              <div>
                <label style={labelStijl}>Actie</label>
                <input
                  autoFocus
                  type="text"
                  value={titel}
                  onChange={e => setTitel(e.target.value)}
                  placeholder="Wat moet er gedaan worden?"
                  style={veld}
                />
              </div>

              {/* Dossier (optioneel) */}
              <div>
                <label style={labelStijl}>
                  Dossier <span style={{ fontWeight: 500, color: '#9aa4ab' }}>(optioneel)</span>
                </label>
                {dossier ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    border: '1px solid var(--border)', borderRadius: 12, padding: '11px 12px 11px 14px',
                    background: 'var(--bg)',
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dossier.titel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDossier(null)}
                      aria-label="Dossier loskoppelen"
                      style={{
                        flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: 'none',
                        background: 'transparent', color: '#6b757c', cursor: 'pointer',
                        display: 'grid', placeItems: 'center', WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={dossierQuery}
                      onChange={e => zoek(e.target.value)}
                      placeholder="Zoek op dossiertitel…"
                      style={veld}
                    />
                    {resultaten.length > 0 && (
                      <div style={{
                        marginTop: 6, border: '1px solid var(--border)', borderRadius: 12,
                        overflow: 'hidden', background: 'var(--bg-elev)',
                      }}>
                        {resultaten.map((d, i) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => kiesDossier(d)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '11px 14px', border: 'none', background: 'transparent',
                              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                              cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.titel}
                            </div>
                            {d.klant_naam && (
                              <div style={{ fontSize: 12, color: '#9aa4ab', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.klant_naam}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {dossierQuery.trim() && resultaten.length === 0 && (
                      <div style={{ fontSize: 13, color: '#9aa4ab', marginTop: 8 }}>Geen dossiers gevonden.</div>
                    )}
                  </>
                )}
              </div>

              {/* Toegewezen aan */}
              <div>
                <label style={labelStijl}>Toegewezen aan</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    style={{ ...veld, appearance: 'none', WebkitAppearance: 'none', paddingRight: 40 }}
                  >
                    {toewijsOpties.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <svg
                    width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9aa4ab" strokeWidth={2}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Prioriteit */}
              <div>
                <label style={labelStijl}>Prioriteit</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {PRIORITEITEN.map(p => {
                    const actief = prioriteit === p.value
                    const kleur = PRIO_KLEUR[p.value]
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPrio(p.value)}
                        style={{
                          padding: '11px 4px', borderRadius: 10, cursor: 'pointer',
                          fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                          border: `1.5px solid ${actief ? kleur.c : 'var(--border)'}`,
                          background: actief ? kleur.bg : 'transparent',
                          color: actief ? kleur.c : '#6b757c',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label style={labelStijl}>
                  Deadline <span style={{ fontWeight: 500, color: '#9aa4ab' }}>(optioneel)</span>
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={veld}
                />
              </div>

              {fout && (
                <div style={{ fontSize: 13, color: '#b42318', lineHeight: 1.4 }}>{fout}</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
              <button
                type="button"
                onClick={sluit}
                style={{
                  flex: '0 0 auto', padding: '14px 20px', borderRadius: 12,
                  background: 'var(--bg)', color: 'var(--fg)', border: 'none',
                  fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={!titel.trim() || pending}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 12, border: 'none',
                  background: '#009439', color: '#fff', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 700,
                  cursor: !titel.trim() || pending ? 'default' : 'pointer',
                  opacity: !titel.trim() || pending ? 0.5 : 1,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {pending ? 'Opslaan…' : 'Actie aanmaken'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
