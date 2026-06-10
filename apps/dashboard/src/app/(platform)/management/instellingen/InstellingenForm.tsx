'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button, Input, PageHeader, Card, CardBody, Alert, EmptyState } from '@/components/ui'
import { slaAKOp, slaDoelstellingOp, verwijderDoelstelling } from './actions'

type AK = { id: string; jaar: number; filiaal: string; bedrag_ak: number; opmerkingen: string | null }
type Doelstelling = {
  id: string; jaar: number; filiaal: string | null; projectleider: string | null
  omzet_doelstelling: number | null; resultaat_doelstelling: number | null
}

type Props = {
  huidigJaar: number
  filialen: string[]
  projectleiders: string[]
  akData: AK[]
  doelstellingen: Doelstelling[]
}

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function fEur(v: number | null | undefined) { return v == null ? '—' : eurFmt.format(v) }

/* ── AK Form per filiaal ─────────────────────────────────────────── */

function AKRij({ filiaal, bestaand, jaar }: { filiaal: string; bestaand: AK | undefined; jaar: number }) {
  const [bedrag, setBedrag] = useState(bestaand?.bedrag_ak?.toString() ?? '')
  const [opm, setOpm]       = useState(bestaand?.opmerkingen ?? '')
  const [status, setStatus] = useState<'idle' | 'ok' | 'fout'>('idle')
  const [isPending, start]  = useTransition()

  async function opslaan() {
    start(async () => {
      const result = await slaAKOp({ jaar, filiaal, bedrag: parseFloat(bedrag.replace(',', '.')) || 0, opmerkingen: opm || null })
      setStatus(result.ok ? 'ok' : 'fout')
      setTimeout(() => setStatus('idle'), 3000)
    })
  }

  const kortFiliaal = (f: string) => {
    if (f.includes('Morgenstond')) return 'BBM'
    if (f.includes('Onderhoud')) return 'EOS'
    if (f.includes('Dakplan')) return 'DP'
    return f.slice(0, 10)
  }

  return (
    <tr>
      <td style={tdS}>
        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{kortFiliaal(filiaal)}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'block' }}>{filiaal}</span>
      </td>
      <td style={{ ...tdS, width: 180 }}>
        <Input
          type="text"
          value={bedrag}
          onChange={e => setBedrag(e.target.value)}
          placeholder="0"
          prefix="€"
          inputSize="sm"
          className="w-[140px]"
        />
      </td>
      <td style={tdS}>
        <Input
          type="text"
          value={opm}
          onChange={e => setOpm(e.target.value)}
          placeholder="Optionele opmerking"
          inputSize="sm"
          className="w-[220px]"
        />
      </td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          {status === 'ok'  && <span className="text-xs text-success-600">✓ Opgeslagen</span>}
          {status === 'fout' && <span className="text-xs text-error-600">✗ Fout</span>}
          <Button
            variant="primary"
            size="sm"
            onClick={opslaan}
            disabled={isPending || !bedrag}
            loading={isPending}
          >
            {isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </td>
    </tr>
  )
}

/* ── Doelstelling rij ────────────────────────────────────────────── */

function DoelstellingRij({ d, onVerwijder }: { d: Doelstelling; onVerwijder: (id: string) => void }) {
  const [isPending, start] = useTransition()

  function verwijder() {
    if (!confirm('Weet je zeker dat je deze doelstelling wilt verwijderen?')) return
    start(async () => {
      await verwijderDoelstelling(d.id)
      onVerwijder(d.id)
    })
  }

  return (
    <tr>
      <td style={tdS}>{d.filiaal ?? <span style={{ color: 'var(--fg-muted)' }}>Alle</span>}</td>
      <td style={tdS}>{d.projectleider ?? <span style={{ color: 'var(--fg-muted)' }}>Alle</span>}</td>
      <td style={{ ...tdS, textAlign: 'right' }}>{fEur(d.omzet_doelstelling)}</td>
      <td style={{ ...tdS, textAlign: 'right' }}>{fEur(d.resultaat_doelstelling)}</td>
      <td style={{ ...tdS, textAlign: 'right' }}>
        <Button
          variant="destructive"
          size="sm"
          onClick={verwijder}
          disabled={isPending}
          loading={isPending}
        >
          {isPending ? '…' : 'Verwijder'}
        </Button>
      </td>
    </tr>
  )
}

/* ── Nieuw doelstelling formulier ────────────────────────────────── */

