'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import { bewaarDiploma, verwijderDiploma } from '@/app/(platform)/kam/vca-diplomas/actions'
import { VCA_SOORT_LABEL, type VcaRij, type VcaSoort, type VcaStatus } from '@/lib/kam/vca'

const STATUS_META: Record<VcaStatus, { label: string; c: string; bg: string }> = {
  geldig:              { label: 'Geldig',      c: '#067647', bg: '#ecfdf3' },
  verloopt_binnenkort: { label: 'Verloopt',    c: '#b85a00', bg: '#fff6ec' },
  verlopen:            { label: 'Verlopen',    c: '#b42318', bg: '#fef3f2' },
  geen:                { label: 'Geen diploma', c: '#b42318', bg: '#fef3f2' },
  onbekend:            { label: 'Geen datum',  c: '#6b757c', bg: '#f1f4f5' },
}

const FILTERS: { key: 'alle' | VcaStatus; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'verlopen', label: 'Verlopen' },
  { key: 'verloopt_binnenkort', label: 'Verloopt binnenkort' },
  { key: 'geen', label: 'Geen diploma' },
  { key: 'geldig', label: 'Geldig' },
]

function datum(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('nl-NL') : '—'
}

export default function VcaDiplomasOverzicht({ rijen }: { rijen: VcaRij[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'alle' | VcaStatus>('alle')
  const [zoek, setZoek] = useState('')
  const [bewerk, setBewerk] = useState<VcaRij | null>(null)

  const tellers = useMemo(() => ({
    verlopen: rijen.filter((r) => r.status === 'verlopen').length,
    binnenkort: rijen.filter((r) => r.status === 'verloopt_binnenkort').length,
    geen: rijen.filter((r) => r.status === 'geen').length,
    geldig: rijen.filter((r) => r.status === 'geldig').length,
  }), [rijen])

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    return rijen.filter((r) => {
      if (filter !== 'alle' && r.status !== filter) return false
      if (q && !r.naam.toLowerCase().includes(q)) return false
      return true
    })
  }, [rijen, filter, zoek])

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="KAM/VGM" title="VCA-diploma’s" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Kaart label="Verlopen" waarde={tellers.verlopen} kleur="#b42318" />
        <Kaart label="Verloopt binnen 3 mnd" waarde={tellers.binnenkort} kleur="#b85a00" />
        <Kaart label="Geen diploma vastgelegd" waarde={tellers.geen} kleur="#6b757c" />
        <Kaart label="Geldig" waarde={tellers.geldig} kleur="#067647" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === f.key ? '#009439' : 'var(--border)'}`,
              background: filter === f.key ? '#ecfdf3' : '#fff',
              color: filter === f.key ? '#067647' : 'var(--fg-soft)',
            }}
          >
            {f.label}
          </button>
        ))}
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek medewerker…"
          style={{ marginLeft: 'auto', padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, minWidth: 220 }}
        />
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
              <th style={th}>Medewerker</th>
              <th style={th}>Functie</th>
              <th style={th}>Soort</th>
              <th style={th}>Diplomanummer</th>
              <th style={th}>Behaald</th>
              <th style={th}>Geldig tot</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map((r) => {
              const st = STATUS_META[r.status]
              return (
                <tr key={r.medewerker_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>{r.naam}</td>
                  <td style={{ ...td, color: 'var(--fg-soft)' }}>{r.functie ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--fg-soft)' }}>{r.soort ? VCA_SOORT_LABEL[r.soort] : '—'}</td>
                  <td style={{ ...td, color: 'var(--fg-soft)', fontFamily: 'var(--font-mono)' }}>{r.diplomanummer ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--fg-soft)' }}>{datum(r.behaald_op)}</td>
                  <td style={{ ...td, color: 'var(--fg-soft)' }}>
                    {datum(r.geldig_tot)}
                    {r.status === 'verloopt_binnenkort' && r.dagen_tot_verval !== null && (
                      <span style={{ fontSize: 11, color: '#b85a00', marginLeft: 6 }}>nog {r.dagen_tot_verval} d</span>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, padding: '2px 9px', borderRadius: 99 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={td}>
                    <button onClick={() => setBewerk(r)} style={{ fontSize: 12, color: '#1f6feb', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {r.diploma_id ? 'Bewerken' : 'Vastleggen'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {zichtbaar.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--fg-muted)', padding: 32 }}>Geen medewerkers gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {bewerk && (
        <DiplomaModal
          rij={bewerk}
          onSluit={() => setBewerk(null)}
          onKlaar={() => { setBewerk(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DiplomaModal({ rij, onSluit, onKlaar }: { rij: VcaRij; onSluit: () => void; onKlaar: () => void }) {
  const [soort, setSoort] = useState<VcaSoort>(rij.soort ?? 'b_vca')
  const [nummer, setNummer] = useState(rij.diplomanummer ?? '')
  const [behaald, setBehaald] = useState(rij.behaald_op ?? '')
  const [geldig, setGeldig] = useState(rij.geldig_tot ?? '')
  const [pending, start] = useTransition()

  // VCA is doorgaans 10 jaar geldig: vul de einddatum alvast in bij het invoeren
  // van de behaaldatum, zodat KAM hem alleen nog hoeft te controleren.
  function zetBehaald(waarde: string) {
    setBehaald(waarde)
    if (waarde && !geldig) {
      const d = new Date(`${waarde}T00:00:00`)
      d.setFullYear(d.getFullYear() + 10)
      setGeldig(d.toISOString().slice(0, 10))
    }
  }

  function opslaan() {
    start(async () => {
      const res = await bewaarDiploma({
        diplomaId: rij.diploma_id, medewerkerId: rij.medewerker_id,
        soort, diplomanummer: nummer, behaaldOp: behaald || null, geldigTot: geldig || null,
      })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Diploma opgeslagen.')
      onKlaar()
    })
  }

  function verwijder() {
    if (!rij.diploma_id) return
    start(async () => {
      const res = await verwijderDiploma(rij.diploma_id!)
      if (!res.ok) { toast.error(res.error); return }
      onKlaar()
    })
  }

  return (
    <div onClick={() => !pending && onSluit()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--bg-elev)', borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>VCA-diploma</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 18 }}>{rij.naam}</div>

        <label style={label}>Soort</label>
        <select value={soort} onChange={(e) => setSoort(e.target.value as VcaSoort)} style={veld}>
          {(Object.keys(VCA_SOORT_LABEL) as VcaSoort[]).map((s) => (
            <option key={s} value={s}>{VCA_SOORT_LABEL[s]}</option>
          ))}
        </select>

        <label style={label}>Diplomanummer</label>
        <input value={nummer} onChange={(e) => setNummer(e.target.value)} style={veld} placeholder="Bijv. 123456789" />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Behaald op</label>
            <input type="date" value={behaald} onChange={(e) => zetBehaald(e.target.value)} style={veld} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Geldig tot</label>
            <input type="date" value={geldig} onChange={(e) => setGeldig(e.target.value)} style={veld} />
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: -6, marginBottom: 16 }}>
          Bij het invullen van de behaaldatum wordt automatisch 10 jaar geldigheid voorgesteld.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            {rij.diploma_id && (
              <Button variant="ghost" onClick={verwijder} disabled={pending}>Verwijderen</Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onSluit} disabled={pending}>Annuleren</Button>
            <Button variant="primary" onClick={opslaan} disabled={pending}>{pending ? 'Bezig…' : 'Opslaan'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Kaart({ label, waarde, kleur }: { label: string; waarde: number; kleur: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: kleur, lineHeight: 1 }}>{waarde}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--fg)', whiteSpace: 'nowrap' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-soft)', marginBottom: 6 }
const veld: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, marginBottom: 14, fontFamily: 'inherit' }
