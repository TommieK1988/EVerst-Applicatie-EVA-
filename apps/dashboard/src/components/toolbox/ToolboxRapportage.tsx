'use client'

import React, { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import { wijsToe, verwijderToewijzing, type DeelnemerRij, type MedewerkerKeuze } from '@/app/(platform)/kam/toolbox/actions'
import type { ToolboxStatus } from '@/components/toolbox/types'

type Props = {
  toolbox: { id: string; titel: string; status: ToolboxStatus; huidige_versie: number }
  deelnemers: DeelnemerRij[]
  medewerkers: MedewerkerKeuze[]
}

const STATUS_LABEL: Record<string, { label: string; c: string; bg: string }> = {
  open:     { label: 'Open',     c: '#6b757c', bg: '#f1f4f5' },
  bezig:    { label: 'Bezig',    c: '#b85a00', bg: '#fff6ec' },
  afgerond: { label: 'Afgerond', c: '#067647', bg: '#ecfdf3' },
}

export default function ToolboxRapportage({ toolbox, deelnemers, medewerkers }: Props) {
  const router = useRouter()
  const [toewijsOpen, setToewijsOpen] = useState(false)
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [zoek, setZoek] = useState('')
  const [pending, startTransition] = useTransition()
  const [lightbox, setLightbox] = useState<string | null>(null)

  const gepubliceerd = toolbox.status === 'gepubliceerd'
  const afgerond = deelnemers.filter((d) => d.status === 'afgerond').length

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    return q ? medewerkers.filter((m) => m.naam.toLowerCase().includes(q)) : medewerkers
  }, [zoek, medewerkers])

  function toggle(id: string) {
    setSelectie((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function bevestigToewijzen(allen: boolean) {
    startTransition(async () => {
      const res = await wijsToe({
        toolboxId: toolbox.id,
        medewerkerIds: allen ? 'allen' : [...selectie],
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${res.data.aangemaakt} toegewezen${res.data.overgeslagen ? `, ${res.data.overgeslagen} al toegewezen` : ''}.`)
      setToewijsOpen(false); setSelectie(new Set())
      router.refresh()
    })
  }

  function verwijder(id: string) {
    startTransition(async () => {
      const res = await verwijderToewijzing(id)
      if (!res.ok) { toast.error(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="eva-page-full">
      <PageHeader
        eyebrow="Toolbox"
        title={toolbox.titel}
        status={{
          label: gepubliceerd ? `Gepubliceerd · v${toolbox.huidige_versie}` : 'Concept',
          tone: gepubliceerd ? 'success' : 'warning',
        }}
        actions={
          <>
            <Link href={`/kam/toolbox/${toolbox.id}/bewerken`}><Button variant="ghost">Bewerken</Button></Link>
            {gepubliceerd && (
              <Link href={`/kam/toolbox/${toolbox.id}/presenteren`} target="_blank"><Button variant="ghost">Presenteren</Button></Link>
            )}
            <a href={`/kam/toolbox/${toolbox.id}/presentielijst`} target="_blank" rel="noreferrer">
              <Button variant="ghost">Presentielijst (PDF)</Button>
            </a>
            <Button variant="primary" disabled={!gepubliceerd} onClick={() => setToewijsOpen(true)}>Toewijzen</Button>
          </>
        }
      />

      {!gepubliceerd && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff6ec', border: '1px solid #f5c67c', borderRadius: 10, fontSize: 13, color: '#8a5200' }}>
          Deze toolbox is nog niet gepubliceerd. Publiceer hem in de editor voordat je hem kunt toewijzen.
        </div>
      )}

      <div style={{ fontSize: 13, color: 'var(--fg-soft)', marginBottom: 12 }}>
        {deelnemers.length === 0 ? 'Nog niemand toegewezen.' : `${afgerond} van ${deelnemers.length} afgerond`}
      </div>

      {deelnemers.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                <th style={thStijl}>Medewerker</th>
                <th style={thStijl}>Functie</th>
                <th style={thStijl}>Status</th>
                <th style={thStijl}>Afgerond op</th>
                <th style={thStijl}>Pogingen</th>
                <th style={thStijl}>In één keer goed</th>
                <th style={thStijl}>Handtekening</th>
                <th style={thStijl}></th>
              </tr>
            </thead>
            <tbody>
              {deelnemers.map((d) => {
                const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.open
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={tdStijl}>{d.medewerker_naam}</td>
                    <td style={{ ...tdStijl, color: 'var(--fg-soft)' }}>{d.functie ?? '—'}</td>
                    <td style={tdStijl}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, padding: '2px 9px', borderRadius: 99 }}>{st.label}</span>
                    </td>
                    <td style={{ ...tdStijl, color: 'var(--fg-soft)' }}>{d.afgerond_op ? new Date(d.afgerond_op).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td style={{ ...tdStijl, color: 'var(--fg-soft)' }}>{d.pogingen || '—'}</td>
                    <td style={{ ...tdStijl, color: 'var(--fg-soft)' }}>{d.in_een_keer_goed === null ? '—' : `${d.in_een_keer_goed}%`}</td>
                    <td style={tdStijl}>
                      {d.handtekening_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.handtekening_url} alt="handtekening" onClick={() => setLightbox(d.handtekening_url)} style={{ height: 28, cursor: 'zoom-in', background: '#fff', border: '1px solid var(--border)', borderRadius: 4 }} />
                      ) : '—'}
                    </td>
                    <td style={tdStijl}>
                      {d.status !== 'afgerond' && (
                        <button onClick={() => verwijder(d.id)} disabled={pending} style={{ fontSize: 12, color: '#b42318', background: 'none', border: 'none', cursor: 'pointer' }}>Verwijderen</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toewijs-paneel */}
      {toewijsOpen && (
        <div onClick={() => !pending && setToewijsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: '80dvh', background: '#fff', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Toolbox toewijzen</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14 }}>Elke medewerker krijgt de toolbox als openstaande taak op zijn telefoon.</div>
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek medewerker…" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, marginBottom: 10 }} />
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
              {gefilterd.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--bg-subtle)' }}>
                  <input type="checkbox" checked={selectie.has(m.id)} onChange={() => toggle(m.id)} />
                  <span style={{ fontSize: 13 }}>{m.naam}</span>
                  {m.functie && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>· {m.functie}</span>}
                </label>
              ))}
              {gefilterd.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>Geen medewerkers gevonden.</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <Button variant="ghost" onClick={() => bevestigToewijzen(true)} disabled={pending}>Alle app-gebruikers</Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" onClick={() => setToewijsOpen(false)} disabled={pending}>Annuleren</Button>
                <Button variant="primary" onClick={() => bevestigToewijzen(false)} disabled={pending || selectie.size === 0}>
                  {pending ? 'Bezig…' : `Toewijzen (${selectie.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="handtekening" style={{ maxWidth: '90vw', maxHeight: '80vh', background: '#fff', borderRadius: 8, padding: 16 }} />
        </div>
      )}
    </div>
  )
}

const thStijl: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-muted)' }
const tdStijl: React.CSSProperties = { padding: '10px 12px', color: 'var(--fg)' }