function NieuweDoelstellingForm({ filialen, projectleiders, jaar, onToegevoegd }: {
  filialen: string[]; projectleiders: string[]; jaar: number
  onToegevoegd: (d: Doelstelling) => void
}) {
  const [filiaal, setFiliaal]   = useState('')
  const [pl, setPl]             = useState('')
  const [omzet, setOmzet]       = useState('')
  const [resultaat, setRes]     = useState('')
  const [status, setStatus]     = useState<'idle' | 'ok' | 'fout'>('idle')
  const [foutTekst, setFoutTekst] = useState('')
  const [isPending, start]      = useTransition()

  async function voegToe() {
    start(async () => {
      const result = await slaDoelstellingOp({
        jaar,
        filiaal:              filiaal || null,
        projectleider:        pl || null,
        omzet_doelstelling:   parseFloat(omzet.replace(',', '.'))    || null,
        resultaat_doelstelling: parseFloat(resultaat.replace(',', '.')) || null,
      })
      if (result.ok && result.data) {
        onToegevoegd(result.data as Doelstelling)
        setFiliaal(''); setPl(''); setOmzet(''); setRes('')
        setStatus('ok')
      } else {
        setFoutTekst(result.fout ?? 'Onbekende fout')
        setStatus('fout')
      }
      setTimeout(() => setStatus('idle'), 4000)
    })
  }

  return (
    <Card>
      <CardBody>
        <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: 'var(--fg)' }}>
          Nieuwe doelstelling toevoegen
        </h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelS}>Werkmaatschappij</label>
            <select value={filiaal} onChange={e => setFiliaal(e.target.value)} style={inputS}>
              <option value="">— Alle —</option>
              {filialen.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={labelS}>Projectleider</label>
            <select value={pl} onChange={e => setPl(e.target.value)} style={inputS}>
              <option value="">— Alle —</option>
              {projectleiders.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelS}>Omzet doelstelling (€)</label>
            <Input type="text" value={omzet} onChange={e => setOmzet(e.target.value)}
              placeholder="1.500.000" inputSize="sm" className="w-[140px]"/>
          </div>
          <div>
            <label style={labelS}>Resultaat doelstelling (€)</label>
            <Input type="text" value={resultaat} onChange={e => setRes(e.target.value)}
              placeholder="200.000" inputSize="sm" className="w-[140px]"/>
          </div>
          <Button
            variant="primary"
            onClick={voegToe}
            disabled={isPending || (!omzet && !resultaat)}
            loading={isPending}
          >{isPending ? 'Toevoegen…' : 'Toevoegen'}</Button>
        </div>
        {status === 'ok'   && <Alert tone="success" className="mt-2">Doelstelling opgeslagen</Alert>}
        {status === 'fout' && <Alert tone="error" className="mt-2">{foutTekst}</Alert>}
      </CardBody>
    </Card>
  )
}

/* ── Hoofd component ─────────────────────────────────────────────── */

export default function InstellingenForm({ huidigJaar, filialen, projectleiders, akData, doelstellingen: initDoelstellingen }: Props) {
  const [doelstellingen, setDoelstellingen] = useState<Doelstelling[]>(initDoelstellingen)

  function onToegevoegd(d: Doelstelling) {
    setDoelstellingen(prev => [...prev, d])
  }

  function onVerwijder(id: string) {
    setDoelstellingen(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: 900 }}>

      {/* Header */}
      <PageHeader
        eyebrow="Management"
        title={`Instellingen ${huidigJaar}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/management">← Management</Link>
          </Button>
        }
      />

      {/* AK per werkmaatschappij */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--fg)' }}>
          Algemene Kosten (AK) per werkmaatschappij
        </h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 16px' }}>
          Stel het jaarlijkse AK-budget in per werkmaatschappij. Dit wordt gebruikt om de AK-dekkingsgraad te berekenen.
        </p>

        {filialen.length === 0 ? (
          <EmptyState
            size="sm"
            tone="neutral"
            title="Geen werkmaatschappijen gevonden"
            description="Synchroniseer eerst projectdata."
          />
        ) : (
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Werkmaatschappij', 'AK Bedrag (€)', 'Opmerking', ''].map(h => (
                    <th key={h} style={{ ...thS, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filialen.map(f => (
                  <AKRij
                    key={f}
                    filiaal={f}
                    bestaand={akData.find(a => a.filiaal === f)}
                    jaar={huidigJaar}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Doelstellingen */}
      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--fg)' }}>
          Doelstellingen per bedrijf / projectleider
        </h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 16px' }}>
          Stel omzet- en resultaatdoelstellingen in voor {huidigJaar}. Laat werkmaatschappij of projectleider leeg voor een algemene doelstelling.
        </p>

        {doelstellingen.length > 0 && (
          <Card className="mb-4">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Werkmaatschappij', 'Projectleider', 'Omzet doelstelling', 'Resultaat doelstelling', ''].map(h => (
                    <th key={h} style={{ ...thS, textAlign: h.startsWith('Omzet') || h.startsWith('Resultaat') || h === '' ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doelstellingen.map(d => (
                  <DoelstellingRij key={d.id} d={d} onVerwijder={onVerwijder}/>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <NieuweDoelstellingForm
          filialen={filialen}
          projectleiders={projectleiders}
          jaar={huidigJaar}
          onToegevoegd={onToegevoegd}
        />
      </section>
    </div>
  )
}

/* ── Stijlen ─────────────────────────────────────────────────────── */

const inputS: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  fontSize: 13, color: 'var(--fg)',
  outline: 'none',
}

const labelS: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--fg-muted)', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const thS: React.CSSProperties = {
  padding: '9px 14px', background: 'var(--bg-elev)',
  borderBottom: '2px solid var(--border)',
  fontWeight: 600, fontSize: 11, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}

const tdS: React.CSSProperties = {
  padding: '10px 14px', borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
}
